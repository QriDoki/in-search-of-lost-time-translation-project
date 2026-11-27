/**
 * Dexie 存储层（protocol §5.2）：库/scope、CRUD、outbox 合并、sanitize、迁移、认领。
 * 账号隔离由库名保证；claimedBy 置位的 anon 库只读。
 */
import Dexie, { liveQuery, type Table } from 'dexie'
import { sanitizeAnnotationTypes } from '../../../../../scripts/lib/annotation-types.mjs'
import type {
  Bookmark,
  CloudStateRow,
  DevicePrefs,
  EntityKind,
  GraveyardDoc,
  Highlight,
  HighlightColor,
  LocalBookmark,
  LocalHighlight,
  OutboxOp,
  ProgressDoc,
  ReadingPosition,
  Scope,
  SettingsDoc,
  SyncedPrefs,
} from './types'
import { deepClone, fnv1a36, nfc, nowIso, uuidv4, uuidv7 } from './util'

export class ValidationError extends Error {
  constructor(public field: string, message: string) {
    super(`${field}: ${message}`)
    this.name = 'ValidationError'
  }
}

/** 本地行 = 云端结构 + local 块 + 顶层 dirty 镜像（供 Dexie 索引）。 */
export type HighlightRow = LocalHighlight & { dirty: 0 | 1 }
export type BookmarkRow = LocalBookmark & { dirty: 0 | 1 }

export class UserDb extends Dexie {
  highlights!: Table<HighlightRow, string>
  bookmarks!: Table<BookmarkRow, string>
  progress!: Table<ReadingPosition, string>
  settings!: Table<{ key: string; value: unknown }, string>
  cloudState!: Table<CloudStateRow, string>
  outbox!: Table<OutboxOp, number>
  meta!: Table<{ key: string; value: unknown }, string>

  constructor(public scope: Scope) {
    super(`proust-reader-v1-${scope}`)
    this.version(1).stores({
      highlights: 'id, chapterId, paragraphId, updatedAt, deletedAt, dirty, [chapterId+paragraphId]',
      bookmarks: 'id, chapterId, updatedAt, deletedAt, dirty',
      progress: 'pageId',
      settings: 'key',
      cloudState: 'id',
      outbox: '++seq, id, [entity+id]',
      meta: 'key',
    })
  }
}

/* ------------------------------------------------------------------ */
/* scope / 模式                                                        */
/* ------------------------------------------------------------------ */

let db: UserDb | null = null
let scope: Scope = 'anon'
let mode: 'idb' | 'localStorage' | 'unavailable' = 'unavailable'
const scopeListeners = new Set<(s: Scope) => void>()

export function currentScope(): Scope {
  return scope
}

export function currentDb(): UserDb {
  if (!db) throw new Error('db-not-open')
  return db
}

export function storageMode(): 'idb' | 'localStorage' | 'unavailable' {
  return mode
}

export function onScopeChange(cb: (s: Scope) => void): () => void {
  scopeListeners.add(cb)
  return () => scopeListeners.delete(cb)
}

export async function openDatabase(target: Scope): Promise<UserDb> {
  const next = new UserDb(target)
  await next.open()
  db = next
  scope = target
  mode = 'idb'
  return next
}

export async function switchScope(target: Scope): Promise<void> {
  if (db) {
    db.close()
    db = null
  }
  await openDatabase(target)
  for (const cb of scopeListeners) cb(target)
}

/** IDB 不可用时的降级标记（initUserStorage 调用）。 */
export function markLocalStorageMode(): void {
  mode = 'localStorage'
  db = null
}

export function deviceId(): string {
  try {
    const existing = localStorage.getItem('lost-time:device-id')
    if (existing) return existing
    const id = uuidv4()
    localStorage.setItem('lost-time:device-id', id)
    return id
  } catch {
    return uuidv4()
  }
}

/* ------------------------------------------------------------------ */
/* meta  helpers                                                       */
/* ------------------------------------------------------------------ */

async function getMeta<T>(key: string): Promise<T | null> {
  const row = await currentDb().meta.get(key)
  return row ? (row.value as T) : null
}

async function setMeta(key: string, value: unknown): Promise<void> {
  await currentDb().meta.put({ key, value })
}

async function assertWritable(): Promise<void> {
  const claimedBy = await getMeta<string>('claimedBy')
  if (claimedBy) throw new Error('scope-claimed')
}

/* ------------------------------------------------------------------ */
/* outbox 合并                                                         */
/* ------------------------------------------------------------------ */

async function mergeOutbox(entity: EntityKind, id: string, type: 'put' | 'delete'): Promise<void> {
  const table = currentDb().outbox
  const existing = await table.where('[entity+id]').equals([entity, id]).first()
  if (existing) {
    await table.update(existing.seq!, { type, createdAt: nowIso() })
  } else {
    await table.add({ entity, id, type, createdAt: nowIso() })
  }
}

/** 供 sync 引擎复用的 outbox 合并入口（同 id 合并为一条）。 */
export async function queueOutbox(entity: EntityKind, id: string, type: 'put' | 'delete'): Promise<void> {
  const table = currentDb().outbox
  const existing = await table.where('[entity+id]').equals([entity, id]).first()
  if (existing) await table.update(existing.seq!, { type, createdAt: nowIso() })
  else await table.add({ entity, id, type, createdAt: nowIso() })
}

async function dropOutbox(entity: EntityKind, id: string): Promise<void> {
  await currentDb().outbox.where('[entity+id]').equals([entity, id]).delete()
}

/* ------------------------------------------------------------------ */
/* sanitize                                                            */
/* ------------------------------------------------------------------ */

const COLORS: HighlightColor[] = ['yellow', 'green', 'blue', 'pink', 'purple']
const isIso = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v))
const isNonNegInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0

function sanitizeSelector(input: unknown, kind: 'highlight' | 'note'): Highlight['selector'] {
  if (typeof input !== 'object' || input === null) throw new ValidationError('selector', '必须为对象')
  const s = input as Record<string, unknown>
  const exact = typeof s.exact === 'string' ? s.exact : ''
  if (exact.length > 10000) throw new ValidationError('selector.exact', '超过 10000 字符')
  const start = s.start as { paragraphId?: unknown; offset?: unknown } | undefined
  const end = s.end as { paragraphId?: unknown; offset?: unknown } | undefined
  if (!start || typeof start.paragraphId !== 'string' || !isNonNegInt(start.offset)) {
    throw new ValidationError('selector.start', 'paragraphId/offset 非法')
  }
  if (!end || typeof end.paragraphId !== 'string' || !isNonNegInt(end.offset)) {
    throw new ValidationError('selector.end', 'paragraphId/offset 非法')
  }
  if (kind === 'note') {
    if (exact !== '') throw new ValidationError('selector.exact', 'note 的 exact 必须为空')
  } else if (start.paragraphId === end.paragraphId) {
    if (end.offset < start.offset) throw new ValidationError('selector.end.offset', '小于 start.offset')
    if (exact.length !== end.offset - start.offset) {
      throw new ValidationError('selector.exact', '同段 exact 长度与偏移区间不一致')
    }
  }
  return {
    exact,
    prefix: typeof s.prefix === 'string' ? s.prefix.slice(0, 32) : '',
    suffix: typeof s.suffix === 'string' ? s.suffix.slice(0, 32) : '',
    start: { paragraphId: start.paragraphId, offset: start.offset },
    end: { paragraphId: end.paragraphId, offset: end.offset },
  }
}

export function sanitizeHighlight(input: unknown): Highlight {
  if (typeof input !== 'object' || input === null) throw new ValidationError('highlight', '必须为对象')
  const h = input as Record<string, unknown>
  if (typeof h.id !== 'string' || !h.id) throw new ValidationError('id', '缺失')
  const kind = h.kind === 'note' ? 'note' : h.kind === 'highlight' ? 'highlight' : null
  if (!kind) throw new ValidationError('kind', '必须为 highlight 或 note')
  if (typeof h.chapterId !== 'string' || !h.chapterId) throw new ValidationError('chapterId', '缺失')
  const selector = sanitizeSelector(h.selector, kind)
  const note = typeof h.note === 'string' ? h.note : ''
  if (note.length > 20000) throw new ValidationError('note', '超过 20000 字符')
  if (typeof h.color !== 'string' || !COLORS.includes(h.color as HighlightColor)) {
    throw new ValidationError('color', '枚举外')
  }
  const schemaVersion = typeof h.schemaVersion === 'number' && h.schemaVersion >= 1 ? h.schemaVersion : 1
  const clean: Highlight = {
    id: h.id,
    schemaVersion: schemaVersion as 1,
    kind,
    chapterId: h.chapterId,
    paragraphId: selector.start.paragraphId,
    revision: typeof h.revision === 'string' ? h.revision : '',
    textHash: typeof h.textHash === 'string' ? h.textHash : '',
    selector,
    note,
    types: sanitizeAnnotationTypes(h.types),
    color: h.color as HighlightColor,
    createdAt: isIso(h.createdAt) ? h.createdAt : nowIso(),
    updatedAt: isIso(h.updatedAt) ? h.updatedAt : nowIso(),
    deletedAt: isIso(h.deletedAt) ? h.deletedAt : null,
    rev: isNonNegInt(h.rev) ? h.rev : 0,
    deviceId: typeof h.deviceId === 'string' ? h.deviceId : '',
  }
  if (Array.isArray(h.conflicts)) clean.conflicts = deepClone(h.conflicts) as Highlight['conflicts']
  if (Array.isArray(h.selectorHistory)) clean.selectorHistory = deepClone(h.selectorHistory) as Highlight['selectorHistory']
  // 未知字段原样保留
  for (const [k, v] of Object.entries(h)) {
    if (!(k in clean)) (clean as Record<string, unknown>)[k] = deepClone(v)
  }
  return clean
}

export function sanitizeBookmark(input: unknown): Bookmark {
  if (typeof input !== 'object' || input === null) throw new ValidationError('bookmark', '必须为对象')
  const b = input as Record<string, unknown>
  if (typeof b.id !== 'string' || !b.id) throw new ValidationError('id', '缺失')
  if (typeof b.chapterId !== 'string' || !b.chapterId) throw new ValidationError('chapterId', '缺失')
  if (typeof b.paragraphId !== 'string' || !b.paragraphId) throw new ValidationError('paragraphId', '缺失')
  const schemaVersion = typeof b.schemaVersion === 'number' && b.schemaVersion >= 1 ? b.schemaVersion : 1
  const clean: Bookmark = {
    id: b.id,
    schemaVersion: schemaVersion as 1,
    chapterId: b.chapterId,
    paragraphId: b.paragraphId,
    label: typeof b.label === 'string' ? b.label : '',
    createdAt: isIso(b.createdAt) ? b.createdAt : nowIso(),
    updatedAt: isIso(b.updatedAt) ? b.updatedAt : nowIso(),
    deletedAt: isIso(b.deletedAt) ? b.deletedAt : null,
    rev: isNonNegInt(b.rev) ? b.rev : 0,
    deviceId: typeof b.deviceId === 'string' ? b.deviceId : '',
  }
  if (Array.isArray(b.conflicts)) clean.conflicts = deepClone(b.conflicts) as Bookmark['conflicts']
  for (const [k, v] of Object.entries(b)) {
    if (!(k in clean)) (clean as Record<string, unknown>)[k] = deepClone(v)
  }
  return clean
}

/** 上传前剥离 local 块与顶层 dirty 镜像。 */
export function toCloud<T extends { local?: unknown; dirty?: unknown }>(row: T): Omit<T, 'local' | 'dirty'> {
  const { local, dirty, ...rest } = row as Record<string, unknown>
  void local
  void dirty
  return rest as Omit<T, 'local' | 'dirty'>
}

/* ------------------------------------------------------------------ */
/* 记录 CRUD                                                           */
/* ------------------------------------------------------------------ */

export async function putHighlight(h: Highlight): Promise<void> {
  await assertWritable()
  const clean = sanitizeHighlight(h)
  const d = currentDb()
  await d.transaction('rw', d.highlights, d.outbox, async () => {
    const existing = await d.highlights.get(clean.id)
    const local = existing?.local ?? { dirty: 1 as const, baseEtag: null, baseSnapshot: null }
    local.dirty = 1
    await d.highlights.put({ ...clean, local, dirty: 1 })
    await mergeOutbox('highlight', clean.id, 'put')
  })
}

export async function softDeleteHighlight(id: string): Promise<void> {
  await assertWritable()
  const d = currentDb()
  await d.transaction('rw', d.highlights, d.outbox, d.cloudState, async () => {
    const row = await d.highlights.get(id)
    if (!row) return
    const cloud = await d.cloudState.get(id)
    // D18：从未上传（无 cloudState 且 baseEtag null）→ 硬删 + 丢 op，无墓碑
    if (!cloud && row.local.baseEtag === null) {
      await d.highlights.delete(id)
      await dropOutbox('highlight', id)
      return
    }
    const now = nowIso()
    await d.highlights.put({
      ...row,
      deletedAt: now,
      updatedAt: now,
      rev: row.rev + 1,
      deviceId: deviceId(),
      dirty: 1,
      local: { ...row.local, dirty: 1 },
    })
    await mergeOutbox('highlight', id, 'delete')
  })
}

export async function putBookmark(b: Bookmark): Promise<void> {
  await assertWritable()
  const clean = sanitizeBookmark(b)
  const d = currentDb()
  await d.transaction('rw', d.bookmarks, d.outbox, async () => {
    const existing = await d.bookmarks.get(clean.id)
    const local = existing?.local ?? { dirty: 1 as const, baseEtag: null, baseSnapshot: null }
    local.dirty = 1
    await d.bookmarks.put({ ...clean, local, dirty: 1 })
    await mergeOutbox('bookmark', clean.id, 'put')
  })
}

export async function softDeleteBookmark(id: string): Promise<void> {
  await assertWritable()
  const d = currentDb()
  await d.transaction('rw', d.bookmarks, d.outbox, d.cloudState, async () => {
    const row = await d.bookmarks.get(id)
    if (!row) return
    const cloud = await d.cloudState.get(id)
    if (!cloud && row.local.baseEtag === null) {
      await d.bookmarks.delete(id)
      await dropOutbox('bookmark', id)
      return
    }
    const now = nowIso()
    await d.bookmarks.put({
      ...row,
      deletedAt: now,
      updatedAt: now,
      rev: row.rev + 1,
      deviceId: deviceId(),
      dirty: 1,
      local: { ...row.local, dirty: 1 },
    })
    await mergeOutbox('bookmark', id, 'delete')
  })
}

export async function getHighlight(id: string): Promise<LocalHighlight | null> {
  const row = await currentDb().highlights.get(id)
  return row ?? null
}

export async function listHighlights(): Promise<LocalHighlight[]> {
  return currentDb().highlights.toArray()
}

export async function listBookmarks(): Promise<LocalBookmark[]> {
  return currentDb().bookmarks.toArray()
}

export function liveHighlights() {
  return liveQuery(() => currentDb().highlights.toArray())
}

export function liveBookmarks() {
  return liveQuery(() => currentDb().bookmarks.toArray())
}

/* ------------------------------------------------------------------ */
/* 进度 / 设置                                                         */
/* ------------------------------------------------------------------ */

export async function saveProgress(pos: ReadingPosition): Promise<void> {
  await assertWritable()
  const d = currentDb()
  await d.transaction('rw', d.progress, d.meta, d.outbox, async () => {
    const previous = await d.progress.get(pos.pageId)
    const next: ReadingPosition = {
      ...pos,
      maxProgress: Math.max(previous?.maxProgress ?? 0, pos.maxProgress, pos.pageProgress),
      deviceId: pos.deviceId ?? deviceId(),
    }
    delete next.needsRelocate // 成功保存即清除失配标记
    await d.progress.put(next)
    await setMeta('last', next)
    await mergeOutbox('progress', 'doc', 'put')
  })
}

export async function getProgressDoc(): Promise<ProgressDoc> {
  const d = currentDb()
  const rows = await d.progress.toArray()
  const pages: Record<string, ReadingPosition> = {}
  for (const row of rows) pages[row.pageId] = row
  const last = (await getMeta<ReadingPosition>('last')) ?? null
  return { schemaVersion: 1, last, pages }
}

export async function saveSyncedPrefs(prefs: SyncedPrefs): Promise<void> {
  await assertWritable()
  const d = currentDb()
  const now = nowIso()
  const dev = deviceId()
  await d.transaction('rw', d.settings, d.outbox, async () => {
    const existing = await d.settings.get('synced')
    const doc = (existing?.value as SettingsDoc) ?? { schemaVersion: 1, prefs, stamps: {} }
    const stamps = { ...doc.stamps }
    for (const key of Object.keys(prefs) as (keyof SyncedPrefs)[]) {
      stamps[key] = { t: now, d: dev }
    }
    await d.settings.put({ key: 'synced', value: { schemaVersion: 1, prefs: deepClone(prefs), stamps } })
    await mergeOutbox('settings', 'doc', 'put')
  })
}

export async function getSettingsDoc(): Promise<SettingsDoc> {
  const row = await currentDb().settings.get('synced')
  if (row) return row.value as SettingsDoc
  return {
    schemaVersion: 1,
    prefs: { fontSize: 20, lineHeight: 1.9, fontFamily: 'sans', theme: 'paper', annotationTypes: [] },
    stamps: {},
  }
}

export async function saveDevicePrefs(p: DevicePrefs): Promise<void> {
  await assertWritable()
  await currentDb().settings.put({ key: 'device', value: p })
}

export async function getDevicePrefs(): Promise<DevicePrefs | null> {
  const row = await currentDb().settings.get('device')
  return row ? (row.value as DevicePrefs) : null
}

/* ------------------------------------------------------------------ */
/* 迁移（localStorage → IDB，幂等）                                    */
/* ------------------------------------------------------------------ */

export interface LegacyMap {
  pages: Record<string, string[]>
}

export async function migrateLegacyData(
  version: string,
  fetchMap?: (version: string) => Promise<LegacyMap | null>,
): Promise<{ migrated: boolean; needsRelocate: string[] }> {
  const d = currentDb()
  if (await getMeta<boolean>('legacyMigrated')) return { migrated: true, needsRelocate: [] }

  const loader =
    fetchMap ??
    (async (v: string) => {
      try {
        const base = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/'
        const res = await fetch(`${base}reader/paragraph-ids-${v}.json`)
        if (!res.ok) return null
        return (await res.json()) as LegacyMap
      } catch {
        return null
      }
    })
  const map = await loader(version)
  if (!map) return { migrated: false, needsRelocate: [] }

  const needsRelocate: string[] = []
  const dev = deviceId()
  const now = nowIso()

  // progress：legacy 索引映射 + fnv1a36 校验
  let stored: { last?: ReadingPosition | null; pages?: Record<string, ReadingPosition> } | null = null
  try {
    const raw = localStorage.getItem('lost-time:progress:v2')
    stored = raw ? JSON.parse(raw) : null
  } catch {
    stored = null
  }
  if (stored?.pages) {
    await d.transaction('rw', d.progress, d.meta, async () => {
      for (const pos of Object.values(stored!.pages!)) {
        const ids = map.pages[pos.pageId]
        let paragraphId = pos.paragraphId
        let relocate = false
        if (/^p-\d+$/.test(pos.paragraphId)) {
          const index = Number.parseInt(pos.paragraphId.slice(2), 10) - 1
          const target = ids?.[index]
          if (target) {
            // D32：映射目标存在即采纳；哈希漂移由运行时定位管线检测
            paragraphId = target
          } else {
            // 索引越界或页缺失于映射 → 保留旧值 + needsRelocate
            relocate = true
          }
        }
        const next: ReadingPosition = { ...pos, paragraphId, deviceId: dev }
        if (relocate) {
          next.needsRelocate = true
          needsRelocate.push(pos.pageId)
        }
        await d.progress.put(next)
      }
      if (stored!.last) await setMeta('last', stored!.last)
    })
  }

  // prefs → SettingsDoc（width 落 device 行）
  try {
    const raw = localStorage.getItem('lost-time:reader-prefs:v2')
    if (raw) {
      const prefs = JSON.parse(raw) as Record<string, unknown>
      const synced: SyncedPrefs = {
        fontSize: Number(prefs.fontSize) || 20,
        lineHeight: Number(prefs.lineHeight) || 1.9,
        fontFamily: (['serif', 'sans', 'kai'].includes(prefs.fontFamily as string) ? prefs.fontFamily : 'sans') as SyncedPrefs['fontFamily'],
        theme: (['paper', 'light', 'sepia', 'dark'].includes(prefs.theme as string) ? prefs.theme : 'paper') as SyncedPrefs['theme'],
        annotationTypes: sanitizeAnnotationTypes(prefs.annotationTypes),
      }
      const stamps: SettingsDoc['stamps'] = {}
      for (const key of Object.keys(synced)) stamps[key] = { t: now, d: dev }
      await d.settings.put({ key: 'synced', value: { schemaVersion: 1, prefs: synced, stamps } })
      if (Number.isFinite(Number(prefs.width))) {
        await d.settings.put({ key: 'device', value: { width: Number(prefs.width) } })
      }
    }
  } catch {
    // 忽略非法 prefs
  }

  await setMeta('legacyMigrated', true)
  // 旧键不删（D11）
  return { migrated: true, needsRelocate }
}

/** 迁移失配检测辅助：旧 hash 与目标段文本指纹比对（raw/NFC 双基准任一命中即通过）。 */
export function legacyHashMatches(oldHash: string, targetText: string): boolean {
  return oldHash === fnv1a36(targetText) || oldHash === fnv1a36(nfc(targetText))
}

/* ------------------------------------------------------------------ */
/* 认领迁移（anon → 账号库）                                           */
/* ------------------------------------------------------------------ */

export async function claimAnonData(targetScope: Scope): Promise<void> {
  const anon = new UserDb('anon')
  await anon.open()
  const target = new UserDb(targetScope)
  await target.open()
  try {
    const anonClaimed = await anon.meta.get('claimedBy')
    if (anonClaimed) return // 已认领，幂等

    const copyRecord = async (
      row: HighlightRow | BookmarkRow,
      table: 'highlights' | 'bookmarks',
    ): Promise<void> => {
      const targetTable = target[table] as unknown as Table<any, string>
      const existing = await targetTable.get(row.id)
      if (!existing) {
        await targetTable.put({ ...deepClone(row), dirty: 1, local: { ...row.local, dirty: 1 } })
        await target.outbox.add({ entity: table === 'highlights' ? 'highlight' : 'bookmark', id: row.id, type: row.deletedAt ? 'delete' : 'put', createdAt: nowIso() })
      } else {
        // 同 id → 合并（base = 目标 baseSnapshot）；此处惰性导入 merge 避免循环
        const { mergeHighlight, mergeBookmark } = await import('./merge')
        const cloud = toCloud(row)
        if (table === 'highlights') {
          const out = mergeHighlight({ base: (existing.local.baseSnapshot as Highlight) ?? null, local: toCloud(existing) as Highlight, remote: cloud as Highlight, selfDeviceId: deviceId(), now: nowIso() })
          await target.highlights.put({ ...out.record, local: { ...existing.local, dirty: 1, baseSnapshot: existing.local.baseSnapshot }, dirty: 1 } as HighlightRow)
        } else {
          const out = mergeBookmark({ base: (existing.local.baseSnapshot as Bookmark) ?? null, local: toCloud(existing) as Bookmark, remote: cloud as Bookmark, selfDeviceId: deviceId(), now: nowIso() })
          await target.bookmarks.put({ ...out.record, local: { ...existing.local, dirty: 1, baseSnapshot: existing.local.baseSnapshot }, dirty: 1 } as BookmarkRow)
        }
        await target.outbox.add({ entity: table === 'highlights' ? 'highlight' : 'bookmark', id: row.id, type: 'put', createdAt: nowIso() })
      }
    }

    for (const row of await anon.highlights.toArray()) await copyRecord(row, 'highlights')
    for (const row of await anon.bookmarks.toArray()) await copyRecord(row, 'bookmarks')

    // progress / settings 文档合并
    const { mergeProgress, mergeSettings } = await import('./merge')
    const anonProgress: ProgressDoc = { schemaVersion: 1, last: (await anon.meta.get('last'))?.value as ReadingPosition ?? null, pages: {} }
    for (const p of await anon.progress.toArray()) anonProgress.pages[p.pageId] = p
    const targetProgress = await (async () => {
      const pages: Record<string, ReadingPosition> = {}
      for (const p of await target.progress.toArray()) pages[p.pageId] = p
      return { schemaVersion: 1 as const, last: (await target.meta.get('last'))?.value as ReadingPosition ?? null, pages }
    })()
    const mergedProgress = mergeProgress(targetProgress, anonProgress, deviceId())
    await target.transaction('rw', target.progress, target.meta, async () => {
      await target.progress.clear()
      await target.progress.bulkPut(Object.values(mergedProgress.pages))
      await target.meta.put({ key: 'last', value: mergedProgress.last })
    })

    const anonSettings = (await anon.settings.get('synced'))?.value as SettingsDoc | undefined
    const targetSettings = (await target.settings.get('synced'))?.value as SettingsDoc | undefined
    if (anonSettings) {
      const merged = mergeSettings(targetSettings ?? { schemaVersion: 1, prefs: anonSettings.prefs, stamps: {} }, anonSettings)
      await target.settings.put({ key: 'synced', value: merged })
    }
    const anonDevice = (await anon.settings.get('device'))?.value
    if (anonDevice && !(await target.settings.get('device'))) {
      await target.settings.put({ key: 'device', value: anonDevice })
    }

    await anon.meta.put({ key: 'claimedBy', value: targetScope })
  } finally {
    anon.close()
    target.close()
  }
}

/* ------------------------------------------------------------------ */
/* 崩溃恢复                                                            */
/* ------------------------------------------------------------------ */

export async function rebuildOutbox(): Promise<void> {
  const d = currentDb()
  await d.transaction('rw', d.highlights, d.bookmarks, d.outbox, async () => {
    const existing = new Map<string, OutboxOp>()
    for (const op of await d.outbox.toArray()) existing.set(`${op.entity}:${op.id}`, op)
    const ensure = async (entity: EntityKind, id: string, type: 'put' | 'delete') => {
      const key = `${entity}:${id}`
      if (!existing.has(key)) {
        const seq = await d.outbox.add({ entity, id, type, createdAt: nowIso() })
        existing.set(key, { seq, entity, id, type, createdAt: nowIso() })
      }
    }
    for (const row of await d.highlights.toArray()) {
      if (row.dirty === 1 || row.local.dirty === 1) {
        await ensure('highlight', row.id, row.deletedAt ? 'delete' : 'put')
        if (row.local.dirty !== 1) await d.highlights.update(row.id, { dirty: 1, 'local.dirty': 1 })
      }
    }
    for (const row of await d.bookmarks.toArray()) {
      if (row.dirty === 1 || row.local.dirty === 1) {
        await ensure('bookmark', row.id, row.deletedAt ? 'delete' : 'put')
        if (row.local.dirty !== 1) await d.bookmarks.update(row.id, { dirty: 1, 'local.dirty': 1 })
      }
    }
    // 双向校验：op 仍在但 dirty 丢失 → 修复 dirty；孤儿 op → 丢弃
    for (const op of await d.outbox.toArray()) {
      if (op.entity === 'highlight') {
        const row = await d.highlights.get(op.id)
        if (!row) await d.outbox.delete(op.seq!)
        else if (row.local.dirty !== 1) await d.highlights.update(op.id, { dirty: 1, 'local.dirty': 1 })
      }
      if (op.entity === 'bookmark') {
        const row = await d.bookmarks.get(op.id)
        if (!row) await d.outbox.delete(op.seq!)
        else if (row.local.dirty !== 1) await d.bookmarks.update(op.id, { dirty: 1, 'local.dirty': 1 })
      }
    }
  })
}

/** D33 附加：删除某账号命名空间库（断开连接时用户显式勾选清除缓存）。 */
export async function deleteScopeDatabase(target: Scope): Promise<void> {
  if (db && scope === target) {
    db.close()
    db = null
  }
  await Dexie.delete(`proust-reader-v1-${target}`)
}

export async function getGraveyard(): Promise<GraveyardDoc> {
  return (await getMeta<GraveyardDoc>('graveyard')) ?? { schemaVersion: 1, entries: {} }
}

export async function setGraveyard(g: GraveyardDoc): Promise<void> {
  await setMeta('graveyard', g)
}

export { uuidv7 }