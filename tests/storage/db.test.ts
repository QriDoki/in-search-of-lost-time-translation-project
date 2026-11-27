import { beforeEach, describe, expect, it } from 'vitest'
import {
  claimAnonData,
  currentDb,
  getHighlight,
  getProgressDoc,
  getSettingsDoc,
  listHighlights,
  markLocalStorageMode,
  migrateLegacyData,
  openDatabase,
  putBookmark,
  putHighlight,
  rebuildOutbox,
  sanitizeBookmark,
  sanitizeHighlight,
  saveProgress,
  saveSyncedPrefs,
  softDeleteBookmark,
  softDeleteHighlight,
  storageMode,
  switchScope,
  ValidationError,
} from '../../site/.vitepress/theme/composables/user-storage/db'
import { hl, bm } from './fixtures'

beforeEach(async () => {
  await openDatabase('anon')
})

describe('sanitize', () => {
  it('exact 10000 通过 / 10001 拒绝', () => {
    const exact = 'x'.repeat(10000)
    const ok = sanitizeHighlight(hl({ selector: { exact, prefix: '', suffix: '', start: { paragraphId: 'P1', offset: 0 }, end: { paragraphId: 'P1', offset: 10000 } } }))
    expect(ok.selector.exact.length).toBe(10000)
    const bad = 'x'.repeat(10001)
    expect(() => sanitizeHighlight(hl({ selector: { exact: bad, prefix: '', suffix: '', start: { paragraphId: 'P1', offset: 0 }, end: { paragraphId: 'P1', offset: 10001 } } }))).toThrow(ValidationError)
  })
  it('note 20000 通过 / 20001 拒绝', () => {
    expect(sanitizeHighlight(hl({ note: 'n'.repeat(20000) })).note.length).toBe(20000)
    expect(() => sanitizeHighlight(hl({ note: 'n'.repeat(20001) }))).toThrow(/note/)
  })
  it('prefix/suffix 截 32', () => {
    const out = sanitizeHighlight(hl({ selector: { exact: '很久以来', prefix: 'p'.repeat(50), suffix: 's'.repeat(50), start: { paragraphId: 'P1', offset: 0 }, end: { paragraphId: 'P1', offset: 4 } } }))
    expect(out.selector.prefix.length).toBe(32)
    expect(out.selector.suffix.length).toBe(32)
  })
  it('color 枚举外拒绝；types 过滤', () => {
    expect(() => sanitizeHighlight(hl({ color: 'red' as never }))).toThrow(/color/)
    expect(sanitizeHighlight(hl({ types: ['🔤', '非法'] as never })).types).toEqual(['🔤'])
  })
  it('offset 负数/非整数拒绝', () => {
    expect(() => sanitizeHighlight(hl({ selector: { exact: 'x', prefix: '', suffix: '', start: { paragraphId: 'P1', offset: -1 }, end: { paragraphId: 'P1', offset: 1 } } }))).toThrow(/start/)
    expect(() => sanitizeHighlight(hl({ selector: { exact: 'x', prefix: '', suffix: '', start: { paragraphId: 'P1', offset: 0.5 }, end: { paragraphId: 'P1', offset: 1 } } }))).toThrow(/start/)
  })
  it('同段 exact 长度与偏移区间不一致拒绝', () => {
    expect(() => sanitizeHighlight(hl({ selector: { exact: '很久以来', prefix: '', suffix: '', start: { paragraphId: 'P1', offset: 0 }, end: { paragraphId: 'P1', offset: 3 } } }))).toThrow(/exact/)
  })
  it('未知字段保留', () => {
    const out = sanitizeHighlight({ ...hl(), futureField: { a: 1 } })
    expect((out as Record<string, unknown>).futureField).toEqual({ a: 1 })
  })
  it('bookmark sanitize 与未知字段', () => {
    const out = sanitizeBookmark({ ...bm(), x: 9 })
    expect(out.label).toBe('')
    expect((out as Record<string, unknown>).x).toBe(9)
    expect(() => sanitizeBookmark({})).toThrow(/id/)
  })
})

describe('CRUD + outbox', () => {
  it('putHighlight 写库 + outbox put；重复 put 合并为一条', async () => {
    await putHighlight(hl())
    await putHighlight(hl({ note: 'updated' }))
    const ops = await currentDb().outbox.toArray()
    expect(ops).toHaveLength(1)
    expect(ops[0].type).toBe('put')
    expect((await getHighlight('h1'))?.note).toBe('updated')
  })

  it('★ D18 未同步创建+删除 → 硬删无 op 无墓碑', async () => {
    await putHighlight(hl())
    await softDeleteHighlight('h1')
    expect(await getHighlight('h1')).toBeNull()
    expect(await currentDb().outbox.toArray()).toHaveLength(0)
  })

  it('★ 已同步记录删除 → 软删墓碑 + delete op（put+delete→delete）', async () => {
    await putHighlight(hl())
    await currentDb().cloudState.put({ id: 'h1', eTag: 'etag1', syncedRev: 1 })
    await currentDb().highlights.update('h1', { 'local.baseEtag': 'etag1' })
    await softDeleteHighlight('h1')
    const row = await getHighlight('h1')
    expect(row?.deletedAt).not.toBeNull()
    const ops = await currentDb().outbox.toArray()
    expect(ops).toHaveLength(1)
    expect(ops[0].type).toBe('delete')
  })

  it('★ 撤销重建 rev+1（以原 id put deletedAt=null）', async () => {
    await putHighlight(hl())
    await currentDb().cloudState.put({ id: 'h1', eTag: 'e', syncedRev: 1 })
    await currentDb().highlights.update('h1', { 'local.baseEtag': 'e' })
    await softDeleteHighlight('h1')
    const deleted = await getHighlight('h1')
    // 撤销 = 以原 id 重建（rev+1，D18）
    await putHighlight(hl({ rev: deleted!.rev + 1, deletedAt: null, note: 'restored' }))
    const restored = await getHighlight('h1')
    expect(restored?.deletedAt).toBeNull()
    expect(restored?.rev).toBe(deleted!.rev + 1)
  })

  it('bookmark CRUD + D18', async () => {
    await putBookmark(bm())
    await softDeleteBookmark('b1')
    expect(await currentDb().bookmarks.get('b1')).toBeUndefined()
    expect(await currentDb().outbox.toArray()).toHaveLength(0)
  })
})

describe('★ 账号隔离与认领', () => {
  it('两 scope 同 id 不同内容互不可见', async () => {
    await putHighlight(hl({ note: 'anon-data' }))
    await switchScope('ms-aaa')
    expect(await getHighlight('h1')).toBeNull()
    await putHighlight(hl({ note: 'account-data' }))
    await switchScope('anon')
    expect((await getHighlight('h1'))?.note).toBe('anon-data')
  })

  it('★ 认领迁移：复制去重、同 id 合并、claimedBy 后 anon 写抛错、登出回 anon 数据仍在', async () => {
    await putHighlight(hl({ id: 'only-anon', note: 'A' }))
    await putHighlight(hl({ id: 'shared', note: 'anon-version', updatedAt: '2026-01-01T00:00:00.000Z' }))
    // 账号库已有 shared 的较新版本
    await switchScope('ms-bbb')
    await putHighlight(hl({ id: 'shared', note: 'account-version', updatedAt: '2026-01-05T00:00:00.000Z' }))
    await switchScope('anon')
    await claimAnonData('ms-bbb')
    // anon 写抛错
    await expect(putHighlight(hl({ id: 'new' }))).rejects.toThrow('scope-claimed')
    // 账号库含 only-anon，shared 保留账号较新版
    await switchScope('ms-bbb')
    expect((await getHighlight('only-anon'))?.note).toBe('A')
    expect((await getHighlight('shared'))?.note).toBe('account-version')
    // 登出回 anon，数据仍在（只读）
    await switchScope('anon')
    expect((await getHighlight('only-anon'))?.note).toBe('A')
  })
})

describe('★ 崩溃恢复 rebuildOutbox', () => {
  it('丢 op（dirty 仍在）→ 重建', async () => {
    await putHighlight(hl())
    await currentDb().outbox.clear()
    await rebuildOutbox()
    const ops = await currentDb().outbox.toArray()
    expect(ops).toHaveLength(1)
    expect(ops[0].id).toBe('h1')
  })
  it('丢 dirty（op 仍在）→ 修复 dirty', async () => {
    await putHighlight(hl())
    await currentDb().highlights.update('h1', { dirty: 0, 'local.dirty': 0 })
    await rebuildOutbox()
    const row = await getHighlight('h1')
    expect(row?.local.dirty).toBe(1)
  })
})

describe('进度 / 设置', () => {
  it('saveProgress maxProgress 单调 + outbox', async () => {
    await saveProgress({ pageId: 'vol1-01', paragraphId: 'P1', paragraphHash: 'h', offset: 0, pageProgress: 0.8, maxProgress: 0.8, updatedAt: '2026-01-01T00:00:00.000Z' })
    await saveProgress({ pageId: 'vol1-01', paragraphId: 'P1', paragraphHash: 'h', offset: 0, pageProgress: 0.3, maxProgress: 0.3, updatedAt: '2026-01-02T00:00:00.000Z' })
    const doc = await getProgressDoc()
    expect(doc.pages['vol1-01'].maxProgress).toBe(0.8)
    expect(doc.last?.pageId).toBe('vol1-01')
    expect((await currentDb().outbox.where('[entity+id]').equals(['progress', 'doc']).count())).toBe(1)
  })
  it('saveSyncedPrefs 逐字段 stamps + outbox', async () => {
    await saveSyncedPrefs({ fontSize: 22, lineHeight: 1.9, fontFamily: 'sans', theme: 'paper', annotationTypes: [] })
    const doc = await getSettingsDoc()
    expect(doc.prefs.fontSize).toBe(22)
    expect(doc.stamps.fontSize).toBeTruthy()
  })
})

describe('★ 迁移', () => {
  const map = { pages: { 'vol1-01': ['P000010', 'P000011'] } }
  beforeEach(() => {
    localStorage.setItem('lost-time:progress:v2', JSON.stringify({
      last: null,
      pages: { 'vol1-01': { pageId: 'vol1-01', paragraphId: 'p-000001', paragraphHash: 'h', offset: 0, pageProgress: 0.5, maxProgress: 0.5, updatedAt: '2026-01-01T00:00:00.000Z' } },
    }))
    localStorage.setItem('lost-time:reader-prefs:v2', JSON.stringify({ fontSize: 24, width: 800, theme: 'dark' }))
  })
  it('迁移幂等、旧键保留、legacy→P 映射、width 落 device', async () => {
    const r1 = await migrateLegacyData('dev', async () => map)
    expect(r1.migrated).toBe(true)
    const doc = await getProgressDoc()
    expect(doc.pages['vol1-01'].paragraphId).toBe('P000010')
    expect(localStorage.getItem('lost-time:progress:v2')).not.toBeNull() // 旧键不删
    const settings = await getSettingsDoc()
    expect(settings.prefs.fontSize).toBe(24)
    expect((await currentDb().settings.get('device'))?.value).toEqual({ width: 800 })
    const r2 = await migrateLegacyData('dev', async () => map)
    expect(r2.migrated).toBe(true)
    expect((await getProgressDoc()).pages['vol1-01'].paragraphId).toBe('P000010')
  })
  it('★ 映射缺失目标 → 保留旧值 + needsRelocate', async () => {
    localStorage.setItem('lost-time:progress:v2', JSON.stringify({
      last: null, pages: { 'vol1-01': { pageId: 'vol1-01', paragraphId: 'p-000099', paragraphHash: 'h', offset: 0, pageProgress: 0.5, maxProgress: 0.5, updatedAt: '2026-01-01T00:00:00.000Z' } },
    }))
    const r = await migrateLegacyData('dev', async () => map)
    expect(r.needsRelocate).toContain('vol1-01')
    const doc = await getProgressDoc()
    expect(doc.pages['vol1-01'].paragraphId).toBe('p-000099')
    expect(doc.pages['vol1-01'].needsRelocate).toBe(true)
  })
  it('map 加载失败 → migrated:false（下次重试）', async () => {
    const r = await migrateLegacyData('dev', async () => null)
    expect(r.migrated).toBe(false)
  })
})

describe('降级', () => {
  it('IDB 不可用 → localStorage 模式', () => {
    markLocalStorageMode()
    expect(storageMode()).toBe('localStorage')
    expect(() => currentDb()).toThrow('db-not-open')
  })
})