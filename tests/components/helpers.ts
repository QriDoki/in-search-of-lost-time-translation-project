/**
 * 组件测试通用手法（protocol §7.4）：
 * 正文 fixture 注入、Range 选区构造、事件模拟、IDB/渲染 flush。
 * 禁 Playwright；定位断言走纯函数与 clamp 边界，不断言像素。
 */
import { nextTick } from 'vue'
import { vi } from 'vitest'

export const P1 = '很久以来，我都是早早就躺下了。'
export const P2 = '有时候，蜡烛才灭，我的眼皮就随即阖上。'
export const P3 = '那是很久以前的事了，那时贡布雷的教堂。'

/** 注入阅读页正文 fixture：.reader-chapter > .vp-doc > p[id][data-legacy]。 */
export function mountChapter(paragraphs: { id: string; text: string; legacy?: string }[] = [
  { id: 'P000001', text: P1, legacy: 'p-000001' },
  { id: 'P000002', text: P2, legacy: 'p-000002' },
]): HTMLElement {
  document.body.innerHTML = `<div class="reader-chapter"><div class="vp-doc">${paragraphs
    .map((p) => `<p id="${p.id}"${p.legacy ? ` data-legacy="${p.legacy}"` : ''}>${p.text}</p>`)
    .join('')}</div></div>`
  return document.querySelector<HTMLElement>('.vp-doc')!
}

export function para(id: string): HTMLElement {
  const node = document.getElementById(id)
  if (!node) throw new Error(`paragraph ${id} not in fixture`)
  return node
}

/** 构造单段文本选区并派发 selectionchange。 */
export function selectText(paragraphId: string, start: number, end: number): Range {
  const node = para(paragraphId)
  const textNode = node.firstChild
  if (!textNode || textNode.nodeType !== Node.TEXT_NODE) throw new Error('fixture 段落须为纯文本')
  const range = document.createRange()
  range.setStart(textNode, start)
  range.setEnd(textNode, end)
  const selection = window.getSelection()!
  selection.removeAllRanges()
  selection.addRange(range)
  document.dispatchEvent(new Event('selectionchange'))
  return range
}

export function collapseSelection(): void {
  window.getSelection()?.removeAllRanges()
  document.dispatchEvent(new Event('selectionchange'))
}

/** 真实定时器下等待 IDB/渲染 settle。 */
export async function flush(times = 3): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

/** 受控 matchMedia（any-hover / any-pointer / reduced-motion）。 */
export function stubMatchMedia(matcher: (query: string) => boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: matcher(query),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }))
}

/** 受控 clipboard。 */
export function stubClipboard(): { writeText: ReturnType<typeof vi.fn> } {
  const writeText = vi.fn(async (_text: string) => {})
  vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText }, onLine: true })
  return { writeText }
}

/** 伪造元素 rect（happy-dom 无布局）。 */
export function stubRect(el: Element, rect: Partial<DOMRect>): void {
  const full = { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}), ...rect }
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue(full as DOMRect)
}

export function dispatchPointer(target: EventTarget, type: string, pointerType = 'mouse'): PointerEvent {
  const event = new PointerEvent(type, { bubbles: true, cancelable: true, pointerType })
  target.dispatchEvent(event)
  return event
}

export function pressKey(target: EventTarget, key: string, opts: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key, ...opts })
  target.dispatchEvent(event)
  return event
}