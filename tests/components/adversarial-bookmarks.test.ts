/**
 * 对抗性测试 · 书签（interaction §4，protocol §6.1/§7.4）。
 * 聚焦：加书签不改阅读进度（reactive/localStorage/IDB 三面）、
 * 跨段选区书签落起始段、列表正文位置排序、label 优先首句。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import ReaderHighlightPopover from '../../site/.vitepress/theme/components/ReaderHighlightPopover.vue'
import ReaderSelectionToolbar from '../../site/.vitepress/theme/components/ReaderSelectionToolbar.vue'
import ReaderExcerpts from '../../site/.vitepress/theme/components/ReaderExcerpts.vue'
import {
  _resetUserStorage,
  currentDb,
  initUserStorage,
  listBookmarks,
  putBookmark,
  deepEqual,
  type ReadingPosition,
} from '../../site/.vitepress/theme/composables/user-storage'
import { progress } from '../../site/.vitepress/theme/composables/reader'
import { useToasts } from '../../site/.vitepress/theme/composables/useToasts'
import { resetVitepressMock } from './vitepress-mock'
import { P1, P2, flush, mountChapter, para, selectText, stubClipboard, stubMatchMedia } from './helpers'
import { bm } from '../storage/fixtures'

vi.mock('vitepress', () => import('./vitepress-mock'))

const { clear: clearToasts } = useToasts()

const LOCAL_POS: ReadingPosition = {
  pageId: 'vol1-01',
  paragraphId: 'P000001',
  paragraphHash: 'h',
  offset: 0.2,
  pageProgress: 0.3,
  maxProgress: 0.3,
  updatedAt: '2026-11-27T09:00:00.000Z',
  deviceId: 'local-device',
}

describe('对抗 · 书签', () => {
  let wrappers: VueWrapper[] = []

  beforeEach(async () => {
    resetVitepressMock()
    clearToasts()
    mountChapter()
    stubMatchMedia((q) => q.includes('any-hover'))
    stubClipboard()
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })))
    _resetUserStorage()
    await initUserStorage()
    wrappers = []
  })

  afterEach(() => {
    for (const w of wrappers) w.unmount()
    wrappers = []
    clearToasts()
    progress.last = null
    progress.pages = {}
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  function mountComponent(component: unknown): VueWrapper {
    const w = mount(component as never, { attachTo: document.body })
    wrappers.push(w)
    return w
  }

  it('★ 加书签不改变阅读进度（interaction §4：书签与进度相互独立）', async () => {
    progress.last = { ...LOCAL_POS }
    progress.pages = { 'vol1-01': { ...LOCAL_POS } }
    const before = JSON.parse(JSON.stringify(progress))
    localStorage.setItem('lost-time:progress:v2', JSON.stringify(before))
    mountComponent(ReaderHighlightPopover)
    await flush()
    const btn = para('P000001').querySelector<HTMLButtonElement>('.reader-bookmark-toggle')!
    btn.click()
    await vi.waitFor(async () => expect(await listBookmarks()).toHaveLength(1), { timeout: 3000 })
    // reactive 进度不变
    expect(deepEqual(JSON.parse(JSON.stringify(progress)), before)).toBe(true)
    // localStorage 快照不变
    expect(JSON.parse(localStorage.getItem('lost-time:progress:v2')!)).toEqual(before)
    // IDB 进度表与 outbox 无进度写入
    expect(await currentDb().progress.count()).toBe(0)
    expect(await currentDb().outbox.where('[entity+id]').equals(['progress', 'doc']).count()).toBe(0)
  })

  it('跨段选区加书签 → 仅起始段（段落级粒度，interaction §4）', async () => {
    mountComponent(ReaderSelectionToolbar)
    const range = document.createRange()
    range.setStart(para('P000001').firstChild!, 2)
    range.setEnd(para('P000002').firstChild!, 3)
    const sel = window.getSelection()!
    sel.removeAllRanges()
    sel.addRange(range)
    document.dispatchEvent(new Event('selectionchange'))
    await vi.waitFor(() => expect(document.querySelector('.reader-selection-toolbar')).toBeTruthy(), { timeout: 2000 })
    ;[...document.querySelectorAll<HTMLButtonElement>('.reader-selection-toolbar__action')].find((b) => b.getAttribute('aria-label') === '书签')!.click()
    await vi.waitFor(async () => expect(await listBookmarks()).toHaveLength(1), { timeout: 3000 })
    const [b] = await listBookmarks()
    expect(b.paragraphId).toBe('P000001')
    expect(b.chapterId).toBe('vol1-01')
    // P2 无书签
    expect((await listBookmarks()).some((x) => x.paragraphId === 'P000002')).toBe(false)
  })

  it('书签列表按正文位置排序（interaction §4）', async () => {
    await putBookmark(bm({ id: 'b2', chapterId: 'vol1-01', paragraphId: 'P000002' }))
    await putBookmark(bm({ id: 'b1', chapterId: 'vol1-01', paragraphId: 'P000001' }))
    mountComponent(ReaderExcerpts)
    await flush()
    ;[...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((b) => b.textContent === '书签')!.click()
    await nextTick()
    const items = [...document.querySelectorAll<HTMLElement>('.reader-excerpts__item')]
    expect(items[0].textContent).toContain(P1.split(/[。！？]/)[0])
    expect(items[1].textContent).toContain(P2.split(/[。！？]/)[0])
  })

  it('有 label 时列表显示 label（label 为唯一可编辑内容字段，protocol §3）', async () => {
    await putBookmark(bm({ id: 'b1', chapterId: 'vol1-01', paragraphId: 'P000001', label: '自定义标签' }))
    mountComponent(ReaderExcerpts)
    await flush()
    ;[...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((b) => b.textContent === '书签')!.click()
    await nextTick()
    const item = document.querySelector<HTMLElement>('.reader-excerpts__item')!
    expect(item.querySelector('.reader-excerpts__exact')!.textContent).toContain('自定义标签')
    expect(item.textContent).not.toContain('很久以来，我都是早早就躺下了')
  })

  it('页边图标：已 bookmark 段常驻图标 aria-label=移除书签（interaction §4）', async () => {
    await putBookmark(bm({ id: 'b1', chapterId: 'vol1-01', paragraphId: 'P000002' }))
    mountComponent(ReaderHighlightPopover)
    await vi.waitFor(() => expect(para('P000002').querySelector('.reader-bookmark-toggle.is-bookmarked')).toBeTruthy(), { timeout: 3000 })
    expect(para('P000002').querySelector('.reader-bookmark-toggle')!.getAttribute('aria-label')).toBe('移除书签')
    // 未 bookmark 段为添加态
    expect(para('P000001').querySelector('.reader-bookmark-toggle')!.getAttribute('aria-label')).toBe('添加书签')
    // 图标按钮不污染段落指纹文本（空按钮 + CSS ::before）
    expect(para('P000002').textContent).toBe(P2)
  })
})
