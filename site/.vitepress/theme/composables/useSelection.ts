/**
 * 选区监听 + 正文 containment + DOM Range → 锚点映射（protocol §4.2 / interaction §2.1/§2.4）。
 * 复用 ReaderAIEdit 的 selectionchange 范式与 anchor.ts 的 domRangeToSelection（NFC 偏移、跨段截取）。
 * 面板/弹层/工具条自身都在 .reader-chapter 之外，天然被排除。
 */
import { ref, type Ref } from 'vue'
import { collectAnchorParagraphs, domRangeToSelection, type SelectionAnchor } from './user-storage'

export interface SelectionSnapshot {
  anchor: SelectionAnchor
  /** 选区文本（正文内截取后，跨段以 '\n' 连接）。 */
  text: string
  range: Range
  /** 选区首行 rect（工具条锚定用；无布局时为 null）。 */
  rect: { left: number; top: number; bottom: number; width: number; height: number } | null
}

export interface UseSelectionOptions {
  /** 版权页 / 降级模式 / 重锚期间返回 false。 */
  enabled?: () => boolean
  /** 出现防抖（选区稳定后），默认 150ms；塌陷立即清空。 */
  debounce?: number
}

export function useSelection(opts: UseSelectionOptions = {}): {
  selection: Ref<SelectionSnapshot | null>
  refresh: () => void
  dismiss: () => void
  start: () => void
  stop: () => void
} {
  const selection = ref<SelectionSnapshot | null>(null)
  let timer: ReturnType<typeof setTimeout> | undefined
  let started = false

  function article(): HTMLElement | null {
    return document.querySelector<HTMLElement>('.reader-chapter .vp-doc')
  }

  function compute(): void {
    if (opts.enabled && !opts.enabled()) {
      selection.value = null
      return
    }
    const root = article()
    const sel = window.getSelection()
    if (!root || !sel || sel.isCollapsed || !sel.rangeCount) {
      selection.value = null
      return
    }
    const range = sel.getRangeAt(0)
    const paras = collectAnchorParagraphs(root)
    const anchor = domRangeToSelection(range, paras)
    if (!anchor || !anchor.exact.trim()) {
      selection.value = null
      return
    }
    let rect: SelectionSnapshot['rect'] = null
    try {
      const rects = range.getClientRects()
      const r = rects.length ? rects[0] : range.getBoundingClientRect()
      rect = { left: r.left, top: r.top, bottom: r.bottom, width: r.width, height: r.height }
    } catch {
      rect = null
    }
    selection.value = { anchor, text: anchor.exact, range, rect }
  }

  function onSelectionChange(): void {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed) {
      if (timer) {
        clearTimeout(timer)
        timer = undefined
      }
      selection.value = null
      return
    }
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      compute()
    }, opts.debounce ?? 150)
  }

  /** 立即重算（测试/程序化选区后调用）。 */
  function refresh(): void {
    compute()
  }

  /** 清空状态（不触碰 DOM 选区本身）。 */
  function dismiss(): void {
    if (timer) {
      clearTimeout(timer)
      timer = undefined
    }
    selection.value = null
  }

  function start(): void {
    if (started) return
    started = true
    document.addEventListener('selectionchange', onSelectionChange)
  }

  function stop(): void {
    started = false
    document.removeEventListener('selectionchange', onSelectionChange)
    dismiss()
  }

  return { selection, refresh, dismiss, start, stop }
}