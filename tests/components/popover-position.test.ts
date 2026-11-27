import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { computePopoverPosition, usePopoverPosition } from '../../site/.vitepress/theme/composables/usePopoverPosition'
import ReaderAnnotations from '../../site/.vitepress/theme/components/ReaderAnnotations.vue'
import { prefs } from '../../site/.vitepress/theme/composables/reader'
import { resetVitepressMock, routeState, triggerContentUpdated } from './vitepress-mock'
import { dispatchPointer, mountChapter, pressKey, stubMatchMedia, stubRect } from './helpers'

vi.mock('vitepress', () => import('./vitepress-mock'))

describe('computePopoverPosition（提取自 ReaderAnnotations.updatePosition）', () => {
  const viewport = { width: 1000, height: 800 }
  const bounds = { width: 360, height: 200 }

  it('锚点水平居中', () => {
    const pos = computePopoverPosition({ left: 400, top: 300, bottom: 320, width: 40, height: 20 }, bounds, viewport)
    expect(pos.left).toBe(`${400 + 20 - 180}px`)
  })

  it('左缘 clamp 到 margin', () => {
    const pos = computePopoverPosition({ left: 0, top: 300, bottom: 320, width: 10, height: 20 }, bounds, viewport)
    expect(pos.left).toBe('12px')
  })

  it('右缘 clamp 到 viewport - width - margin', () => {
    const pos = computePopoverPosition({ left: 990, top: 300, bottom: 320, width: 10, height: 20 }, bounds, viewport)
    expect(pos.left).toBe(`${1000 - 360 - 12}px`)
  })

  it('下方空间充足 → 锚点下方 gap', () => {
    const pos = computePopoverPosition({ left: 400, top: 300, bottom: 320, width: 40, height: 20 }, bounds, viewport)
    expect(pos.top).toBe('330px') // bottom 320 + gap 10
  })

  it('下方不足 → 翻到上方', () => {
    const pos = computePopoverPosition({ left: 400, top: 700, bottom: 720, width: 40, height: 20 }, bounds, viewport)
    expect(pos.top).toBe(`${700 - 200 - 10}px`)
  })

  it('上下都不足 → clamp 到 margin', () => {
    const pos = computePopoverPosition({ left: 400, top: 50, bottom: 60, width: 40, height: 10 }, { width: 360, height: 900 }, viewport)
    expect(pos.top).toBe('12px')
  })

  it('自定义 margin/gap 生效', () => {
    const pos = computePopoverPosition(
      { left: 400, top: 300, bottom: 320, width: 40, height: 20 },
      bounds,
      viewport,
      { margin: 20, gap: 5 },
    )
    expect(pos.top).toBe('325px')
    const left = computePopoverPosition({ left: 0, top: 300, bottom: 320, width: 10, height: 20 }, bounds, viewport, { margin: 20 })
    expect(left.left).toBe('20px')
  })
})

describe('usePopoverPosition composable', () => {
  let anchor: HTMLElement
  let panel: HTMLElement

  beforeEach(() => {
    document.body.innerHTML = '<button id="a">t</button><div id="p">panel</div>'
    anchor = document.getElementById('a')!
    panel = document.getElementById('p')!
    stubRect(anchor, { left: 400, top: 300, bottom: 320, width: 40, height: 20 })
    stubRect(panel, { width: 360, height: 200 })
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0) as unknown as number)
    vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('update 设置 position 与 positioned', () => {
    const { position, positioned, update } = usePopoverPosition(() => anchor, () => panel)
    expect(positioned.value).toBe(false)
    update()
    expect(positioned.value).toBe(true)
    expect(position.value.top).toBe('330px')
  })

  it('锚点脱离文档 → onAnchorMissing', () => {
    const onAnchorMissing = vi.fn()
    const { update } = usePopoverPosition(() => anchor, () => panel, { onAnchorMissing })
    anchor.remove()
    update()
    expect(onAnchorMissing).toHaveBeenCalledTimes(1)
  })

  it('schedule 经 rAF 去重', async () => {
    const { schedule, positioned } = usePopoverPosition(() => anchor, () => panel)
    schedule()
    schedule()
    expect(positioned.value).toBe(false)
    await new Promise((r) => setTimeout(r, 10))
    expect(positioned.value).toBe(true)
  })

  it('start 挂 scroll(capture)/resize；dispose 移除', () => {
    const add = vi.spyOn(window, 'addEventListener')
    const remove = vi.spyOn(window, 'removeEventListener')
    const { start, dispose } = usePopoverPosition(() => anchor, () => panel)
    start()
    expect(add).toHaveBeenCalledWith('scroll', expect.any(Function), { passive: true, capture: true })
    expect(add).toHaveBeenCalledWith('resize', expect.any(Function))
    dispose()
    expect(remove).toHaveBeenCalledWith('scroll', expect.any(Function), true)
    expect(remove).toHaveBeenCalledWith('resize', expect.any(Function))
  })

  it('observe/reset 控制 ResizeObserver', () => {
    const observe = vi.fn()
    const disconnect = vi.fn()
    vi.stubGlobal('ResizeObserver', class { observe = observe; disconnect = disconnect; unobserve = vi.fn() })
    const { start, observe: obs, reset } = usePopoverPosition(() => anchor, () => panel)
    start()
    obs()
    expect(observe).toHaveBeenCalledWith(panel)
    reset()
    expect(disconnect).toHaveBeenCalled()
  })
})

describe('ReaderAnnotations 行为回归（提取后不变）', () => {
  beforeEach(() => {
    resetVitepressMock()
    stubMatchMedia((q) => q.includes('any-hover'))
    document.body.innerHTML = `
      <div class="reader-chapter"><div class="vp-doc">
        <p>正文<span class="reader-annotation" data-reader-note-types="🏛️">
          <button class="reader-annotation__trigger" data-reader-note="<b>注解内容</b>" aria-label="注解"></button>
        </span>
      </div></div>`
    prefs.annotationTypes = ['🏛️', '📚', '🔤', '🎭', '🪶']
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  function trigger(): HTMLButtonElement {
    return document.querySelector<HTMLButtonElement>('.reader-annotation__trigger')!
  }

  it('click 打开弹层：内容渲染 + aria-expanded/aria-controls', async () => {
    const wrapper = mount(ReaderAnnotations, { attachTo: document.body })
    trigger().click()
    await nextTick()
    const popover = document.getElementById('reader-annotation-popover')!
    expect(popover).toBeTruthy()
    expect(popover.querySelector('.reader-annotation-popover__content')!.innerHTML).toContain('注解内容')
    expect(trigger().getAttribute('aria-expanded')).toBe('true')
    expect(trigger().getAttribute('aria-controls')).toBe('reader-annotation-popover')
    wrapper.unmount()
  })

  it('Esc 关闭并归还焦点', async () => {
    const wrapper = mount(ReaderAnnotations, { attachTo: document.body })
    trigger().click()
    await nextTick()
    pressKey(document, 'Escape')
    await nextTick()
    expect(document.getElementById('reader-annotation-popover')).toBeNull()
    expect(document.activeElement).toBe(trigger())
    expect(trigger().getAttribute('aria-expanded')).toBe('false')
    wrapper.unmount()
  })

  it('hover 预览：mouse + any-hover 打开；移开 120ms 后关闭', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const wrapper = mount(ReaderAnnotations, { attachTo: document.body })
    dispatchPointer(trigger(), 'pointerover', 'mouse')
    await nextTick()
    expect(document.getElementById('reader-annotation-popover')).toBeTruthy()
    // 无 pinned 遮罩
    expect(document.querySelector('.reader-annotation-backdrop')).toBeNull()
    dispatchPointer(trigger(), 'pointerout', 'mouse')
    await vi.advanceTimersByTimeAsync(119)
    expect(document.getElementById('reader-annotation-popover')).toBeTruthy()
    await vi.advanceTimersByTimeAsync(2)
    expect(document.getElementById('reader-annotation-popover')).toBeNull()
    wrapper.unmount()
  })

  it('触屏合成 mouse 事件不触发预览', async () => {
    const wrapper = mount(ReaderAnnotations, { attachTo: document.body })
    dispatchPointer(trigger(), 'pointerover', 'touch')
    await nextTick()
    expect(document.getElementById('reader-annotation-popover')).toBeNull()
    wrapper.unmount()
  })

  it('pin 态遮罩点击关闭', async () => {
    const wrapper = mount(ReaderAnnotations, { attachTo: document.body })
    trigger().click()
    await nextTick()
    const backdrop = document.querySelector<HTMLElement>('.reader-annotation-backdrop')!
    expect(backdrop).toBeTruthy()
    backdrop.click()
    await nextTick()
    expect(document.getElementById('reader-annotation-popover')).toBeNull()
    wrapper.unmount()
  })

  it('互斥：收到 highlight 打开事件即关闭；自身打开 dispatch annotation', async () => {
    const wrapper = mount(ReaderAnnotations, { attachTo: document.body })
    const events: unknown[] = []
    window.addEventListener('reader-popover:open', (e) => events.push((e as CustomEvent).detail))
    trigger().click()
    await nextTick()
    expect(events).toContainEqual({ source: 'annotation' })
    window.dispatchEvent(new CustomEvent('reader-popover:open', { detail: { source: 'highlight' } }))
    await nextTick()
    expect(document.getElementById('reader-annotation-popover')).toBeNull()
    wrapper.unmount()
  })

  it('路由切换关闭弹层', async () => {
    const wrapper = mount(ReaderAnnotations, { attachTo: document.body })
    trigger().click()
    await nextTick()
    routeState.path = '/chapters/vol1-02.html'
    await nextTick()
    expect(document.getElementById('reader-annotation-popover')).toBeNull()
    wrapper.unmount()
  })

  it('注解过滤：类型不可见时触发器隐藏且不打开', async () => {
    const wrapper = mount(ReaderAnnotations, { attachTo: document.body })
    prefs.annotationTypes = ['📚']
    await nextTick()
    triggerContentUpdated()
    await nextTick()
    expect(trigger().closest('.reader-annotation')!.classList.contains('is-note-hidden')).toBe(true)
    trigger().click()
    await nextTick()
    expect(document.getElementById('reader-annotation-popover')).toBeNull()
    wrapper.unmount()
  })
})