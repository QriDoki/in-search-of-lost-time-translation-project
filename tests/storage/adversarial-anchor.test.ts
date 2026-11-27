/**
 * 对抗性测试 · anchor.ts —— 断言依据：协议 §5.3 四级管线、§3.1 不变量 1/12/14、data-model §2.3/§4.1。
 * 主线：resolve 永不回写 selector；宁可降级不错关联；NFC 偏移基准；mark 各认各的 data。
 */
import { afterEach, describe, expect, it } from 'vitest'
import {
  clearHighlightMarks,
  collectAnchorParagraphs,
  domRangeToSelection,
  reanchor,
  renderHighlights,
  resolveHighlight,
  resolveShare,
  type AnchorContext,
} from '../../site/.vitepress/theme/composables/user-storage/anchor'
import { fnv1a36, nfc, deepEqual, deepClone } from '../../site/.vitepress/theme/composables/user-storage/util'
import type { Highlight, Selector } from '../../site/.vitepress/theme/composables/user-storage/types'
import { hl } from './fixtures'

const TEXT = '很久以来，我都是早早就躺下了。'

function makeDoc(paras: { id: string; text: string; legacy?: string }[]): HTMLElement {
  const root = document.createElement('div')
  root.className = 'vp-doc'
  for (const p of paras) {
    const el = document.createElement('p')
    el.id = p.id
    if (p.legacy) el.dataset.legacy = p.legacy
    el.textContent = p.text
    root.append(el)
  }
  document.body.append(root)
  return root
}

function ctxOf(root: HTMLElement): AnchorContext {
  return { pageId: 'vol1-01', paragraphs: collectAnchorParagraphs(root) }
}

function sel(exact: string, startPid: string, startOff: number, endPid: string, endOff: number, prefix = '', suffix = ''): Selector {
  return { exact, prefix, suffix, start: { paragraphId: startPid, offset: startOff }, end: { paragraphId: endPid, offset: endOff } }
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('collectAnchorParagraphs（协议 §5.3 / §2.2）', () => {
  it('text=NFC(textContent)，hash=fnv1a36(raw)，legacy 来自 data-legacy', () => {
    const nfd = 'áb'
    const root = makeDoc([{ id: 'P000001', text: TEXT, legacy: 'p-000007' }, { id: 'P000002', text: nfd }])
    const paras = collectAnchorParagraphs(root)
    expect(paras[0].text).toBe(TEXT)
    expect(paras[0].hash).toBe(fnv1a36(TEXT))
    expect(paras[0].legacy).toBe('p-000007')
    expect(paras[1].text).toBe(nfc(nfd)) // NFC 归一化
    expect(paras[1].hash).toBe(fnv1a36(nfd)) // 指纹用 raw，不做 NFC
    expect(paras[1].legacy).toBe('')
  })
})

describe('级别 1：hash + 切片校验（协议 §5.3）', () => {
  it('★ hash 命中且 exact===slice → exact level 1，ranges 正确', () => {
    const root = makeDoc([{ id: 'P000001', text: TEXT }])
    const h = hl({ paragraphId: 'P000001', textHash: fnv1a36(TEXT), selector: sel('很久以来', 'P000001', 0, 'P000001', 4) })
    const r = resolveHighlight(h, ctxOf(root))
    expect(r.status).toBe('exact')
    if (r.status === 'exact') {
      expect(r.level).toBe(1)
      expect(r.ranges).toEqual([{ paragraphId: 'P000001', start: 0, end: 4 }])
    }
  })

  it('★ hash 漂移 → 降级级别 2 精确匹配（不错关联）', () => {
    const root = makeDoc([{ id: 'P000001', text: TEXT }])
    const h = hl({ paragraphId: 'P000001', textHash: 'drifted', selector: sel('很久以来', 'P000001', 0, 'P000001', 4) })
    const r = resolveHighlight(h, ctxOf(root))
    expect(r.status).toBe('exact')
    if (r.status === 'exact') expect(r.level).toBe(2)
  })

  it('★ 偏移失配（exact≠slice）→ 降级级别 2', () => {
    const root = makeDoc([{ id: 'P000001', text: TEXT }])
    // exact 与偏移区间不一致：slice(0,4)='很久以来' ≠ '早早就躺'
    const h = hl({ paragraphId: 'P000001', textHash: fnv1a36(TEXT), selector: sel('早早就躺', 'P000001', 0, 'P000001', 4) })
    const r = resolveHighlight(h, ctxOf(root))
    // 级别 1 失败；级别 2 在段内找 '早早就躺' 唯一命中
    expect(r.status).toBe('exact')
    if (r.status === 'exact') {
      expect(r.level).toBe(2)
      expect(r.ranges[0].start).toBe(TEXT.indexOf('早早就躺'))
    }
  })

  it('偏移 0 边界：exact 取段首', () => {
    const root = makeDoc([{ id: 'P000001', text: TEXT }])
    const h = hl({ paragraphId: 'P000001', textHash: fnv1a36(TEXT), selector: sel('很', 'P000001', 0, 'P000001', 1) })
    const r = resolveHighlight(h, ctxOf(root))
    expect(r.status).toBe('exact')
    if (r.status === 'exact') expect(r.level).toBe(1)
  })
})

describe('级别 2：精确匹配与多处命中（协议 §5.3，宁可降级不错关联）', () => {
  it('exact+prefix+suffix 唯一命中 → level 2', () => {
    const root = makeDoc([{ id: 'P000001', text: '前文很久以来后文' }])
    const h = hl({ paragraphId: 'Pmiss', textHash: 'x', selector: sel('很久以来', 'Pmiss', 0, 'Pmiss', 4, '前文', '后文') })
    const r = resolveHighlight(h, ctxOf(root))
    expect(r.status).toBe('exact')
    if (r.status === 'exact') expect(r.level).toBe(2)
  })

  it('★ 重复短语多处命中 → 距原偏移最近者', () => {
    const root = makeDoc([{ id: 'P000001', text: '甲乙丙甲乙' }])
    // 原偏移 3（第二个甲乙）→ 应选 idx3 而非 idx0
    const h = hl({ paragraphId: 'P000001', textHash: 'drift', selector: sel('甲乙', 'P000001', 3, 'P000001', 5) })
    const r = resolveHighlight(h, ctxOf(root))
    expect(r.status).toBe('exact')
    if (r.status === 'exact') {
      expect(r.level).toBe(2)
      expect(r.ranges[0].start).toBe(3)
    }
  })

  it('★ 多处命中仍平局 → 降级（P0 无 dmp → 级别 5），不自动挑', () => {
    const root = makeDoc([{ id: 'P000001', text: '甲X甲' }])
    // 原偏移 1，两命中 idx0/idx2 距离都是 1 → 平局
    const h = hl({ paragraphId: 'P000001', textHash: 'drift', selector: sel('甲', 'P000001', 1, 'P000001', 2) })
    const r = resolveHighlight(h, ctxOf(root))
    expect(r.status).toBe('paragraph')
    if (r.status === 'paragraph') {
      expect(r.level).toBe(5)
      expect(r.paragraphId).toBe('P000001')
    }
  })
})

describe('段落缺失（协议 §5.3）', () => {
  it('段落已不存在且全文无命中 → missing', () => {
    const root = makeDoc([{ id: 'P000001', text: '别的文字' }])
    const h = hl({ paragraphId: 'Pgone', textHash: 'x', selector: sel('找不到的短语', 'Pgone', 0, 'Pgone', 6) })
    const r = resolveHighlight(h, ctxOf(root))
    expect(r.status).toBe('missing')
  })
})

describe('跨段摘录（不变量 14 / data-model §4.1）', () => {
  it('★ 逐段校验全通过 → exact level 1，ranges 覆盖各段', () => {
    const root = makeDoc([{ id: 'P1', text: 'ABC' }, { id: 'P2', text: 'DEF' }, { id: 'P3', text: 'GHI' }])
    const h = hl({ paragraphId: 'P1', textHash: fnv1a36('ABC'), selector: sel('BC\nDEF\nGH', 'P1', 1, 'P3', 2) })
    const r = resolveHighlight(h, ctxOf(root))
    expect(r.status).toBe('exact')
    if (r.status === 'exact') {
      expect(r.level).toBe(1)
      expect(r.ranges).toEqual([
        { paragraphId: 'P1', start: 1, end: 3 },
        { paragraphId: 'P2', start: 0, end: 3 },
        { paragraphId: 'P3', start: 0, end: 2 },
      ])
    }
  })

  it('★ 任一段失配 → 整体降级，不允许部分错误关联', () => {
    const root = makeDoc([{ id: 'P1', text: 'ABC' }, { id: 'P2', text: 'DXF' }, { id: 'P3', text: 'GHI' }])
    const h = hl({ paragraphId: 'P1', textHash: fnv1a36('ABC'), selector: sel('BC\nDEF\nGH', 'P1', 1, 'P3', 2) })
    const r = resolveHighlight(h, ctxOf(root))
    expect(r.status).not.toBe('exact') // 中间段 DEF→DXF 失配 → 整体降级
    expect(r.status === 'paragraph' || r.status === 'missing').toBe(true)
  })
})

describe('★ 不变量 1：resolve 永不回写 selector', () => {
  it('resolveHighlight 前后 selector 与整条记录深相等', () => {
    const root = makeDoc([{ id: 'P000001', text: TEXT }])
    const h = hl({ paragraphId: 'P000001', textHash: 'drift', selector: sel('很久以来', 'P000001', 0, 'P000001', 4) })
    const before = deepClone(h)
    resolveHighlight(h, ctxOf(root))
    expect(deepEqual(h, before)).toBe(true)
    expect(deepEqual(h.selector, before.selector)).toBe(true)
  })

  it('resolveShare 同样不改 payload', () => {
    const root = makeDoc([{ id: 'P000001', text: TEXT }])
    const p = { v: 1 as const, c: 'vol1-01', s: 'P000001', q: '很久以来' }
    const before = deepClone(p)
    resolveShare(p, ctxOf(root))
    expect(deepEqual(p, before)).toBe(true)
  })
})

describe('reanchor：唯一写 selector 路径（协议 §5.3 / 不变量 1）', () => {
  it('★ 显式重锚 → 新 selector、rev+1、旧锚点入 selectorHistory、updatedAt/deviceId 更新', () => {
    const h = hl({ rev: 3, revision: 'v1', textHash: 'h1' })
    const newSel = { exact: '新文字', prefix: '前', suffix: '后', start: { paragraphId: 'P000002', offset: 1 }, end: { paragraphId: 'P000002', offset: 4 } }
    const out = reanchor(h, newSel, 'v2')
    expect(out.selector.exact).toBe('新文字')
    expect(out.paragraphId).toBe('P000002')
    expect(out.rev).toBe(4)
    expect(out.revision).toBe('v2')
    expect(out.selectorHistory).toHaveLength(1)
    expect(out.selectorHistory![0].selector).toEqual(h.selector)
    expect(out.selectorHistory![0].revision).toBe('v1')
    expect(out.selectorHistory![0].textHash).toBe('h1')
    expect(out.updatedAt).not.toBe(h.updatedAt)
    // 原记录不被修改
    expect(h.rev).toBe(3)
    expect(h.selectorHistory).toBeUndefined()
  })

  it('★ selectorHistory cap 5：溢出丢最旧', () => {
    const entry = (n: number) => ({ selector: hl().selector, revision: `r${n}`, textHash: 'h', replacedAt: `2026-01-0${n}T00:00:00.000Z` })
    const h = hl({ selectorHistory: [entry(1), entry(2), entry(3), entry(4), entry(5)] })
    const out = reanchor(h, { exact: 'x', prefix: '', suffix: '', start: { paragraphId: 'P000001', offset: 0 }, end: { paragraphId: 'P000001', offset: 1 } }, 'vnew')
    expect(out.selectorHistory).toHaveLength(5)
    expect(out.selectorHistory![0].revision).toBe('r2') // 最旧 r1 被丢
    expect(out.selectorHistory![4].revision).toBe('v1') // 本次旧锚点（h.revision='v1'）入尾
  })
})

describe('domRangeToSelection：NFC 偏移映射（协议 §5.3 / data-model §2.3）', () => {
  it('★ 同段 exact === nfcText.slice(start.offset, end.offset)（不变量 14）', () => {
    const root = makeDoc([{ id: 'P000001', text: TEXT }])
    const paras = collectAnchorParagraphs(root)
    const textNode = paras[0].node.firstChild as Text
    const range = document.createRange()
    range.setStart(textNode, 0)
    range.setEnd(textNode, 4)
    const anchor = domRangeToSelection(range, paras)
    expect(anchor).not.toBeNull()
    expect(anchor!.exact).toBe('很久以来')
    expect(anchor!.exact).toBe(paras[0].text.slice(anchor!.start.offset, anchor!.end.offset))
  })

  it('★ 组合字符 NFC 偏移：raw 下标 2 → NFC 下标 1（á 2→1）', () => {
    const nfd = 'áb' // 3 code units → NFC 'áb' 2 code units
    const root = makeDoc([{ id: 'P000001', text: nfd }])
    const paras = collectAnchorParagraphs(root)
    const textNode = paras[0].node.firstChild as Text
    const range = document.createRange()
    range.setStart(textNode, 2) // raw：组合音之后、b 之前
    range.setEnd(textNode, 3)
    const anchor = domRangeToSelection(range, paras)
    expect(anchor!.exact).toBe('b')
    expect(anchor!.start.offset).toBe(1) // NFC 基准
    expect(anchor!.end.offset).toBe(2)
    expect(anchor!.exact).toBe(paras[0].text.slice(anchor!.start.offset, anchor!.end.offset))
  })

  it('★ 跨段 exact 以 \\n 连接', () => {
    const root = makeDoc([{ id: 'P1', text: 'ABC' }, { id: 'P2', text: 'DEF' }])
    const paras = collectAnchorParagraphs(root)
    const range = document.createRange()
    range.setStart(paras[0].node.firstChild as Text, 1)
    range.setEnd(paras[1].node.firstChild as Text, 2)
    const anchor = domRangeToSelection(range, paras)
    expect(anchor!.exact).toBe('BC\nDE')
    expect(anchor!.start.paragraphId).toBe('P1')
    expect(anchor!.end.paragraphId).toBe('P2')
  })

  it('空选区 → null', () => {
    const root = makeDoc([{ id: 'P000001', text: TEXT }])
    const paras = collectAnchorParagraphs(root)
    const textNode = paras[0].node.firstChild as Text
    const range = document.createRange()
    range.setStart(textNode, 2)
    range.setEnd(textNode, 2)
    expect(domRangeToSelection(range, paras)).toBeNull()
  })

  it('prefix/suffix ≤ 32 字符', () => {
    const long = 'x'.repeat(50) + '目标' + 'y'.repeat(50)
    const root = makeDoc([{ id: 'P000001', text: long }])
    const paras = collectAnchorParagraphs(root)
    const textNode = paras[0].node.firstChild as Text
    const range = document.createRange()
    range.setStart(textNode, 50)
    range.setEnd(textNode, 52)
    const anchor = domRangeToSelection(range, paras)
    expect(anchor!.prefix.length).toBeLessThanOrEqual(32)
    expect(anchor!.suffix.length).toBeLessThanOrEqual(32)
  })
})

describe('T ID / note kind（协议 §5.3）', () => {
  it('T ID 视同无永久锚点 → 级别 2 精确匹配仍可用', () => {
    const root = makeDoc([{ id: 'P000001', text: TEXT }])
    const h = hl({ paragraphId: 'T12345678', textHash: 'x', selector: sel('很久以来', 'T12345678', 0, 'T12345678', 4) })
    const r = resolveHighlight(h, ctxOf(root))
    expect(r.status).toBe('exact')
    if (r.status === 'exact') expect(r.level).toBe(2)
  })

  it('kind=note：段落存在即 exact level 1（跳过 exact 校验）', () => {
    const root = makeDoc([{ id: 'P000001', text: TEXT }])
    const h = hl({ kind: 'note', paragraphId: 'P000001', textHash: 'whatever', selector: sel('', 'P000001', 0, 'P000001', 0) })
    const r = resolveHighlight(h, ctxOf(root))
    expect(r.status).toBe('exact')
    if (r.status === 'exact') {
      expect(r.level).toBe(1)
      expect(r.ranges[0]).toEqual({ paragraphId: 'P000001', start: 0, end: TEXT.length })
    }
  })
})

describe('mark 渲染与清理（不变量 12 / 协议 §5.3）', () => {
  it('★ 三种 mark 共存，clear 只认 data-reader-highlight，互不误删', () => {
    const root = makeDoc([{ id: 'P000001', text: TEXT }])
    const paras = collectAnchorParagraphs(root)
    // 用户高亮
    renderHighlights([{ id: 'u1', color: 'yellow', result: { status: 'exact', level: 1, ranges: [{ paragraphId: 'P000001', start: 0, end: 4 }] }, hasNote: false }], root)
    // 手工注入搜索/分享 mark（模拟其他模块）
    const p = paras[0].node
    const searchMark = document.createElement('mark')
    searchMark.dataset.readerSearch = 's1'
    searchMark.textContent = '搜索'
    p.append(searchMark)
    const shareMark = document.createElement('mark')
    shareMark.dataset.readerShare = 'sh1'
    shareMark.textContent = '分享'
    p.append(shareMark)
    expect(p.querySelectorAll('mark[data-reader-highlight]').length).toBe(1)
    clearHighlightMarks(root)
    expect(p.querySelectorAll('mark[data-reader-highlight]').length).toBe(0)
    expect(p.querySelectorAll('mark[data-reader-search]').length).toBe(1)
    expect(p.querySelectorAll('mark[data-reader-share]').length).toBe(1)
  })

  it('用户 mark 带 class/tabindex/aria-label', () => {
    const root = makeDoc([{ id: 'P000001', text: TEXT }])
    renderHighlights([{ id: 'u1', color: 'blue', result: { status: 'exact', level: 1, ranges: [{ paragraphId: 'P000001', start: 0, end: 4 }] }, hasNote: true }], root)
    const mark = root.querySelector('mark[data-reader-highlight]') as HTMLElement
    expect(mark.classList.contains('reader-highlight')).toBe(true)
    expect(mark.tabIndex).toBe(0)
    expect(mark.getAttribute('aria-label')).toBeTruthy()
    expect(mark.textContent).toBe('很久以来')
  })

  it('paragraph 降级 → 整段淡底标记，不包精确范围；missing 不渲染', () => {
    const root = makeDoc([{ id: 'P000001', text: TEXT }])
    renderHighlights([
      { id: 'deg', color: 'yellow', result: { status: 'paragraph', level: 5, paragraphId: 'P000001' }, hasNote: false },
      { id: 'mis', color: 'yellow', result: { status: 'missing' }, hasNote: false },
    ], root)
    const p = root.querySelector('#P000001') as HTMLElement
    expect(p.dataset.readerHighlightDegraded).toBe('deg')
    expect(p.querySelectorAll('mark').length).toBe(0)
    clearHighlightMarks(root)
    expect(p.dataset.readerHighlightDegraded).toBeUndefined()
  })
})
