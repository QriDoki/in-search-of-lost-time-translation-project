/**
 * 对抗性测试 · 手动重锚（interaction §9.2/§9.3，protocol §5.3/§7.4）。
 * 聚焦：selectorHistory ≤5 经 UI 全链路、跨段重锚 paragraphId 迁移、
 * 重锚期间工具条真实抑制、新增失效逐条 toast（每版本一次语义）、
 * 无选区时不出现确认按钮。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import ReaderHighlightPopover from '../../site/.vitepress/theme/components/ReaderHighlightPopover.vue'
import ReaderSelectionToolbar from '../../site/.vitepress/theme/components/ReaderSelectionToolbar.vue'
import {
  _resetUserStorage,
  currentDb,
  getHighlight,
  initUserStorage,
  putHighlight,
  fnv1a36,
  type SelectorHistoryEntry,
} from '../../site/.vitepress/theme/composables/user-storage'
import { useToasts } from '../../site/.vitepress/theme/composables/useToasts'
import { resetVitepressMock } from './vitepress-mock'
import { collapseSelection, mountChapter, para, pressKey, selectText, stubMatchMedia } from './helpers'
import { hl } from '../storage/fixtures'

vi.mock('vitepress', () => import('./vitepress-mock'))

const { clear: clearToasts, toasts } = useToasts()

const DEAD_SEL = { exact: '不相干文', prefix: '', suffix: '', start: { paragraphId: 'P000001', offset: 0 }, end: { paragraphId: 'P000001', offset: 4 } }

describe('对抗 · 手动重锚', () => {
  let wrappers: VueWrapper[] = []

  beforeEach(async () => {
    resetVitepressMock()
    clearToasts()
    mountChapter()
    stubMatchMedia((q) => q.includes('any-hover'))
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })))
    _resetUserStorage()
    await initUserStorage()
    wrappers = []
  })

  afterEach(() => {
    for (const w of wrappers) w.unmount()
    wrappers = []
    clearToasts()
    collapseSelection()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  function mountComponent(component: unknown): VueWrapper {
    const w = mount(component as never, { attachTo: document.body })
    wrappers.push(w)
    return w
  }

  function banner(): HTMLElement | null {
    return document.querySelector('.reader-reanchor-banner')
  }

  function buttonByText(text: string, root: ParentNode = document): HTMLButtonElement {
    const btn = [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.trim().includes(text))
    if (!btn) throw new Error(`button "${text}" not found`)
    return btn
  }

  async function seedDead(over = {}): Promise<void> {
    await putHighlight(hl({ id: 'dead', chapterId: 'vol1-01', paragraphId: 'P000001', textHash: 'stale', selector: DEAD_SEL, ...over }))
    await vi.waitFor(() => expect(para('P000001').classList.contains('reader-highlight-degraded')).toBe(true), { timeout: 3000 })
  }

  async function openDead(): Promise<void> {
    window.dispatchEvent(new CustomEvent('reader-highlight:open', { detail: { id: 'dead' } }))
    await vi.waitFor(() => expect(document.getElementById('reader-highlight-popover')).toBeTruthy())
  }

  it('★ selectorHistory ≤5：第 6 次重锚丢最旧（经 UI 全链路，protocol §5.3）', async () => {
    const history: SelectorHistoryEntry[] = Array.from({ length: 5 }, (_, i) => ({
      selector: { ...DEAD_SEL, exact: `旧锚${i}` },
      revision: 'v0',
      textHash: 'stale',
      replacedAt: `2026-01-0${i + 1}T00:00:00.000Z`,
    }))
    mountComponent(ReaderHighlightPopover)
    await seedDead({ selectorHistory: history, rev: 6 })
    await openDead()
    buttonByText('重新关联').click()
    await vi.waitFor(() => expect(banner()).toBeTruthy())
    selectText('P000001', 0, 4)
    await vi.waitFor(() => expect(banner()!.textContent).toContain('关联到这段文字？'), { timeout: 2000 })
    buttonByText('确认', banner()!).click()
    await vi.waitFor(async () => expect((await getHighlight('dead'))!.selector.exact).toBe('很久以来'), { timeout: 3000 })
    const after = (await getHighlight('dead'))!
    expect(after.rev).toBe(7)
    expect(after.selectorHistory).toHaveLength(5)
    // 最旧（旧锚0）被挤出，原 selector（不相干文）入历史
    expect(after.selectorHistory![0].selector.exact).toBe('旧锚1')
    expect(after.selectorHistory![4].selector.exact).toBe('不相干文')
  })

  it('跨段重锚：paragraphId 迁移到新起始段，mark 渲染到新段（protocol §5.3 reanchor）', async () => {
    // 失效记录指向 P1，重锚选区落在 P2
    mountComponent(ReaderHighlightPopover)
    await seedDead()
    await openDead()
    buttonByText('重新关联').click()
    await vi.waitFor(() => expect(banner()).toBeTruthy())
    selectText('P000002', 0, 3)
    await vi.waitFor(() => expect(banner()!.textContent).toContain('关联到这段文字？'), { timeout: 2000 })
    buttonByText('确认', banner()!).click()
    await vi.waitFor(async () => {
      const h = await getHighlight('dead')
      expect(h!.paragraphId).toBe('P000002')
      expect(h!.selector.start).toEqual({ paragraphId: 'P000002', offset: 0 })
      expect(h!.selector.exact).toBe('有时候')
    }, { timeout: 3000 })
    // 新段渲染 mark，旧段降级 class 清除
    await vi.waitFor(() => expect(document.querySelector('mark[data-reader-highlight="dead"]')?.closest('p')?.id).toBe('P000002'), { timeout: 3000 })
    expect(para('P000001').classList.contains('reader-highlight-degraded')).toBe(false)
  })

  it('★ 重锚期间工具条真实抑制（reader-reanchor:active 集成，D33）', async () => {
    mountComponent(ReaderHighlightPopover)
    mountComponent(ReaderSelectionToolbar)
    await seedDead()
    await openDead()
    buttonByText('重新关联').click()
    await vi.waitFor(() => expect(banner()).toBeTruthy())
    // 重锚模式下的选区不得触发创建工具条
    selectText('P000001', 0, 4)
    await new Promise((r) => setTimeout(r, 250))
    expect(document.querySelector('.reader-selection-toolbar')).toBeNull()
    // 取消后恢复
    buttonByText('取消', banner()!).click()
    await vi.waitFor(() => expect(banner()).toBeNull())
    selectText('P000001', 0, 4)
    await vi.waitFor(() => expect(document.querySelector('.reader-selection-toolbar')).toBeTruthy(), { timeout: 2000 })
  })

  it('无选区时只有提示与取消，不出现确认按钮（显式确认才写，interaction §9.2）', async () => {
    mountComponent(ReaderHighlightPopover)
    await seedDead()
    await openDead()
    const before = await getHighlight('dead')
    buttonByText('重新关联').click()
    await vi.waitFor(() => expect(banner()).toBeTruthy())
    expect(banner()!.textContent).toContain('选中与摘录对应的文字')
    expect([...banner()!.querySelectorAll('button')].some((b) => b.textContent === '确认')).toBe(false)
    // Esc 退出 → 原样
    pressKey(document, 'Escape')
    await vi.waitFor(() => expect(banner()).toBeNull())
    const after = await getHighlight('dead')
    expect(after!.selector).toEqual(before!.selector)
    expect(after!.rev).toBe(before!.rev)
  })

  it('新增失效逐条 toast：同版本已见的不重复计数（interaction §9.3 每版本一次）', async () => {
    mountComponent(ReaderHighlightPopover)
    await seedDead()
    await vi.waitFor(() => expect(toasts.value.some((t) => t.message.includes('1 条摘录需要重新定位'))).toBe(true), { timeout: 3000 })
    clearToasts()
    // 新增第二条失效 → 只就新增的 1 条发 toast
    await putHighlight(hl({ id: 'dead2', chapterId: 'vol1-01', paragraphId: 'P000002', textHash: 'stale', selector: { exact: '另一段失效', prefix: '', suffix: '', start: { paragraphId: 'P000002', offset: 0 }, end: { paragraphId: 'P000002', offset: 5 } } }))
    await vi.waitFor(() => expect(toasts.value.some((t) => t.message.includes('1 条摘录需要重新定位'))).toBe(true), { timeout: 3000 })
    const seen = (await currentDb().meta.get('degradedSeen:dev'))?.value as string[]
    expect(seen.sort()).toEqual(['dead', 'dead2'])
  })
})
