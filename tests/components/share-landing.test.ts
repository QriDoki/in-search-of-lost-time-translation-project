import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import ReaderShareLanding from '../../site/.vitepress/theme/components/ReaderShareLanding.vue'
import {
  _resetUserStorage,
  encodeShare,
  initUserStorage,
  listHighlights,
} from '../../site/.vitepress/theme/composables/user-storage'
import { useToasts } from '../../site/.vitepress/theme/composables/useToasts'
import { resetVitepressMock } from './vitepress-mock'
import { flush, mountChapter, stubClipboard } from './helpers'

vi.mock('vitepress', () => import('./vitepress-mock'))

const { clear: clearToasts, toasts } = useToasts()

function setShareFragment(over: Record<string, unknown> = {}): void {
  const encoded = encodeShare({ v: 1, c: 'vol1-01', s: 'P000001', q: '很久以来', a: '，我都是', ...over } as never)
  window.location.hash = `#share=${encoded}`
}

describe('ReaderShareLanding（§7.4 分享落地矩阵）', () => {
  let wrapper: VueWrapper | null = null
  let clipboard: { writeText: ReturnType<typeof vi.fn> }
  let scrollTo: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    resetVitepressMock()
    clearToasts()
    mountChapter()
    clipboard = stubClipboard()
    scrollTo = vi.fn()
    vi.stubGlobal('scrollTo', scrollTo)
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })))
    window.location.hash = ''
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

  it('fragment 解析 → 滚动调用 → 临时 mark[data-reader-share]', async () => {
    setShareFragment()
    wrapper = mount(ReaderShareLanding, { attachTo: document.body })
    await vi.waitFor(() => expect(card()).toBeTruthy(), { timeout: 3000 })
    expect(scrollTo).toHaveBeenCalled()
    const mark = document.querySelector('mark[data-reader-share]')!
    expect(mark.textContent).toBe('很久以来')
    expect(card()!.textContent).toContain('来自分享的摘录')
    expect(card()!.getAttribute('role')).toBe('dialog')
  })

  it('保存到我的摘录 → 写库（selector 取定位结果）→ 已保存 ✓ 自动收起', async () => {
    setShareFragment()
    wrapper = mount(ReaderShareLanding, { attachTo: document.body })
    await vi.waitFor(() => expect(card()).toBeTruthy(), { timeout: 3000 })
    card()!.querySelector<HTMLButtonElement>('.reader-share-landing__primary')!.click()
    await vi.waitFor(async () => expect(await listHighlights()).toHaveLength(1))
    const [h] = await listHighlights()
    expect(h.selector.exact).toBe('很久以来')
    expect(h.selector.start).toEqual({ paragraphId: 'P000001', offset: 0 })
    expect(h.selector.end).toEqual({ paragraphId: 'P000001', offset: 4 })
    expect(h.chapterId).toBe('vol1-01')
    expect(card()!.textContent).toContain('已保存 ✓')
    await vi.waitFor(() => expect(card()).toBeNull(), { timeout: 2500 })
    // 临时高亮保留（用户高亮由摘录层渲染）
  })

  it('降级：译文更新 → 滚到段落 + 诚实文案 + 展示原 exact', async () => {
    setShareFragment({ q: '不相干文', a: '' })
    wrapper = mount(ReaderShareLanding, { attachTo: document.body })
    await vi.waitFor(() => expect(card()).toBeTruthy(), { timeout: 3000 })
    expect(card()!.textContent).toContain('译文已更新，原文可能略有出入')
    expect(card()!.textContent).toContain('不相干文')
    expect(scrollTo).toHaveBeenCalled()
    expect(document.querySelector('mark[data-reader-share]')).toBeNull()
  })

  it('段落消失 → 降级卡，不假装精确', async () => {
    setShareFragment({ s: 'P999999', q: '不相干文', a: '' })
    wrapper = mount(ReaderShareLanding, { attachTo: document.body })
    await vi.waitFor(() => expect(card()).toBeTruthy(), { timeout: 3000 })
    expect(card()!.textContent).toContain('译文已更新，原文可能略有出入')
  })

  it('关闭卡保留临时高亮至离页', async () => {
    setShareFragment()
    wrapper = mount(ReaderShareLanding, { attachTo: document.body })
    await vi.waitFor(() => expect(card()).toBeTruthy(), { timeout: 3000 })
    card()!.querySelector<HTMLButtonElement>('.reader-share-landing__close')!.click()
    await flush(1)
    expect(card()).toBeNull()
    expect(document.querySelector('mark[data-reader-share]')).toBeTruthy()
    wrapper.unmount()
    wrapper = null
    expect(document.querySelector('mark[data-reader-share]')).toBeNull()
  })

  it('复制正文 → clipboard + toast', async () => {
    setShareFragment()
    wrapper = mount(ReaderShareLanding, { attachTo: document.body })
    await vi.waitFor(() => expect(card()).toBeTruthy(), { timeout: 3000 })
    ;[...card()!.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === '复制正文')!.click()
    await vi.waitFor(() => expect(clipboard.writeText).toHaveBeenCalledWith('很久以来'))
    expect(toasts.value.some((t) => t.message === '已复制')).toBe(true)
  })

  it('非法 fragment → 不渲染', async () => {
    window.location.hash = '#share=!!!invalid!!!'
    wrapper = mount(ReaderShareLanding, { attachTo: document.body })
    await flush()
    expect(card()).toBeNull()
  })

  it('无 share fragment → 不渲染', async () => {
    wrapper = mount(ReaderShareLanding, { attachTo: document.body })
    await flush()
    expect(card()).toBeNull()
  })

  it('?search= 存在时让位搜索定位', async () => {
    window.location.search = '?search=x'
    setShareFragment()
    wrapper = mount(ReaderShareLanding, { attachTo: document.body })
    await flush()
    expect(card()).toBeNull()
    window.location.search = ''
  })
})