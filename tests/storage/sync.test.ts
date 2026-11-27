import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSyncEngine } from '../../site/.vitepress/theme/composables/user-storage/sync'
import { currentDb, openDatabase, putHighlight, softDeleteHighlight } from '../../site/.vitepress/theme/composables/user-storage/db'
import { AuthError, GraphError, type AuthProvider, type GraphItem, type GraphTransport } from '../../site/.vitepress/theme/composables/user-storage/types'
import { hl } from './fixtures'

/* ---------- 内存 MockGraph ---------- */
class MockGraph implements GraphTransport {
  files = new Map<string, { body: string; eTag: string }>()
  private counter = 0
  failNext: { op: string; error: GraphError }[] = []
  writes: { path: string; cond?: unknown }[] = []

  private maybeFail(op: string) {
    const idx = this.failNext.findIndex((f) => f.op === op)
    if (idx >= 0) {
      const [f] = this.failNext.splice(idx, 1)
      throw f.error
    }
  }
  seed(path: string, body: unknown, eTag?: string) {
    this.files.set(path, { body: JSON.stringify(body), eTag: eTag ?? `etag-${++this.counter}` })
  }
  async list(folder: string): Promise<GraphItem[]> {
    this.maybeFail('list')
    const prefix = folder === 'root' ? '' : `${folder}/`
    const items: GraphItem[] = []
    for (const [path, v] of this.files) {
      if (prefix && !path.startsWith(prefix)) continue
      if (!prefix && path.includes('/')) continue
      const name = prefix ? path.slice(prefix.length) : path
      items.push({ name, eTag: v.eTag, id: name })
    }
    return items
  }
  async read(path: string) {
    this.maybeFail('read')
    const f = this.files.get(path)
    return f ? { body: f.body, eTag: f.eTag } : null
  }
  async write(path: string, body: string | ArrayBuffer, cond?: { ifMatch?: string; ifNoneMatch?: '*' }) {
    this.maybeFail('write')
    this.writes.push({ path, cond })
    const existing = this.files.get(path)
    if (cond?.ifNoneMatch === '*' && existing) throw new GraphError('exists', 412, false)
    if (cond?.ifMatch && existing && existing.eTag !== cond.ifMatch) throw new GraphError('stale', 412, false)
    if (cond?.ifMatch && !existing) throw new GraphError('gone', 412, false)
    const eTag = `etag-${++this.counter}`
    this.files.set(path, { body: typeof body === 'string' ? body : '', eTag })
    return { eTag }
  }
  async remove(path: string, cond?: { ifMatch?: string }) {
    this.maybeFail('remove')
    const existing = this.files.get(path)
    if (cond?.ifMatch && existing && existing.eTag !== cond.ifMatch) throw new GraphError('stale', 412, false)
    this.files.delete(path)
  }
}

const UID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

const authMock: AuthProvider = {
  async init() {},
  current: () => ({ scope: 'ms-test', displayName: 'T', email: 't@x.com' }),
  async login() {
    return { scope: 'ms-test', displayName: 'T', email: 't@x.com' }
  },
  async logout() {},
  async getToken() {
    return 'tok'
  },
  onChange: () => () => {},
}

let graph: MockGraph
beforeEach(async () => {
  await openDatabase('anon')
  graph = new MockGraph()
})
afterEach(() => {
  vi.useRealTimers()
})

const engine = (over: Partial<Parameters<typeof createSyncEngine>[0]> = {}) =>
  createSyncEngine({ db: currentDb(), transport: graph, auth: authMock, ...over })

describe('sync 上传/下载', () => {
  it('本地 dirty 上传 → cloudState + dirty=0 + baseEtag', async () => {
    await putHighlight(hl({ id: 'h1' }))
    const e = engine()
    const report = await e.syncNow()
    expect(report.uploaded).toBe(1)
    expect(graph.files.has('highlights/h1.json')).toBe(true)
    const row = await currentDb().highlights.get('h1')
    expect(row?.local.dirty).toBe(0)
    expect(row?.local.baseEtag).toBeTruthy()
    expect(await currentDb().outbox.count()).toBe(0)
  })

  it('★ 增量发现：eTag 未变不下载；新增下载', async () => {
    const id = UID(1)
    graph.seed(`highlights/${id}.json`, hl({ id, note: 'cloud' }))
    const e = engine()
    const r1 = await e.syncNow()
    expect(r1.downloaded).toBe(1)
    expect((await currentDb().highlights.get(id))?.note).toBe('cloud')
    // 第二轮 eTag 未变 → 不下载
    const r2 = await e.syncNow()
    expect(r2.downloaded).toBe(0)
  })

  it('★ 412 → 拉远端 → 合并 → 重传', async () => {
    await putHighlight(hl({ id: 'h1', note: 'local', updatedAt: '2026-01-02T00:00:00.000Z' }))
    // 云端已有较新版本，local baseEtag 设为 stale
    graph.seed('highlights/h1.json', hl({ id: 'h1', note: 'remote', updatedAt: '2026-01-03T00:00:00.000Z', deviceId: 'devB' }), 'etag-current')
    await currentDb().highlights.update('h1', { 'local.baseEtag': 'etag-stale' })
    const e = engine()
    const report = await e.syncNow()
    expect(report.merged).toBeGreaterThanOrEqual(1)
    const row = await currentDb().highlights.get('h1')
    expect(row?.note).toBe('remote') // 远端较新胜
    expect(row?.local.dirty).toBe(0) // 重传成功
    expect(graph.files.get('highlights/h1.json')?.body).toContain('remote')
  })

  it('★ 软删除复活防护：graveyard id 迟到上传被丢弃 + 远端清除', async () => {
    const id = UID(2)
    await currentDb().meta.put({ key: 'graveyard', value: { schemaVersion: 1, entries: { [id]: { purgedAt: '2026-01-01T00:00:00.000Z' } } } })
    graph.seed(`highlights/${id}.json`, hl({ id }))
    // 本地积压一个上传 op（离线迟到）
    await currentDb().highlights.put({ ...hl({ id }), local: { dirty: 1, baseEtag: null, baseSnapshot: null }, dirty: 1 })
    await currentDb().outbox.add({ entity: 'highlight', id, type: 'put', createdAt: '2026-01-01T00:00:00.000Z' })
    const e = engine()
    await e.syncNow()
    expect(graph.files.has(`highlights/${id}.json`)).toBe(false) // 远端被清
    expect(await currentDb().outbox.where('[entity+id]').equals(['highlight', id]).count()).toBe(0)
  })

  it('★ 外部删改：远端缺失 → 本地重建上传；未知文件不读不删 + 标记', async () => {
    await putHighlight(hl({ id: 'h1' }))
    await currentDb().cloudState.put({ id: 'h1', eTag: 'old', syncedRev: 1 })
    await currentDb().highlights.update('h1', { dirty: 0, 'local.dirty': 0 })
    await currentDb().outbox.clear()
    graph.seed('highlights/unknown-file.txt', { junk: true })
    const e = engine()
    await e.syncNow()
    expect(graph.files.has('highlights/h1.json')).toBe(true) // 重建
    expect(graph.files.has('highlights/unknown-file.txt')).toBe(true) // 不删
    expect(e.getStatus().unknownFiles).toBe(true)
  })
})

describe('sync 退避与状态机', () => {
  it('★ 401 → 续期失败 → needs-auth', async () => {
    await putHighlight(hl({ id: 'h1' }))
    graph.failNext.push({ op: 'write', error: new GraphError('401', 401, false) })
    const renewAuth: AuthProvider = {
      ...authMock,
      getToken: async () => {
        throw new AuthError('需要重新登录', 'needs-login')
      },
    }
    const e = createSyncEngine({ db: currentDb(), transport: graph, auth: renewAuth })
    await e.syncNow()
    expect(e.getStatus().state).toBe('needs-auth')
  })

  it('★ 退避 1/2/4s ≤3 次（注入 timers/random）', async () => {
    const delays: number[] = []
    const timers = {
      setTimeout: ((fn: () => void, ms: number) => {
        delays.push(ms)
        fn() // 立即执行，仅记录延迟值
        return 0 as unknown as ReturnType<typeof setTimeout>
      }) as typeof setTimeout,
      clearTimeout: (() => {}) as typeof clearTimeout,
    }
    await putHighlight(hl({ id: 'h1' }))
    graph.failNext.push(
      { op: 'list', error: new GraphError('503', 503, true) },
      { op: 'list', error: new GraphError('503', 503, true) },
      { op: 'list', error: new GraphError('503', 503, true) },
      { op: 'list', error: new GraphError('503', 503, true) },
    )
    const e = createSyncEngine({ db: currentDb(), transport: graph, auth: authMock, timers, random: () => 0.5 })
    const report = await e.syncNow()
    expect(delays.slice(0, 3)).toEqual([1000, 2000, 4000])
    expect(report.failed).toBeGreaterThanOrEqual(1)
  })

  it('★ mutation 3s 防抖合并；单飞', async () => {
    const pending: { fn: () => void; ms: number }[] = []
    const timers = {
      setTimeout: ((fn: () => void, ms: number) => {
        pending.push({ fn, ms })
        return pending.length as unknown as ReturnType<typeof setTimeout>
      }) as typeof setTimeout,
      clearTimeout: ((id: number) => {
        pending.splice(id - 1, 1)
      }) as typeof clearTimeout,
    }
    await putHighlight(hl({ id: 'h1' }))
    const e = createSyncEngine({ db: currentDb(), transport: graph, auth: authMock, timers })
    const spy = vi.spyOn(graph, 'write')
    e.trigger('mutation')
    e.trigger('mutation')
    e.trigger('mutation')
    expect(pending).toHaveLength(1) // 三次合并为一个防抖定时器
    expect(pending[0].ms).toBe(3000)
    expect(spy).not.toHaveBeenCalled()
    pending[0].fn() // 触发防抖到期
    await vi.waitFor(() => expect(spy).toHaveBeenCalled())
  })

  it('状态机：未连接 → disconnected', async () => {
    const e = createSyncEngine({ db: currentDb(), transport: graph, auth: { ...authMock, current: () => null } })
    await e.syncNow()
    expect(e.getStatus().state).toBe('disconnected')
  })

  it('pause → paused；resume 恢复', async () => {
    const e = engine()
    e.pause()
    await vi.waitFor(() => expect(e.getStatus().state).toBe('paused'))
    e.resume()
    await vi.waitFor(() => expect(e.getStatus().state).not.toBe('paused'))
  })
})

describe('sync GC', () => {
  it('★ 90 天边界：89d23h 不清 / 90d 清；溢出文件随父清除', async () => {
    const now = '2026-04-01T00:00:00.000Z'
    const within = new Date(Date.parse(now) - (89 * 24 + 23) * 3600 * 1000).toISOString()
    const expired = new Date(Date.parse(now) - 90 * 24 * 3600 * 1000).toISOString()
    await currentDb().highlights.put({ ...hl({ id: 'fresh', deletedAt: within }), local: { dirty: 0, baseEtag: 'e', baseSnapshot: null }, dirty: 0 })
    await currentDb().highlights.put({ ...hl({ id: 'old', deletedAt: expired }), local: { dirty: 0, baseEtag: 'e', baseSnapshot: null }, dirty: 0 })
    graph.seed('highlights/fresh.json', hl({ id: 'fresh', deletedAt: within }))
    graph.seed('highlights/old.json', hl({ id: 'old', deletedAt: expired }))
    graph.seed('highlights/old.conflict-1.json', { snapshot: {} })
    const e = engine({ now: () => now })
    const report = await e.syncNow()
    expect(graph.files.has('highlights/fresh.json')).toBe(true)
    expect(graph.files.has('highlights/old.json')).toBe(false)
    expect(graph.files.has('highlights/old.conflict-1.json')).toBe(false)
    expect(await currentDb().highlights.get('old')).toBeUndefined()
    const g = (await currentDb().meta.get('graveyard'))?.value as { entries: Record<string, unknown> }
    expect(g.entries.old).toBeTruthy()
    expect(report.purged).toBeGreaterThanOrEqual(1)
  })
})

describe('sync resolveConflict', () => {
  beforeEach(async () => {
    const copy = { deviceId: 'devB', rev: 2, updatedAt: '2026-01-03T00:00:00.000Z', keptAt: '2026-01-03T00:00:00.000Z', snapshot: { note: 'remote-note', types: [], color: 'green' as const, selector: hl().selector, deletedAt: null } }
    await putHighlight(hl({ id: 'h1', note: 'local-note', conflicts: [copy] }))
  })

  it('local → 丢弃副本', async () => {
    const e = engine()
    await e.resolveConflict('highlight', 'h1', 0, 'local')
    const row = await currentDb().highlights.get('h1')
    expect(row?.conflicts ?? []).toHaveLength(0)
    expect(row?.note).toBe('local-note')
  })

  it('remote → 副本内容作为正常编辑 rev+1 进 outbox', async () => {
    const e = engine()
    const before = (await currentDb().highlights.get('h1'))!.rev
    await e.resolveConflict('highlight', 'h1', 0, 'remote')
    const row = await currentDb().highlights.get('h1')
    expect(row?.note).toBe('remote-note')
    expect(row?.rev).toBe(before + 1)
    expect(await currentDb().outbox.where('[entity+id]').equals(['highlight', 'h1']).count()).toBe(1)
  })

  it('★ both → 新 uuid 记录，原 selector 不变', async () => {
    const e = engine()
    await e.resolveConflict('highlight', 'h1', 0, 'both')
    const all = await currentDb().highlights.toArray()
    expect(all).toHaveLength(2)
    const original = all.find((r) => r.id === 'h1')!
    const copy = all.find((r) => r.id !== 'h1')!
    expect(copy.note).toBe('remote-note')
    expect(copy.selector).toEqual(original.selector)
    expect(copy.id).not.toBe('h1')
  })

  it('listConflicts 返回存活记录的副本', async () => {
    const e = engine()
    const list = await e.listConflicts()
    expect(list).toHaveLength(1)
    expect(list[0].copies).toHaveLength(1)
  })
})

describe('B1-4 progress / settings 文档同步', () => {
  it('saveProgress → progress.json 上传；远端较新合并回本地', async () => {
    const { saveProgress, getProgressDoc } = await import('../../site/.vitepress/theme/composables/user-storage/db')
    await saveProgress({ pageId: 'vol1-01', paragraphId: 'P1', paragraphHash: 'h', offset: 0, pageProgress: 0.4, maxProgress: 0.4, updatedAt: '2026-01-01T00:00:00.000Z' })
    const e = engine()
    await e.syncNow()
    expect(graph.files.has('progress.json')).toBe(true)
    // 远端另一设备读到别处（较新）
    graph.seed('progress.json', { schemaVersion: 1, last: { pageId: 'vol2-01', paragraphId: 'P9', paragraphHash: 'h', offset: 0, pageProgress: 0.6, maxProgress: 0.6, updatedAt: '2026-01-02T00:00:00.000Z' }, pages: { 'vol2-01': { pageId: 'vol2-01', paragraphId: 'P9', paragraphHash: 'h', offset: 0, pageProgress: 0.6, maxProgress: 0.6, updatedAt: '2026-01-02T00:00:00.000Z' } } }, 'etag-newer')
    await e.syncNow()
    const doc = await getProgressDoc()
    expect(doc.pages['vol1-01']).toBeTruthy() // 本地页不丢
    expect(doc.pages['vol2-01']).toBeTruthy() // 远端页并入
    expect(doc.last?.pageId).toBe('vol2-01')
  })

  it('saveSyncedPrefs → settings.json 上传；逐字段 stamps 合并', async () => {
    const { saveSyncedPrefs, getSettingsDoc } = await import('../../site/.vitepress/theme/composables/user-storage/db')
    await saveSyncedPrefs({ fontSize: 22, lineHeight: 1.9, fontFamily: 'sans', theme: 'paper', annotationTypes: [] })
    const e = engine()
    await e.syncNow()
    expect(graph.files.has('settings.json')).toBe(true)
    const doc = await getSettingsDoc()
    expect(doc.prefs.fontSize).toBe(22)
  })
})

describe('★ 时钟不可信', () => {
  it('两侧 updatedAt 乱序仍走判定表不丢数据', async () => {
    const id = UID(3)
    // 快钟设备 remote updatedAt 更晚但内容冲突 → 败者仍存副本
    await putHighlight(hl({ id, note: 'local', updatedAt: '2026-01-02T00:00:00.000Z' }))
    graph.seed(`highlights/${id}.json`, hl({ id, note: 'fast-clock', updatedAt: '2099-01-01T00:00:00.000Z', deviceId: 'devB' }), 'etag-x')
    await currentDb().highlights.update(id, { 'local.baseEtag': 'etag-stale' })
    const e = engine()
    const report = await e.syncNow()
    const row = await currentDb().highlights.get(id)
    expect(row?.conflicts?.length).toBeGreaterThanOrEqual(1) // 败者不丢
    expect(report.conflicts).toBeGreaterThanOrEqual(1)
  })
})