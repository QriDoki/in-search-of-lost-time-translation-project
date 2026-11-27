import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import ReaderHighlightPopover from '../../site/.vitepress/theme/components/ReaderHighlightPopover.vue'
import {
  _resetUserStorage,
  currentDb,
  deepEqual,
  getHighlight,
  initUserStorage,
  putHighlight,
  fnv1a36,
} from '../../site/.vitepress/theme/composables/user-storage'
import { useToasts } from '../../site/.vitepress/theme/composables/useToasts'
import { resetVitepressMock } from './vitepress-mock'
import { P1, collapseSelection, flush, mountChapter, para, pressKey, selectText, stubMatchMedia } from './helpers'
import { hl } from '../storage/fixtures'

vi.mock('vitepress', () => import('./vitepress-mock'))

const { clear: clearToasts, toasts } = useToasts()

const DEAD_SEL = { exact: '不相干文', prefix: '', suffix: '', start: { paragraphId: 'P000001', offset: 0 }, end: { paragraphId: 'P000001', offset: 4 } }
const LIVE_SEL = { exact: '很久以来', prefix: '', suffix: '，我都是', start: { paragraphId: 'P000001', offset: 0 }, end: { paragraphId: 'P000001', offset: 4 } }

describe('F2-1 手动重锚 + 失效 toast', () => {
  let wrapper: VueWrapper | null = null

  beforeEach(async () => {
    resetVitepressMock()
    clearToasts()
    mountChapter()
    stubMatchMedia((q) => q.includes('any-hover'))
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })))
    _resetUserStorage()
    await initUserStorage()
    wrapper = mount(ReaderHighlightPopover, { attachTo: document.body })
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    clearToasts()
    collapseSelection()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  async function seedDead(): Promise<void> {
    await putHighlight(hl({ id: 'dead', chapterId: 'vol1-01', paragraphId: 'P000001', textHash: 'stale', selector: DEAD_SEL }))
    await vi.waitFor(() => expect(para('P000001').classList.contains('reader-highlight-degraded')).toBe(true), { timeout: 3000 })
  }

  function banner(): HTMLElement | null {
    return document.querySelector('.reader-reanchor-banner')
  }

  function buttonByText(text: string, root: ParentNode = document): HTMLButtonElement {
    const btn = [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.trim().includes(text))
    if (!btn) throw new Error(`button "${text}" not found`)
    return btn
  }

  it('重锚流程：选中 → 确认 → 写 selector（rev+1，history 追加）+ toast', async () => {
    await seedDead()
    window.dispatchEvent(new CustomEvent('reader-highlight:open', { detail: { id: 'dead' } }))
    await vi.waitFor(() => expect(document.getElementById('reader-highlight-popover')).toBeTruthy())
    const before = await getHighlight('dead')
    buttonByText('重新关联').click()
    await vi.waitFor(() => expect(banner()).toBeTruthy())
    expect(banner()!.textContent).toContain('选中与摘录对应的文字')
    expect(document.getElementById('reader-highlight-popover')).toBeNull()

    selectText('P000001', 0, 4)
    await vi.waitFor(() => expect(banner()!.textContent).toContain('关联到这段文字？'), { timeout: 2000 })
    buttonByText('确认', banner()!).click()
    await vi.waitFor(async () => {
      const after = await getHighlight('dead')
      expect(after!.selector.exact).toBe('很久以来')
    }, { timeout: 3000 })
    const after = (await getHighlight('dead'))!
    expect(after.rev).toBe(before!.rev + 1)
    expect(after.selectorHistory).toHaveLength(1)
    expect(after.selectorHistory![0].selector.exact).toBe('不相干文')
    expect(toasts.value.some((t) => t.message === '已重新关联')).toBe(true)
    expect(banner()).toBeNull()
    // 徽标消除：重锚后级别 2 精确命中
    await vi.waitFor(() => expect(para('P000001').classList.contains('reader-highlight-degraded')).toBe(false), { timeout: 3000 })
  })

  it('★ 取消 → selector 原样保留（绝不自动改写）', async () => {
    await seedDead()
    window.dispatchEvent(new CustomEvent('reader-highlight:open', { detail: { id: 'dead' } }))
    await vi.waitFor(() => expect(document.getElementById('reader-highlight-popover')).toBeTruthy())
    const before = await getHighlight('dead')
    buttonByText('重新关联').click()
    await vi.waitFor(() => expect(banner()).toBeTruthy())
    selectText('P000001', 0, 4)
    await vi.waitFor(() => expect(banner()!.textContent).toContain('关联到这段文字？'), { timeout: 2000 })
    buttonByText('取消', banner()!).click()
    await vi.waitFor(() => expect(banner()).toBeNull())
    const after = await getHighlight('dead')
    expect(deepEqual(after!.selector, before!.selector)).toBe(true)
    expect(after!.rev).toBe(before!.rev)
    expect(after!.selectorHistory ?? []).toHaveLength(0)
  })

  it('Esc 取消重锚；重锚期间 dispatch active 事件（工具条抑制）', async () => {
    await seedDead()
    const events: unknown[] = []
    window.addEventListener('reader-reanchor:active', (e) => events.push((e as CustomEvent).detail))
    window.dispatchEvent(new CustomEvent('reader-highlight:open', { detail: { id: 'dead' } }))
    await vi.waitFor(() => expect(document.getElementById('reader-highlight-popover')).toBeTruthy())
    buttonByText('重新关联').click()
    await vi.waitFor(() => expect(banner()).toBeTruthy())
    expect(events).toContain(true)
    pressKey(document, 'Escape')
    await vi.waitFor(() => expect(banner()).toBeNull())
    expect(events).toContain(false)
  })

  it('重选：清空选区回到等待态', async () => {
    await seedDead()
    window.dispatchEvent(new CustomEvent('reader-highlight:open', { detail: { id: 'dead' } }))
    await vi.waitFor(() => expect(document.getElementById('reader-highlight-popover')).toBeTruthy())
    buttonByText('重新关联').click()
    await vi.waitFor(() => expect(banner()).toBeTruthy())
    selectText('P000001', 0, 4)
    await vi.waitFor(() => expect(banner()!.textContent).toContain('关联到这段文字？'), { timeout: 2000 })
    buttonByText('重选', banner()!).click()
    await vi.waitFor(() => expect(banner()!.textContent).toContain('选中与摘录对应的文字'))
  })

  it('失效 toast：新失效 → 一条 toast「查看」进面板失效筛选；同版本不重复', async () => {
    const panels: unknown[] = []
    const degradedEvents: unknown[] = []
    window.addEventListener('reader-panel:open', (e) => panels.push((e as CustomEvent).detail))
    window.addEventListener('reader-excerpts:show-degraded', (e) => degradedEvents.push(e))
    await seedDead()
    await vi.waitFor(() => expect(toasts.value.some((t) => t.message.includes('需要重新定位'))).toBe(true), { timeout: 3000 })
    const toast = toasts.value.find((t) => t.message.includes('需要重新定位'))!
    expect(toast.message).toContain('译文已更新，1 条摘录需要重新定位')
    toast.action!.run()
    expect(panels).toContain('excerpts')
    expect(degradedEvents).toHaveLength(1)
    // 再次渲染（同版本已 seen）→ 不重复 toast
    clearToasts()
    const { triggerContentUpdated } = await import('./vitepress-mock')
    triggerContentUpdated()
    await flush()
    expect(toasts.value.some((t) => t.message.includes('需要重新定位'))).toBe(false)
    expect(await currentDb().meta.get('degradedSeen:dev')).toBeTruthy()
  })
})

describe('F2-3 重叠高亮 + pink 第 5 色', () => {
  let wrapper: VueWrapper | null = null

  beforeEach(async () => {
    resetVitepressMock()
    clearToasts()
    mountChapter()
    stubMatchMedia((q) => q.includes('any-hover'))
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })))
    _resetUserStorage()
    await initUserStorage()
    wrapper = mount(ReaderHighlightPopover, { attachTo: document.body })
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    clearToasts()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('重叠渲染：嵌套 mark；点击列出覆盖摘录（≤3）', async () => {
    await putHighlight(hl({ id: 'h1', chapterId: 'vol1-01', paragraphId: 'P000001', textHash: fnv1a36(P1), selector: LIVE_SEL, color: 'yellow' }))
    await putHighlight(hl({ id: 'h2', chapterId: 'vol1-01', paragraphId: 'P000001', textHash: fnv1a36(P1), color: 'green', selector: { exact: '久以来，', prefix: '很', suffix: '我都是', start: { paragraphId: 'P000001', offset: 1 }, end: { paragraphId: 'P000001', offset: 5 } } }))
    await vi.waitFor(() => expect(document.querySelectorAll('mark[data-reader-highlight]').length).toBeGreaterThanOrEqual(2), { timeout: 3000 })
    // 嵌套：h2 的 mark 在 h1 的 mark 内（或反之）
    const nested = document.querySelector('mark[data-reader-highlight] mark[data-reader-highlight]')
    expect(nested).toBeTruthy()
    ;(nested as HTMLElement).click()
    await vi.waitFor(() => expect(document.querySelector('.reader-highlight-popover__listtitle')).toBeTruthy())
    expect(document.querySelector('.reader-highlight-popover__listtitle')!.textContent).toContain('2 条摘录')
    const items = document.querySelectorAll('.reader-highlight-popover__listitem')
    expect(items).toHaveLength(2)
    ;(items[0] as HTMLElement).click()
    await vi.waitFor(() => expect(document.querySelector('.reader-highlight-popover__exact')).toBeTruthy())
  })

  it('超过 3 条 → 「在摘录面板中查看全部」', async () => {
    for (let i = 0; i < 4; i += 1) {
      await putHighlight(hl({ id: `h${i}`, chapterId: 'vol1-01', paragraphId: 'P000001', textHash: fnv1a36(P1), selector: LIVE_SEL, color: 'yellow' }))
    }
    await vi.waitFor(() => expect(document.querySelectorAll('mark[data-reader-highlight]').length).toBeGreaterThanOrEqual(4), { timeout: 3000 })
    const marks = document.querySelectorAll<HTMLElement>('mark[data-reader-highlight]')
    marks[marks.length - 1].click()
    await vi.waitFor(() => expect(document.querySelector('.reader-highlight-popover__listtitle')).toBeTruthy())
    expect(document.querySelectorAll('.reader-highlight-popover__listitem')).toHaveLength(3)
    const panels: unknown[] = []
    window.addEventListener('reader-panel:open', (e) => panels.push((e as CustomEvent).detail))
    ;[...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.includes('在摘录面板中查看全部'))!.click()
    expect(panels).toContain('excerpts')
  })

  it('弹层色板含 pink 第 5 色', async () => {
    await putHighlight(hl({ id: 'h1', chapterId: 'vol1-01', paragraphId: 'P000001', textHash: fnv1a36(P1), selector: LIVE_SEL }))
    await vi.waitFor(() => expect(document.querySelector('mark[data-reader-highlight]')).toBeTruthy(), { timeout: 3000 })
    document.querySelector<HTMLElement>('mark[data-reader-highlight]')!.click()
    await vi.waitFor(() => expect(document.getElementById('reader-highlight-popover')).toBeTruthy())
    const swatches = [...document.querySelectorAll('.reader-highlight-popover__color')].map((b) => b.getAttribute('aria-label'))
    expect(swatches).toEqual(['黄色高亮', '绿色高亮', '蓝色高亮', '粉色高亮', '紫色高亮'])
  })
})