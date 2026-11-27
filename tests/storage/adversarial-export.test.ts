/**
 * 对抗性测试 · export.ts —— 断言依据：协议 §5.8、§3.1 不变量 4/7/9、判定表 #5/#9、data-model §9。
 * 主线：导入永不整库覆盖；败者不静默丢；非法输入零写入；未知字段保留。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  applyImport,
  buildExportEnvelope,
  parseImportFile,
  previewImport,
} from '../../site/.vitepress/theme/composables/user-storage/export'
import {
  currentDb,
  getHighlight,
  getProgressDoc,
  openDatabase,
  putHighlight,
  setGraveyard,
  softDeleteHighlight,
} from '../../site/.vitepress/theme/composables/user-storage/db'
import type { ExportEnvelope, Highlight } from '../../site/.vitepress/theme/composables/user-storage/types'
import { hl, bm } from './fixtures'

const T1 = '2026-01-02T00:00:00.000Z'
const T2 = '2026-01-03T00:00:00.000Z'

beforeEach(async () => {
  localStorage.clear()
  await openDatabase('anon')
})

function envelope(over: Partial<ExportEnvelope['data']> = {}, meta: Partial<ExportEnvelope> = {}): ExportEnvelope {
  return {
    format: 'proust-reader-export',
    formatVersion: 1,
    app: { name: 'proust-reader', buildVersion: 'test' },
    exportedAt: T2,
    scope: 'anon',
    data: { highlights: [], bookmarks: [], progress: { schemaVersion: 1, last: null, pages: {} }, settings: { schemaVersion: 1, prefs: { fontSize: 20, lineHeight: 1.9, fontFamily: 'sans', theme: 'paper', annotationTypes: [] }, stamps: {} }, ...over },
    ...meta,
  }
}

describe('导出信封（协议 §5.8 / data-model §9）', () => {
  it('★ roundtrip：含墓碑与 conflicts；剥 local；无 token/邮箱；未知字段保留', async () => {
    await putHighlight(hl({ id: 'live', note: 'n', conflicts: [{ deviceId: 'd', rev: 1, updatedAt: T1, keptAt: T1, snapshot: { note: '败者', types: [], color: 'yellow', selector: hl().selector, deletedAt: null } }], futureField: { x: 1 } } as Partial<Highlight>))
    await putHighlight(hl({ id: 'dead' }))
    await currentDb().cloudState.put({ id: 'dead', eTag: 'e', syncedRev: 1 })
    await currentDb().highlights.update('dead', { 'local.baseEtag': 'e' })
    await softDeleteHighlight('dead')
    const env = await buildExportEnvelope()
    expect(env.data.highlights).toHaveLength(2)
    expect(env.data.highlights.find((h) => h.id === 'dead')!.deletedAt).not.toBeNull()
    expect(env.data.highlights.find((h) => h.id === 'live')!.conflicts).toHaveLength(1)
    const text = JSON.stringify(env)
    expect(text).not.toContain('"local"')
    expect(text).not.toContain('"email"')
    expect(text).not.toContain('"token"')
    expect(text).not.toContain('"dirty"')
    const parsed = parseImportFile(text)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      const live = parsed.envelope.data.highlights.find((h) => h.id === 'live')!
      expect((live as Record<string, unknown>).futureField).toEqual({ x: 1 })
      expect(live.conflicts).toHaveLength(1)
    }
  })
})

describe('导入校验：非法 → 零写入（协议 §5.8）', () => {
  it('★ formatVersion 过高拒绝，不猜测解析', () => {
    const text = JSON.stringify(envelope({}, { formatVersion: 2 as 1 }))
    const r = parseImportFile(text)
    expect(r.ok).toBe(false)
  })

  it('★ 非法 JSON / 格式标识不符 / 缺 data → ok:false', () => {
    expect(parseImportFile('{不是JSON').ok).toBe(false)
    expect(parseImportFile(JSON.stringify({ format: '别的', formatVersion: 1, data: { highlights: [], bookmarks: [] } })).ok).toBe(false)
    expect(parseImportFile(JSON.stringify({ format: 'proust-reader-export', formatVersion: 1 })).ok).toBe(false)
  })

  it('★ 信封内单条非法（note 超限）→ 整体 ok:false，零写入', async () => {
    await putHighlight(hl({ id: 'pre-existing', note: '原有' }))
    const bad = envelope({ highlights: [hl({ id: 'bad', note: 'n'.repeat(20001) })] })
    const r = parseImportFile(JSON.stringify(bad))
    expect(r.ok).toBe(false)
    expect(await getHighlight('bad')).toBeNull()
    expect((await getHighlight('pre-existing'))!.note).toBe('原有')
    expect(await currentDb().outbox.count()).toBe(1) // 只有原有记录的 op
  })

  it('★ 高 formatVersion 拒绝后库无任何写入', async () => {
    await putHighlight(hl({ id: 'keep' }))
    const before = await currentDb().highlights.toArray()
    const r = parseImportFile(JSON.stringify(envelope({ highlights: [hl({ id: 'new' })] }, { formatVersion: 99 as 1 })))
    expect(r.ok).toBe(false)
    expect(await currentDb().highlights.toArray()).toEqual(before)
  })
})

describe('导入逐条合并，永不整库覆盖（不变量 7 / data-model §9）', () => {
  it('★ 本地独有记录在导入后存活', async () => {
    await putHighlight(hl({ id: 'local-only', note: '本地独有' }))
    const env = envelope({ highlights: [hl({ id: 'imported', note: '导入' })] })
    await applyImport(env, 'local')
    expect((await getHighlight('local-only'))!.note).toBe('本地独有')
    expect((await getHighlight('imported'))!.note).toBe('导入')
  })

  it('★ baseSnapshot 缺失 → 异值走 #9 冲突副本，不静默覆盖', async () => {
    await putHighlight(hl({ id: 'x', note: '本地值', updatedAt: T1 }))
    // 新建记录 baseSnapshot=null
    const env = envelope({ highlights: [hl({ id: 'x', note: '导入值', updatedAt: T2 })] })
    const result = await applyImport(env, 'local')
    const row = await getHighlight('x')
    // strategy=local → 本机胜，但导入侧败者仍存副本
    expect(row!.note).toBe('本地值')
    expect(row!.conflicts!.some((c) => c.snapshot.note === '导入值')).toBe(true)
    expect(result.conflictsKept).toBeGreaterThanOrEqual(1)
  })

  it('★ 同 updatedAt 不同内容 → 按 #5 同刻 deviceId 裁决，不得直接 skip（判定表 #5）', async () => {
    await putHighlight(hl({ id: 'tie', note: '本地', updatedAt: T1, deviceId: 'devA' }))
    const env = envelope({ highlights: [hl({ id: 'tie', note: '导入', updatedAt: T1, deviceId: 'devZ' })] })
    const result = await applyImport(env, 'local')
    const row = await getHighlight('tie')
    // 协议判定表 #5：同刻异值必须裁决（deviceId 字典序）且败者入副本。
    // strategy=local 使本机胜，但导入侧内容差异绝不能被当作「相同」静默 skip。
    expect(result.skipped).toBe(0)
    expect(result.updated).toBe(1)
    expect(row!.note).toBe('本地')
    expect(row!.conflicts!.some((c) => c.snapshot.note === '导入')).toBe(true)
  })

  it('★ graveyard 中的 id → 丢弃导入记录', async () => {
    await setGraveyard({ schemaVersion: 1, entries: { purged: { purgedAt: T1 } } })
    const env = envelope({ highlights: [hl({ id: 'purged', note: '已清除' })] })
    const result = await applyImport(env, 'local')
    expect(await getHighlight('purged')).toBeNull()
    expect(result.skipped).toBe(1)
  })

  it('★ 导入后同 id 的 outbox op 仍只有一条（data-model §7.3 同 id 合并）', async () => {
    await putHighlight(hl({ id: 'dup-op', note: '本地', updatedAt: T1 }))
    expect(await currentDb().outbox.count()).toBe(1)
    const env = envelope({ highlights: [hl({ id: 'dup-op', note: '导入', updatedAt: T2 })] })
    await applyImport(env, 'import')
    const ops = await currentDb().outbox.where('[entity+id]').equals(['highlight', 'dup-op']).toArray()
    expect(ops).toHaveLength(1)
  })

  it('★ progress/settings 的 outbox op 不因导入重复（[entity+id] 唯一）', async () => {
    await currentDb().progress.put({ pageId: 'vol1-01', paragraphId: 'P1', paragraphHash: 'h', offset: 0, pageProgress: 0, maxProgress: 0.1, updatedAt: T1 })
    await currentDb().outbox.add({ entity: 'progress', id: 'doc', type: 'put', createdAt: T1 })
    await currentDb().outbox.add({ entity: 'settings', id: 'doc', type: 'put', createdAt: T1 })
    await applyImport(envelope(), 'local')
    expect(await currentDb().outbox.where('[entity+id]').equals(['progress', 'doc']).count()).toBe(1)
    expect(await currentDb().outbox.where('[entity+id]').equals(['settings', 'doc']).count()).toBe(1)
  })

  it('progress 按页合并不覆盖：本地独有页保留', async () => {
    await currentDb().progress.put({ pageId: 'vol1-01', paragraphId: 'P1', paragraphHash: 'h', offset: 0.5, pageProgress: 0.5, maxProgress: 0.5, updatedAt: T2 })
    const env = envelope({ progress: { schemaVersion: 1, last: null, pages: { 'vol2-02': { pageId: 'vol2-02', paragraphId: 'P2', paragraphHash: 'h', offset: 0.1, pageProgress: 0.1, maxProgress: 0.1, updatedAt: T1 } } } })
    await applyImport(env, 'local')
    const doc = await getProgressDoc()
    expect(Object.keys(doc.pages).sort()).toEqual(['vol1-01', 'vol2-02'])
    expect(doc.pages['vol1-01'].maxProgress).toBe(0.5)
  })

  it('未知字段经导入保留回写（不变量 4）', async () => {
    const env = envelope({ highlights: [hl({ id: 'uf', future: { deep: [1] } } as Partial<Highlight>)] })
    await applyImport(env, 'local')
    expect((await getHighlight('uf'))!.future).toEqual({ deep: [1] })
  })
})

describe('导入三策略（协议 §5.8）', () => {
  async function seedConflictPair() {
    await putHighlight(hl({ id: 's', note: '本机', updatedAt: T1 }))
    return envelope({ highlights: [hl({ id: 's', note: '导入', updatedAt: T2 })] })
  }

  it('local = 本机胜，败者（导入侧）仍存副本', async () => {
    const env = await seedConflictPair()
    const r = await applyImport(env, 'local')
    const row = await getHighlight('s')
    expect(row!.note).toBe('本机')
    expect(row!.conflicts!.some((c) => c.snapshot.note === '导入')).toBe(true)
    expect(r.conflictsKept).toBe(1)
  })

  it('import = 导入胜，本机败者存副本', async () => {
    const env = await seedConflictPair()
    await applyImport(env, 'import')
    const row = await getHighlight('s')
    expect(row!.note).toBe('导入')
    expect(row!.conflicts!.some((c) => c.snapshot.note === '本机')).toBe(true)
  })

  it('both = 导入侧另存新记录（新 id），原记录保留本机值', async () => {
    const env = await seedConflictPair()
    const r = await applyImport(env, 'both')
    const all = await currentDb().highlights.toArray()
    expect(all).toHaveLength(2)
    const orig = all.find((h) => h.id === 's')!
    const copy = all.find((h) => h.id !== 's')!
    expect(orig.note).toBe('本机')
    expect(copy.note).toBe('导入')
    expect(copy.deletedAt).toBeNull()
    expect(r.added).toBe(1)
  })
})

describe('preview 与 apply 一致（协议 §5.8 / §7.2）', () => {
  it('★ 干跑不写库；计数与 apply 一致', async () => {
    await putHighlight(hl({ id: 'exist', note: '旧', updatedAt: T1 }))
    const env = envelope({
      highlights: [
        hl({ id: 'exist', note: '新', updatedAt: T2 }), // updated
        hl({ id: 'brand-new' }), // added
      ],
      bookmarks: [bm({ id: 'b-new' })], // added
    })
    const preview = await previewImport(env)
    expect(await currentDb().highlights.count()).toBe(1) // 干跑不写
    expect(await currentDb().bookmarks.count()).toBe(0)
    expect(preview.added).toBe(2)
    expect(preview.updated).toBe(1)
    const result = await applyImport(env, 'import')
    expect(result.added).toBe(preview.added)
    expect(result.updated).toBe(preview.updated)
    expect(result.skipped).toBe(preview.skipped)
  })

  it('完全相同的记录 → skipped（全等不合并）', async () => {
    const h = hl({ id: 'same', note: '一样', updatedAt: T1 })
    await putHighlight(h)
    const env = envelope({ highlights: [hl({ id: 'same', note: '一样', updatedAt: T1 })] })
    const preview = await previewImport(env)
    expect(preview.skipped).toBe(1)
    const r = await applyImport(env, 'local')
    expect(r.skipped).toBe(1)
    expect(r.updated).toBe(0)
  })
})
