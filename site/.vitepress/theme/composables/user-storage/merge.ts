/**
 * 纯函数三方合并（protocol §5.4 判定表 #1–#11 的唯一实现）。零 IO、零 dexie。
 */
import type {
  Bookmark,
  BookmarkSnapshot,
  ConflictCopy,
  GraveyardDoc,
  Highlight,
  HighlightSnapshot,
  ProgressDoc,
  ReadingPosition,
  SettingsDoc,
} from './types'
import { deepClone, deepEqual } from './util'

export interface MergeInput<T> {
  base: T | null
  local: T
  remote: T
  selfDeviceId: string
  now: string
}
export interface MergeOutput<T, S = HighlightSnapshot> {
  record: T
  appended: ConflictCopy<S>[]
  overflow: ConflictCopy<S>[]
  readOnly?: 'higher-schema'
}

const IDENTITY = ['id', 'schemaVersion', 'kind', 'chapterId', 'paragraphId'] as const

function pickWinner(local: { updatedAt: string; deviceId: string }, remote: { updatedAt: string; deviceId: string }): 'local' | 'remote' {
  if (local.updatedAt !== remote.updatedAt) return local.updatedAt > remote.updatedAt ? 'local' : 'remote'
  if (local.deviceId !== remote.deviceId) return local.deviceId > remote.deviceId ? 'local' : 'remote'
  return 'local'
}

const earlier = (a: string, b: string) => (a <= b ? a : b)

function highlightSnapshot(h: Highlight): HighlightSnapshot {
  return deepClone({ note: h.note, types: h.types, color: h.color, selector: h.selector, deletedAt: h.deletedAt })
}
function bookmarkSnapshot(b: Bookmark): BookmarkSnapshot {
  return deepClone({ label: b.label, deletedAt: b.deletedAt })
}

function makeCopy<S>(side: { deviceId: string; rev: number; updatedAt: string }, snapshot: S, now: string): ConflictCopy<S> {
  return { deviceId: side.deviceId, rev: side.rev, updatedAt: side.updatedAt, keptAt: now, snapshot }
}

/** 合并既有副本 + 新增，按 keptAt 保留最新 3 份，最旧挤出 overflow（D16）。 */
export function capConflicts<S>(existing: ConflictCopy<S>[], appended: ConflictCopy<S>[]): { kept: ConflictCopy<S>[]; overflow: ConflictCopy<S>[] } {
  const all = [...existing, ...appended]
  // 去重（deviceId+rev+updatedAt+keptAt）
  const seen = new Set<string>()
  const unique = all.filter((c) => {
    const key = `${c.deviceId}|${c.rev}|${c.updatedAt}|${c.keptAt}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  unique.sort((a, b) => (a.keptAt < b.keptAt ? -1 : a.keptAt > b.keptAt ? 1 : 0))
  if (unique.length <= 3) return { kept: unique, overflow: [] }
  return { kept: unique.slice(-3), overflow: unique.slice(0, -3) }
}

interface FieldDesc<T> {
  get: (r: T) => unknown
  set: (r: T, v: unknown) => void
}

function mergeContent<T extends { rev: number; deviceId: string; updatedAt: string; deletedAt: string | null; conflicts?: ConflictCopy<any>[] }>(
  input: MergeInput<T>,
  fields: FieldDesc<T>[],
  snapshot: (r: T) => any,
): MergeOutput<T, any> {
  const { base, local, remote, selfDeviceId, now } = input

  // #10 远端高 schema → 只读，不合并
  if ((remote as any).schemaVersion > (local as any).schemaVersion) {
    return { record: local, appended: [], overflow: [], readOnly: 'higher-schema' }
  }

  // 不变量 9：两侧既有副本取并集，永不静默丢弃（含远端携带的副本）
  const existingConflicts = [...(local.conflicts ?? []), ...(remote.conflicts ?? [])]

  // D23 身份字段不一致 → 保留本机整条，远端整条内容存副本
  if (IDENTITY.some((f) => !deepEqual((local as any)[f], (remote as any)[f]))) {
    const copy = makeCopy(remote, snapshot(remote), now)
    const { kept, overflow } = capConflicts(existingConflicts, [copy])
    return { record: { ...local, conflicts: kept.length ? kept : undefined }, appended: [copy], overflow }
  }

  // 全等 → 不合并，rev 不变
  if (deepEqual(local, remote)) {
    return { record: local, appended: [], overflow: [] }
  }

  const winnerSide = pickWinner(local, remote)
  const winner = winnerSide === 'local' ? local : remote
  const loser = winnerSide === 'local' ? remote : local

  const localDel = local.deletedAt != null
  const remoteDel = remote.deletedAt != null

  // #7 一侧删除、另一侧改内容 → 删除侧整条存活，编辑侧内容入副本（deletedAt=null）
  if (localDel !== remoteDel) {
    const deleting = localDel ? local : remote
    const editing = localDel ? remote : local
    const editingChanged = fields.some((f) => (base ? !deepEqual(f.get(editing), f.get(base)) : true))
    if (editingChanged) {
      const record: T = { ...deepClone(deleting), rev: Math.max(local.rev, remote.rev) + 1, deviceId: selfDeviceId, updatedAt: now }
      const copy = makeCopy(editing, { ...snapshot(editing), deletedAt: null }, now)
      const { kept, overflow } = capConflicts(existingConflicts, [copy])
      record.conflicts = kept.length ? kept : undefined
      return { record, appended: [copy], overflow }
    }
  }

  // 逐字段合并（#1–#5、#9）
  const record: T = { ...deepClone(winner) } // 未知字段载体 = 整体胜者侧
  let conflict = false
  for (const f of fields) {
    const lv = f.get(local)
    const rv = f.get(remote)
    const bv = base ? f.get(base) : undefined
    const lc = base ? !deepEqual(lv, bv) : true
    const rc = base ? !deepEqual(rv, bv) : true
    if (!lc && !rc) {
      f.set(record, base ? bv : lv) // #1
    } else if (lc && !rc) {
      f.set(record, lv) // #2
    } else if (!lc && rc) {
      f.set(record, rv) // #3
    } else if (deepEqual(lv, rv)) {
      f.set(record, lv) // #4
    } else {
      f.set(record, winnerSide === 'local' ? lv : rv) // #5
      conflict = true
    }
  }

  // deletedAt 特殊规则（#6/#8）优先于 #5
  if (localDel && remoteDel) {
    record.deletedAt = earlier(local.deletedAt!, remote.deletedAt!) // #8
  } else if (localDel !== remoteDel) {
    record.deletedAt = (localDel ? local : remote).deletedAt // #6 墓碑生效
  } else {
    record.deletedAt = null
  }

  record.rev = Math.max(local.rev, remote.rev) + 1
  record.deviceId = selfDeviceId
  record.updatedAt = now

  const appended = conflict ? [makeCopy(loser, snapshot(loser), now)] : []
  const { kept, overflow } = capConflicts(existingConflicts, appended)
  record.conflicts = kept.length ? kept : undefined
  return { record, appended, overflow }
}

const highlightFields: FieldDesc<Highlight>[] = [
  { get: (r) => r.note, set: (r, v) => { r.note = v as string } },
  { get: (r) => r.types, set: (r, v) => { r.types = v as string[] } },
  { get: (r) => r.color, set: (r, v) => { r.color = v as Highlight['color'] } },
  {
    // anchorBundle 整体字段（D23）
    get: (r) => ({ selector: r.selector, textHash: r.textHash, revision: r.revision }),
    set: (r, v) => {
      const b = v as { selector: Highlight['selector']; textHash: string; revision: string }
      r.selector = b.selector
      r.textHash = b.textHash
      r.revision = b.revision
    },
  },
]

export function mergeHighlight(input: MergeInput<Highlight>): MergeOutput<Highlight, HighlightSnapshot> {
  return mergeContent(input, highlightFields, highlightSnapshot) as MergeOutput<Highlight, HighlightSnapshot>
}

const bookmarkFields: FieldDesc<Bookmark>[] = [
  { get: (r) => r.label, set: (r, v) => { r.label = v as string } },
]

export function mergeBookmark(input: MergeInput<Bookmark>): MergeOutput<Bookmark, BookmarkSnapshot> {
  return mergeContent(input, bookmarkFields, bookmarkSnapshot) as MergeOutput<Bookmark, BookmarkSnapshot>
}

/* ------------------------------------------------------------------ */
/* 文档合并                                                            */
/* ------------------------------------------------------------------ */

function newerPosition(a: ReadingPosition, b: ReadingPosition): ReadingPosition {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? a : b
  const ad = a.deviceId ?? ''
  const bd = b.deviceId ?? ''
  return ad >= bd ? a : b
}

export function mergeProgress(local: ProgressDoc, remote: ProgressDoc, selfDeviceId: string): ProgressDoc {
  const pages: Record<string, ReadingPosition> = {}
  const ids = new Set([...Object.keys(local.pages), ...Object.keys(remote.pages)])
  for (const id of ids) {
    const l = local.pages[id]
    const r = remote.pages[id]
    if (l && r) {
      const winner = newerPosition(l, r)
      pages[id] = { ...deepClone(winner), maxProgress: Math.max(l.maxProgress, r.maxProgress) }
    } else {
      pages[id] = deepClone((l ?? r)!)
    }
  }
  let last: ReadingPosition | null = null
  if (local.last && remote.last) last = deepClone(newerPosition(local.last, remote.last))
  else last = deepClone(local.last ?? remote.last ?? null)
  void selfDeviceId
  return { schemaVersion: 1, last, pages }
}

const EPOCH_STAMP = { t: '1970-01-01T00:00:00.000Z', d: '' }

export function mergeSettings(local: SettingsDoc, remote: SettingsDoc): SettingsDoc {
  const prefs = { ...local.prefs }
  const stamps: SettingsDoc['stamps'] = { ...local.stamps }
  for (const key of Object.keys(remote.prefs) as (keyof SettingsDoc['prefs'])[]) {
    const ls = local.stamps[key] ?? EPOCH_STAMP
    const rs = remote.stamps[key] ?? EPOCH_STAMP
    let remoteWins: boolean
    if (ls.t !== rs.t) remoteWins = rs.t > ls.t
    else remoteWins = rs.d > ls.d
    if (remoteWins) {
      ;(prefs as Record<string, unknown>)[key] = deepClone(remote.prefs[key])
      stamps[key] = rs
    } else {
      ;(prefs as Record<string, unknown>)[key] = deepClone(local.prefs[key])
      stamps[key] = ls
    }
  }
  return { schemaVersion: 1, prefs, stamps }
}

export function mergeGraveyard(local: GraveyardDoc, remote: GraveyardDoc): GraveyardDoc {
  const entries: GraveyardDoc['entries'] = { ...local.entries }
  for (const [id, e] of Object.entries(remote.entries)) {
    const existing = entries[id]
    entries[id] = { purgedAt: existing ? earlier(existing.purgedAt, e.purgedAt) : e.purgedAt }
  }
  return { schemaVersion: 1, entries }
}

export function isGraveyarded(id: string, g: GraveyardDoc): boolean {
  return Object.prototype.hasOwnProperty.call(g.entries, id)
}