import { beforeEach, describe, expect, it } from 'vitest'
import { createSyncEngine } from '../../site/.vitepress/theme/composables/user-storage/sync'
import { currentDb, openDatabase, putHighlight } from '../../site/.vitepress/theme/composables/user-storage/db'
import {
  collectAnchorParagraphs,
  nfcRangeToRawOffsets,
  renderHighlights,
  resolveHighlight,
  type AnchorContext,
} from '../../site/.vitepress/theme/composables/user-storage/anchor'
import { fnv1a36, nfc } from '../../site/.vitepress/theme/composables/user-storage/util'
import type { AuthProvider, GraphTransport } from '../../site/.vitepress/theme/composables/user-storage/types'
import { hl } from './fixtures'

const noopTransport: GraphTransport = {
  async list() {
    return []
  },
  async read() {
    return null
  },
  async write() {
    return { eTag: 'e' }
  },
  async remove() {},
}
const auth: AuthProvider = {
  async init() {},
  current: () => ({ scope: 'ms-test', displayName: 'T', email: 't@x' }),
  async login() {
    return { scope: 'ms-test', displayName: 'T', email: 't@x' }
  },
  async logout() {},
  async getToken() {
    return 'tok'
  },
  onChange: () => () => {},
}

beforeEach(async () => {
  await openDatabase('anon')
})

describe('G1：删除 vs 修改（#7）墓碑存活记录必须进冲突供给', () => {
  it('★ 墓碑 + 待裁决副本 → listConflicts 返回该条，countConflicts>0', async () => {
    const copy = { deviceId: 'devB', rev: 2, updatedAt: '2026-01-03T00:00:00.000Z', keptAt: '2026-01-03T00:00:00.000Z', snapshot: { note: '编辑侧', types: [], color: 'green' as const, selector: hl().selector, deletedAt: null } }
    // #7 合并结果：存活记录 = 删除侧整条（含墓碑）+ 编辑侧副本
    await currentDb().highlights.put({ ...hl({ id: 'tomb', deletedAt: '2026-01-05T00:00:00.000Z', conflicts: [copy] }), local: { dirty: 0, baseEtag: 'e', baseSnapshot: null }, dirty: 0 } as never)
    const engine = createSyncEngine({ db: currentDb(), transport: noopTransport, auth, now: () => '2026-01-06T00:00:00.000Z' })
    const list = await engine.listConflicts()
    expect(list.some((c) => c.id === 'tomb')).toBe(true)
    await engine.syncNow() // 触发 emit 刷新状态快照（now 注入避免 GC 清除近期墓碑）
    expect(engine.getStatus().conflicts).toBeGreaterThanOrEqual(1)
  })

  it('★ #7 下载合并集成：本地删除、远端编辑 → 墓碑存活 + 副本可裁决', async () => {
    const id = '00000000-0000-4000-8000-000000000077'
    await putHighlight(hl({ id, note: '本地', updatedAt: '2026-01-01T00:00:00.000Z' }))
    await currentDb().cloudState.put({ id, eTag: 'e-old', syncedRev: 1 })
    await currentDb().highlights.update(id, { deletedAt: '2026-01-05T00:00:00.000Z', 'local.baseEtag': 'e-old', 'local.baseSnapshot': hl({ id, note: '本地' }) })
    const transport: GraphTransport = {
      ...noopTransport,
      async list() {
        return [{ name: `${id}.json`, eTag: 'e-new', id }]
      },
      async read(path: string) {
        if (path === `highlights/${id}.json`) {
          return { body: JSON.stringify(hl({ id, note: '远端编辑', updatedAt: '2026-01-06T00:00:00.000Z', deviceId: 'devB' })), eTag: 'e-new' }
        }
        return null
      },
    }
    const engine = createSyncEngine({ db: currentDb(), transport, auth, now: () => '2026-01-07T00:00:00.000Z' })
    await engine.syncNow()
    const row = await currentDb().highlights.get(id)
    expect(row?.deletedAt).not.toBeNull() // 墓碑存活
    expect(row?.conflicts?.length).toBeGreaterThanOrEqual(1) // 编辑侧入副本
    const list = await engine.listConflicts()
    expect(list.some((c) => c.id === id)).toBe(true) // 不被 !deletedAt 过滤掉
  })

  it('graveyard 已清除 id 不进冲突供给（与丢弃规则不冲突）', async () => {
    const copy = { deviceId: 'd', rev: 1, updatedAt: '2026-01-01T00:00:00.000Z', keptAt: '2026-01-01T00:00:00.000Z', snapshot: { note: 'x', types: [], color: 'yellow' as const, selector: hl().selector, deletedAt: null } }
    await currentDb().highlights.put({ ...hl({ id: 'purged', conflicts: [copy] }), local: { dirty: 0, baseEtag: null, baseSnapshot: null }, dirty: 0 } as never)
    await currentDb().meta.put({ key: 'graveyard', value: { schemaVersion: 1, entries: { purged: { purgedAt: '2026-01-01T00:00:00.000Z' } } } })
    const engine = createSyncEngine({ db: currentDb(), transport: noopTransport, auth })
    expect((await engine.listConflicts()).some((c) => c.id === 'purged')).toBe(false)
  })
})

describe('G2：NFC 组合字符渲染偏移逆映射', () => {
  function setup(html: string): AnchorContext {
    document.body.innerHTML = `<div class="reader-chapter"><div class="vp-doc">${html}</div></div>`
    return { pageId: 'vol1-01', paragraphs: collectAnchorParagraphs(document.querySelector<HTMLElement>('.vp-doc')!) }
  }
  const marksText = (root: HTMLElement) => [...root.querySelectorAll('mark[data-reader-highlight]')].map((m) => m.textContent).join('')

  it('nfcRangeToRawOffsets：áb (raw 3) NFC 0..2 → raw 0..3', () => {
    const raw = 'áb'
    expect(nfc(raw).length).toBe(2)
    expect(nfcRangeToRawOffsets(raw, 0, 2)).toEqual([0, 3])
    expect(nfcRangeToRawOffsets(raw, 0, 1)).toEqual([0, 2]) // 首簇含组合符
    expect(nfcRangeToRawOffsets('中文', 0, 2)).toEqual([0, 2]) // CJK 恒等
  })

  it('★ 单组合字符：selector NFC 0..2 覆盖完整 áb（不止 á）', () => {
    const ctx = setup('<p id="P000001">áb</p>')
    const h = hl({ paragraphId: 'P000001', textHash: fnv1a36('áb'), selector: { exact: 'áb', prefix: '', suffix: '', start: { paragraphId: 'P000001', offset: 0 }, end: { paragraphId: 'P000001', offset: 2 } } })
    const r = resolveHighlight(h, ctx)
    const root = document.querySelector<HTMLElement>('.vp-doc')!
    renderHighlights([{ id: 'h1', color: 'yellow', result: r, hasNote: false }], root)
    expect(marksText(root)).toBe('áb')
  })

  it('★ 多组合字符 + 跨 Text 节点（em 拆分）', () => {
    // raw: a + ◌́ + ◌̀ + b（多组合），NFC 仍可能 2 单元；跨 em 节点
    const ctx = setup('<p id="P000001">á<em>b</em></p>')
    const raw = ctx.paragraphs[0].node.textContent!
    const nfcText = nfc(raw)
    const h = hl({ paragraphId: 'P000001', textHash: fnv1a36(raw), selector: { exact: nfcText, prefix: '', suffix: '', start: { paragraphId: 'P000001', offset: 0 }, end: { paragraphId: 'P000001', offset: nfcText.length } } })
    const r = resolveHighlight(h, ctx)
    const root = document.querySelector<HTMLElement>('.vp-doc')!
    renderHighlights([{ id: 'h1', color: 'blue', result: r, hasNote: false }], root)
    expect(marksText(root)).toBe(nfcText)
    expect(root.querySelectorAll('mark[data-reader-highlight]').length).toBeGreaterThanOrEqual(1)
  })
})