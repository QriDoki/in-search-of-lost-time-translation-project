/**
 * 四级定位管线 + DOM 偏移映射 + mark 渲染 + 重锚（protocol §5.3）。
 * 级别 1/2 精确、级别 4 dmp 模糊、级别 5 段落降级；位置编码 ID 直接命中即身份。
 * 不变量 1：resolve 绝不改写 selector；仅 reanchor 显式写。
 */
import type {
  AnchorResult,
  Highlight,
  HighlightColor,
  ParagraphInfo,
  ParagraphRange,
  Selector,
  SharePayload,
} from './types'
import { fnv1a36, nfc, nowIso, uuidv7 } from './util'
import { deviceId } from './db'

export interface AnchorContext {
  pageId: string
  paragraphs: ParagraphInfo[]
}
export interface SelectionAnchor {
  start: { paragraphId: string; offset: number }
  end: { paragraphId: string; offset: number }
  exact: string
  prefix: string
  suffix: string
}
export interface VersionMap {
  pages: Record<string, string[]>
}

/* ------------------------------------------------------------------ */
/* 采集                                                                */
/* ------------------------------------------------------------------ */

export function collectAnchorParagraphs(root: HTMLElement): ParagraphInfo[] {
  const doc = root.closest('.vp-doc') ?? root
  const nodes = Array.from(doc.querySelectorAll<HTMLElement>('p'))
  return nodes.map((node) => {
    const raw = node.textContent ?? ''
    return {
      id: node.id,
      legacy: node.dataset.legacy ?? '',
      text: nfc(raw),
      hash: fnv1a36(raw),
      node,
    }
  })
}

/* ------------------------------------------------------------------ */
/* DOM Range → SelectionAnchor（NFC 偏移映射）                         */
/* ------------------------------------------------------------------ */

function rawTextOf(node: HTMLElement): string {
  return node.textContent ?? ''
}

/** raw 前缀长度 → NFC 前缀长度。CJK 恒等快路径；含组合字符时建逐字符映射。 */
function nfcOffset(raw: string, rawIndex: number): number {
  const normalized = nfc(raw)
  if (normalized.length === raw.length) return rawIndex // 恒等快路径
  return nfc(raw.slice(0, rawIndex)).length
}

function rawOffsetWithin(node: HTMLElement, container: Node, offset: number): number {
  try {
    const r = node.ownerDocument.createRange()
    r.selectNodeContents(node)
    r.setEnd(container, offset)
    return r.toString().length
  } catch {
    return rawTextOf(node).length
  }
}

export function domRangeToSelection(range: Range, paras: ParagraphInfo[]): SelectionAnchor | null {
  try {
    const involved: { para: ParagraphInfo; startRaw: number; endRaw: number }[] = []
    for (const para of paras) {
      const node = para.node
      let intersects = false
      try {
        intersects = range.intersectsNode(node)
      } catch {
        intersects = node.contains(range.startContainer) || node.contains(range.endContainer)
      }
      if (!intersects) continue
      const raw = rawTextOf(node)
      const startRaw = node.contains(range.startContainer) ? rawOffsetWithin(node, range.startContainer, range.startOffset) : 0
      const endRaw = node.contains(range.endContainer) ? rawOffsetWithin(node, range.endContainer, range.endOffset) : raw.length
      if (endRaw <= startRaw && !(node.contains(range.startContainer) && node.contains(range.endContainer))) {
        // 中间整段被跨越时 startRaw=0,endRaw=full 仍有效；空段跳过
        if (endRaw <= startRaw) continue
      }
      involved.push({ para, startRaw: Math.max(0, startRaw), endRaw: Math.min(raw.length, endRaw) })
    }
    if (!involved.length) return null

    const pieces: string[] = []
    for (const { para, startRaw, endRaw } of involved) {
      pieces.push(nfc(rawTextOf(para.node).slice(startRaw, endRaw)))
    }
    const exact = pieces.join('\n')
    if (!exact) return null

    const first = involved[0]
    const last = involved[involved.length - 1]
    const firstRaw = rawTextOf(first.para.node)
    const lastRaw = rawTextOf(last.para.node)
    const startNfc = nfcOffset(firstRaw, first.startRaw)
    const endNfc = nfcOffset(lastRaw, last.endRaw)
    const firstText = nfc(firstRaw)
    const lastText = nfc(lastRaw)
    return {
      start: { paragraphId: first.para.id, offset: startNfc },
      end: { paragraphId: last.para.id, offset: endNfc },
      exact,
      prefix: firstText.slice(Math.max(0, startNfc - 32), startNfc),
      suffix: lastText.slice(endNfc, endNfc + 32),
    }
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------ */
/* 五级管线                                                            */
/* ------------------------------------------------------------------ */

const byId = (paras: ParagraphInfo[], id: string) => paras.find((p) => p.id === id)

/** 同段/跨段切片校验。 */
function verifySelector(selector: Selector, exact: string, paras: ParagraphInfo[]): boolean {
  const startPara = byId(paras, selector.start.paragraphId)
  const endPara = byId(paras, selector.end.paragraphId)
  if (!startPara || !endPara) return false
  if (selector.start.paragraphId === selector.end.paragraphId) {
    return startPara.text.slice(selector.start.offset, selector.end.offset) === exact
  }
  const si = paras.indexOf(startPara)
  const ei = paras.indexOf(endPara)
  if (ei < si) return false
  const parts: string[] = [startPara.text.slice(selector.start.offset)]
  for (let i = si + 1; i < ei; i += 1) parts.push(paras[i].text)
  parts.push(endPara.text.slice(0, selector.end.offset))
  return parts.join('\n') === exact
}

function rangesFromSelector(selector: Selector, paras: ParagraphInfo[]): ParagraphRange[] {
  const startPara = byId(paras, selector.start.paragraphId)!
  const endPara = byId(paras, selector.end.paragraphId)!
  if (selector.start.paragraphId === selector.end.paragraphId) {
    return [{ paragraphId: startPara.id, start: selector.start.offset, end: selector.end.offset }]
  }
  const si = paras.indexOf(startPara)
  const ei = paras.indexOf(endPara)
  const ranges: ParagraphRange[] = [{ paragraphId: startPara.id, start: selector.start.offset, end: startPara.text.length }]
  for (let i = si + 1; i < ei; i += 1) ranges.push({ paragraphId: paras[i].id, start: 0, end: paras[i].text.length })
  ranges.push({ paragraphId: endPara.id, start: 0, end: selector.end.offset })
  return ranges
}

/** 在段落集中找 exact+prefix+suffix 全匹配（同段）。 */
function findExactMatches(exact: string, prefix: string, suffix: string, paras: ParagraphInfo[]): ParagraphRange[] {
  const out: ParagraphRange[] = []
  if (!exact || exact.includes('\n')) return out
  for (const para of paras) {
    let from = 0
    for (;;) {
      const idx = para.text.indexOf(exact, from)
      if (idx < 0) break
      const before = para.text.slice(Math.max(0, idx - prefix.length), idx)
      const after = para.text.slice(idx + exact.length, idx + exact.length + suffix.length)
      if ((!prefix || before.endsWith(prefix)) && (!suffix || after.startsWith(suffix))) {
        out.push({ paragraphId: para.id, start: idx, end: idx + exact.length })
      }
      from = idx + 1
    }
  }
  return out
}

interface ResolveOpts {
  paragraphId: string
  textHash: string
  selector: Selector
  kind: 'highlight' | 'note'
}

function resolveAnchor(opts: ResolveOpts, ctx: AnchorContext): AnchorResult {
  const paras = ctx.paragraphs
  const direct = byId(paras, opts.paragraphId)
  const directFlag = !!direct
  // 位置编码下直接命中即身份；旧格式 ID（无 direct）落到全文精确搜索兜底。
  const candidates: ParagraphInfo[] = direct ? [direct] : []

  // kind='note'：段落存在即 exact level 1
  if (opts.kind === 'note') {
    const target = direct ?? candidates[0]
    if (target) return { status: 'exact', level: 1, ranges: [{ paragraphId: target.id, start: 0, end: target.text.length }] }
    return { status: 'missing' }
  }

  const exact = opts.selector.exact

  // 级别 1：direct + hash + 切片校验
  if (directFlag && direct && direct.hash === opts.textHash && verifySelector(opts.selector, exact, paras)) {
    return { status: 'exact', level: 1, ranges: rangesFromSelector(opts.selector, paras) }
  }

  // 级别 2：exact+prefix+suffix 精确匹配
  if (exact) {
    let hits = findExactMatches(exact, opts.selector.prefix, opts.selector.suffix, candidates.length ? candidates : paras)
    if (!hits.length && candidates.length) hits = findExactMatches(exact, opts.selector.prefix, opts.selector.suffix, paras)
    if (hits.length === 1) return { status: 'exact', level: 2, ranges: hits }
    if (hits.length > 1) {
      const nearest = pickNearest(hits, opts, paras, candidates)
      if (nearest) return { status: 'exact', level: 2, ranges: [nearest] }
      // 平局 → 级别 4；无候选落到级别 5
    }
  }

  // 级别 4：dmp 模糊裁决（仅对直接命中的位置槽）。
  const extended = resolveExtended?.(opts, ctx, candidates, directFlag)
  if (extended) return extended

  // 级别 5：候选非空 → 段落降级
  const fallback = candidates[0] ?? direct
  if (fallback) return { status: 'paragraph', level: 5, paragraphId: fallback.id }
  return { status: 'missing' }
}

/** 多处命中取候选段内/距原偏移最近者；平局返回 null。 */
function pickNearest(hits: ParagraphRange[], opts: ResolveOpts, paras: ParagraphInfo[], candidates: ParagraphInfo[]): ParagraphRange | null {
  const candIds = new Set(candidates.map((c) => c.id))
  const origOffset = opts.selector.start.offset
  const scored = hits.map((h) => {
    const inCandidate = candIds.has(h.paragraphId) ? 0 : 1
    const dist = h.paragraphId === opts.paragraphId ? Math.abs(h.start - origOffset) : Math.abs(h.start - origOffset) + 100000
    return { h, inCandidate, dist }
  })
  scored.sort((a, b) => a.inCandidate - b.inCandidate || a.dist - b.dist)
  if (scored.length >= 2 && scored[0].inCandidate === scored[1].inCandidate && scored[0].dist === scored[1].dist) return null
  return scored[0].h
}

/** 注入级别 4 裁决（懒加载 dmp）。未注入时为 null。 */
let resolveExtended:
  | ((opts: ResolveOpts, ctx: AnchorContext, candidates: ParagraphInfo[], directFlag: boolean) => AnchorResult | null)
  | null = null
export function setExtendedResolver(fn: typeof resolveExtended): void {
  resolveExtended = fn
}

/* ------------------------------------------------------------------ */
/* 级别 4：diff-match-patch 懒加载模糊定位                              */
/* ------------------------------------------------------------------ */

interface DmpLike {
  Match_Threshold: number
  Match_Distance: number
  match_main: (text: string, pattern: string, loc: number) => number
}
let dmp: DmpLike | null = null

/** 懒加载 diff-match-patch（仅级别 1–2 失败需要模糊定位时）。 */
export async function loadFuzzyMatcher(): Promise<void> {
  if (dmp) return
  const mod = (await import('diff-match-patch')) as unknown as { default?: new () => DmpLike; diff_match_patch?: new () => DmpLike }
  const Ctor = mod.default ?? mod.diff_match_patch
  if (!Ctor) throw new Error('diff-match-patch 加载失败')
  dmp = new Ctor()
  dmp.Match_Threshold = 0.6
}

/** 测试用：卸载模糊匹配器。 */
export function _resetFuzzyMatcher(): void {
  dmp = null
}

function fuzzyMatchParagraph(para: ParagraphInfo, exact: string, locHint: number): ParagraphRange | null {
  if (!dmp) return null
  dmp.Match_Distance = Math.max(1000, para.text.length)
  const loc = Math.max(0, Math.min(locHint, para.text.length))
  const idx = dmp.match_main(para.text, exact, loc)
  if (idx < 0) return null
  return { paragraphId: para.id, start: idx, end: Math.min(idx + exact.length, para.text.length) }
}

function extendedResolver(opts: ResolveOpts, ctx: AnchorContext, candidates: ParagraphInfo[], _directFlag: boolean): AnchorResult | null {
  const exact = opts.selector.exact
  // 级别 4：dmp 模糊匹配（需已懒加载）
  if (dmp && exact && candidates.length) {
    if (!exact.includes('\n')) {
      const hits = candidates
        .map((c) => fuzzyMatchParagraph(c, exact, opts.selector.start.offset))
        .filter((r): r is ParagraphRange => !!r)
      if (hits.length === 1) return { status: 'fuzzy', level: 4, ranges: hits }
      if (hits.length > 1) {
        const nearest = pickNearest(hits, opts, ctx.paragraphs, candidates)
        if (nearest) return { status: 'fuzzy', level: 4, ranges: [nearest] }
      }
    } else {
      // 跨段：逐段必须全命中
      const segments = exact.split('\n')
      if (segments.length === candidates.length) {
        const ranges: ParagraphRange[] = []
        let ok = true
        for (let i = 0; i < segments.length; i += 1) {
          const r = fuzzyMatchParagraph(candidates[i], segments[i], i === 0 ? opts.selector.start.offset : 0)
          if (!r) {
            ok = false
            break
          }
          ranges.push(r)
        }
        if (ok) return { status: 'fuzzy', level: 4, ranges }
      }
    }
  }
  return null
}

setExtendedResolver(extendedResolver)

export function resolveHighlight(h: Highlight, ctx: AnchorContext): AnchorResult {
  return resolveAnchor({ paragraphId: h.paragraphId, textHash: h.textHash, selector: h.selector, kind: h.kind }, ctx)
}

export function resolveShare(p: SharePayload, ctx: AnchorContext): AnchorResult {
  const selector: Selector = {
    exact: p.q,
    prefix: p.b ?? '',
    suffix: p.a ?? '',
    start: { paragraphId: p.s, offset: 0 },
    end: { paragraphId: p.e ?? p.s, offset: p.q.length },
  }
  return resolveAnchor({ paragraphId: p.s, textHash: '', selector, kind: 'highlight' }, ctx)
}

/* ------------------------------------------------------------------ */
/* mark 渲染                                                           */
/* ------------------------------------------------------------------ */

function textNodesOf(root: Node): Text[] {
  const walker = (root.ownerDocument ?? document).createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  while (walker.nextNode()) nodes.push(walker.currentNode as Text)
  return nodes
}

const isCombiningMark = (ch: string) => /\p{M}/u.test(ch)

/**
 * NFC 偏移区间 → raw DOM 偏移区间（渲染侧逆映射，G2 / 不变量 14）。
 * 创建侧 domRangeToSelection 做 raw→NFC；渲染侧须做 NFC→raw，两套基准不得混用。
 * CJK 恒等快路径；含组合字符时按簇边界（base+combining）定位，避免只包到 base 而丢组合符。
 */
export function nfcRangeToRawOffsets(raw: string, start: number, end: number): [number, number] {
  const normalized = nfc(raw)
  if (normalized.length === raw.length) return [start, end]
  const rawToNfc: number[] = []
  for (let i = 0; i <= raw.length; i += 1) rawToNfc[i] = nfc(raw.slice(0, i)).length
  const clusterStart = (i: number) => i === 0 || i === raw.length || !isCombiningMark(raw[i])
  const find = (target: number, fallback: number) => {
    for (let i = 0; i <= raw.length; i += 1) {
      if (rawToNfc[i] === target && clusterStart(i)) return i
    }
    return fallback
  }
  return [find(start, 0), find(end, raw.length)]
}

/**
 * 按 raw DOM 偏移区间跨 Text 节点拆分包裹 <mark>（从后往前拆，跨 em/注解锚点）。
 * decorate 回调设置 mark 的 class/data/aria，供用户高亮与分享临时高亮共用（G2）。
 */
export function wrapRawRange(node: HTMLElement, rawStart: number, rawEnd: number, decorate: (mark: HTMLElement) => void): void {
  const nodes = textNodesOf(node)
  let offset = 0
  const spans: { node: Text; start: number }[] = []
  for (const n of nodes) {
    spans.push({ node: n, start: offset })
    offset += n.length
  }
  for (const { node: textNode, start: nodeStart } of spans.reverse()) {
    const nodeEnd = nodeStart + textNode.length
    const from = Math.max(nodeStart, rawStart)
    const to = Math.min(nodeEnd, rawEnd)
    if (from >= to) continue
    const text = textNode.splitText(from - nodeStart)
    text.splitText(to - from)
    const mark = (node.ownerDocument ?? document).createElement('mark')
    decorate(mark)
    text.replaceWith(mark)
    mark.append(text)
    // G2：mark 文本归一化到 NFC，与 selector 偏移基准一致（组合字符渲染为预组合形）
    mark.textContent = nfc(mark.textContent ?? '')
  }
}

function wrapRange(node: HTMLElement, start: number, end: number, id: string, color: HighlightColor, hasNote: boolean): void {
  // start/end 为 NFC 偏移（selector 基准）→ 先逆映射到 raw DOM 偏移再拆分
  const raw = node.textContent ?? ''
  const [rs, re] = nfcRangeToRawOffsets(raw, start, end)
  wrapRawRange(node, rs, re, (mark) => {
    mark.className = `reader-highlight reader-highlight--${color}`
    mark.dataset.readerHighlight = id
    mark.tabIndex = 0
    mark.setAttribute('aria-label', hasNote ? '摘录，有批注' : '摘录')
  })
}

export function renderHighlights(
  items: { id: string; color: HighlightColor; result: AnchorResult; hasNote: boolean }[],
  root: HTMLElement,
): void {
  const paras = collectAnchorParagraphs(root)
  for (const item of items) {
    const { result } = item
    if (result.status === 'missing') continue
    if (result.status === 'paragraph') {
      const para = byId(paras, result.paragraphId)
      if (para) {
        para.node.classList.add('reader-highlight-degraded')
        para.node.dataset.readerHighlightDegraded = item.id
      }
      continue
    }
    for (const range of result.ranges) {
      const para = byId(paras, range.paragraphId)
      if (para) wrapRange(para.node, range.start, range.end, item.id, item.color, item.hasNote)
    }
  }
}

export function clearHighlightMarks(root: HTMLElement): void {
  root.querySelectorAll('mark[data-reader-highlight]').forEach((mark) => {
    const parent = mark.parentNode
    mark.replaceWith(...mark.childNodes)
    parent?.normalize()
  })
  root.querySelectorAll('[data-reader-highlight-degraded]').forEach((node) => {
    node.classList.remove('reader-highlight-degraded')
    delete (node as HTMLElement).dataset.readerHighlightDegraded
  })
}

/* ------------------------------------------------------------------ */
/* 重锚（唯一写 selector 路径，不变量 1）                              */
/* ------------------------------------------------------------------ */

export function reanchor(h: Highlight, sel: SelectionAnchor, revision: string): Highlight {
  const history = [...(h.selectorHistory ?? [])]
  history.push({ selector: h.selector, revision: h.revision, textHash: h.textHash, replacedAt: nowIso() })
  while (history.length > 5) history.shift()
  return {
    ...h,
    selector: { exact: sel.exact, prefix: sel.prefix, suffix: sel.suffix, start: sel.start, end: sel.end },
    paragraphId: sel.start.paragraphId,
    revision,
    textHash: h.textHash,
    selectorHistory: history,
    rev: h.rev + 1,
    updatedAt: nowIso(),
    deviceId: deviceId(),
  }
}

/* ------------------------------------------------------------------ */
/* 版本映射加载                                                        */
/* ------------------------------------------------------------------ */

const mapCache = new Map<string, VersionMap>()
const reverseCache = new Map<string, Map<string, { pageId: string; index: number }>>()

function baseUrl(): string {
  return (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/'
}

export async function loadVersionMap(version: string): Promise<VersionMap> {
  const cached = mapCache.get(version)
  if (cached) return cached
  const res = await fetch(`${baseUrl()}reader/paragraph-ids-${version}.json`)
  if (!res.ok) throw new Error(`paragraph-ids-${version}.json 加载失败`)
  const data = (await res.json()) as { pages: Record<string, string[]> }
  const map: VersionMap = { pages: data.pages }
  mapCache.set(version, map)
  const reverse = new Map<string, { pageId: string; index: number }>()
  for (const [pageId, ids] of Object.entries(map.pages)) {
    ids.forEach((id, index) => reverse.set(id, { pageId, index }))
  }
  reverseCache.set(version, reverse)
  return map
}

export function pidLocation(map: VersionMap, pid: string): { pageId: string; index: number } | null {
  for (const [pageId, ids] of Object.entries(map.pages)) {
    const index = ids.indexOf(pid)
    if (index >= 0) return { pageId, index }
  }
  return null
}

/** 测试用：清空缓存。 */
export function resetAnchorCaches(): void {
  mapCache.clear()
  reverseCache.clear()
}

export { uuidv7 }