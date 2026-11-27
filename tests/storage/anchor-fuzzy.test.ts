import { beforeEach, describe, expect, it } from 'vitest'
import {
  collectAnchorParagraphs,
  loadFuzzyMatcher,
  resolveHighlight,
  _resetFuzzyMatcher,
  type AnchorContext,
} from '../../site/.vitepress/theme/composables/user-storage/anchor'
import { hl } from './fixtures'

function setup(html: string): AnchorContext {
  document.body.innerHTML = `<div class="reader-chapter"><div class="vp-doc">${html}</div></div>`
  return { pageId: 'vol1-01', paragraphs: collectAnchorParagraphs(document.querySelector<HTMLElement>('.vp-doc')!) }
}

beforeEach(() => {
  _resetFuzzyMatcher()
})

describe('旧格式 ID 兜底：全文精确搜索', () => {
  it('★ 段落 ID 不在当前页（旧 P 格式）→ exact 唯一命中他段（级别 2）', () => {
    const ctx = setup('<p id="vol1-1_0001">无关段落。</p><p id="vol1-1_0002">很久以来，我都是早早就躺下了。</p>')
    const h = hl({ paragraphId: 'P000001', textHash: 'stale', selector: { exact: '很久以来', prefix: '', suffix: '，我都是', start: { paragraphId: 'P000001', offset: 0 }, end: { paragraphId: 'P000001', offset: 4 } } })
    const r = resolveHighlight(h, ctx)
    expect(r.status).toBe('exact')
    if (r.status === 'exact') {
      expect(r.level).toBe(2)
      expect(r.ranges[0].paragraphId).toBe('vol1-1_0002')
    }
  })

  it('旧 ID 且全文无命中 → missing（不假装定位）', () => {
    const ctx = setup('<p id="vol1-1_0001">别的文字</p>')
    const h = hl({ paragraphId: 'P000001', textHash: 'stale', selector: { exact: '找不到的短语', prefix: '', suffix: '', start: { paragraphId: 'P000001', offset: 0 }, end: { paragraphId: 'P000001', offset: 6 } } })
    expect(resolveHighlight(h, ctx).status).toBe('missing')
  })
})

describe('级别 4：diff-match-patch 懒加载（直接命中的位置槽）', () => {
  it('★ 懒加载后模糊命中（exact 有微调，level 2 失败）→ fuzzy level 4', async () => {
    const ctx = setup('<p id="vol1-1_0001">很久以来我都是早早就躺下了。</p>')
    const h = hl({ paragraphId: 'vol1-1_0001', textHash: 'stale', selector: { exact: '很久以来我都是早早躺下了', prefix: '', suffix: '', start: { paragraphId: 'vol1-1_0001', offset: 0 }, end: { paragraphId: 'vol1-1_0001', offset: 12 } } })
    // 未加载 dmp → 降级
    const before = resolveHighlight(h, ctx)
    expect(before.status).not.toBe('fuzzy')
    await loadFuzzyMatcher()
    const r = resolveHighlight(h, ctx)
    expect(r.status).toBe('fuzzy')
    if (r.status === 'fuzzy') expect(r.level).toBe(4)
  })

  it('完全无关文本 → 不命中（阈值边界）', async () => {
    await loadFuzzyMatcher()
    const ctx = setup('<p id="vol1-1_0001">量子计算机与相对论。</p>')
    const h = hl({ paragraphId: 'vol1-1_0001', textHash: 'stale', selector: { exact: '很久以来我都是早早就躺下了', prefix: '', suffix: '', start: { paragraphId: 'vol1-1_0001', offset: 0 }, end: { paragraphId: 'vol1-1_0001', offset: 12 } } })
    const r = resolveHighlight(h, ctx)
    expect(r.status).not.toBe('fuzzy')
  })

  it('★ 旧 ID 无直接命中 → 不走 dmp（仅全文精确兜底）', async () => {
    await loadFuzzyMatcher()
    const ctx = setup('<p id="vol1-1_0001">很久以来我都是早早就躺下了。</p>')
    const h = hl({ paragraphId: 'P000001', textHash: 'stale', selector: { exact: '很久以来我都是早早躺下了', prefix: '', suffix: '', start: { paragraphId: 'P000001', offset: 0 }, end: { paragraphId: 'P000001', offset: 12 } } })
    const r = resolveHighlight(h, ctx)
    expect(r.status).not.toBe('fuzzy')
  })
})
