/**
 * 对抗性测试 · db.ts —— 断言依据：协议 §5.2、§3.1 不变量、D11/D12/D18/D32、data-model §7/§12。
 * outbox 只存指针（不变量 2）；账号隔离（不变量 6）；导入永不整库覆盖之外的本地写入语义。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  claimAnonData,
  currentDb,
  currentScope,
  deviceId,
  getHighlight,
  getProgressDoc,
  getSettingsDoc,
  listHighlights,
  migrateLegacyData,
  openDatabase,
  putBookmark,
  putHighlight,
  rebuildOutbox,
  sanitizeBookmark,
  sanitizeHighlight,
  saveDevicePrefs,
  saveProgress,
  saveSyncedPrefs,
  softDeleteBookmark,
  softDeleteHighlight,
  switchScope,
  ValidationError,
  legacyHashMatches,
  type LegacyMap,
} from '../../site/.vitepress/theme/composables/user-storage/db'
import { fnv1a36, nfc } from '../../site/.vitepress/theme/composables/user-storage/util'
import type { Highlight, ReadingPosition } from '../../site/.vitepress/theme/composables/user-storage/types'
import { hl, bm } from './fixtures'

beforeEach(async () => {
  localStorage.clear()
  await openDatabase('anon')
})

const pos = (pageId: string, over: Partial<ReadingPosition> = {}): ReadingPosition => ({
  pageId, paragraphId: 'p-000001', paragraphHash: 'h', offset: 0.2, pageProgress: 0.3,
  maxProgress: 0.4, updatedAt: '2026-01-01T00:00:00.000Z', ...over,
})

describe('outbox：只存指针 + 同 id 合并（不变量 2 / data-model §7.3）', () => {
  it('★ op 只含指针字段，不携带载荷', async () => {
    await putHighlight(hl({ id: 'x', note: '很长的批注'.repeat(100) }))
    const ops = await currentDb().outbox.toArray()
    expect(ops).toHaveLength(1)
    for (const op of ops) {
      expect(Object.keys(op).sort()).toEqual(['createdAt', 'entity', 'id', 'seq', 'type'])
    }
  })

  it('★ put+put → 仍一条 put（新 put 覆盖旧 put）', async () => {
    await putHighlight(hl({ id: 'x', note: '一' }))
    await putHighlight(hl({ id: 'x', note: '二' }))
    const ops = await currentDb().outbox.toArray()
    expect(ops).toHaveLength(1)
    expect(ops[0].type).toBe('put')
    // 载荷以实体表当前值为准
    expect((await getHighlight('x'))!.note).toBe('二')
  })

  it('★ put+delete → delete 覆盖 put（已同步记录）', async () => {
    await putHighlight(hl({ id: 'x' }))
    await currentDb().cloudState.put({ id: 'x', eTag: 'e1', syncedRev: 1 })
    await currentDb().highlights.update('x', { 'local.baseEtag': 'e1' })
    await softDeleteHighlight('x')
    const ops = await currentDb().outbox.toArray()
    expect(ops).toHaveLength(1)
    expect(ops[0].type).toBe('delete')
  })

  it('delete 后再 put → 一条 put', async () => {
    await putHighlight(hl({ id: 'x' }))
    await currentDb().cloudState.put({ id: 'x', eTag: 'e1', syncedRev: 1 })
    await currentDb().highlights.update('x', { 'local.baseEtag': 'e1' })
    await softDeleteHighlight('x')
    await putHighlight(hl({ id: 'x', deletedAt: null, rev: 3 }))
    const ops = await currentDb().outbox.toArray()
    expect(ops).toHaveLength(1)
    expect(ops[0].type).toBe('put')
  })

  it('★ progress/settings 的 id 同为 doc，按 [entity+id] 区分不互相覆盖', async () => {
    await saveProgress(pos('vol1-01'))
    await saveSyncedPrefs({ fontSize: 20, lineHeight: 1.9, fontFamily: 'sans', theme: 'paper', annotationTypes: [] })
    const ops = await currentDb().outbox.toArray()
    expect(ops).toHaveLength(2)
    expect(ops.map((o) => o.entity).sort()).toEqual(['progress', 'settings'])
    expect(ops.every((o) => o.id === 'doc')).toBe(true)
    // 再各写一次仍各一条
    await saveProgress(pos('vol1-02'))
    await saveSyncedPrefs({ fontSize: 22, lineHeight: 1.9, fontFamily: 'sans', theme: 'paper', annotationTypes: [] })
    expect(await currentDb().outbox.count()).toBe(2)
  })

  it('不同记录 id 各自独立 op', async () => {
    await putHighlight(hl({ id: 'a' }))
    await putHighlight(hl({ id: 'b' }))
    await putBookmark(bm({ id: 'c' }))
    expect(await currentDb().outbox.count()).toBe(3)
  })
})

describe('D18：未同步的创建+删除 = 硬删除 + outbox 无操作', () => {
  it('★ 从未上传（无 cloudState 且 baseEtag null）→ 硬删、丢 op、无墓碑', async () => {
    await putHighlight(hl({ id: 'fresh' }))
    expect(await currentDb().outbox.count()).toBe(1)
    await softDeleteHighlight('fresh')
    expect(await getHighlight('fresh')).toBeNull()
    expect(await currentDb().outbox.count()).toBe(0)
    expect(await listHighlights()).toHaveLength(0)
  })

  it('★ 已同步过的记录删除 → 软删除墓碑 + delete op + rev+1', async () => {
    await putHighlight(hl({ id: 'synced', rev: 2 }))
    await currentDb().cloudState.put({ id: 'synced', eTag: 'e', syncedRev: 2 })
    await currentDb().highlights.update('synced', { 'local.baseEtag': 'e' })
    await softDeleteHighlight('synced')
    const row = await getHighlight('synced')
    expect(row).not.toBeNull()
    expect(row!.deletedAt).not.toBeNull()
    expect(row!.rev).toBe(3)
    const ops = await currentDb().outbox.toArray()
    expect(ops).toHaveLength(1)
    expect(ops[0].type).toBe('delete')
  })

  it('★ 撤销 = 以原 id 重建（rev+1），重新进 outbox', async () => {
    const original = hl({ id: 'undo', note: '快照', rev: 1 })
    await putHighlight(original)
    await softDeleteHighlight('undo') // 硬删
    await putHighlight({ ...original, rev: 2 }) // 撤销重建
    const row = await getHighlight('undo')
    expect(row!.note).toBe('快照')
    expect(row!.rev).toBe(2)
    expect(row!.deletedAt).toBeNull()
    const ops = await currentDb().outbox.toArray()
    expect(ops).toHaveLength(1)
    expect(ops[0].type).toBe('put')
  })

  it('bookmark 同样适用 D18', async () => {
    await putBookmark(bm({ id: 'bfresh' }))
    await softDeleteBookmark('bfresh')
    expect(await currentDb().bookmarks.get('bfresh')).toBeUndefined()
    expect(await currentDb().outbox.count()).toBe(0)
  })

  it('有 baseEtag 但无 cloudState 行 → 仍软删除（曾同步过）', async () => {
    await putHighlight(hl({ id: 'etag-only' }))
    await currentDb().highlights.update('etag-only', { 'local.baseEtag': 'e-old' })
    await softDeleteHighlight('etag-only')
    expect((await getHighlight('etag-only'))!.deletedAt).not.toBeNull()
  })
})

describe('账号隔离与认领（不变量 6 / data-model §7.1 / 协议 §5.2）', () => {
  it('★ 两 scope 同 id 不同内容互不可见；切回数据仍在', async () => {
    await openDatabase('ms-aaa')
    await putHighlight(hl({ id: 'shared-id', note: '账号A' }))
    await switchScope('ms-bbb')
    expect(currentScope()).toBe('ms-bbb')
    expect(await getHighlight('shared-id')).toBeNull()
    await putHighlight(hl({ id: 'shared-id', note: '账号B' }))
    await switchScope('ms-aaa')
    expect((await getHighlight('shared-id'))!.note).toBe('账号A')
    expect(currentDb().name).toBe('proust-reader-v1-ms-aaa')
  })

  it('★ 登出只切回 anon，不删除任何库', async () => {
    await openDatabase('ms-keep')
    await putHighlight(hl({ id: 'k', note: '保留' }))
    await switchScope('anon')
    await switchScope('ms-keep')
    expect((await getHighlight('k'))!.note).toBe('保留')
  })

  it('★ 认领：anon 逐条复制到账号库（含墓碑），按 id 去重', async () => {
    await putHighlight(hl({ id: 'c1', note: 'anon摘录' }))
    await putHighlight(hl({ id: 'c2' }))
    await currentDb().cloudState.put({ id: 'c2', eTag: 'e', syncedRev: 1 })
    await currentDb().highlights.update('c2', { 'local.baseEtag': 'e' })
    await softDeleteHighlight('c2') // 墓碑
    await putBookmark(bm({ id: 'cb' }))
    await claimAnonData('ms-claim')
    await switchScope('ms-claim')
    expect((await getHighlight('c1'))!.note).toBe('anon摘录')
    expect((await getHighlight('c2'))!.deletedAt).not.toBeNull()
    expect(await currentDb().bookmarks.get('cb')).toBeDefined()
    // 复制侧 dirty=1 待上传
    expect((await getHighlight('c1'))!.local.dirty).toBe(1)
    await switchScope('anon')
    const claimedBy = await currentDb().meta.get('claimedBy')
    expect(claimedBy!.value).toBe('ms-claim')
  })

  it('★ 认领：目标已有同 id → 走合并（base=目标 baseSnapshot），不覆盖', async () => {
    // 目标库先有同 id 记录（模拟另一设备已同步过）
    await openDatabase('ms-dup')
    const base = hl({ id: 'dup', note: '共同祖先' })
    await putHighlight(hl({ id: 'dup', note: '目标侧改', updatedAt: '2026-01-03T00:00:00.000Z' }))
    await currentDb().highlights.update('dup', { 'local.baseSnapshot': base, 'local.baseEtag': 'e', 'local.dirty': 0, dirty: 0 })
    // anon 侧同 id 不同内容
    await switchScope('anon')
    await putHighlight(hl({ id: 'dup', note: 'anon侧改', updatedAt: '2026-01-02T00:00:00.000Z' }))
    await claimAnonData('ms-dup')
    await switchScope('ms-dup')
    const row = await getHighlight('dup')
    // 两侧改且异值 → #5 目标侧 updatedAt 新胜，anon 侧入副本
    expect(row!.note).toBe('目标侧改')
    expect(row!.conflicts!.some((c) => c.snapshot.note === 'anon侧改')).toBe(true)
  })

  it('★ claimedBy 置位后 anon 库写操作抛 scope-claimed', async () => {
    await putHighlight(hl({ id: 'ro' }))
    await claimAnonData('ms-ro')
    // 当前库仍是 anon（claim 不切库）
    await expect(putHighlight(hl({ id: 'new' }))).rejects.toThrow('scope-claimed')
    await expect(softDeleteHighlight('ro')).rejects.toThrow('scope-claimed')
    await expect(putBookmark(bm({ id: 'nb' }))).rejects.toThrow('scope-claimed')
    await expect(saveProgress(pos('vol1-01'))).rejects.toThrow('scope-claimed')
    await expect(saveSyncedPrefs({ fontSize: 20, lineHeight: 1.9, fontFamily: 'sans', theme: 'paper', annotationTypes: [] })).rejects.toThrow('scope-claimed')
    // 读仍可用
    expect(await listHighlights()).toHaveLength(1)
  })

  it('★ claimedBy 后 anon 一切写操作含 saveDevicePrefs（协议 §5.2「一切写操作」）', async () => {
    await claimAnonData('ms-dev')
    await expect(saveDevicePrefs({ width: 700 })).rejects.toThrow('scope-claimed')
  })

  it('认领幂等：第二次不重复复制', async () => {
    await putHighlight(hl({ id: 'idem' }))
    await claimAnonData('ms-idem')
    await switchScope('ms-idem')
    const opsBefore = await currentDb().outbox.count()
    await switchScope('anon')
    await claimAnonData('ms-idem')
    await switchScope('ms-idem')
    expect(await currentDb().outbox.count()).toBe(opsBefore)
    expect(await currentDb().highlights.count()).toBe(1)
  })
})

describe('崩溃恢复 rebuildOutbox（协议 §5.2 / data-model §7.3）', () => {
  it('★ 丢 op：dirty 行无 op → 重建', async () => {
    await putHighlight(hl({ id: 'lost-op' }))
    await currentDb().outbox.clear()
    await rebuildOutbox()
    const ops = await currentDb().outbox.toArray()
    expect(ops).toHaveLength(1)
    expect(ops[0].id).toBe('lost-op')
    expect(ops[0].type).toBe('put')
  })

  it('★ 丢 dirty：op 仍在但 dirty=0 → 修复 dirty=1', async () => {
    await putHighlight(hl({ id: 'lost-dirty' }))
    await currentDb().highlights.update('lost-dirty', { dirty: 0, 'local.dirty': 0 })
    await rebuildOutbox()
    const row = await getHighlight('lost-dirty')
    expect(row!.local.dirty).toBe(1)
    expect(await currentDb().outbox.count()).toBe(1)
  })

  it('孤儿 op（实体行已不存在）→ 丢弃', async () => {
    await currentDb().outbox.add({ entity: 'highlight', id: 'ghost', type: 'put', createdAt: '2026-01-01T00:00:00.000Z' })
    await rebuildOutbox()
    expect(await currentDb().outbox.count()).toBe(0)
  })

  it('dirty 墓碑行 → 重建为 delete op', async () => {
    await putHighlight(hl({ id: 'tomb' }))
    await currentDb().cloudState.put({ id: 'tomb', eTag: 'e', syncedRev: 1 })
    await currentDb().highlights.update('tomb', { 'local.baseEtag': 'e' })
    await softDeleteHighlight('tomb')
    await currentDb().outbox.clear()
    await rebuildOutbox()
    const ops = await currentDb().outbox.toArray()
    expect(ops).toHaveLength(1)
    expect(ops[0].type).toBe('delete')
  })
})

describe('sanitize 限额与白名单（协议 §5.2 / data-model §4.3）', () => {
  const sel = (exact: string, start = 0, end = exact.length) => ({
    exact, prefix: '', suffix: '',
    start: { paragraphId: 'P000001', offset: start },
    end: { paragraphId: 'P000001', offset: end },
  })

  it('★ exact 恰好 10000 通过；10001 抛 ValidationError', () => {
    expect(() => sanitizeHighlight(hl({ selector: sel('x'.repeat(10000)) }))).not.toThrow()
    expect(() => sanitizeHighlight(hl({ selector: sel('x'.repeat(10001)) }))).toThrow(ValidationError)
  })

  it('★ note 恰好 20000 通过；20001 抛错', () => {
    expect(() => sanitizeHighlight(hl({ note: 'n'.repeat(20000) }))).not.toThrow()
    expect(() => sanitizeHighlight(hl({ note: 'n'.repeat(20001) }))).toThrow(ValidationError)
  })

  it('★ prefix/suffix 超 32 截断（不抛错）', () => {
    const clean = sanitizeHighlight(hl({ selector: { ...sel('很久以来'), prefix: 'p'.repeat(40), suffix: 's'.repeat(40) } }))
    expect(clean.selector.prefix).toHaveLength(32)
    expect(clean.selector.suffix).toHaveLength(32)
  })

  it('★ color 枚举外拒绝（5 色含 pink）', () => {
    for (const color of ['yellow', 'green', 'blue', 'pink', 'purple']) {
      expect(() => sanitizeHighlight(hl({ color: color as Highlight['color'] }))).not.toThrow()
    }
    expect(() => sanitizeHighlight(hl({ color: 'red' as Highlight['color'] }))).toThrow(ValidationError)
  })

  it('types 走 sanitizeAnnotationTypes 枚举过滤', () => {
    const clean = sanitizeHighlight(hl({ types: ['🔤', '不存在的类型'] as string[] }))
    expect(clean.types).toEqual(['🔤'])
  })

  it('★ offset 负数 / 非整数 / 字符串拒绝', () => {
    expect(() => sanitizeHighlight(hl({ selector: sel('abc', -1, 3) }))).toThrow(ValidationError)
    expect(() => sanitizeHighlight(hl({ selector: sel('abc', 0, 1.5) }))).toThrow(ValidationError)
    expect(() => sanitizeHighlight(hl({ selector: { ...sel('abc'), start: { paragraphId: 'P000001', offset: '0' as unknown as number } } }))).toThrow(ValidationError)
  })

  it('★ 同段 exact 长度与偏移区间不一致拒绝（exact===slice 的必要条件）', () => {
    expect(() => sanitizeHighlight(hl({ selector: sel('abc', 0, 5) }))).toThrow(ValidationError)
    expect(() => sanitizeHighlight(hl({ selector: sel('abc', 2, 1) }))).toThrow(ValidationError)
  })

  it('offset 0 边界合法（空选区 exact="" start=end=0）', () => {
    expect(() => sanitizeHighlight(hl({ selector: sel('', 0, 0) }))).not.toThrow()
  })

  it('kind=note：exact 必须为空', () => {
    expect(() => sanitizeHighlight(hl({ kind: 'note', selector: sel('') }))).not.toThrow()
    expect(() => sanitizeHighlight(hl({ kind: 'note', selector: sel('x') }))).toThrow(ValidationError)
  })

  it('★ 未知字段原样保留（不变量 4）', () => {
    const clean = sanitizeHighlight(hl({ futureField: { a: [1, 2] }, another: 'x' } as Partial<Highlight>))
    expect((clean as Record<string, unknown>).futureField).toEqual({ a: [1, 2] })
    expect((clean as Record<string, unknown>).another).toBe('x')
  })

  it('paragraphId 冗余索引 = selector.start.paragraphId', () => {
    const clean = sanitizeHighlight(hl({ paragraphId: 'Pwrong', selector: sel('很久以来') }))
    expect(clean.paragraphId).toBe('P000001')
  })

  it('putHighlight 非法输入抛错且不写库不落 op', async () => {
    await expect(putHighlight(hl({ id: 'bad', note: 'n'.repeat(20001) }))).rejects.toThrow(ValidationError)
    expect(await getHighlight('bad')).toBeNull()
    expect(await currentDb().outbox.count()).toBe(0)
  })

  it('sanitizeBookmark：id/chapterId/paragraphId 缺失拒绝；未知字段保留', () => {
    expect(() => sanitizeBookmark({ ...bm(), id: '' })).toThrow(ValidationError)
    expect(() => sanitizeBookmark({ ...bm(), chapterId: '' })).toThrow(ValidationError)
    const clean = sanitizeBookmark({ ...bm(), future: 1 })
    expect((clean as Record<string, unknown>).future).toBe(1)
  })
})

describe('迁移 localStorage → IDB（D11/D12/D32 / data-model §12）', () => {
  const map: LegacyMap = { pages: { 'vol1-01': ['P000010', 'P000011', 'P000012'] } }
  const loader = async () => map

  function seedLegacy(pages: Record<string, ReadingPosition>, prefs?: Record<string, unknown>) {
    localStorage.setItem('lost-time:progress:v2', JSON.stringify({ last: null, pages }))
    if (prefs) localStorage.setItem('lost-time:reader-prefs:v2', JSON.stringify(prefs))
  }

  it('★ legacy 索引映射 p-00000N → P ID；maxProgress 原样保留', async () => {
    seedLegacy({ 'vol1-01': pos('vol1-01', { paragraphId: 'p-000002', maxProgress: 0.77 }) })
    const r = await migrateLegacyData('v-test', loader)
    expect(r.migrated).toBe(true)
    const doc = await getProgressDoc()
    expect(doc.pages['vol1-01'].paragraphId).toBe('P000011')
    expect(doc.pages['vol1-01'].maxProgress).toBe(0.77)
  })

  it('★ 索引越界 → 保留旧 paragraphId + needsRelocate:true（D32）', async () => {
    seedLegacy({ 'vol1-01': pos('vol1-01', { paragraphId: 'p-000099' }) })
    const r = await migrateLegacyData('v-test', loader)
    expect(r.needsRelocate).toContain('vol1-01')
    const doc = await getProgressDoc()
    expect(doc.pages['vol1-01'].paragraphId).toBe('p-000099')
    expect(doc.pages['vol1-01'].needsRelocate).toBe(true)
  })

  it('★ 页缺失于映射（D32「缺失」）→ 保留旧值 + needsRelocate:true', async () => {
    seedLegacy({ 'vol9-99': pos('vol9-99', { paragraphId: 'p-000001' }) })
    const r = await migrateLegacyData('v-test', loader)
    expect(r.needsRelocate).toContain('vol9-99')
    const doc = await getProgressDoc()
    expect(doc.pages['vol9-99'].paragraphId).toBe('p-000001')
    expect(doc.pages['vol9-99'].needsRelocate).toBe(true)
  })

  it('★ 幂等：跑两次结果相同；旧键保留不删（D11）', async () => {
    seedLegacy({ 'vol1-01': pos('vol1-01', { paragraphId: 'p-000001' }) }, { fontSize: 22, width: 720 })
    const r1 = await migrateLegacyData('v-test', loader)
    const doc1 = await getProgressDoc()
    const r2 = await migrateLegacyData('v-test', loader)
    expect(r1.migrated).toBe(true)
    expect(r2.migrated).toBe(true)
    expect(await getProgressDoc()).toEqual(doc1)
    expect(localStorage.getItem('lost-time:progress:v2')).not.toBeNull()
    expect(localStorage.getItem('lost-time:reader-prefs:v2')).not.toBeNull()
  })

  it('★ width 落设备本地行，不进 settings.json 同步 prefs', async () => {
    seedLegacy({}, { fontSize: 22, lineHeight: 2.0, fontFamily: 'kai', theme: 'sepia', width: 720, annotationTypes: ['🔤'] })
    await migrateLegacyData('v-test', loader)
    const settings = await getSettingsDoc()
    expect(settings.prefs.fontSize).toBe(22)
    expect(settings.prefs.fontFamily).toBe('kai')
    expect(settings.prefs.theme).toBe('sepia')
    expect(settings.prefs.annotationTypes).toEqual(['🔤'])
    expect((settings.prefs as unknown as Record<string, unknown>).width).toBeUndefined()
    const device = await currentDb().settings.get('device')
    expect(device!.value).toEqual({ width: 720 })
    // stamps = 迁移时刻 + 本机 deviceId
    expect(settings.stamps.fontSize.d).toBe(deviceId())
    expect(Number.isNaN(Date.parse(settings.stamps.fontSize.t))).toBe(false)
  })

  it('映射加载失败 → migrated:false，下次可重试', async () => {
    seedLegacy({ 'vol1-01': pos('vol1-01') })
    const r1 = await migrateLegacyData('v-test', async () => null)
    expect(r1.migrated).toBe(false)
    expect(await currentDb().progress.count()).toBe(0)
    const r2 = await migrateLegacyData('v-test', loader)
    expect(r2.migrated).toBe(true)
  })

  it('★ legacyHashMatches：raw 与 NFC 双基准任一命中即通过（D32 辅助）', () => {
    const nfd = 'áb' // a + 组合锐音 + b（3 code units）
    const nfcText = nfc(nfd) // 'áb'（2 code units）
    expect(nfd.length).not.toBe(nfcText.length)
    // 旧 hash 按 NFC 基准存，目标文本是 NFD → 第二基准命中
    expect(legacyHashMatches(fnv1a36(nfcText), nfd)).toBe(true)
    // 旧 hash 按 raw 基准存 → 第一基准命中
    expect(legacyHashMatches(fnv1a36(nfd), nfd)).toBe(true)
    // 两个基准都不命中 → false
    expect(legacyHashMatches(fnv1a36('完全不同的文本'), nfd)).toBe(false)
  })
})

describe('saveProgress / deviceId（协议 §5.2 / D12）', () => {
  it('★ maxProgress 单调不减：低值保存不回退', async () => {
    await saveProgress(pos('vol1-01', { maxProgress: 0.8, pageProgress: 0.8 }))
    await saveProgress(pos('vol1-01', { maxProgress: 0.3, pageProgress: 0.3 }))
    const doc = await getProgressDoc()
    expect(doc.pages['vol1-01'].maxProgress).toBe(0.8)
  })

  it('★ needsRelocate 下次成功保存即清除（D12）', async () => {
    await currentDb().progress.put({ ...pos('vol1-01'), needsRelocate: true })
    await saveProgress(pos('vol1-01'))
    const doc = await getProgressDoc()
    expect(doc.pages['vol1-01'].needsRelocate).toBeUndefined()
  })

  it('last 随保存更新', async () => {
    await saveProgress(pos('vol1-01'))
    await saveProgress(pos('vol1-02'))
    expect((await getProgressDoc()).last!.pageId).toBe('vol1-02')
  })

  it('deviceId：localStorage 持久、跨调用稳定、UUIDv4', () => {
    const d1 = deviceId()
    const d2 = deviceId()
    expect(d1).toBe(d2)
    expect(localStorage.getItem('lost-time:device-id')).toBe(d1)
    expect(d1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})
