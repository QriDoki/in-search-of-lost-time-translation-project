/**
 * 对抗性测试 · 分享落地（interaction §8.2/§8.3，protocol §6.1/§7.4）。
 * 聚焦：保存进 outbox 单条、降级保存保留原 exact、异章 payload 忽略、
 * hashchange 重定位与清理、滚动公式 clamp 边界、呼吸后常驻、无障碍。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import ReaderShareLanding from '../../site/.vitepress/theme/components/ReaderShareLanding.vue'
import {
  _resetUserStorage,
  currentDb,
  encodeShare,
  initUserStorage,
  listHighlights,
} from '../../site/.vitepress/theme/composables/user-storage'
import { useToasts } from '../../site/.vitepress/theme/composables/useToasts'
import { resetVitepressMock } from './vitepress-mock'
import { flush, mountChapter, para, stubClipboard, stubRect } from './helpers'

vi.mock('vitepress', () => import('./vitepress-mock'))

const { clear: clearToasts, toasts } = useToasts()

function fragment(over: Record<string, unknown> = {}): string {
  return `#share=${encodeShare({ v: 1, c: 'vol1-01', s: 'P000001', q: '很久以来', a: '，我都是', ...over } as never)}`
}

describe('对抗 · 分享落地', () => {
  let wrapper: VueWrapper | null = null
  let scrollTo: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    resetVitepressMock()
    clearToasts()
    mountChapter()
    stubClipboard()
    scrollTo = vi.fn()
    vi.stubGlobal('scrollTo', scrollTo)
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })))
    window.location.hash = ''
    window.location.search = ''
    _resetUserStorage()
    await initUserStorage()
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    clearToasts()
    window.location.hash = ''
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  function card(): HTMLElement | null {
    return document.querySelector('.reader-share-landing')
  }

  async function mountLanding(): Promise<void> {
    wrapper = mount(ReaderShareLanding, { attachTo: document.body })
    await vi.waitFor(() => expect(card()).toBeTruthy(), { timeout: 3000 })
  }

  it('★ 保存创建本地高亮：outbox 单条 put + dirty=1（interaction §8.2 进入同步队列）', async () => {
    window.location.hash = fragment()
    await mountLanding()
    card()!.querySelector<HTMLButtonElement>('.reader-share-landing__primary')!.click()
    await vi.waitFor(async () => expect(await listHighlights()).toHaveLength(1), { timeout: 3000 })
    const [h] = await listHighlights()
    expect(h.local.dirty).toBe(1)
    const ops = await currentDb().outbox.toArray()
    expect(ops).toHaveLength(1)
    expect(ops[0]).toMatchObject({ entity: 'highlight', id: h.id, type: 'put' })
  })

  it('降级时保存：原始 exact 不被改写（不变量 1；interaction §8.2 供读者对照）', async () => {
    window.location.hash = fragment({ q: '不相干文', a: '' })
    await mountLanding()
    expect(card()!.textContent).toContain('译文已更新，原文可能略有出入')
    card()!.querySelector<HTMLButtonElement>('.reader-share-landing__primary')!.click()
    await vi.waitFor(async () => expect(await listHighlights()).toHaveLength(1), { timeout: 3000 })
    const [h] = await listHighlights()
    expect(h.selector.exact).toBe('不相干文')
    expect(h.selector.start.paragraphId).toBe('P000001')
  })

  it('异章 payload（c ≠ 当前页）→ 不渲染卡、不注入 mark、不滚动', async () => {
    window.location.hash = fragment({ c: 'vol2-01' })
    wrapper = mount(ReaderShareLanding, { attachTo: document.body })
    await flush()
    expect(card()).toBeNull()
    expect(document.querySelector('mark[data-reader-share]')).toBeNull()
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('hashchange 重定位：旧 share mark 清除、新 mark 注入；hash 移除全清', async () => {
    window.location.hash = fragment()
    await mountLanding()
    expect(document.querySelector('mark[data-reader-share]')!.textContent).toBe('很久以来')
    // 切换到另一段文字
    window.location.hash = fragment({ q: '我都是', b: '很久以来，', a: '早早就' })
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    await vi.waitFor(() => expect(document.querySelector('mark[data-reader-share]')!.textContent).toBe('我都是'), { timeout: 3000 })
    expect(document.querySelectorAll('mark[data-reader-share]')).toHaveLength(1)
    // 移除 hash → 卡与 mark 全清
    window.location.hash = ''
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    await vi.waitFor(() => expect(card()).toBeNull(), { timeout: 3000 })
    expect(document.querySelectorAll('mark[data-reader-share]')).toHaveLength(0)
  })

  it('滚动公式 max(90, innerHeight*0.35)：大视口取 35%（interaction §8.2/§1.3.1②）', async () => {
    stubRect(para('P000001'), { top: 500, bottom: 520, left: 0, width: 100, height: 20 })
    Object.defineProperty(window, 'innerHeight', { value: 1000, configurable: true })
    window.location.hash = fragment()
    await mountLanding()
    expect(scrollTo).toHaveBeenCalledWith({ top: 150, behavior: 'instant' })
  })

  it('滚动公式 clamp：小视口取下限 90（不断言像素，断言公式边界）', async () => {
    stubRect(para('P000001'), { top: 500, bottom: 520, left: 0, width: 100, height: 20 })
    Object.defineProperty(window, 'innerHeight', { value: 200, configurable: true })
    window.location.hash = fragment()
    await mountLanding()
    expect(scrollTo).toHaveBeenCalledWith({ top: 410, behavior: 'instant' })
  })

  it('临时高亮 2.5s 呼吸后仍常驻（直到离页），卡可手动关闭（interaction §8.2）', async () => {
    window.location.hash = fragment()
    await mountLanding()
    const mark = document.querySelector('mark[data-reader-share]')!
    // 呼吸动画 1.25s × 2 = 2.5s（CSS）；之后 mark 常驻
    await new Promise((r) => setTimeout(r, 2600))
    expect(document.querySelector('mark[data-reader-share]')).toBe(mark)
    card()!.querySelector<HTMLButtonElement>('.reader-share-landing__close')!.click()
    await flush(1)
    expect(card()).toBeNull()
    expect(document.querySelector('mark[data-reader-share]')).toBe(mark)
  }, 10000)

  it('落地卡 role=dialog + aria-label（interaction §12）', async () => {
    window.location.hash = fragment()
    await mountLanding()
    expect(card()!.getAttribute('role')).toBe('dialog')
    expect(card()!.getAttribute('aria-label')).toBe('来自分享的摘录')
  })

  it('复制正文 toast 已复制；保存后卡片「已保存 ✓」自动收起', async () => {
    window.location.hash = fragment()
    await mountLanding()
    card()!.querySelector<HTMLButtonElement>('.reader-share-landing__primary')!.click()
    await vi.waitFor(() => expect(card()!.textContent).toContain('已保存 ✓'), { timeout: 3000 })
    await vi.waitFor(() => expect(card()).toBeNull(), { timeout: 2500 })
    expect(toasts.value.some((t) => t.message === '保存失败')).toBe(false)
  })
})
