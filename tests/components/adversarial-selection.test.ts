/**
 * 对抗性测试 · 选区工具条（interaction §2.1/§2.4，protocol §6.1/§7.4）。
 * 断言依据是合同，不是实现。聚焦既有测试未覆盖的边界：
 * 跨出正文截取、跨段创建、滚动消失（桌面/触屏差异）、Esc 传播阻断、
 * 同范围异色、全部按钮 pointerdown.prevent、工具条内选区。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import ReaderSelectionToolbar from '../../site/.vitepress/theme/components/ReaderSelectionToolbar.vue'
import {
  _resetUserStorage,
  initUserStorage,
  listHighlights,
  putHighlight,
  fnv1a36,
} from '../../site/.vitepress/theme/composables/user-storage'
import { useToasts } from '../../site/.vitepress/theme/composables/useToasts'
import { resetVitepressMock } from './vitepress-mock'
import { P1, P2, collapseSelection, mountChapter, para, pressKey, selectText, stubClipboard, stubMatchMedia } from './helpers'
import { hl } from '../storage/fixtures'

vi.mock('vitepress', () => import('./vitepress-mock'))

const { clear: clearToasts, toasts } = useToasts()

const SEL_0_4 = { exact: '很久以来', prefix: '', suffix: '，我都是', start: { paragraphId: 'P000001', offset: 0 }, end: { paragraphId: 'P000001', offset: 4 } }

describe('对抗 · 选区工具条', () => {
  let wrapper: VueWrapper | null = null

  beforeEach(async () => {
    resetVitepressMock()
    clearToasts()
    mountChapter()
    stubMatchMedia((q) => q.includes('any-hover'))
    stubClipboard()
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })))
    _resetUserStorage()
    await initUserStorage()
    wrapper = mount(ReaderSelectionToolbar, { attachTo: document.body })
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    clearToasts()
    collapseSelection()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  function toolbar(): HTMLElement | null {
    return document.querySelector('.reader-selection-toolbar')
  }

  async function selectAndWait(start = 0, end = 4): Promise<void> {
    selectText('P000001', start, end)
    await vi.waitFor(() => expect(toolbar()).toBeTruthy(), { timeout: 2000 })
  }

  function actionButton(label: string): HTMLButtonElement {
    const btn = [...toolbar()!.querySelectorAll<HTMLButtonElement>('.reader-selection-toolbar__action')].find((b) => b.getAttribute('aria-label') === label)
    if (!btn) throw new Error(`action ${label} not found`)
    return btn
  }

  /** 构造跨节点选区并派发 selectionchange。 */
  function selectAcross(startNode: Node, startOffset: number, endNode: Node, endOffset: number): void {
    const range = document.createRange()
    range.setStart(startNode, startOffset)
    range.setEnd(endNode, endOffset)
    const sel = window.getSelection()!
    sel.removeAllRanges()
    sel.addRange(range)
    document.dispatchEvent(new Event('selectionchange'))
  }

  it('选区跨出正文（标题→正文）→ 截取正文内部分创建（interaction §2.4）', async () => {
    const title = document.createElement('h1')
    title.id = 'chapter-title'
    title.textContent = '章节标题文字'
    document.querySelector('.reader-chapter')!.prepend(title)
    selectAcross(title.firstChild!, 0, para('P000001').firstChild!, 4)
    await vi.waitFor(() => expect(toolbar()).toBeTruthy(), { timeout: 2000 })
    actionButton('批注') // 存在即可
    toolbar()!.querySelector<HTMLButtonElement>('.reader-selection-toolbar__color--yellow')!.click()
    await vi.waitFor(async () => expect(await listHighlights()).toHaveLength(1), { timeout: 3000 })
    const [h] = await listHighlights()
    // 标题部分被截取掉，只保留正文内 0..4
    expect(h.selector.exact).toBe('很久以来')
    expect(h.selector.start).toEqual({ paragraphId: 'P000001', offset: 0 })
    expect(h.selector.end).toEqual({ paragraphId: 'P000001', offset: 4 })
  })

  it('选区跨出正文（正文→页脚）→ 截取正文内部分，跨段以 \\n 连接（interaction §2.1/§2.4）', async () => {
    const footer = document.createElement('div')
    footer.id = 'page-footer'
    footer.textContent = '页脚文字'
    document.querySelector('.reader-chapter')!.append(footer)
    selectAcross(para('P000001').firstChild!, 2, footer.firstChild!, 2)
    await vi.waitFor(() => expect(toolbar()).toBeTruthy(), { timeout: 2000 })
    toolbar()!.querySelector<HTMLButtonElement>('.reader-selection-toolbar__color--yellow')!.click()
    await vi.waitFor(async () => expect(await listHighlights()).toHaveLength(1), { timeout: 3000 })
    const [h] = await listHighlights()
    expect(h.selector.exact).toBe(`${P1.slice(2)}\n${P2}`)
    expect(h.selector.start).toEqual({ paragraphId: 'P000001', offset: 2 })
    expect(h.selector.end).toEqual({ paragraphId: 'P000002', offset: P2.length })
  })

  it('截取后为空（段尾→正文外）→ 不触发（interaction §2.4）', async () => {
    const footer = document.createElement('div')
    footer.textContent = '页脚文字'
    document.querySelector('.reader-chapter')!.append(footer)
    selectAcross(para('P000002').firstChild!, P2.length, footer.firstChild!, 2)
    await new Promise((r) => setTimeout(r, 250))
    expect(toolbar()).toBeNull()
  })

  it('跨段选区创建 → selector 跨段偏移与 \\n 连接（protocol 不变量 14）', async () => {
    selectAcross(para('P000001').firstChild!, 2, para('P000002').firstChild!, 3)
    await vi.waitFor(() => expect(toolbar()).toBeTruthy(), { timeout: 2000 })
    toolbar()!.querySelector<HTMLButtonElement>('.reader-selection-toolbar__color--blue')!.click()
    await vi.waitFor(async () => expect(await listHighlights()).toHaveLength(1), { timeout: 3000 })
    const [h] = await listHighlights()
    expect(h.selector.exact).toBe(`${P1.slice(2)}\n${P2.slice(0, 3)}`)
    expect(h.selector.start).toEqual({ paragraphId: 'P000001', offset: 2 })
    expect(h.selector.end).toEqual({ paragraphId: 'P000002', offset: 3 })
    expect(h.paragraphId).toBe('P000001')
    expect(h.textHash).toBe(fnv1a36(P1))
    expect(h.color).toBe('blue')
  })

  it('桌面滚动 → 工具条消失（interaction §2.1）', async () => {
    await selectAndWait()
    window.dispatchEvent(new Event('scroll'))
    await vi.waitFor(() => expect(toolbar()).toBeNull())
    // 滚动消失不要求清除选区，但工具条必须收起
  })

  it('触屏底部动作栏不随滚动消失；选区清除即消失（interaction §2.1 触屏差异）', async () => {
    wrapper?.unmount()
    stubMatchMedia(() => false) // 无 any-hover → 触屏
    wrapper = mount(ReaderSelectionToolbar, { attachTo: document.body })
    await selectAndWait()
    expect(toolbar()!.classList.contains('reader-selection-toolbar--touch')).toBe(true)
    window.dispatchEvent(new Event('scroll'))
    await new Promise((r) => setTimeout(r, 60))
    expect(toolbar()).toBeTruthy()
    collapseSelection()
    await vi.waitFor(() => expect(toolbar()).toBeNull())
  })

  it('Esc 关闭工具条且阻断传播（protocol §6.3：不连带关闭面板）', async () => {
    await selectAndWait()
    const windowEsc = vi.fn()
    window.addEventListener('keydown', windowEsc)
    const event = pressKey(document.body, 'Escape')
    await vi.waitFor(() => expect(toolbar()).toBeNull())
    expect(event.defaultPrevented).toBe(true)
    expect(windowEsc).not.toHaveBeenCalled()
    expect(window.getSelection()!.isCollapsed).toBe(false)
    window.removeEventListener('keydown', windowEsc)
  })

  it('同范围不同色 → 创建第二条（interaction §2.4 仅同范围+同色去重；P2 重叠放开）', async () => {
    await putHighlight(hl({ id: 'existing', chapterId: 'vol1-01', paragraphId: 'P000001', textHash: fnv1a36(P1), selector: SEL_0_4, color: 'yellow' }))
    await selectAndWait(0, 4)
    await vi.waitFor(() => expect(toolbar()!.querySelector('.reader-selection-toolbar__color--yellow')!.getAttribute('aria-pressed')).toBe('true'))
    toolbar()!.querySelector<HTMLButtonElement>('.reader-selection-toolbar__color--green')!.click()
    await vi.waitFor(async () => expect(await listHighlights()).toHaveLength(2), { timeout: 3000 })
    const rows = await listHighlights()
    const created = rows.find((r) => r.id !== 'existing')!
    expect(created.color).toBe('green')
    expect(created.selector.exact).toBe('很久以来')
    expect(toasts.value.some((t) => t.message === '此处已有摘录')).toBe(false)
  })

  it('全部动作按钮 pointerdown.prevent 保选区（protocol §6.1：一律 @pointerdown.prevent）', async () => {
    await selectAndWait()
    for (const label of ['批注', '书签', '复制', '链接', 'AI修订']) {
      const btn = actionButton(label)
      const event = new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'mouse' })
      btn.dispatchEvent(event)
      expect(event.defaultPrevented, `button ${label}`).toBe(true)
      expect(window.getSelection()!.isCollapsed, `button ${label}`).toBe(false)
      expect(window.getSelection()!.toString()).toBe('很久以来')
    }
    // 色块同样
    for (const color of ['yellow', 'green', 'blue', 'pink', 'purple']) {
      const btn = toolbar()!.querySelector(`.reader-selection-toolbar__color--${color}`)!
      const event = new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'mouse' })
      btn.dispatchEvent(event)
      expect(event.defaultPrevented, `color ${color}`).toBe(true)
    }
    expect(toolbar()).toBeTruthy()
  })

  it('选区落在工具条自身内 → 不触发（interaction §2.4）', async () => {
    await selectAndWait()
    const label = toolbar()!.querySelector('.reader-selection-toolbar__action')!
    selectAcross(label.firstChild!, 0, label.firstChild!, 1)
    await vi.waitFor(() => expect(toolbar()).toBeNull(), { timeout: 2000 })
  })

  it('外点关闭但不清除选区（外点仅收起工具条）', async () => {
    await selectAndWait()
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' }))
    await vi.waitFor(() => expect(toolbar()).toBeNull())
    expect(window.getSelection()!.isCollapsed).toBe(false)
  })
})
