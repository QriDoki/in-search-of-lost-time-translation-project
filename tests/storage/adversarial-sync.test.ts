/**
 * 对抗性测试 · sync.ts —— 断言依据：协议 §5.4 回合算法/状态机/退避、§3.1 不变量、D16/D18、data-model §8。
 * 全部外部 IO 经注入的 mock transport/auth；时钟/timers/random 可注入。
 * 主线：并发不静默丢失、墓碑不复活、失败不丢本地数据。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSyncEngine, type SyncDeps, type SyncEngine } from '../../site/.vitepress/theme/composables/user-storage/sync'
import {
  currentDb,
  openDatabase,
  putHighlight,
  softDeleteHighlight,
  type UserDb,
} from '../../site/.vitepress/theme/composables/user-storage/db'
import {
  AuthError,
  GraphError,
  type AuthProvider,
  type GraphItem,
  type GraphTransport,
  type Highlight,
} from '../../site/.vitepress/theme/composables/user-storage/types'
import { hl } from './fixtures'

/* ---------- 独立 mock transport（记录调用，可编程失败） ---------- */
class AdversarialGraph implements GraphTransport {
  files = new Map<string, { body: string; eTag: string }>()
  reads: string[] = []
  writes: { path: string; cond?: { ifMatch?: string; ifNoneMatch?: '*' } }[] = []
  removes: string[] = []
  lists: string[] = []
  private n = 0
  /** 按 path+操作 注入一次性/持续错误 */
  fail = new Map<string, GraphError>()
  failTimes = new Map<string, number>()

  seed(path: string, body: unknown, eTag?: string) {
    this.files.set(path, { body: JSON.stringify(body), eTag: eTag ?? `e${++this.n}` })
  }
  private maybeFail(key: string) {
    const times = this.failTimes.get(key)
    if (times !== undefined) {
      if (times > 0) {
        this.failTimes.set(key, times - 1)
        throw this.fail.get(key)!
      }
      return
    }
    const e = this.fail.get(key)
    if (e) throw e
  }
  async list(folder: string): Promise<GraphItem[]> {
    this.lists.push(folder)
    this.maybeFail(`list:${folder}`)
    const prefix = folder === 'root' ? '' : `${folder}/`
    const out: GraphItem[] = []
    for (const [path, v] of this.files) {
      if (prefix && !path.startsWith(prefix)) continue
      if (!prefix && path.includes('/')) continue
      out.push({ name: prefix ? path.slice(prefix.length) : path, eTag: v.eTag, id: path })
    }
    return out
  }
  async read(path: string) {
    this.reads.push(path)
    this.maybeFail(`read:${path}`)
    const f = this.files.get(path)
    return f ? { body: f.body, eTag: f.eTag } : null
  }
  async write(path: string, body: string | ArrayBuffer, cond?: { ifMatch?: string; ifNoneMatch?: '*' }) {
    this.writes.push({ path, cond })
    this.maybeFail(`write:${path}`)
    const existing = this.files.get(path)
    if (cond?.ifNoneMatch === '*' && existing) throw new GraphError('exists', 412, false)
    if (cond?.ifMatch && existing && existing.eTag !== cond.ifMatch) throw new GraphError('stale', 412, false)
    if (cond?.ifMatch && !existing) throw new GraphError('gone', 412, false)
    const eTag = `e${++this.n}`
    this.files.set(path, { body: typeof body === 'string' ? body : '', eTag })
    return { eTag }
  }
  async remove(path: string) {
    this.removes.push(path)
    this.maybeFail(`remove:${path}`)
    this.files.delete(path)
  }
}

const UID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

function authMock(over: Partial<AuthProvider> = {}): AuthProvider {
  return {
    async init() {},
    current: () => ({ scope: 'ms-test', displayName: 'T', email: 't@x.com' }),
    async login() { return { scope: 'ms-test', displayName: 'T', email: 't@x.com' } },
    async logout() {},
    async getToken() { return 'tok' },
    onChange: () => () => {},
    ...over,
  }
}

/** 立即触发的 timers（记录延迟供断言） */
function fastTimers() {
  const delays: number[] = []
  return {
    delays,
    setTimeout: (cb: () => void, ms: number) => { delays.push(ms); cb(); return 0 as unknown as ReturnType<typeof setTimeout> },
    clearTimeout: () => {},
  }
}

let graph: AdversarialGraph
let db: UserDb
let engine: SyncEngine
const NOW = '2026-06-01T00:00:00.000Z'

function makeEngine(over: { now?: () => string; timers?: unknown; auth?: AuthProvider; random?: () => number } = {}) {
  const timers = (over.timers ?? fastTimers()) as unknown as SyncDeps['timers']
  engine = createSyncEngine({
    db,
    transport: graph,
    auth: over.auth ?? authMock(),
    now: over.now ?? (() => NOW),
    timers,
    random: over.random ?? (() => 0.5),
  })
  return engine
}

beforeEach(async () => {
  localStorage.clear()
  db = await openDatabase('anon')
  graph = new AdversarialGraph()
})
afterEach(() => {
  engine?.dispose()
})

describe('412 → 拉远端三方合并重传（协议 §5.4 步骤 4）', () => {
  it('★ 上传 412 → read 远端 → merge → 新 baseEtag 重传成功，败者入副本', async () => {
    const id = UID(1)
    // 本地：基于 base 改了 note；远端：另一设备改了 color（eTag 与本地 baseEtag 不同）
    const base = hl({ id, note: 'base', color: 'yellow' })
    await putHighlight(hl({ id, note: '本地改', color: 'yellow', updatedAt: '2026-05-01T00:00:00.000Z' }))
    await currentDb().highlights.update(id, { 'local.baseEtag': 'e-old', 'local.baseSnapshot': base })
    graph.seed(`highlights/${id}.json`, hl({ id, note: 'base', color: 'blue', updatedAt: '2026-05-02T00:00:00.000Z' }), 'e-remote')
    makeEngine()
    const report = await engine.syncNow()
    expect(report.uploaded).toBe(1)
    // 重传用了远端新 eTag 的 If-Match
    const lastWrite = graph.writes.filter((w) => w.path === `highlights/${id}.json`).pop()
    expect(lastWrite!.cond).toEqual({ ifMatch: 'e-remote' })
    const row = await currentDb().highlights.get(id)
    // 远端 updatedAt 新 → color 取远端 blue；本地 note 单侧改保留
    expect(row!.color).toBe('blue')
    expect(row!.note).toBe('本地改')
    expect(row!.local.dirty).toBe(0)
    expect(await currentDb().outbox.count()).toBe(0)
  })

  it('★ 双侧异值 412 合并 → 败者副本不丢', async () => {
    const id = UID(2)
    const base = hl({ id, note: 'base' })
    await putHighlight(hl({ id, note: '本地败者', updatedAt: '2026-05-01T00:00:00.000Z' }))
    await currentDb().highlights.update(id, { 'local.baseEtag': 'e-old', 'local.baseSnapshot': base })
    graph.seed(`highlights/${id}.json`, hl({ id, note: '远端胜者', updatedAt: '2026-05-02T00:00:00.000Z' }), 'e-remote')
    makeEngine()
    await engine.syncNow()
    const row = await currentDb().highlights.get(id)
    expect(row!.note).toBe('远端胜者')
    expect(row!.conflicts!.some((c) => c.snapshot.note === '本地败者')).toBe(true)
    // 上传的载荷也携带副本
    const uploaded = JSON.parse(graph.files.get(`highlights/${id}.json`)!.body)
    expect(uploaded.conflicts.some((c: { snapshot: { note: string } }) => c.snapshot.note === '本地败者')).toBe(true)
  })

  it('★ 持续 412 ≤3 次 → 该条 failed，op 保留下轮再来，本地数据不丢', async () => {
    const id = UID(3)
    await putHighlight(hl({ id, note: '本地' }))
    graph.seed(`highlights/${id}.json`, hl({ id, note: '远端' }), 'e-remote')
    // 每次 write 都 412（ifMatch 永远对不上：远端 eTag 持续变化）
    const origWrite = graph.write.bind(graph)
    graph.write = async (path, body, cond) => {
      if (path === `highlights/${id}.json`) {
        graph.writes.push({ path, cond })
        graph.seed(path, hl({ id, note: '远端又变' })) // eTag 变化 → 下次仍 412
        throw new GraphError('stale', 412, false)
      }
      return origWrite(path, body, cond)
    }
    makeEngine()
    const report = await engine.syncNow()
    expect(report.failed).toBeGreaterThanOrEqual(1)
    expect(await currentDb().outbox.count()).toBe(1) // op 保留
    expect((await currentDb().highlights.get(id))!.note).toBeTruthy() // 本地不丢
    const attempts = graph.writes.filter((w) => w.path === `highlights/${id}.json`).length
    expect(attempts).toBeLessThanOrEqual(3)
  })
})

describe('墓碑复活防护（不变量 5 / data-model §8.4）', () => {
  it('★ 远端 graveyard 命中 → 远端文件被清，不下载', async () => {
    const id = UID(4)
    graph.seed('graveyard.json', { schemaVersion: 1, entries: { [id]: { purgedAt: '2026-01-01T00:00:00.000Z' } } })
    graph.seed(`highlights/${id}.json`, hl({ id, note: '已清除的' }))
    makeEngine()
    await engine.syncNow()
    expect(graph.files.has(`highlights/${id}.json`)).toBe(false)
    expect(graph.removes).toContain(`highlights/${id}.json`)
    expect(await currentDb().highlights.get(id)).toBeUndefined()
  })

  it('★ 离线迟到上传：outbox 中 graveyard id 的 op 被丢弃，永不上传', async () => {
    const id = UID(5)
    // 离线设备积压的 put（记录从未同步成功）
    await putHighlight(hl({ id, note: '离线积压' }))
    graph.seed('graveyard.json', { schemaVersion: 1, entries: { [id]: { purgedAt: '2026-01-01T00:00:00.000Z' } } })
    makeEngine()
    await engine.syncNow()
    expect(graph.files.has(`highlights/${id}.json`)).toBe(false)
    expect(graph.writes.some((w) => w.path === `highlights/${id}.json`)).toBe(false)
    expect(await currentDb().outbox.count()).toBe(0)
  })

  it('graveyard 并集合并上传：本地新增 purged 传播到云端', async () => {
    const id = UID(6)
    await currentDb().meta.put({ key: 'graveyard', value: { schemaVersion: 1, entries: { [id]: { purgedAt: '2026-02-01T00:00:00.000Z' } } } })
    graph.seed('graveyard.json', { schemaVersion: 1, entries: { [UID(7)]: { purgedAt: '2026-01-01T00:00:00.000Z' } } })
    makeEngine()
    await engine.syncNow()
    const cloud = JSON.parse(graph.files.get('graveyard.json')!.body)
    expect(cloud.entries[id]).toBeDefined()
    expect(cloud.entries[UID(7)]).toBeDefined()
  })
})

describe('GC 90 天边界（协议 §5.4 步骤 6 / §7.2 / D25）', () => {
  it('★ 89d23h 不清；恰好 90d 清（删远端+删本地+入 graveyard）', async () => {
    const keep = UID(8)
    const purge = UID(9)
    const nowMs = Date.parse(NOW)
    const d89 = new Date(nowMs - (89 * 24 + 23) * 3600 * 1000).toISOString()
    const d90 = new Date(nowMs - 90 * 24 * 3600 * 1000).toISOString()
    for (const [id, deletedAt] of [[keep, d89], [purge, d90]] as const) {
      await putHighlight(hl({ id }))
      await currentDb().cloudState.put({ id, eTag: 'e', syncedRev: 1 })
      await currentDb().highlights.update(id, { deletedAt, 'local.baseEtag': 'e' })
      graph.seed(`highlights/${id}.json`, hl({ id, deletedAt }))
    }
    makeEngine({ now: () => NOW })
    const report = await engine.syncNow()
    expect(await currentDb().highlights.get(keep)).toBeDefined()
    expect(await currentDb().highlights.get(purge)).toBeUndefined()
    expect(graph.files.has(`highlights/${keep}.json`)).toBe(true)
    expect(graph.files.has(`highlights/${purge}.json`)).toBe(false)
    const g = (await currentDb().meta.get('graveyard'))!.value as { entries: Record<string, unknown> }
    expect(g.entries[purge]).toBeDefined()
    expect(g.entries[keep]).toBeUndefined()
    expect(report.purged).toBe(1)
  })

  it('★ GC 清除父记录时溢出文件一并清除、同入 graveyard（D16）', async () => {
    const id = UID(10)
    const nowMs = Date.parse(NOW)
    const d90 = new Date(nowMs - 90 * 24 * 3600 * 1000).toISOString()
    await putHighlight(hl({ id }))
    await currentDb().cloudState.put({ id, eTag: 'e', syncedRev: 1 })
    await currentDb().highlights.update(id, { deletedAt: d90, 'local.baseEtag': 'e' })
    graph.seed(`highlights/${id}.json`, hl({ id, deletedAt: d90 }))
    graph.seed(`highlights/${id}.conflict-1.json`, { deviceId: 'd', rev: 1, updatedAt: d90, keptAt: d90, snapshot: { note: '溢出', types: [], color: 'yellow', selector: hl().selector, deletedAt: null } })
    makeEngine({ now: () => NOW })
    await engine.syncNow()
    expect(graph.files.has(`highlights/${id}.conflict-1.json`)).toBe(false)
    expect(graph.removes).toContain(`highlights/${id}.conflict-1.json`)
  })
})

describe('D16 溢出副本下载挂回父记录', () => {
  const copy = (keptAt: string, note: string) => ({
    deviceId: 'd', rev: 1, updatedAt: '2026-01-01T00:00:00.000Z', keptAt,
    snapshot: { note, types: [], color: 'yellow' as const, selector: hl().selector, deletedAt: null },
  })

  it('父记录 2 份 + 远端溢出文件 → 挂回成 3 份', async () => {
    const id = UID(11)
    await currentDb().highlights.put({ ...hl({ id, conflicts: [copy('2026-01-01T00:00:00.000Z', 'c1'), copy('2026-01-02T00:00:00.000Z', 'c2')] }), local: { dirty: 0, baseEtag: 'e-parent', baseSnapshot: null }, dirty: 0 } as never)
    await currentDb().cloudState.put({ id, eTag: 'e-parent', syncedRev: 1 })
    graph.seed(`highlights/${id}.json`, hl({ id }), 'e-parent')
    graph.seed(`highlights/${id}.conflict-1.json`, copy('2026-01-03T00:00:00.000Z', '溢出副本'))
    makeEngine()
    await engine.syncNow()
    const row = await currentDb().highlights.get(id)
    expect(row!.conflicts).toHaveLength(3)
    expect(row!.conflicts!.some((c) => c.snapshot.note === '溢出副本')).toBe(true)
  })

  it('★ 父记录已满 3 份 + 更新的溢出副本 → 最新副本不得静默丢弃（不变量 9 / D16）', async () => {
    const id = UID(12)
    const existing = [
      copy('2026-01-01T00:00:00.000Z', '旧1'),
      copy('2026-01-02T00:00:00.000Z', '旧2'),
      copy('2026-01-03T00:00:00.000Z', '旧3'),
    ]
    await currentDb().highlights.put({ ...hl({ id, conflicts: existing }), local: { dirty: 0, baseEtag: 'e-parent', baseSnapshot: null }, dirty: 0 } as never)
    await currentDb().cloudState.put({ id, eTag: 'e-parent', syncedRev: 1 })
    graph.seed(`highlights/${id}.json`, hl({ id }), 'e-parent')
    graph.seed(`highlights/${id}.conflict-1.json`, copy('2026-01-04T00:00:00.000Z', '最新溢出'))
    makeEngine()
    await engine.syncNow()
    const row = await currentDb().highlights.get(id)
    // 协议：挂回父记录；cap 3 时最旧转溢出文件。最新副本必须可见（在 conflicts 或仍为溢出文件）
    const inConflicts = row!.conflicts!.some((c) => c.snapshot.note === '最新溢出')
    const stillOverflowFile = graph.files.has(`highlights/${id}.conflict-1.json`)
    expect(inConflicts || stillOverflowFile).toBe(true)
    // 且不得把最新副本读掉后既不入 conflicts 也不保留文件（静默丢弃）
    expect(inConflicts).toBe(true)
  })
})

describe('增量发现与未知文件（协议 §5.4 步骤 2 / data-model §8.2）', () => {
  it('★ eTag 未变不下载；新增下载；eTag 变化下载合并', async () => {
    const same = UID(13)
    const changed = UID(14)
    const fresh = UID(15)
    await currentDb().highlights.put({ ...hl({ id: same, note: '本地' }), local: { dirty: 0, baseEtag: 'e-same', baseSnapshot: hl({ id: same, note: '本地' }) }, dirty: 0 } as never)
    await currentDb().cloudState.put({ id: same, eTag: 'e-same', syncedRev: 1 })
    graph.seed(`highlights/${same}.json`, hl({ id: same, note: '本地' }), 'e-same')
    await currentDb().cloudState.put({ id: changed, eTag: 'e-old', syncedRev: 1 })
    await currentDb().highlights.put({ ...hl({ id: changed, note: '本地旧' }), local: { dirty: 0, baseEtag: 'e-old', baseSnapshot: hl({ id: changed, note: 'base' }) }, dirty: 0 } as never)
    graph.seed(`highlights/${changed}.json`, hl({ id: changed, note: '远端新', updatedAt: '2026-05-01T00:00:00.000Z' }), 'e-new')
    graph.seed(`highlights/${fresh}.json`, hl({ id: fresh, note: '全新' }))
    makeEngine()
    const report = await engine.syncNow()
    expect(graph.reads).not.toContain(`highlights/${same}.json`)
    expect(graph.reads).toContain(`highlights/${changed}.json`)
    expect(graph.reads).toContain(`highlights/${fresh}.json`)
    expect((await currentDb().highlights.get(fresh))!.note).toBe('全新')
    expect((await currentDb().highlights.get(fresh))!.local.dirty).toBe(0)
    expect(report.downloaded).toBe(2)
  })

  it('★ 未知命名文件 → unknownFiles=true，不读不删', async () => {
    graph.seed('highlights/notes.txt', '不是本应用的文件')
    graph.seed('highlights/我的文档.json', '{}')
    makeEngine()
    await engine.syncNow()
    expect(engine.getStatus().unknownFiles).toBe(true)
    expect(graph.reads).not.toContain('highlights/notes.txt')
    expect(graph.reads).not.toContain('highlights/我的文档.json')
    expect(graph.files.has('highlights/notes.txt')).toBe(true)
    expect(graph.removes).not.toContain('highlights/notes.txt')
  })

  it('★ 外部删改：远端缺失但 cloudState 存在、本地仍在 → 重建上传', async () => {
    const id = UID(16)
    await putHighlight(hl({ id, note: '本地重建' }))
    await currentDb().cloudState.put({ id, eTag: 'e-gone', syncedRev: 1 })
    await currentDb().highlights.update(id, { 'local.baseEtag': 'e-gone', 'local.dirty': 0, dirty: 0 })
    await currentDb().outbox.clear()
    makeEngine()
    await engine.syncNow()
    expect(graph.files.has(`highlights/${id}.json`)).toBe(true)
    expect(JSON.parse(graph.files.get(`highlights/${id}.json`)!.body).note).toBe('本地重建')
  })

  it('外部删改：本地已 GC → 删 cloudState 行', async () => {
    const id = UID(17)
    await currentDb().cloudState.put({ id, eTag: 'e-gone', syncedRev: 1 })
    makeEngine()
    await engine.syncNow()
    expect(await currentDb().cloudState.get(id)).toBeUndefined()
  })
})

describe('退避与错误语义（协议 §5.4 退避 / §7.2）', () => {
  it('★ retryable 失败退避 1s/2s/4s（random=0.5 → 无抖动），≤3 次后 failed', async () => {
    const timers = fastTimers()
    graph.fail.set('list:highlights', new GraphError('throttled', 429, true))
    makeEngine({ timers, random: () => 0.5 })
    const report = await engine.syncNow()
    expect(timers.delays).toEqual([1000, 2000, 4000])
    expect(report.failed).toBeGreaterThanOrEqual(1)
  })

  it('退避抖动 ±20%：random=0 → ×0.8，random=1 → ×1.2', async () => {
    const t0 = fastTimers()
    graph.fail.set('list:highlights', new GraphError('x', 503, true))
    makeEngine({ timers: t0, random: () => 0 })
    await engine.syncNow()
    expect(t0.delays).toEqual([800, 1600, 3200])
    engine.dispose()
    const t1 = fastTimers()
    graph = new AdversarialGraph()
    graph.fail.set('list:highlights', new GraphError('x', 503, true))
    makeEngine({ timers: t1, random: () => 1 })
    await engine.syncNow()
    expect(t1.delays).toEqual([1200, 2400, 4800])
  })

  it('★ 401 → getToken 续期一次重试成功', async () => {
    const id = UID(18)
    await putHighlight(hl({ id }))
    graph.failTimes.set(`write:highlights/${id}.json`, 1)
    graph.fail.set(`write:highlights/${id}.json`, new GraphError('expired', 401, false))
    let tokenCalls = 0
    const auth = authMock({ async getToken() { tokenCalls += 1; return 'fresh' } })
    makeEngine({ auth })
    const report = await engine.syncNow()
    expect(report.uploaded).toBe(1)
    expect(tokenCalls).toBeGreaterThanOrEqual(1)
  })

  it('★ 持续 401（续期仍 401）→ needs-auth 终止（协议「仍 401 → needs-auth」）', async () => {
    const id = UID(19)
    await putHighlight(hl({ id }))
    graph.fail.set(`write:highlights/${id}.json`, new GraphError('expired', 401, false))
    const auth = authMock({ async getToken() { return 'still-bad' } })
    makeEngine({ auth })
    await engine.syncNow()
    expect(engine.getStatus().state).toBe('needs-auth')
  })

  it('★ 网络错误 → offline 终止，outbox 与本地数据不丢；online 触发恢复', async () => {
    const id = UID(20)
    await putHighlight(hl({ id, note: '离线数据安全' }))
    graph.fail.set(`write:highlights/${id}.json`, new GraphError('net down', 0, true))
    makeEngine()
    await engine.syncNow()
    expect(engine.getStatus().state).toBe('offline')
    expect(await currentDb().outbox.count()).toBe(1)
    expect((await currentDb().highlights.get(id))!.note).toBe('离线数据安全')
    // 恢复
    graph.fail.delete(`write:highlights/${id}.json`)
    engine.trigger('online')
    await vi.waitFor(async () => {
      expect(graph.files.has(`highlights/${id}.json`)).toBe(true)
    })
  })

  it('非 retryable 错误（403）→ 该条 failed，回合继续其余条', async () => {
    const bad = UID(21)
    const good = UID(22)
    await putHighlight(hl({ id: bad }))
    await putHighlight(hl({ id: good }))
    graph.fail.set(`write:highlights/${bad}.json`, new GraphError('forbidden', 403, false))
    makeEngine()
    const report = await engine.syncNow()
    expect(report.failed).toBeGreaterThanOrEqual(1)
    expect(graph.files.has(`highlights/${good}.json`)).toBe(true)
    expect(await currentDb().outbox.count()).toBe(1) // bad 的 op 保留
  })
})

describe('单飞 / 防抖 / 状态机（协议 §5.4）', () => {
  it('★ 单飞：回合进行中再 syncNow → 返回同一 Promise，不并发跑两轮', async () => {
    makeEngine()
    const p1 = engine.syncNow()
    const p2 = engine.syncNow()
    expect(p1).toBe(p2)
    await p1
    expect(graph.lists.filter((f) => f === 'highlights')).toHaveLength(1)
  })

  it('★ mutation 3s 防抖合并：多次 trigger 只跑一轮', async () => {
    const scheduled: { cb: () => void; ms: number }[] = []
    const timers = {
      setTimeout: (cb: () => void, ms: number) => { scheduled.push({ cb, ms }); return scheduled.length as unknown as ReturnType<typeof setTimeout> },
      clearTimeout: (id: ReturnType<typeof setTimeout>) => { scheduled[(id as unknown as number) - 1] = { cb: () => {}, ms: 0 } },
    }
    makeEngine({ timers })
    await putHighlight(hl({ id: UID(23) }))
    engine.trigger('mutation')
    engine.trigger('mutation')
    engine.trigger('mutation')
    const active = scheduled.filter((s) => s.ms === 3000)
    expect(active.length).toBeGreaterThanOrEqual(1)
    // 手动触发最后一个防抖回调
    active[active.length - 1].cb()
    await vi.waitFor(() => expect(graph.files.has(`highlights/${UID(23)}.json`)).toBe(true))
    expect(graph.lists.filter((f) => f === 'highlights')).toHaveLength(1)
  })

  it('★ 状态机优先级：disconnected > 一切', async () => {
    await putHighlight(hl({ id: UID(24) }))
    makeEngine({ auth: authMock({ current: () => null }) })
    await vi.waitFor(() => expect(engine.getStatus().state).toBe('disconnected'))
  })

  it('paused 优先于 offline/pending', async () => {
    await putHighlight(hl({ id: UID(25) }))
    makeEngine()
    engine.pause()
    await vi.waitFor(() => expect(engine.getStatus().state).toBe('paused'))
  })

  it('conflict 优先于 pending', async () => {
    const id = UID(26)
    await putHighlight(hl({ id, note: '甲', updatedAt: '2026-05-01T00:00:00.000Z' }))
    await currentDb().highlights.update(id, { 'local.baseEtag': 'e-old', 'local.baseSnapshot': hl({ id, note: 'base' }) })
    graph.seed(`highlights/${id}.json`, hl({ id, note: '乙', updatedAt: '2026-05-02T00:00:00.000Z' }), 'e-remote')
    makeEngine()
    await engine.syncNow()
    // 合并产生副本且本地 dirty 待重传 → conflict 态优先
    const row = await currentDb().highlights.get(id)
    expect(row!.conflicts!.length).toBeGreaterThan(0)
    expect(engine.getStatus().state).toBe('conflict')
  })

  it('队列空无冲突 → synced', async () => {
    makeEngine()
    await engine.syncNow()
    expect(engine.getStatus().state).toBe('synced')
    expect(engine.getStatus().pending).toBe(0)
  })
})

describe('resolveConflict 三裁决（协议 §5.4）', () => {
  const copy = (note: string, exact = '别的文字') => ({
    deviceId: 'devOther', rev: 2, updatedAt: '2026-05-01T00:00:00.000Z', keptAt: '2026-05-01T00:00:00.000Z',
    snapshot: { note, types: ['🔤'], color: 'blue' as const, selector: { ...hl().selector, exact, end: { paragraphId: 'P000001', offset: exact.length } }, deletedAt: null },
  })

  async function seedConflict(id: string) {
    await currentDb().highlights.put({
      ...hl({ id, note: '当前', conflicts: [copy('副本甲'), copy('副本乙', '另一段')] }),
      local: { dirty: 0, baseEtag: 'e', baseSnapshot: null }, dirty: 0,
    } as never)
  }

  it('local = 显式丢弃该副本，记录内容不变', async () => {
    const id = UID(27)
    await seedConflict(id)
    makeEngine()
    await engine.resolveConflict('highlight', id, 0, 'local')
    const row = await currentDb().highlights.get(id)
    expect(row!.conflicts).toHaveLength(1)
    expect(row!.conflicts![0].snapshot.note).toBe('副本乙')
    expect(row!.note).toBe('当前')
    expect(row!.rev).toBe(1)
  })

  it('remote = 副本内容作为一次正常编辑（rev+1，进 outbox）', async () => {
    const id = UID(28)
    await seedConflict(id)
    makeEngine()
    await engine.resolveConflict('highlight', id, 0, 'remote')
    const row = await currentDb().highlights.get(id)
    expect(row!.note).toBe('副本甲')
    expect(row!.color).toBe('blue')
    expect(row!.rev).toBe(2)
    expect(row!.local.dirty).toBe(1)
    const ops = await currentDb().outbox.toArray()
    expect(ops.some((o) => o.id === id && o.type === 'put')).toBe(true)
  })

  it('★ both = 副本另存新记录（新 UUIDv7），原记录 selector 不变', async () => {
    const id = UID(29)
    await seedConflict(id)
    makeEngine()
    const before = await currentDb().highlights.get(id)
    await engine.resolveConflict('highlight', id, 0, 'both')
    const orig = await currentDb().highlights.get(id)
    expect(orig!.selector).toEqual(before!.selector) // 原记录锚点不动
    expect(orig!.conflicts).toHaveLength(1)
    const all = await currentDb().highlights.toArray()
    const newRec = all.find((r) => r.id !== id)!
    expect(newRec).toBeDefined()
    expect(newRec.id).not.toBe(id)
    expect(newRec.note).toBe('副本甲')
    expect(newRec.deletedAt).toBeNull()
    expect(newRec.rev).toBe(1)
    // 协议 §5.4：「selector/锚点字段同原记录」→ 新记录锚点取原记录
    expect(newRec.selector).toEqual(orig!.selector)
  })

  it('处理完冲突归零 → 自动 trigger 同步', async () => {
    const id = UID(30)
    await currentDb().highlights.put({ ...hl({ id, conflicts: [copy('唯一副本')] }), local: { dirty: 0, baseEtag: 'e', baseSnapshot: null }, dirty: 0 } as never)
    makeEngine()
    await engine.resolveConflict('highlight', id, 0, 'local')
    expect(engine.getStatus().conflicts).toBe(0)
  })
})

describe('progress / settings 文档同步（协议 §5.4 步骤 5）', () => {
  it('★ progress 按页合并：远端独有页并入本地，maxProgress 单调，写回 If-Match', async () => {
    await currentDb().progress.put({ pageId: 'vol1-01', paragraphId: 'P1', paragraphHash: 'h', offset: 0.5, pageProgress: 0.5, maxProgress: 0.5, updatedAt: '2026-05-01T00:00:00.000Z' })
    graph.seed('progress.json', {
      schemaVersion: 1, last: null,
      pages: {
        'vol1-01': { pageId: 'vol1-01', paragraphId: 'P1', paragraphHash: 'h', offset: 0.2, pageProgress: 0.2, maxProgress: 0.9, updatedAt: '2026-04-01T00:00:00.000Z' },
        'vol2-02': { pageId: 'vol2-02', paragraphId: 'P2', paragraphHash: 'h', offset: 0.1, pageProgress: 0.1, maxProgress: 0.1, updatedAt: '2026-04-01T00:00:00.000Z' },
      },
    }, 'e-prog')
    makeEngine()
    await engine.syncNow()
    const pages = await currentDb().progress.toArray()
    expect(pages.map((p) => p.pageId).sort()).toEqual(['vol1-01', 'vol2-02'])
    expect(pages.find((p) => p.pageId === 'vol1-01')!.maxProgress).toBe(0.9)
    const w = graph.writes.find((x) => x.path === 'progress.json')
    expect(w!.cond).toEqual({ ifMatch: 'e-prog' })
    const cloud = JSON.parse(graph.files.get('progress.json')!.body)
    expect(Object.keys(cloud.pages).sort()).toEqual(['vol1-01', 'vol2-02'])
  })

  it('★ progress 写 412 → 重拉重合再传（协议「重拉重合」，远端新增页不得丢）', async () => {
    await currentDb().progress.put({ pageId: 'vol1-01', paragraphId: 'P1', paragraphHash: 'h', offset: 0.5, pageProgress: 0.5, maxProgress: 0.5, updatedAt: '2026-05-01T00:00:00.000Z' })
    graph.seed('progress.json', { schemaVersion: 1, last: null, pages: {} }, 'e-prog')
    // 第一次 write 412，同时远端被第三设备加入 vol3-03
    const origWrite = graph.write.bind(graph)
    let failed = false
    graph.write = async (path, body, cond) => {
      if (path === 'progress.json' && !failed) {
        failed = true
        graph.writes.push({ path, cond })
        graph.seed('progress.json', {
          schemaVersion: 1, last: null,
          pages: { 'vol3-03': { pageId: 'vol3-03', paragraphId: 'P3', paragraphHash: 'h', offset: 0, pageProgress: 0, maxProgress: 0.3, updatedAt: '2026-05-02T00:00:00.000Z' } },
        })
        throw new GraphError('stale', 412, false)
      }
      return origWrite(path, body, cond)
    }
    makeEngine()
    await engine.syncNow()
    const cloud = JSON.parse(graph.files.get('progress.json')!.body)
    // 重合后远端第三设备的页必须保留
    expect(cloud.pages['vol3-03']).toBeDefined()
    expect(cloud.pages['vol1-01']).toBeDefined()
  })

  it('settings 按字段 stamps 合并写回', async () => {
    await currentDb().settings.put({ key: 'synced', value: { schemaVersion: 1, prefs: { fontSize: 22, lineHeight: 1.9, fontFamily: 'sans', theme: 'paper', annotationTypes: [] }, stamps: { fontSize: { t: '2026-05-02T00:00:00.000Z', d: 'devL' } } } })
    graph.seed('settings.json', { schemaVersion: 1, prefs: { fontSize: 18, lineHeight: 2.2, fontFamily: 'kai', theme: 'dark', annotationTypes: ['🔤'] }, stamps: { fontSize: { t: '2026-05-01T00:00:00.000Z', d: 'devR' }, theme: { t: '2026-05-03T00:00:00.000Z', d: 'devR' } } }, 'e-set')
    makeEngine()
    await engine.syncNow()
    const local = (await currentDb().settings.get('synced'))!.value as { prefs: { fontSize: number; theme: string } }
    expect(local.prefs.fontSize).toBe(22) // 本地 stamp 新
    expect(local.prefs.theme).toBe('dark') // 远端 stamp 新
  })
})

describe('上传约束（协议 §5.4 步骤 4 / data-model §4.3）', () => {
  it('★ 单文件 >256KB → 该 op failed 不上传，op 保留', async () => {
    const id = UID(31)
    await putHighlight(hl({ id, note: '正常', bigUnknown: 'x'.repeat(300 * 1024) } as Partial<Highlight>))
    makeEngine()
    const report = await engine.syncNow()
    expect(report.failed).toBeGreaterThanOrEqual(1)
    expect(graph.files.has(`highlights/${id}.json`)).toBe(false)
    expect(await currentDb().outbox.count()).toBe(1)
  })

  it('★ 远端高 schemaVersion → 本地只读标记，不上传不改动本地内容', async () => {
    const id = UID(32)
    await putHighlight(hl({ id, note: '本地内容' }))
    graph.seed(`highlights/${id}.json`, hl({ id, note: '远端新格式', schemaVersion: 2 as 1 }), 'e-hi')
    makeEngine()
    await engine.syncNow()
    const row = await currentDb().highlights.get(id)
    expect(row!.local.readOnly).toBe('higher-schema')
    expect(row!.note).toBe('本地内容')
    expect(graph.writes.some((w) => w.path === `highlights/${id}.json`)).toBe(false)
  })

  it('上传载荷剥离 local 块与 dirty（不变量 3）', async () => {
    const id = UID(33)
    await putHighlight(hl({ id }))
    makeEngine()
    await engine.syncNow()
    const uploaded = JSON.parse(graph.files.get(`highlights/${id}.json`)!.body)
    expect(uploaded.local).toBeUndefined()
    expect(uploaded.dirty).toBeUndefined()
  })

  it('新建上传用 If-None-Match:*，已同步用 If-Match', async () => {
    const id = UID(34)
    await putHighlight(hl({ id }))
    makeEngine()
    await engine.syncNow()
    const w1 = graph.writes.find((x) => x.path === `highlights/${id}.json`)
    expect(w1!.cond).toEqual({ ifNoneMatch: '*' })
    // 再编辑 → If-Match
    await putHighlight(hl({ id, note: '二改' }))
    await engine.syncNow()
    const w2 = graph.writes.filter((x) => x.path === `highlights/${id}.json`).pop()
    expect(w2!.cond).toHaveProperty('ifMatch')
  })
})
