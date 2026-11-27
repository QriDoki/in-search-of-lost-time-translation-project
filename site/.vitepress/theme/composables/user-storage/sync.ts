/**
 * 同步引擎（protocol §5.4）：状态机、回合算法、退避、GC、认领、冲突裁决。
 * 注入 db/transport/auth/clock/timers/random，全部外部 IO 经 transport（可 mock）。
 * 本地数据在任何失败下不丢（outbox 与 dirty 持久）。
 */
import type { Table } from 'dexie'
import type { UserDb } from './db'
import { deviceId, queueOutbox, toCloud } from './db'
import {
  capConflicts,
  isGraveyarded,
  mergeBookmark,
  mergeGraveyard,
  mergeHighlight,
  mergeProgress,
  mergeSettings,
} from './merge'
import type {
  AuthProvider,
  Bookmark,
  ConflictInfo,
  GraphTransport,
  GraveyardDoc,
  Highlight,
  OutboxOp,
  ProgressDoc,
  SettingsDoc,
  SyncState,
  SyncStatus,
} from './types'
import { AuthError, GraphError } from './types'
import { deepClone, nowIso, uuidv7 } from './util'

export interface SyncDeps {
  db: UserDb
  transport: GraphTransport
  auth: AuthProvider
  now?: () => string
  timers?: { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout }
  random?: () => number
}
export interface SyncReport {
  uploaded: number
  downloaded: number
  merged: number
  conflicts: number
  failed: number
  purged: number
}
export interface SyncEngine {
  getStatus(): SyncStatus
  subscribe(cb: (s: SyncStatus) => void): () => void
  trigger(reason: 'init' | 'mutation' | 'online' | 'manual'): void
  syncNow(): Promise<SyncReport>
  pause(): void
  resume(): void
  listConflicts(): Promise<ConflictInfo[]>
  resolveConflict(entity: 'highlight' | 'bookmark', id: string, copyIndex: number, choice: 'local' | 'remote' | 'both'): Promise<void>
  dispose(): void
}

const MAX_UPLOAD_BYTES = 256 * 1024
const GC_DAYS = 90
const RECORD_RE = /^([0-9a-f-]{36})\.json$/i
const CONFLICT_RE = /^([0-9a-f-]{36})\.conflict-(\d+)\.json$/i

export function createSyncEngine(deps: SyncDeps): SyncEngine {
  const { db, transport, auth } = deps
  const now = deps.now ?? nowIso
  const timers = deps.timers ?? { setTimeout, clearTimeout }
  const random = deps.random ?? Math.random

  const listeners = new Set<(s: SyncStatus) => void>()
  let lastSyncAt: string | null = null
  let lastError: string | null = null
  let unknownFiles = false
  let needsAuth = false
  let offline = false
  let paused = false
  let running: Promise<SyncReport> | null = null
  let rerun = false
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let disposed = false
  let currentStatus: SyncStatus = { state: 'disconnected', pending: 0, conflicts: 0, lastSyncAt: null, lastError: null, unknownFiles: false }

  const emptyReport = (): SyncReport => ({ uploaded: 0, downloaded: 0, merged: 0, conflicts: 0, failed: 0, purged: 0 })

  async function countPending(): Promise<number> {
    return db.outbox.count()
  }
  async function countConflicts(): Promise<number> {
    // G1：冲突供给认「带待裁决副本的记录」，含 #7 墓碑存活记录；仅排除 graveyard 已清除 id
    const g = await readGraveyard()
    const h = await db.highlights.filter((r) => (r.conflicts?.length ?? 0) > 0 && !isGraveyarded(r.id, g)).count()
    const b = await db.bookmarks.filter((r) => (r.conflicts?.length ?? 0) > 0 && !isGraveyarded(r.id, g)).count()
    return h + b
  }

  async function deriveState(): Promise<SyncState> {
    if (!auth.current()) return 'disconnected'
    if (needsAuth) return 'needs-auth'
    const metaPaused = (await db.meta.get('paused'))?.value
    if (paused || metaPaused) return 'paused'
    if (offline || (typeof navigator !== 'undefined' && navigator.onLine === false)) return 'offline'
    if (running) return 'syncing'
    if ((await countConflicts()) > 0) return 'conflict'
    if (lastError) return 'error'
    if ((await countPending()) > 0) return 'pending'
    return 'synced'
  }

  async function emit(): Promise<void> {
    const status: SyncStatus = {
      state: await deriveState(),
      pending: await countPending(),
      conflicts: await countConflicts(),
      lastSyncAt,
      lastError,
      unknownFiles,
    }
    currentStatus = status
    for (const cb of listeners) cb(status)
  }

  /* ---------- 退避与错误处理 ---------- */

  async function withRetry<T>(fn: () => Promise<T>, report: SyncReport): Promise<T | null> {
    const delays = [1000, 2000, 4000]
    let attempt = 0
    for (;;) {
      try {
        return await fn()
      } catch (e) {
        if (e instanceof GraphError && e.status === 401) {
          // 续期一次重试
          try {
            await auth.getToken()
            return await fn()
          } catch {
            needsAuth = true
            throw e
          }
        }
        const retryable = e instanceof GraphError ? e.retryable : true
        if (!retryable) throw e
        if (attempt >= delays.length) {
          report.failed += 1
          lastError = (e as Error).message
          return null
        }
        const jitter = 1 + (random() * 0.4 - 0.2)
        await new Promise<void>((resolve) => timers.setTimeout(resolve, delays[attempt] * jitter))
        attempt += 1
      }
    }
  }

  /* ---------- 回合算法 ---------- */

  async function readGraveyard(): Promise<GraveyardDoc> {
    return ((await db.meta.get('graveyard'))?.value as GraveyardDoc) ?? { schemaVersion: 1, entries: {} }
  }

  async function round(): Promise<SyncReport> {
    const report = emptyReport()
    needsAuth = false
    offline = false
    lastError = null
    try {
      // 1. graveyard
      const localG = await readGraveyard()
      const remoteRaw = await withRetry(() => transport.read('graveyard.json'), report)
      let remoteG: GraveyardDoc = { schemaVersion: 1, entries: {} }
      let gEtag: string | null = null
      if (remoteRaw) {
        remoteG = JSON.parse(remoteRaw.body)
        gEtag = remoteRaw.eTag
      }
      const mergedG = mergeGraveyard(localG, remoteG)
      const localHasNew = Object.keys(localG.entries).some((id) => !remoteG.entries[id])
      let graveyard = mergedG
      if (localHasNew || Object.keys(mergedG.entries).length > Object.keys(remoteG.entries).length) {
        graveyard = (await writeDoc('graveyard.json', mergedG, gEtag, report, (remote) => mergeGraveyard(localG, remote))) as GraveyardDoc
      }
      await db.meta.put({ key: 'graveyard', value: graveyard })

      // 2/3. 记录
      await syncFolder('highlights', 'highlight', graveyard, report)
      await syncFolder('bookmarks', 'bookmark', graveyard, report)

      // 4. 上传 outbox
      await uploadOutbox(graveyard, report)

      // 5. progress / settings
      await syncProgress(report)
      await syncSettings(report)

      // 6. GC
      await gc(graveyard, report)

      // 7.
      lastSyncAt = now()
      await db.meta.put({ key: 'lastSyncAt', value: lastSyncAt })
    } catch (e) {
      if (e instanceof GraphError && e.status === 401) needsAuth = true
      else if (e instanceof AuthError) needsAuth = true
      else if (!(e instanceof GraphError) || e.retryable) offline = true
      lastError = (e as Error).message
    }
    await emit()
    return report
  }

  /** 写文档；412 → 重拉远端并 remerge 再传（≤3 次）。返回最终写入的文档（F3）。 */
  async function writeDoc(path: string, doc: unknown, etag: string | null, report: SyncReport, remerge?: (remote: any) => unknown): Promise<any> {
    for (let i = 0; i < 3; i += 1) {
      const body = JSON.stringify(doc)
      try {
        await transport.write(path, body, etag ? { ifMatch: etag } : { ifNoneMatch: '*' })
        return doc
      } catch (e) {
        if (e instanceof GraphError && e.status === 412) {
          const fresh = await transport.read(path)
          etag = fresh?.eTag ?? null
          if (fresh && remerge) doc = remerge(JSON.parse(fresh.body))
          continue
        }
        throw e
      }
    }
    report.failed += 1
    return doc
  }

  async function syncFolder(folder: 'highlights' | 'bookmarks', entity: 'highlight' | 'bookmark', graveyard: GraveyardDoc, report: SyncReport): Promise<void> {
    const items = await withRetry(() => transport.list(folder), report)
    if (!items) return
    const table = (entity === 'highlight' ? db.highlights : db.bookmarks) as unknown as Table<any, string>
    const seen = new Set<string>()
    for (const item of items) {
      const recMatch = item.name.match(RECORD_RE)
      const confMatch = item.name.match(CONFLICT_RE)
      if (confMatch) {
        // D16 溢出副本：下载挂回父记录
        const parentId = confMatch[1]
        if (isGraveyarded(parentId, graveyard)) {
          await withRetry(() => transport.remove(`${folder}/${item.name}`), report)
          continue
        }
        const raw = await withRetry(() => transport.read(`${folder}/${item.name}`), report)
        if (raw) {
          const copy = JSON.parse(raw.body)
          const parent = await table.get(parentId)
          if (parent) {
            // F5：按 keptAt 保留最新 3 份，最旧转回溢出文件（不静默丢最新副本）
            const { kept, overflow } = capConflicts(parent.conflicts ?? [], [copy])
            await table.update(parentId, { conflicts: kept })
            await withRetry(() => transport.remove(`${folder}/${item.name}`), report)
            if (overflow.length) {
              const siblings = (await withRetry(() => transport.list(folder), report)) ?? []
              const used = new Set<number>()
              for (const s of siblings) {
                const m = s.name.match(new RegExp(`^${parentId}\\.conflict-(\\d+)\\.json$`))
                if (m) used.add(Number(m[1]))
              }
              let n = 1
              for (const oc of overflow) {
                while (used.has(n)) n += 1
                used.add(n)
                await withRetry(() => transport.write(`${folder}/${parentId}.conflict-${n}.json`, JSON.stringify(oc)), report)
              }
            }
          }
        }
        continue
      }
      if (!recMatch) {
        unknownFiles = true
        continue
      }
      const id = recMatch[1]
      seen.add(id)
      if (isGraveyarded(id, graveyard)) {
        await withRetry(() => transport.remove(`${folder}/${item.name}`), report)
        report.purged += 1
        continue
      }
      const cloud = await db.cloudState.get(id)
      const local = await table.get(id)
      if (cloud && cloud.eTag === item.eTag) {
        continue // eTag 未变不下载
      }
      const raw = await withRetry(() => transport.read(`${folder}/${item.name}`), report)
      if (!raw) continue
      report.downloaded += 1
      const remote = JSON.parse(raw.body)
      if (!local) {
        await table.put({ ...remote, local: { dirty: 0, baseEtag: raw.eTag, baseSnapshot: remote }, dirty: 0 })
        await db.cloudState.put({ id, eTag: raw.eTag, syncedRev: remote.rev })
        continue
      }
      if (remote.schemaVersion > local.schemaVersion) {
        await table.update(id, { 'local.readOnly': 'higher-schema' })
        continue
      }
      const base = local.local.baseSnapshot as never
      const out =
        entity === 'highlight'
          ? mergeHighlight({ base, local: toCloud(local) as Highlight, remote, selfDeviceId: deviceId(), now: now() })
          : mergeBookmark({ base, local: toCloud(local) as Bookmark, remote, selfDeviceId: deviceId(), now: now() })
      await table.put({ ...out.record, local: { dirty: 1, baseEtag: raw.eTag, baseSnapshot: remote }, dirty: 1 })
      await db.cloudState.put({ id, eTag: raw.eTag, syncedRev: out.record.rev })
      await queueOutbox(entity, id, out.record.deletedAt ? 'delete' : 'put')
      report.merged += 1
      report.conflicts += out.appended.length
    }
    // 3. 远端缺失但 cloudState 存在
    for (const cloud of await db.cloudState.toArray()) {
      if (seen.has(cloud.id) || cloud.id === 'progress' || cloud.id === 'settings' || cloud.id === 'graveyard') continue
      const belongs = entity === 'highlight' ? await db.highlights.get(cloud.id) : await db.bookmarks.get(cloud.id)
      const otherFolder = entity === 'highlight' ? await db.bookmarks.get(cloud.id) : await db.highlights.get(cloud.id)
      if (otherFolder) continue
      if (belongs) {
        await queueOutbox(entity, cloud.id, belongs.deletedAt ? 'delete' : 'put')
      } else {
        await db.cloudState.delete(cloud.id)
      }
    }
  }

  async function uploadOutbox(graveyard: GraveyardDoc, report: SyncReport): Promise<void> {
    const ops = await db.outbox.orderBy('seq').toArray()
    for (const op of ops) {
      if (op.entity === 'progress' || op.entity === 'settings') continue
      if (isGraveyarded(op.id, graveyard)) {
        await db.outbox.delete(op.seq!)
        continue
      }
      const table = (op.entity === 'highlight' ? db.highlights : db.bookmarks) as unknown as Table<any, string>
      const row = await table.get(op.id)
      if (!row) {
        await db.outbox.delete(op.seq!)
        continue
      }
      if (row.local.readOnly === 'higher-schema') continue
      const folder = op.entity === 'highlight' ? 'highlights' : 'bookmarks'
      const path = `${folder}/${op.id}.json`
      let uploaded = false
      let renewed401 = false
      for (let attempt = 0; attempt < 3 && !uploaded; attempt += 1) {
        const current = (await table.get(op.id)) ?? row
        const payload = toCloud(current)
        const body = JSON.stringify(payload)
        if (new Blob([body]).size > MAX_UPLOAD_BYTES) {
          report.failed += 1
          lastError = `${op.id} 超过 256KB，不上传`
          break
        }
        try {
          const cond = current.local.baseEtag ? { ifMatch: current.local.baseEtag } : { ifNoneMatch: '*' as const }
          const res = await transport.write(path, body, cond)
          await db.cloudState.put({ id: op.id, eTag: res.eTag, syncedRev: current.rev })
          await table.update(op.id, { dirty: 0, 'local.dirty': 0, 'local.baseEtag': res.eTag, 'local.baseSnapshot': payload })
          await db.outbox.delete(op.seq!)
          report.uploaded += 1
          uploaded = true
        } catch (e) {
          if (e instanceof GraphError && e.status === 412) {
            const raw = await transport.read(path)
            if (raw) {
              const remote = JSON.parse(raw.body)
              const base = current.local.baseSnapshot as never
              const out =
                op.entity === 'highlight'
                  ? mergeHighlight({ base, local: toCloud(current) as Highlight, remote, selfDeviceId: deviceId(), now: now() })
                  : mergeBookmark({ base, local: toCloud(current) as Bookmark, remote, selfDeviceId: deviceId(), now: now() })
              await table.put({ ...out.record, local: { ...current.local, dirty: 1, baseEtag: raw.eTag, baseSnapshot: remote }, dirty: 1 })
              await db.cloudState.put({ id: op.id, eTag: raw.eTag, syncedRev: out.record.rev })
              report.merged += 1
              report.conflicts += out.appended.length
              continue // 下一轮尝试重算载荷 + 新 baseEtag
            }
            // F4：远端文件已被外部删除（read null）→ 清陈旧 baseEtag，以本地为准重建（ifNoneMatch）
            await table.update(op.id, { 'local.baseEtag': null })
            continue
          }
          if (e instanceof GraphError && e.status === 401) {
            // F7：续期一次重试仍 401 → needs-auth 终止回合
            if (renewed401) {
              needsAuth = true
              return
            }
            try {
              await auth.getToken()
              renewed401 = true
              continue
            } catch {
              needsAuth = true
              return
            }
          }
          const retryable = e instanceof GraphError ? e.retryable : true
          if (!retryable) {
            report.failed += 1
            lastError = (e as Error).message
            break
          }
          // 网络类 → 终止回合
          offline = true
          return
        }
      }
      if (!uploaded) report.failed += 1
    }
  }

  async function syncProgress(report: SyncReport): Promise<void> {
    const pages: Record<string, ProgressDoc['pages'][string]> = {}
    for (const p of await db.progress.toArray()) pages[p.pageId] = p
    const local: ProgressDoc = { schemaVersion: 1, last: ((await db.meta.get('last'))?.value as ProgressDoc['last']) ?? null, pages }
    const raw = await withRetry(() => transport.read('progress.json'), report)
    const remote: ProgressDoc = raw ? JSON.parse(raw.body) : { schemaVersion: 1, last: null, pages: {} }
    const merged = mergeProgress(local, remote, deviceId())
    const unchanged = raw && JSON.stringify(remote) === JSON.stringify(merged)
    let finalDoc = merged
    if (!unchanged || !raw) {
      // F3：412 重拉远端并重新 mergeProgress（第三设备并发新增页不丢）
      finalDoc = (await writeDoc('progress.json', merged, raw?.eTag ?? null, report, (fresh) => mergeProgress(local, fresh, deviceId()))) as ProgressDoc
    }
    await db.transaction('rw', db.progress, db.meta, async () => {
      await db.progress.clear()
      await db.progress.bulkPut(Object.values(finalDoc.pages))
      await db.meta.put({ key: 'last', value: finalDoc.last })
    })
    await db.outbox.where('[entity+id]').equals(['progress', 'doc']).delete()
  }

  async function syncSettings(report: SyncReport): Promise<void> {
    const local = ((await db.settings.get('synced'))?.value as SettingsDoc) ?? { schemaVersion: 1, prefs: { fontSize: 20, lineHeight: 1.9, fontFamily: 'sans', theme: 'paper', annotationTypes: [] }, stamps: {} }
    const raw = await withRetry(() => transport.read('settings.json'), report)
    const remote: SettingsDoc = raw ? JSON.parse(raw.body) : { schemaVersion: 1, prefs: local.prefs, stamps: {} }
    const merged = mergeSettings(local, remote)
    const unchanged = raw && JSON.stringify(remote) === JSON.stringify(merged)
    let finalDoc = merged
    if (!unchanged || !raw) {
      finalDoc = (await writeDoc('settings.json', merged, raw?.eTag ?? null, report, (fresh) => mergeSettings(local, fresh))) as SettingsDoc
    }
    await db.settings.put({ key: 'synced', value: finalDoc })
    await db.outbox.where('[entity+id]').equals(['settings', 'doc']).delete()
  }

  async function gc(graveyard: GraveyardDoc, report: SyncReport): Promise<void> {
    const cutoff = Date.parse(now()) - GC_DAYS * 24 * 3600 * 1000
    const newEntries: GraveyardDoc['entries'] = {}
    const scan = async (entity: 'highlight' | 'bookmark') => {
      const table = entity === 'highlight' ? db.highlights : db.bookmarks
      const folder = entity === 'highlight' ? 'highlights' : 'bookmarks'
      for (const row of await table.toArray()) {
        if (!row.deletedAt || Date.parse(row.deletedAt) > cutoff) continue
        await withRetry(() => transport.remove(`${folder}/${row.id}.json`), report)
        // 溢出文件一并清除
        const items = await withRetry(() => transport.list(folder), report)
        for (const item of items ?? []) {
          if (item.name.startsWith(`${row.id}.conflict-`)) await withRetry(() => transport.remove(`${folder}/${item.name}`), report)
        }
        await table.delete(row.id)
        await db.cloudState.delete(row.id)
        await db.outbox.where('[entity+id]').equals([entity, row.id]).delete()
        newEntries[row.id] = { purgedAt: now() }
        report.purged += 1
      }
    }
    await scan('highlight')
    await scan('bookmark')
    if (Object.keys(newEntries).length) {
      const merged = mergeGraveyard(graveyard, { schemaVersion: 1, entries: newEntries })
      await db.meta.put({ key: 'graveyard', value: merged })
    }
  }

  /* ---------- 单飞 / 触发 ---------- */

  function startRound(): Promise<SyncReport> {
    if (running) {
      rerun = true
      return running
    }
    running = (async () => {
      await emit()
      let report = await round()
      while (rerun && (await countPending()) > 0) {
        rerun = false
        report = await round()
      }
      running = null
      rerun = false
      await emit()
      return report
    })()
    return running
  }

  const engine: SyncEngine = {
    getStatus: () => currentStatus,
    subscribe(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    trigger(reason) {
      if (disposed) return
      if (reason === 'mutation') {
        if (debounceTimer) timers.clearTimeout(debounceTimer)
        debounceTimer = timers.setTimeout(() => {
          debounceTimer = null
          void startRound()
        }, 3000)
        return
      }
      void startRound()
    },
    syncNow() {
      return startRound()
    },
    pause() {
      paused = true
      void db.meta.put({ key: 'paused', value: true })
      void emit()
    },
    resume() {
      paused = false
      void db.meta.put({ key: 'paused', value: false })
      void emit()
      void startRound()
    },
    async listConflicts() {
      // G1：墓碑 + 待裁决副本也要进列表（#7 存活记录恰是墓碑）；排除 graveyard 已清除 id
      const g = await readGraveyard()
      const out: ConflictInfo[] = []
      for (const row of await db.highlights.toArray()) {
        if (row.conflicts?.length && !isGraveyarded(row.id, g)) out.push({ entity: 'highlight', id: row.id, current: toCloud(row) as Highlight, copies: row.conflicts })
      }
      for (const row of await db.bookmarks.toArray()) {
        if (row.conflicts?.length && !isGraveyarded(row.id, g)) out.push({ entity: 'bookmark', id: row.id, current: toCloud(row) as Bookmark, copies: row.conflicts })
      }
      return out
    },
    async resolveConflict(entity, id, copyIndex, choice) {
      const table = (entity === 'highlight' ? db.highlights : db.bookmarks) as unknown as Table<any, string>
      const row = await table.get(id)
      if (!row) return
      const conflicts = [...(row.conflicts ?? [])]
      const copy = conflicts[copyIndex]
      if (!copy) return
      conflicts.splice(copyIndex, 1)
      if (choice === 'remote') {
        // 副本内容作为一次正常编辑（rev+1，进 outbox）
        const snap = copy.snapshot as Record<string, unknown>
        const updated = { ...row, ...snap, rev: row.rev + 1, updatedAt: now(), deviceId: deviceId(), dirty: 1, conflicts, local: { ...row.local, dirty: 1 } }
        await table.put(updated as never)
        await queueOutbox(entity, id, 'put')
      } else if (choice === 'both') {
        const newId = uuidv7()
        const snap = copy.snapshot as Record<string, unknown>
        const base = toCloud(row) as Record<string, unknown>
        // F8：内容取副本，但 selector/锚点字段同原记录（协议 §5.4）
        const copyRecord = {
          ...base,
          ...snap,
          selector: base.selector,
          paragraphId: base.paragraphId,
          textHash: base.textHash,
          revision: base.revision,
          chapterId: base.chapterId,
          id: newId,
          rev: 1,
          deviceId: deviceId(),
          createdAt: now(),
          updatedAt: now(),
          deletedAt: null,
          conflicts: undefined,
        }
        await table.put({ ...copyRecord, local: { dirty: 1, baseEtag: null, baseSnapshot: null }, dirty: 1 } as never)
        await queueOutbox(entity, newId, 'put')
        await table.update(id, { conflicts })
      } else {
        await table.update(id, { conflicts })
      }
      if ((await countConflicts()) === 0) engine.trigger('mutation')
      await emit()
    },
    dispose() {
      disposed = true
      if (debounceTimer) timers.clearTimeout(debounceTimer)
      listeners.clear()
    },
  }

  // getStatus 异步派生：提供同步快照 + 订阅精确值
  void emit()
  return engine
}