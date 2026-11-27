/**
 * 弹层定位（protocol §6.3）：逐行提取自 ReaderAnnotations.updatePosition。
 * 锚点居中、上下翻转、视口 clamp + ResizeObserver + scroll(capture)/resize 跟随。
 * 书内注解弹层与用户摘录弹层共用；纯函数 computePopoverPosition 供选区工具条复用。
 */
import { ref } from 'vue'

export interface PopoverPosition {
  left: string
  top: string
}

export interface PopoverPositionOptions {
  margin?: number
  gap?: number
  /** 锚点脱离文档时回调（原 ReaderAnnotations 在此 close()）。 */
  onAnchorMissing?: () => void
  /** 优先锚点上方（选区工具条用）；缺省 below 优先，与注解弹层一致。 */
  preferAbove?: boolean
}

export interface RectLike {
  left: number
  top: number
  bottom: number
  width: number
  height: number
}

/** 锚点居中、空间不足翻到上方、视口边界 clamp（与原算法逐行一致）。 */
export function computePopoverPosition(
  anchor: RectLike,
  bounds: { width: number; height: number },
  viewport: { width: number; height: number },
  opts: { margin?: number; gap?: number; preferAbove?: boolean } = {},
): PopoverPosition {
  const margin = opts.margin ?? 12
  const gap = opts.gap ?? 10
  const left = Math.max(
    margin,
    Math.min(anchor.left + anchor.width / 2 - bounds.width / 2, viewport.width - bounds.width - margin),
  )
  const below = anchor.bottom + gap
  const above = anchor.top - bounds.height - gap
  const preferredTop = opts.preferAbove
    ? above >= margin
      ? above
      : below
    : below + bounds.height <= viewport.height - margin
      ? below
      : above
  const top = Math.max(margin, Math.min(preferredTop, viewport.height - bounds.height - margin))
  return { left: `${left}px`, top: `${top}px` }
}

export function usePopoverPosition(
  anchor: () => HTMLElement | null,
  panel: () => HTMLElement | null,
  opts: PopoverPositionOptions = {},
) {
  const position = ref<PopoverPosition>({ left: '0px', top: '0px' })
  const positioned = ref(false)
  let frame = 0
  let resizeObserver: ResizeObserver | undefined
  let started = false

  function update(): void {
    const a = anchor()
    const p = panel()
    if (!a || !p) return
    if (!a.isConnected) {
      opts.onAnchorMissing?.()
      return
    }
    position.value = computePopoverPosition(
      a.getBoundingClientRect(),
      p.getBoundingClientRect(),
      { width: document.documentElement.clientWidth, height: window.innerHeight },
      opts,
    )
    positioned.value = true
  }

  function schedule(): void {
    if (!anchor() || frame) return
    frame = requestAnimationFrame(() => {
      frame = 0
      update()
    })
  }

  /** 观察当前面板尺寸变化（open 后调用）。 */
  function observe(): void {
    const p = panel()
    if (p) resizeObserver?.observe(p)
  }

  /** 关闭时复位：隐藏 + 断开观察 + 取消 pending frame。 */
  function reset(): void {
    positioned.value = false
    resizeObserver?.disconnect()
    if (frame) {
      cancelAnimationFrame(frame)
      frame = 0
    }
  }

  /** onMounted 调用：创建 ResizeObserver 并挂 scroll/resize 跟随。 */
  function start(): void {
    if (started) return
    started = true
    resizeObserver = new ResizeObserver(schedule)
    window.addEventListener('scroll', schedule, { passive: true, capture: true })
    window.addEventListener('resize', schedule)
  }

  /** onBeforeUnmount 调用。 */
  function dispose(): void {
    reset()
    started = false
    resizeObserver = undefined
    window.removeEventListener('scroll', schedule, true)
    window.removeEventListener('resize', schedule)
  }

  return { position, positioned, schedule, update, observe, reset, start, dispose }
}