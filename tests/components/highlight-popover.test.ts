import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import ReaderHighlightPopover from '../../site/.vitepress/theme/components/ReaderHighlightPopover.vue'
import {
  _resetUserStorage,
  currentDb,
  getHighlight,
  initUserStorage,
  listBookmarks,
  listHighlights,
  putHighlight,
  useUserStorage,
  fnv1a36,
} from '../../site/.vitepress/theme/composables/user-storage'
import { _setAccount, _setEngine } from '../../site/.vitepress/theme/composables/user-storage/vue'
import { useToasts } from '../../site/.vitepress/theme/composables/useToasts'
import { resetVitepressMock } from './vitepress-mock'
import { P1, dispatchPointer, flush, mountChapter, para, pressKey, stubClipboard, stubMatchMedia } from './helpers'
import { hl } from '../storage/fixtures'

vi.mock('vitepress', () => import('./vitepress-mock'))

const { clear: clearToasts, toasts } = useToasts()

const SEL = { exact: '很久以来', prefix: '', suffix: '，我都是', start: { paragraphId: 'P000001', offset: 0 }, end: { paragraphId: 'P000001', offset: 4 } }

describe('ReaderHighlightPopover + mark 接线（§7.4 弹层矩阵）', () => {
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
    _setAccount(null)
    await initUserStorage()
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    clearToasts()
    _setAccount(null)
    _setEngine(null)
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  function mountPopover(props: Record<string, unknown> = {}): VueWrapper {
    wrapper = mount(ReaderHighlightPopover, { attachTo: document.body, props })
    return wrapper
  }

  async function seed(over = {}): Promise<string> {
    const h = hl({ id: 'h1', chapterId: 'vol1-01', paragraphId: 'P000001', textHash: fnv1a36(P1), selector: SEL, ...over })
    await putHighlight(h)
    return h.id
  }

  async function waitMarks(): Promise<void> {
    await vi.waitFor(() => expect(document.querySelector('mark[data-reader-highlight]')).toBeTruthy(), { timeout: 3000 })
  }

  function popover(): HTMLElement | null {
    return document.getElementById('reader-highlight-popover')
  }

  it('liveQuery → 正文 mark 渲染（class/data/tabindex/aria-label）', async () => {
    mountPopover()
    await seed()
    await waitMarks()
    const mark = document.querySelector<HTMLElement>('mark[data-reader-highlight="h1"]')!
    expect(mark.classList.contains('reader-highlight')).toBe(true)
    expect(mark.classList.contains('reader-highlight--yellow')).toBe(true)
    expect(mark.tabIndex).toBe(0)
    expect(mark.getAttribute('aria-label')).toBe('摘录')
    expect(mark.textContent).toBe('很久以来')
  })

  it('有批注 → aria-label「摘录，有批注」', async () => {
    mountPopover()
    await seed({ note: '批注内容' })
    await waitMarks()
    expect(document.querySelector('mark[data-reader-highlight]')!.getAttribute('aria-label')).toBe('摘录，有批注')
  })

  it('click mark → pin 弹层（原文 + 遮罩）；Esc 关闭归还焦点', async () => {
    mountPopover()
    await seed()
    await waitMarks()
    const mark = document.querySelector<HTMLElement>('mark[data-reader-highlight]')!
    mark.click()
    await vi.waitFor(() => expect(popover()).toBeTruthy())
    expect(popover()!.textContent).toContain('很久以来')
    expect(document.querySelector('.reader-annotation-backdrop')).toBeTruthy()
    pressKey(document, 'Escape')
    await vi.waitFor(() => expect(popover()).toBeNull())
    expect(document.activeElement).toBe(mark)
  })

  it('Enter 键打开弹层（mark tabindex=0 无障碍）', async () => {
    mountPopover()
    await seed()
    await waitMarks()
    const mark = document.querySelector<HTMLElement>('mark[data-reader-highlight]')!
    pressKey(mark, 'Enter')
    await vi.waitFor(() => expect(popover()).toBeTruthy())
  })

  it('hover 预览：300ms 入 / 120ms 出（mouse + any-hover）', async () => {
    mountPopover()
    await seed()
    await waitMarks()
    const mark = document.querySelector<HTMLElement>('mark[data-reader-highlight]')!
    dispatchPointer(mark, 'pointerover', 'mouse')
    expect(popover()).toBeNull() // 300ms 未到
    await vi.waitFor(() => expect(popover()).toBeTruthy(), { timeout: 1500 })
    expect(popover()!.classList.contains('is-preview')).toBe(true)
    expect(document.querySelector('.reader-annotation-backdrop')).toBeNull()
    dispatchPointer(mark, 'pointerout', 'mouse')
    expect(popover()).toBeTruthy() // 120ms 延迟
    await vi.waitFor(() => expect(popover()).toBeNull(), { timeout: 1500 })
  })

  it('触屏合成事件不触发 hover 预览', async () => {
    mountPopover()
    await seed()
    await waitMarks()
    const mark = document.querySelector<HTMLElement>('mark[data-reader-highlight]')!
    dispatchPointer(mark, 'pointerover', 'touch')
    await new Promise((r) => setTimeout(r, 400))
    expect(popover()).toBeNull()
  })

  it('互斥：打开 dispatch highlight；收到 annotation 即关闭', async () => {
    mountPopover()
    await seed()
    await waitMarks()
    const events: unknown[] = []
    window.addEventListener('reader-popover:open', (e) => events.push((e as CustomEvent).detail))
    document.querySelector<HTMLElement>('mark[data-reader-highlight]')!.click()
    await vi.waitFor(() => expect(popover()).toBeTruthy())
    expect(events).toContainEqual({ source: 'highlight' })
    window.dispatchEvent(new CustomEvent('reader-popover:open', { detail: { source: 'annotation' } }))
    await vi.waitFor(() => expect(popover()).toBeNull())
  })

  it('编辑批注：650ms 防抖自动保存', async () => {
    mountPopover()
    await seed()
    await waitMarks()
    document.querySelector<HTMLElement>('mark[data-reader-highlight]')!.click()
    await vi.waitFor(() => expect(popover()).toBeTruthy())
    ;[...popover()!.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.includes('编辑批注'))!.click()
    await nextTick()
    const textarea = popover()!.querySelector<HTMLTextAreaElement>('textarea')!
    textarea.value = '新批注'
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    // 650ms 前未写库
    await new Promise((r) => setTimeout(r, 300))
    expect((await getHighlight('h1'))!.note).toBe('')
    await vi.waitFor(async () => expect((await getHighlight('h1'))!.note).toBe('新批注'), { timeout: 2000 })
    expect((await getHighlight('h1'))!.rev).toBe(2)
  })

  it('Cmd+Enter 立即保存并退出编辑态', async () => {
    mountPopover()
    await seed()
    await waitMarks()
    document.querySelector<HTMLElement>('mark[data-reader-highlight]')!.click()
    await vi.waitFor(() => expect(popover()).toBeTruthy())
    ;[...popover()!.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.includes('编辑批注'))!.click()
    await nextTick()
    const textarea = popover()!.querySelector<HTMLTextAreaElement>('textarea')!
    textarea.value = '即时保存'
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    pressKey(textarea, 'Enter', { metaKey: true })
    await vi.waitFor(async () => expect((await getHighlight('h1'))!.note).toBe('即时保存'))
    await vi.waitFor(() => expect(popover()!.querySelector('textarea')).toBeNull())
  })

  it('Esc 放弃未保存修改并退出编辑态（弹层保留）', async () => {
    mountPopover()
    await seed({ note: '原批注' })
    await waitMarks()
    document.querySelector<HTMLElement>('mark[data-reader-highlight]')!.click()
    await vi.waitFor(() => expect(popover()).toBeTruthy())
    ;[...popover()!.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.includes('编辑批注'))!.click()
    await nextTick()
    const textarea = popover()!.querySelector<HTMLTextAreaElement>('textarea')!
    textarea.value = '草稿'
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    pressKey(textarea, 'Escape')
    await nextTick()
    await new Promise((r) => setTimeout(r, 700))
    expect((await getHighlight('h1'))!.note).toBe('原批注')
    expect(popover()).toBeTruthy()
    expect(popover()!.querySelector('textarea')).toBeNull()
  })

  it('改色即生效（写库 + mark 重渲染）', async () => {
    mountPopover()
    await seed()
    await waitMarks()
    document.querySelector<HTMLElement>('mark[data-reader-highlight]')!.click()
    await vi.waitFor(() => expect(popover()).toBeTruthy())
    popover()!.querySelector<HTMLButtonElement>('.reader-highlight-popover__color--green')!.click()
    await vi.waitFor(async () => expect((await getHighlight('h1'))!.color).toBe('green'))
    await vi.waitFor(() => expect(document.querySelector('mark.reader-highlight--green')).toBeTruthy(), { timeout: 3000 })
  })

  it('★ 删除（已同步）→ 墓碑 + 撤销 toast 5s；撤销重建 rev+1', async () => {
    mountPopover()
    await seed()
    // 标记为已同步（cloudState + baseEtag）→ 软删除墓碑
    await currentDb().highlights.update('h1', { 'local.baseEtag': 'etag-1' })
    await currentDb().cloudState.put({ id: 'h1', eTag: 'etag-1', syncedRev: 1 })
    await waitMarks()
    document.querySelector<HTMLElement>('mark[data-reader-highlight]')!.click()
    await vi.waitFor(() => expect(popover()).toBeTruthy())
    ;[...popover()!.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.includes('删除'))!.click()
    await vi.waitFor(async () => expect((await getHighlight('h1'))!.deletedAt).toBeTruthy())
    await vi.waitFor(() => expect(document.querySelector('mark[data-reader-highlight]')).toBeNull(), { timeout: 3000 })
    const toast = toasts.value.find((t) => t.message === '已删除摘录')!
    expect(toast.duration).toBe(5000)
    expect(toast.action!.label).toBe('撤销')
    toast.action!.run()
    await vi.waitFor(async () => {
      const h = await getHighlight('h1')
      expect(h!.deletedAt).toBeNull()
      expect(h!.rev).toBe(2) // 快照（rev1）重建 rev+1（protocol §7.4）
    })
  })

  it('★ 删除（未同步）→ D18 硬删；撤销以原 id 重建', async () => {
    mountPopover()
    await seed()
    await waitMarks()
    document.querySelector<HTMLElement>('mark[data-reader-highlight]')!.click()
    await vi.waitFor(() => expect(popover()).toBeTruthy())
    ;[...popover()!.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.includes('删除'))!.click()
    await vi.waitFor(async () => expect(await getHighlight('h1')).toBeNull())
    const toast = toasts.value.find((t) => t.message === '已删除摘录')!
    toast.action!.run()
    await vi.waitFor(async () => expect(await getHighlight('h1')).toBeTruthy())
    expect((await getHighlight('h1'))!.rev).toBe(2)
  })

  it('撤销超时 → 保持删除（fake timers 驱动 5s 窗口）', async () => {
    mountPopover()
    await seed()
    await currentDb().highlights.update('h1', { 'local.baseEtag': 'etag-1' })
    await currentDb().cloudState.put({ id: 'h1', eTag: 'etag-1', syncedRev: 1 })
    await waitMarks()
    document.querySelector<HTMLElement>('mark[data-reader-highlight]')!.click()
    await vi.waitFor(() => expect(popover()).toBeTruthy())
    // fake timers 须在删除点击前安装，toast 的 5s 计时才受控（IDB 走 setImmediate 不受影响）。
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    ;[...popover()!.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.includes('删除'))!.click()
    await vi.waitFor(async () => expect((await getHighlight('h1'))!.deletedAt).toBeTruthy())
    expect(toasts.value.find((t) => t.message === '已删除摘录')).toBeTruthy()
    await vi.advanceTimersByTimeAsync(5001)
    expect(toasts.value.find((t) => t.message === '已删除摘录')).toBeUndefined()
    expect((await getHighlight('h1'))!.deletedAt).toBeTruthy()
  })

  it('复制链接 → toast「链接已复制（不含批注）」', async () => {
    mountPopover()
    await seed({ note: '私密批注' })
    await waitMarks()
    document.querySelector<HTMLElement>('mark[data-reader-highlight]')!.click()
    await vi.waitFor(() => expect(popover()).toBeTruthy())
    ;[...popover()!.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.includes('复制链接'))!.click()
    await vi.waitFor(() => expect(clipboard.writeText).toHaveBeenCalled())
    expect(clipboard.writeText.mock.calls[0][0]).not.toContain('私密批注')
    expect(toasts.value.some((t) => t.message === '链接已复制（不含批注）')).toBe(true)
  })

  it('已连接 + dirty + 同步失败态 → 「未同步 · 查看详情」链到 sync 面板（G4）', async () => {
    mountPopover()
    await seed()
    _setAccount({ scope: 'ms-abc', displayName: '用户', email: 'u@example.com' })
    // G4：仅失败态显示；健康 pending 不显示（对抗测试覆盖）
    _setEngine({
      getStatus: () => ({ state: 'error', pending: 1, conflicts: 0, lastSyncAt: null, lastError: 'Graph 500', unknownFiles: false }),
      subscribe: () => () => {},
      trigger: () => {}, syncNow: async () => ({ uploaded: 0, downloaded: 0, merged: 0, conflicts: 0, failed: 1, purged: 0 }),
      pause: () => {}, resume: () => {}, listConflicts: async () => [], resolveConflict: async () => {}, dispose: () => {},
    } as never)
    await waitMarks()
    document.querySelector<HTMLElement>('mark[data-reader-highlight]')!.click()
    await vi.waitFor(() => expect(popover()).toBeTruthy())
    const panels: unknown[] = []
    window.addEventListener('reader-panel:open', (e) => panels.push((e as CustomEvent).detail))
    const link = [...popover()!.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.includes('未同步'))!
    link.click()
    expect(panels).toEqual(['sync'])
  })

  it('健康 pending 态不显示「未同步」（G4）', async () => {
    mountPopover()
    await seed()
    _setAccount({ scope: 'ms-abc', displayName: '用户', email: 'u@example.com' })
    _setEngine({
      getStatus: () => ({ state: 'pending', pending: 1, conflicts: 0, lastSyncAt: null, lastError: null, unknownFiles: false }),
      subscribe: () => () => {},
      trigger: () => {}, syncNow: async () => ({ uploaded: 0, downloaded: 0, merged: 0, conflicts: 0, failed: 0, purged: 0 }),
      pause: () => {}, resume: () => {}, listConflicts: async () => [], resolveConflict: async () => {}, dispose: () => {},
    } as never)
    await waitMarks()
    document.querySelector<HTMLElement>('mark[data-reader-highlight]')!.click()
    await vi.waitFor(() => expect(popover()).toBeTruthy())
    expect([...popover()!.querySelectorAll('button')].some((b) => b.textContent!.includes('未同步'))).toBe(false)
  })

  it('定位降级 → 段落淡底 class + 弹层「定位失效」徽标', async () => {
    mountPopover()
    await seed({ textHash: 'stale', selector: { ...SEL, exact: '不相干文', suffix: '' } })
    await vi.waitFor(() => expect(para('P000001').classList.contains('reader-highlight-degraded')).toBe(true), { timeout: 3000 })
    window.dispatchEvent(new CustomEvent('reader-highlight:open', { detail: { id: 'h1' } }))
    await vi.waitFor(() => expect(popover()).toBeTruthy())
    expect(popover()!.textContent).toContain('定位失效')
  })

  it('reader-highlight:open 事件打开弹层（工具条/面板入口）', async () => {
    mountPopover()
    await seed()
    await waitMarks()
    window.dispatchEvent(new CustomEvent('reader-highlight:open', { detail: { id: 'h1', startInEdit: true } }))
    await vi.waitFor(() => expect(popover()).toBeTruthy())
    await vi.waitFor(() => expect(popover()!.querySelector('textarea')).toBeTruthy())
  })

  it('props.highlightId 外部控制打开', async () => {
    await seed()
    mountPopover({ highlightId: 'h1' })
    await vi.waitFor(() => expect(popover()).toBeTruthy())
  })

  it('书签页边图标：点击添加 / 再点移除 + 撤销', async () => {
    mountPopover()
    await flush()
    const btn = para('P000001').querySelector<HTMLButtonElement>('.reader-bookmark-toggle')!
    expect(btn.getAttribute('aria-label')).toBe('添加书签')
    btn.click()
    await vi.waitFor(async () => expect(await listBookmarks()).toHaveLength(1))
    await vi.waitFor(() => expect(para('P000001').querySelector('.reader-bookmark-toggle.is-bookmarked')).toBeTruthy(), { timeout: 3000 })
    para('P000001').querySelector<HTMLButtonElement>('.reader-bookmark-toggle')!.click()
    await vi.waitFor(async () => expect(await listBookmarks()).toHaveLength(0))
    const toast = toasts.value.find((t) => t.message === '已移除书签')!
    toast.action!.run()
    await vi.waitFor(async () => expect(await listBookmarks()).toHaveLength(1))
  })

  it('删除记录后弹层自动关闭（liveQuery 驱动）', async () => {
    mountPopover()
    await seed()
    await waitMarks()
    document.querySelector<HTMLElement>('mark[data-reader-highlight]')!.click()
    await vi.waitFor(() => expect(popover()).toBeTruthy())
    const { softDeleteHighlight } = await import('../../site/.vitepress/theme/composables/user-storage')
    await currentDb().highlights.update('h1', { 'local.baseEtag': 'e' })
    await currentDb().cloudState.put({ id: 'h1', eTag: 'e', syncedRev: 1 })
    await softDeleteHighlight('h1')
    await vi.waitFor(() => expect(popover()).toBeNull(), { timeout: 3000 })
  })
})