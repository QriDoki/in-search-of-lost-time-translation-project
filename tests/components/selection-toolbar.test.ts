import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import ReaderSelectionToolbar from '../../site/.vitepress/theme/components/ReaderSelectionToolbar.vue'
import {
  _resetUserStorage,
  initUserStorage,
  listBookmarks,
  listHighlights,
  putHighlight,
  useUserStorage,
  fnv1a36,
  decodeShare,
} from '../../site/.vitepress/theme/composables/user-storage'
import { openDatabase } from '../../site/.vitepress/theme/composables/user-storage/db'
import { useToasts } from '../../site/.vitepress/theme/composables/useToasts'
import { pageState, resetVitepressMock } from './vitepress-mock'
import { P1, collapseSelection, mountChapter, para, pressKey, selectText, stubClipboard, stubMatchMedia } from './helpers'
import { hl } from '../storage/fixtures'

vi.mock('vitepress', () => import('./vitepress-mock'))

const { clear: clearToasts, toasts } = useToasts()

describe('ReaderSelectionToolbar（§7.4 工具条矩阵）', () => {
  let wrapper: VueWrapper | null = null
  let clipboard: { writeText: ReturnType<typeof vi.fn> }

  beforeEach(async () => {
    resetVitepressMock()
    clearToasts()
    mountChapter()
    stubMatchMedia((q) => q.includes('any-hover'))
    clipboard = stubClipboard()
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
    await vi.waitFor(() => expect(toolbar()).toBeTruthy())
  }

  it('选区出现 → 工具条显示（role=toolbar，4 色块 aria-label）', async () => {
    expect(toolbar()).toBeNull()
    await selectAndWait()
    expect(toolbar()!.getAttribute('role')).toBe('toolbar')
    const labels = [...toolbar()!.querySelectorAll('.reader-selection-toolbar__color')].map((b) => b.getAttribute('aria-label'))
    // F2-3：pink 第 5 色补齐
    expect(labels).toEqual(['黄色高亮', '绿色高亮', '蓝色高亮', '粉色高亮', '紫色高亮'])
  })

  it('选区塌陷 → 工具条消失', async () => {
    await selectAndWait()
    collapseSelection()
    await vi.waitFor(() => expect(toolbar()).toBeNull())
  })

  it('★ pointerdown.prevent 后选区仍在（defaultPrevented）', async () => {
    await selectAndWait()
    const color = toolbar()!.querySelector('.reader-selection-toolbar__color')!
    const event = new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'mouse' })
    color.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(window.getSelection()!.isCollapsed).toBe(false)
    expect(window.getSelection()!.toString()).toBe('很久以来')
  })

  it('色块创建写库（fake-indexeddb 真库断言）', async () => {
    await selectAndWait(0, 4)
    toolbar()!.querySelector<HTMLButtonElement>('.reader-selection-toolbar__color--yellow')!.click()
    await vi.waitFor(async () => expect(await listHighlights()).toHaveLength(1))
    const [h] = await listHighlights()
    expect(h.chapterId).toBe('vol1-01')
    expect(h.paragraphId).toBe('P000001')
    expect(h.selector.exact).toBe('很久以来')
    expect(h.selector.start).toEqual({ paragraphId: 'P000001', offset: 0 })
    expect(h.selector.end).toEqual({ paragraphId: 'P000001', offset: 4 })
    expect(h.color).toBe('yellow')
    expect(h.textHash).toBe(fnv1a36(P1))
    expect(h.revision).toBe('dev')
    expect(h.deletedAt).toBeNull()
    expect(h.local.dirty).toBe(1)
    await vi.waitFor(() => expect(toolbar()).toBeNull())
    expect(window.getSelection()!.isCollapsed).toBe(true)
  })

  it('Esc 关闭并保留选区', async () => {
    await selectAndWait()
    pressKey(document, 'Escape')
    await vi.waitFor(() => expect(toolbar()).toBeNull())
    expect(window.getSelection()!.isCollapsed).toBe(false)
  })

  it('外点关闭', async () => {
    await selectAndWait()
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' }))
    await vi.waitFor(() => expect(toolbar()).toBeNull())
  })

  it('正文外选区不触发', async () => {
    const outside = document.createElement('div')
    outside.id = 'outside'
    outside.textContent = '面板里的文字'
    document.body.append(outside)
    const range = document.createRange()
    range.selectNodeContents(outside.firstChild!)
    const sel = window.getSelection()!
    sel.removeAllRanges()
    sel.addRange(range)
    document.dispatchEvent(new Event('selectionchange'))
    await new Promise((r) => setTimeout(r, 250))
    expect(toolbar()).toBeNull()
  })

  it('版权页不触发', async () => {
    pageState.frontmatter = { readerPageId: 'copyright', contentVersion: 'dev' }
    await vi.waitFor(() => expect(useUserStorage().ready.value).toBe(true))
    selectText('P000001', 0, 4)
    await new Promise((r) => setTimeout(r, 250))
    expect(toolbar()).toBeNull()
  })

  it('F2-3：重叠创建放开（D24 解除）→ 叠加创建第二条', async () => {
    await putHighlight(hl({ id: 'existing', chapterId: 'vol1-01', paragraphId: 'P000001', textHash: fnv1a36(P1), selector: { exact: '很久以来', prefix: '', suffix: '，我都是', start: { paragraphId: 'P000001', offset: 0 }, end: { paragraphId: 'P000001', offset: 4 } } }))
    await selectAndWait(2, 6)
    toolbar()!.querySelector<HTMLButtonElement>('.reader-selection-toolbar__color--green')!.click()
    await vi.waitFor(async () => expect(await listHighlights()).toHaveLength(2), { timeout: 3000 })
    expect(toasts.value.some((t) => t.message === '此处已有摘录')).toBe(false)
    const rows = await listHighlights()
    expect(rows.find((r) => r.id !== 'existing')!.color).toBe('green')
  })

  it('同范围同色重复创建 → 直接打开已有弹层，无拒绝 toast', async () => {
    await putHighlight(hl({ id: 'existing', chapterId: 'vol1-01', paragraphId: 'P000001', textHash: fnv1a36(P1), selector: { exact: '很久以来', prefix: '', suffix: '，我都是', start: { paragraphId: 'P000001', offset: 0 }, end: { paragraphId: 'P000001', offset: 4 } } }))
    const opened: unknown[] = []
    window.addEventListener('reader-highlight:open', (e) => opened.push((e as CustomEvent).detail))
    await selectAndWait(0, 4)
    // 等待重叠检测完成（aria-pressed 反映已有同色覆盖）
    await vi.waitFor(() => expect(toolbar()!.querySelector('.reader-selection-toolbar__color--yellow')!.getAttribute('aria-pressed')).toBe('true'))
    toolbar()!.querySelector<HTMLButtonElement>('.reader-selection-toolbar__color--yellow')!.click()
    await vi.waitFor(() => expect(opened).toContainEqual({ id: 'existing' }))
    expect(toasts.value.some((t) => t.message === '此处已有摘录')).toBe(false)
    expect(await listHighlights()).toHaveLength(1)
  })

  it('批注 = 创建 + 打开弹层编辑态', async () => {
    const opened: unknown[] = []
    window.addEventListener('reader-highlight:open', (e) => opened.push((e as CustomEvent).detail))
    await selectAndWait()
    ;[...toolbar()!.querySelectorAll<HTMLButtonElement>('.reader-selection-toolbar__action')].find((b) => b.textContent!.includes('批注'))!.click()
    await vi.waitFor(async () => expect(await listHighlights()).toHaveLength(1))
    const [h] = await listHighlights()
    expect(opened).toContainEqual({ id: h.id, startInEdit: true })
  })

  it('✦ AI修订 dispatch reader-ai-edit:trigger（detail = 选区文本）', async () => {
    const details: unknown[] = []
    window.addEventListener('reader-ai-edit:trigger', (e) => details.push((e as CustomEvent).detail))
    await selectAndWait()
    ;[...toolbar()!.querySelectorAll<HTMLButtonElement>('.reader-selection-toolbar__action')].find((b) => b.textContent!.includes('AI修订'))!.click()
    expect(details).toEqual(['很久以来'])
  })

  it('⧉ 复制 → clipboard + toast 已复制', async () => {
    await selectAndWait()
    ;[...toolbar()!.querySelectorAll<HTMLButtonElement>('.reader-selection-toolbar__action')].find((b) => b.textContent!.includes('复制'))!.click()
    await vi.waitFor(() => expect(clipboard.writeText).toHaveBeenCalledWith('很久以来'))
    expect(toasts.value.some((t) => t.message === '已复制')).toBe(true)
  })

  it('🔗 链接 → 永久链接写剪贴板 + toast（不含批注）', async () => {
    await selectAndWait()
    ;[...toolbar()!.querySelectorAll<HTMLButtonElement>('.reader-selection-toolbar__action')].find((b) => b.textContent!.includes('链接'))!.click()
    await vi.waitFor(() => expect(clipboard.writeText).toHaveBeenCalled())
    const url = clipboard.writeText.mock.calls[0][0] as string
    expect(url).toContain('/chapters/vol1-01.html#share=')
    const payload = decodeShare(url.split('#share=')[1])!
    expect(payload.c).toBe('vol1-01')
    expect(payload.s).toBe('P000001')
    expect(payload.q).toBe('很久以来')
    expect(toasts.value.some((t) => t.message === '链接已复制（不含批注）')).toBe(true)
  })

  it('🔖 书签 toggle：添加 → 移除 + 撤销恢复（rev+1）', async () => {
    await selectAndWait()
    const bmButton = () => [...toolbar()!.querySelectorAll<HTMLButtonElement>('.reader-selection-toolbar__action')].find((b) => b.textContent!.includes('书签'))!
    bmButton().click()
    await vi.waitFor(async () => expect(await listBookmarks()).toHaveLength(1))
    const [b] = await listBookmarks()
    expect(b.paragraphId).toBe('P000001')
    expect(b.chapterId).toBe('vol1-01')
    expect(toasts.value.some((t) => t.message === '已添加书签')).toBe(true)

    await selectAndWait()
    bmButton().click()
    await vi.waitFor(async () => {
      const rows = await listBookmarks()
      // 未同步创建 → D18 硬删
      expect(rows).toHaveLength(0)
    })
    const undo = toasts.value.find((t) => t.message === '已移除书签')!
    expect(undo.action).toBeTruthy()
    undo.action!.run()
    await vi.waitFor(async () => expect(await listBookmarks()).toHaveLength(1))
    const [restored] = await listBookmarks()
    expect(restored.id).toBe(b.id)
    expect(restored.rev).toBe(b.rev + 1)
    expect(restored.deletedAt).toBeNull()
  })

  it('触屏 = 底部动作栏（--touch class）', async () => {
    wrapper?.unmount()
    stubMatchMedia(() => false)
    wrapper = mount(ReaderSelectionToolbar, { attachTo: document.body })
    await selectAndWait()
    expect(toolbar()!.classList.contains('reader-selection-toolbar--touch')).toBe(true)
  })

  it('重锚模式抑制工具条（reader-reanchor:active）', async () => {
    window.dispatchEvent(new CustomEvent('reader-reanchor:active', { detail: true }))
    selectText('P000001', 0, 4)
    await new Promise((r) => setTimeout(r, 250))
    expect(toolbar()).toBeNull()
    window.dispatchEvent(new CustomEvent('reader-reanchor:active', { detail: false }))
    selectText('P000001', 0, 4)
    await vi.waitFor(() => expect(toolbar()).toBeTruthy())
  })

  it('IDB 不可用（localStorage 模式）→ 不触发', async () => {
    wrapper?.unmount()
    _resetUserStorage()
    const db = await import('../../site/.vitepress/theme/composables/user-storage/db')
    const reject = vi.spyOn(db, 'openDatabase').mockRejectedValueOnce(new Error('IDB unavailable'))
    await initUserStorage()
    expect(useUserStorage().mode.value).toBe('localStorage')
    wrapper = mount(ReaderSelectionToolbar, { attachTo: document.body })
    selectText('P000001', 0, 4)
    await new Promise((r) => setTimeout(r, 250))
    expect(toolbar()).toBeNull()
    reject.mockRestore()
  })

  it('色块 aria-pressed 反映已有同色覆盖', async () => {
    await putHighlight(hl({ id: 'existing', chapterId: 'vol1-01', paragraphId: 'P000001', textHash: fnv1a36(P1), color: 'green', selector: { exact: '很久以来', prefix: '', suffix: '，我都是', start: { paragraphId: 'P000001', offset: 0 }, end: { paragraphId: 'P000001', offset: 4 } } }))
    await selectAndWait(0, 4)
    await vi.waitFor(() => {
      const green = toolbar()!.querySelector('.reader-selection-toolbar__color--green')!
      expect(green.getAttribute('aria-pressed')).toBe('true')
    })
    expect(toolbar()!.querySelector('.reader-selection-toolbar__color--yellow')!.getAttribute('aria-pressed')).toBe('false')
  })
})