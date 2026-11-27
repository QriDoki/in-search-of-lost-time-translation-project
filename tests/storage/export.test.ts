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
  openDatabase,
  putHighlight,
  setGraveyard,
  softDeleteHighlight,
} from '../../site/.vitepress/theme/composables/user-storage/db'
import type { ExportEnvelope } from '../../site/.vitepress/theme/composables/user-storage/types'
import { hl } from './fixtures'

beforeEach(async () => {
  await openDatabase('anon')
})

describe('JSON 导出信封', () => {
  it('★ roundtrip：含墓碑/conflicts/未知字段；剥 local；无 token/邮箱', async () => {
    await putHighlight(hl({ id: 'live', note: 'n', conflicts: [{ deviceId: 'd', rev: 1, updatedAt: '2026-01-01T00:00:00.000Z', keptAt: '2026-01-01T00:00:00.000Z', snapshot: { note: 'old', types: [], color: 'yellow', selector: hl().selector, deletedAt: null } }], futureField: 42 } as never))
    await putHighlight(hl({ id: 'dead' }))
    await currentDb().cloudState.put({ id: 'dead', eTag: 'e', syncedRev: 1 })
    await currentDb().highlights.update('dead', { 'local.baseEtag': 'e' })
    await softDeleteHighlight('dead')
    const env = await buildExportEnvelope()
    expect(env.format).toBe('proust-reader-export')
    expect(env.data.highlights).toHaveLength(2)
    const dead = env.data.highlights.find((h) => h.id === 'dead')!
    expect(dead.deletedAt).not.toBeNull()
    const live = env.data.highlights.find((h) => h.id === 'live')!
    expect(live.conflicts).toHaveLength(1)
    expect((live as Record<string, unknown>).futureField).toBe(42)
    expect((live as Record<string, unknown>).local).toBeUndefined()
    const text = JSON.stringify(env)
    expect(text).not.toContain('"email"')
    expect(text).not.toContain('"token"')
    // roundtrip
    const parsed = parseImportFile(text)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.envelope.data.highlights).toHaveLength(2)
  })
})

describe('导入校验', () => {
  it('★ 非法 JSON / 高 formatVersion → ok:false 零写入', async () => {
    expect(parseImportFile('{bad').ok).toBe(false)
    expect(parseImportFile(JSON.stringify({ format: 'proust-reader-export', formatVersion: 2, data: { highlights: [], bookmarks: [] } })).ok).toBe(false)
    expect(parseImportFile(JSON.stringify({ format: 'other', formatVersion: 1 })).ok).toBe(false)
    // 非法记录 → ok:false
    const bad = { format: 'proust-reader-export', formatVersion: 1, data: { highlights: [{ id: 'x', kind: 'highlight', chapterId: 'c', color: 'red', selector: { exact: '', start: { paragraphId: 'p', offset: 0 }, end: { paragraphId: 'p', offset: 0 } } }], bookmarks: [] } }
    expect(parseImportFile(JSON.stringify(bad)).ok).toBe(false)
    expect(await currentDb().highlights.count()).toBe(0)
  })
})

describe('★ 导入永不整库覆盖', () => {
  it('本地独有记录导入后存活', async () => {
    await putHighlight(hl({ id: 'local-only', note: 'mine' }))
    const env: ExportEnvelope = {
      format: 'proust-reader-export', formatVersion: 1, app: { name: 'proust-reader', buildVersion: 'v' }, exportedAt: '2026-01-01T00:00:00.000Z', scope: 'anon',
      data: { highlights: [hl({ id: 'imported', note: 'theirs' })], bookmarks: [], progress: { schemaVersion: 1, last: null, pages: {} }, settings: { schemaVersion: 1, prefs: { fontSize: 20, lineHeight: 1.9, fontFamily: 'sans', theme: 'paper', annotationTypes: [] }, stamps: {} } },
    }
    const result = await applyImport(env, 'local')
    expect(result.added).toBe(1)
    expect((await getHighlight('local-only'))?.note).toBe('mine')
    expect((await getHighlight('imported'))?.note).toBe('theirs')
  })
})

describe('导入三策略 + 预览一致', () => {
  const conflictEnv = (): ExportEnvelope => ({
    format: 'proust-reader-export', formatVersion: 1, app: { name: 'proust-reader', buildVersion: 'v' }, exportedAt: '2026-01-01T00:00:00.000Z', scope: 'anon',
    data: { highlights: [hl({ id: 'h1', note: 'import-note', updatedAt: '2026-01-03T00:00:00.000Z', deviceId: 'devB' })], bookmarks: [], progress: { schemaVersion: 1, last: null, pages: {} }, settings: { schemaVersion: 1, prefs: { fontSize: 20, lineHeight: 1.9, fontFamily: 'sans', theme: 'paper', annotationTypes: [] }, stamps: {} } },
  })
  beforeEach(async () => {
    await putHighlight(hl({ id: 'h1', note: 'local-note', updatedAt: '2026-01-02T00:00:00.000Z', deviceId: 'devA' }))
  })

  it('preview 计数与 apply 一致（local 策略）', async () => {
    const env = conflictEnv()
    const preview = await previewImport(env)
    expect(preview.updated).toBe(1)
    expect(preview.conflicts).toHaveLength(1)
    const result = await applyImport(env, 'local')
    expect(result.updated).toBe(1)
    expect(result.conflictsKept).toBe(1)
    expect((await getHighlight('h1'))?.note).toBe('local-note') // 本机胜
  })

  it('import 策略 → 导入胜', async () => {
    const result = await applyImport(conflictEnv(), 'import')
    expect((await getHighlight('h1'))?.note).toBe('import-note')
    expect(result.conflictsKept).toBe(1) // 本机败者仍存副本
  })

  it('both 策略 → 导入侧另存新记录（新 uuid）', async () => {
    const result = await applyImport(conflictEnv(), 'both')
    expect(result.added).toBe(1)
    const all = await currentDb().highlights.toArray()
    expect(all).toHaveLength(2)
    const original = all.find((h) => h.id === 'h1')!
    const copy = all.find((h) => h.id !== 'h1')!
    expect(original.note).toBe('local-note')
    expect(copy.note).toBe('import-note')
    expect(copy.selector).toEqual(original.selector) // 锚点同原记录
  })

  it('内容完全相同（含 updatedAt）跳过', async () => {
    const env = conflictEnv()
    // 与本机记录完全一致 → 跳过（同 updatedAt 异值仍走 #5，见对抗测试 F2）
    env.data.highlights[0] = hl({ id: 'h1', note: 'local-note', updatedAt: '2026-01-02T00:00:00.000Z', deviceId: 'devA' })
    const result = await applyImport(env, 'local')
    expect(result.skipped).toBe(1)
    expect(result.updated).toBe(0)
  })
})

describe('★ graveyard 丢弃导入记录', () => {
  it('已清除 id 的导入记录被丢弃', async () => {
    await setGraveyard({ schemaVersion: 1, entries: { h1: { purgedAt: '2026-01-01T00:00:00.000Z' } } })
    const env: ExportEnvelope = {
      format: 'proust-reader-export', formatVersion: 1, app: { name: 'proust-reader', buildVersion: 'v' }, exportedAt: '2026-01-01T00:00:00.000Z', scope: 'anon',
      data: { highlights: [hl({ id: 'h1' })], bookmarks: [], progress: { schemaVersion: 1, last: null, pages: {} }, settings: { schemaVersion: 1, prefs: { fontSize: 20, lineHeight: 1.9, fontFamily: 'sans', theme: 'paper', annotationTypes: [] }, stamps: {} } },
    }
    const result = await applyImport(env, 'local')
    expect(result.skipped).toBe(1)
    expect(await getHighlight('h1')).toBeNull()
  })
})