import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearHighlightMarks,
  collectAnchorParagraphs,
  domRangeToSelection,
  pidLocation,
  reanchor,
  renderHighlights,
  resolveHighlight,
  resolveShare,
  type AnchorContext,
} from '../../site/.vitepress/theme/composables/user-storage/anchor'
import type { Highlight } from '../../site/.vitepress/theme/composables/user-storage/types'
import { fnv1a36, nfc } from '../../site/.vitepress/theme/composables/user-storage/util'
import { hl } from './fixtures'

function setup(html: string): AnchorContext {
  document.body.innerHTML = `<div class="reader-chapter"><div class="vp-doc">${html}</div></div>`
  const root = document.querySelector<HTMLElement>('.vp-doc')!
  return { pageId: 'vol1-01', paragraphs: collectAnchorParagraphs(root) }
}

const P1 = '很久以来，我都是早早就躺下了。'
const P2 = '有时候，蜡烛才灭，我的眼皮就随即阖上。'

describe('collectAnchorParagraphs', () => {
  it('采集 .vp-doc 下全部 p，text=NFC，hash=fnv1a36，legacy', () => {
    const ctx = setup(`<p id="P000001" data-legacy="p-000001">${P1}</p><p id="P000002" data-legacy="p-000002">${P2}</p>`)
    expect(ctx.paragraphs).toHaveLength(2)
    expect(ctx.paragraphs[0].id).toBe('P000001')
    expect(ctx.paragraphs[0].legacy).toBe('p-000001')
    expect(ctx.paragraphs[0].hash).toBe(fnv1a36(P1))
    expect(ctx.paragraphs[0].text).toBe(nfc(P1))
  })
})

describe('四级定位', () => {
  it('级别 1：hash 命中 + slice 校验', () => {
    const ctx = setup(`<p id="P000001">${P1}</p>`)
    const h = hl({ paragraphId: 'P000001', textHash: fnv1a36(P1), selector: { exact: '很久以来', prefix: '', suffix: '，我都是', start: { paragraphId: 'P000001', offset: 0 }, end: { paragraphId: 'P000001', offset: 4 } } })
    const r = resolveHighlight(h, ctx)
    expect(r.status).toBe('exact')
    if (r.status === 'exact') {
      expect(r.level).toBe(1)
      expect(r.ranges[0]).toEqual({ paragraphId: 'P000001', start: 0, end: 4 })
    }
  })

  it('hash 漂移 → 级别 2（exact+prefix+suffix）', () => {
    const ctx = setup(`<p id="P000001">${P1}</p>`)
    const h = hl({ paragraphId: 'P000001', textHash: 'stale-hash', selector: { exact: '很久以来', prefix: '', suffix: '，我都是', start: { paragraphId: 'P000001', offset: 0 }, end: { paragraphId: 'P000001', offset: 4 } } })
    const r = resolveHighlight(h, ctx)
    expect(r.status).toBe('exact')
    if (r.status === 'exact') expect(r.level).toBe(2)
  })

  it('级别 2：段落 ID 漂移但 exact 唯一命中他段', () => {
    const ctx = setup(`<p id="P000001">无关段落。</p><p id="P000002">${P1}</p>`)
    const h = hl({ paragraphId: 'P000099', textHash: 'x', selector: { exact: '很久以来', prefix: '', suffix: '，我都是', start: { paragraphId: 'P000099', offset: 0 }, end: { paragraphId: 'P000099', offset: 4 } } })
    const r = resolveHighlight(h, ctx)
    expect(r.status).toBe('exact')
    if (r.status === 'exact') {
      expect(r.level).toBe(2)
      expect(r.ranges[0].paragraphId).toBe('P000002')
    }
  })

  it('★ 重复短语多处命中 → 最近优先；平局降级（宁可降级不错关联）', () => {
    const ctx = setup(`<p id="P000001">教堂教堂</p><p id="P000002">教堂教堂</p>`)
    // 原偏移 1，候选段内两处命中（0 与 2）距离相同 → 平局 → 段落降级
    const h = hl({ paragraphId: 'P000001', textHash: 'x', selector: { exact: '教堂', prefix: '', suffix: '', start: { paragraphId: 'P000001', offset: 1 }, end: { paragraphId: 'P000001', offset: 3 } } })
    const r = resolveHighlight(h, ctx)
    expect(r.status).toBe('paragraph')
  })

  it('★ resolve 绝不改记录 selector（深比较前后）', () => {
    const ctx = setup(`<p id="P000001">${P1}</p>`)
    const h = hl({ paragraphId: 'P000001', textHash: 'stale', selector: { exact: '很久以来', prefix: '', suffix: '', start: { paragraphId: 'P000001', offset: 0 }, end: { paragraphId: 'P000001', offset: 4 } } })
    const before = JSON.stringify(h.selector)
    resolveHighlight(h, ctx)
    expect(JSON.stringify(h.selector)).toBe(before)
  })

  it('missing：段落不存在且全文无命中', () => {
    const ctx = setup(`<p id="P000001">无关。</p>`)
    const h = hl({ paragraphId: 'P000099', textHash: 'x', selector: { exact: '不存在文本', prefix: '', suffix: '', start: { paragraphId: 'P000099', offset: 0 }, end: { paragraphId: 'P000099', offset: 5 } } })
    expect(resolveHighlight(h, ctx).status).toBe('missing')
  })

  it('kind=note：段落存在即 exact level 1', () => {
    const ctx = setup(`<p id="P000001">${P1}</p>`)
    const h = hl({ kind: 'note', paragraphId: 'P000001', textHash: 'whatever', selector: { exact: '', prefix: '', suffix: '', start: { paragraphId: 'P000001', offset: 0 }, end: { paragraphId: 'P000001', offset: 0 } } })
    const r = resolveHighlight(h, ctx)
    expect(r.status).toBe('exact')
    if (r.status === 'exact') expect(r.level).toBe(1)
  })
})

describe('resolveShare', () => {
  it('分享载荷定位（exact 命中）', () => {
    const ctx = setup(`<p id="P000001">${P1}</p>`)
    const r = resolveShare({ v: 1, c: 'vol1-01', s: 'P000001', q: '很久以来', b: '', a: '，我都是' }, ctx)
    expect(r.status).toBe('exact')
  })
})

describe('domRangeToSelection（NFC 偏移映射）', () => {
  function selectIn(p: HTMLElement, start: number, end: number): Range {
    const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT)
    const nodes: Text[] = []
    while (walker.nextNode()) nodes.push(walker.currentNode as Text)
    const locate = (offset: number) => {
      let acc = 0
      for (const n of nodes) {
        if (acc + n.length >= offset) return { node: n, off: offset - acc }
        acc += n.length
      }
      const last = nodes[nodes.length - 1]
      return { node: last, off: last.length }
    }
    const s = locate(start)
    const e = locate(end)
    const r = document.createRange()
    r.setStart(s.node, s.off)
    r.setEnd(e.node, e.off)
    return r
  }

  it('CJK 恒等快路径：同段选区', () => {
    const ctx = setup(`<p id="P000001">${P1}</p>`)
    const range = selectIn(ctx.paragraphs[0].node, 0, 4)
    const sel = domRangeToSelection(range, ctx.paragraphs)
    expect(sel).not.toBeNull()
    expect(sel!.exact).toBe('很久以来')
    expect(sel!.start).toEqual({ paragraphId: 'P000001', offset: 0 })
    expect(sel!.end).toEqual({ paragraphId: 'P000001', offset: 4 })
  })

  it('跨段 exact 以 \\n 连接', () => {
    const ctx = setup(`<p id="P000001">${P1}</p><p id="P000002">${P2}</p>`)
    const r = document.createRange()
    r.setStart(ctx.paragraphs[0].node.firstChild!, 0)
    r.setEnd(ctx.paragraphs[1].node.firstChild!, 3)
    const sel = domRangeToSelection(r, ctx.paragraphs)
    expect(sel).not.toBeNull()
    expect(sel!.exact).toBe(`${P1}\n${P2.slice(0, 3)}`)
    expect(sel!.start.paragraphId).toBe('P000001')
    expect(sel!.end.paragraphId).toBe('P000002')
  })

  it('组合字符 NFC 映射（á 2→1）', () => {
    const ctx = setup('<p id="P000001">áb</p>') // raw 'áb' (3) → NFC 'áb' (2)
    const range = selectIn(ctx.paragraphs[0].node, 0, 3) // 选 raw 全部
    const sel = domRangeToSelection(range, ctx.paragraphs)
    expect(sel!.exact).toBe('áb')
    expect(sel!.end.offset).toBe(2)
  })

  it('空选区 → null', () => {
    const ctx = setup(`<p id="P000001">${P1}</p>`)
    const range = selectIn(ctx.paragraphs[0].node, 2, 2)
    expect(domRangeToSelection(range, ctx.paragraphs)).toBeNull()
  })
})

describe('mark 渲染与清理', () => {
  it('跨 em 拆分包裹 mark.reader-highlight', () => {
    const ctx = setup('<p id="P000001">很久<em>以来</em>我都</p>')
    const h = hl({ paragraphId: 'P000001', textHash: fnv1a36('很久以来我都'), selector: { exact: '很久以来', prefix: '', suffix: '我都', start: { paragraphId: 'P000001', offset: 0 }, end: { paragraphId: 'P000001', offset: 4 } } })
    const r = resolveHighlight(h, ctx)
    const root = document.querySelector<HTMLElement>('.vp-doc')!
    renderHighlights([{ id: 'h1', color: 'yellow', result: r, hasNote: true }], root)
    const marks = root.querySelectorAll('mark[data-reader-highlight="h1"]')
    expect(marks.length).toBeGreaterThanOrEqual(1)
    expect([...marks].map((m) => m.textContent).join('')).toBe('很久以来')
    expect(marks[0].getAttribute('tabindex')).toBe('0')
    expect(marks[0].getAttribute('aria-label')).toBe('摘录，有批注')
  })

  it('★ 三种 mark 共存嵌套，clear 各认各的 data（互不误删）', () => {
    const ctx = setup(`<p id="P000001">${P1}</p>`)
    const root = document.querySelector<HTMLElement>('.vp-doc')!
    const p = ctx.paragraphs[0].node
    // 搜索 mark + 分享 mark 先存在
    p.innerHTML = '<mark data-reader-search>很久</mark>以来<mark data-reader-share>我都是</mark>早早就躺下了。'
    const paras = collectAnchorParagraphs(root)
    const h = hl({ paragraphId: 'P000001', textHash: fnv1a36(P1), selector: { exact: '以来', prefix: '很久', suffix: '我都是', start: { paragraphId: 'P000001', offset: 2 }, end: { paragraphId: 'P000001', offset: 4 } } })
    const r = resolveHighlight(h, { pageId: 'vol1-01', paragraphs: paras })
    renderHighlights([{ id: 'h1', color: 'green', result: r, hasNote: false }], root)
    expect(root.querySelectorAll('mark[data-reader-highlight]').length).toBeGreaterThanOrEqual(1)
    clearHighlightMarks(root)
    expect(root.querySelectorAll('mark[data-reader-highlight]').length).toBe(0)
    expect(root.querySelectorAll('mark[data-reader-search]').length).toBe(1)
    expect(root.querySelectorAll('mark[data-reader-share]').length).toBe(1)
  })

  it('段落降级渲染 is-degraded；missing 不渲染', () => {
    const ctx = setup(`<p id="P000001">${P1}</p>`)
    const root = document.querySelector<HTMLElement>('.vp-doc')!
    renderHighlights([{ id: 'h1', color: 'blue', result: { status: 'paragraph', level: 5, paragraphId: 'P000001' }, hasNote: false }], root)
    expect(ctx.paragraphs[0].node.classList.contains('reader-highlight-degraded')).toBe(true)
    clearHighlightMarks(root)
    expect(ctx.paragraphs[0].node.classList.contains('reader-highlight-degraded')).toBe(false)
    renderHighlights([{ id: 'h2', color: 'blue', result: { status: 'missing' }, hasNote: false }], root)
    expect(root.querySelectorAll('mark').length).toBe(0)
  })
})

describe('reanchor', () => {
  it('★ rev+1、selectorHistory 追加、cap 5；唯一写 selector 路径', () => {
    const h = hl({ rev: 2 })
    const sel = { start: { paragraphId: 'P000002', offset: 1 }, end: { paragraphId: 'P000002', offset: 3 }, exact: '新选', prefix: 'a', suffix: 'b' }
    const out = reanchor(h, sel, 'v2')
    expect(out.rev).toBe(3)
    expect(out.selector.exact).toBe('新选')
    expect(out.paragraphId).toBe('P000002')
    expect(out.selectorHistory).toHaveLength(1)
    expect(out.selectorHistory![0].selector).toEqual(h.selector)
    // cap 5
    let acc = h
    for (let i = 0; i < 7; i += 1) acc = reanchor(acc, sel, 'v2')
    expect(acc.selectorHistory!.length).toBe(5)
  })
})

describe('pidLocation', () => {
  it('反查 pageId/index', () => {
    const map = { pages: { 'vol1-01': ['P000001', 'P000002'], 'vol1-02': ['P000003'] } }
    expect(pidLocation(map, 'P000003')).toEqual({ pageId: 'vol1-02', index: 0 })
    expect(pidLocation(map, 'P999999')).toBeNull()
  })
})