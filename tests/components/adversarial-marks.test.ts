/**
 * 对抗性测试 · mark 渲染共存（interaction §1.3.1②/§2.2，protocol 不变量 12、§7.4）。
 * 用户高亮 / 搜索高亮 / 分享临时高亮同段共存，清理各认各的 data 标记互不误删；
 * 重叠嵌套；降级段落 class 清理；NFC 组合字符渲染偏移基准。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import ReaderHighlightPopover from '../../site/.vitepress/theme/components/ReaderHighlightPopover.vue'
import ReaderSearchHighlight from '../../site/.vitepress/theme/components/ReaderSearchHighlight.vue'
import ReaderShareLanding from '../../site/.vitepress/theme/components/ReaderShareLanding.vue'
import {
  _resetUserStorage,
  currentDb,
  encodeShare,
  initUserStorage,
  putHighlight,
  softDeleteHighlight,
  fnv1a36,
} from '../../site/.vitepress/theme/composables/user-storage'
import { resetAnchorCaches } from '../../site/.vitepress/theme/composables/user-storage/anchor'
import { useToasts } from '../../site/.vitepress/theme/composables/useToasts'
import { resetVitepressMock } from './vitepress-mock'
import { P1, P2, mountChapter, para, stubClipboard, stubMatchMedia } from './helpers'
import { hl } from '../storage/fixtures'

vi.mock('vitepress', () => import('./vitepress-mock'))

const { clear: clearToasts } = useToasts()

const SEL_A = { exact: '很久以来', prefix: '', suffix: '，我都是', start: { paragraphId: 'P000001', offset: 0 }, end: { paragraphId: 'P000001', offset: 4 } }
const SEL_B = { exact: '我都是', prefix: '很久以来，', suffix: '早早就', start: { paragraphId: 'P000001', offset: 5 }, end: { paragraphId: 'P000001', offset: 8 } }

function userMarks(): NodeListOf<HTMLElement> {
  return document.querySelectorAll<HTMLElement>('mark[data-reader-highlight]')
}
function searchMarks(): NodeListOf<HTMLElement> {
  return document.querySelectorAll<HTMLElement>('mark[data-reader-search]')
}
function shareMarks(): NodeListOf<HTMLElement> {
  return document.querySelectorAll<HTMLElement>('mark[data-reader-share]')
}

describe('对抗 · 三种 mark 共存与清理隔离', () => {
  let wrappers: VueWrapper[] = []

  beforeEach(async () => {
    resetVitepressMock()
    resetAnchorCaches()
    clearToasts()
    mountChapter()
    stubMatchMedia((q) => q.includes('any-hover'))
    stubClipboard()
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })))
    vi.stubGlobal('scrollTo', vi.fn())
    window.location.hash = ''
    window.location.search = ''
    _resetUserStorage()
    await initUserStorage()
    wrappers = []
  })

  afterEach(() => {
    for (const w of wrappers) w.unmount()
    wrappers = []
    clearToasts()
    window.location.hash = ''
    window.location.search = ''
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  function mountComponent(component: unknown): VueWrapper {
    const w = mount(component as never, { attachTo: document.body })
    wrappers.push(w)
    return w
  }

  it('用户 + 搜索同段共存；用户重渲染不误删搜索 mark（不变量 12）', async () => {
    window.location.search = '?search=很久以来'
    window.location.hash = '#P000001'
    await putHighlight(hl({ id: 'h1', chapterId: 'vol1-01', paragraphId: 'P000001', textHash: fnv1a36(P1), selector: SEL_A }))
    mountComponent(ReaderHighlightPopover)
    mountComponent(ReaderSearchHighlight)
    await vi.waitFor(() => expect(userMarks().length).toBeGreaterThanOrEqual(1), { timeout: 3000 })
    await vi.waitFor(() => expect(searchMarks().length).toBeGreaterThanOrEqual(1), { timeout: 3000 })
    const searchCount = searchMarks().length
    const searchText = [...searchMarks()].map((m) => m.textContent).join('')
    // 触发用户层重渲染（新增第二条）
    await putHighlight(hl({ id: 'h2', chapterId: 'vol1-01', paragraphId: 'P000001', textHash: fnv1a36(P1), selector: SEL_B, color: 'green' }))
    await vi.waitFor(() => expect(document.querySelector('mark[data-reader-highlight="h2"]')).toBeTruthy(), { timeout: 3000 })
    expect(searchMarks().length).toBe(searchCount)
    expect([...searchMarks()].map((m) => m.textContent).join('')).toBe(searchText)
  })

  it('搜索重定位不误删用户 mark（reader-search:navigate）', async () => {
    window.location.search = '?search=很久以来'
    window.location.hash = '#P000001'
    await putHighlight(hl({ id: 'h1', chapterId: 'vol1-01', paragraphId: 'P000001', textHash: fnv1a36(P1), selector: SEL_A }))
    mountComponent(ReaderHighlightPopover)
    mountComponent(ReaderSearchHighlight)
    await vi.waitFor(() => expect(userMarks().length).toBeGreaterThanOrEqual(1), { timeout: 3000 })
    await vi.waitFor(() => expect(searchMarks().length).toBeGreaterThanOrEqual(1), { timeout: 3000 })
    const userCount = userMarks().length
    window.dispatchEvent(new Event('reader-search:navigate'))
    await vi.waitFor(() => expect(searchMarks().length).toBeGreaterThanOrEqual(1), { timeout: 3000 })
    expect(userMarks().length).toBe(userCount)
    expect(document.querySelector('mark[data-reader-highlight="h1"]')).toBeTruthy()
  })

  it('用户 + 分享同段共存；用户重渲染与分享离页清理互不误删', async () => {
    window.location.hash = `#share=${encodeShare({ v: 1, c: 'vol1-01', s: 'P000001', q: '很久以来', a: '，我都是' } as never)}`
    await putHighlight(hl({ id: 'h1', chapterId: 'vol1-01', paragraphId: 'P000001', textHash: fnv1a36(P1), selector: SEL_B, color: 'green' }))
    mountComponent(ReaderHighlightPopover)
    const share = mountComponent(ReaderShareLanding)
    await vi.waitFor(() => expect(userMarks().length).toBeGreaterThanOrEqual(1), { timeout: 3000 })
    await vi.waitFor(() => expect(shareMarks().length).toBeGreaterThanOrEqual(1), { timeout: 3000 })
    // 用户层重渲染
    await putHighlight(hl({ id: 'h2', chapterId: 'vol1-01', paragraphId: 'P000002', textHash: fnv1a36(P2), selector: { exact: '有时候', prefix: '', suffix: '，蜡烛才灭', start: { paragraphId: 'P000002', offset: 0 }, end: { paragraphId: 'P000002', offset: 3 } } }))
    await vi.waitFor(() => expect(document.querySelector('mark[data-reader-highlight="h2"]')).toBeTruthy(), { timeout: 3000 })
    expect(shareMarks().length).toBeGreaterThanOrEqual(1)
    expect([...shareMarks()].map((m) => m.textContent).join('')).toBe('很久以来')
    // 分享离页：只清分享 mark
    share.unmount()
    wrappers = wrappers.filter((w) => w !== share)
    expect(shareMarks()).toHaveLength(0)
    expect(document.querySelector('mark[data-reader-highlight="h1"]')).toBeTruthy()
    expect(document.querySelector('mark[data-reader-highlight="h2"]')).toBeTruthy()
  })

  it('三种 mark 同段：用户/搜索清理均不误删分享 mark（不变量 12 全组合）', async () => {
    window.location.search = '?search=我都是'
    window.location.hash = '#P000001'
    await putHighlight(hl({ id: 'h1', chapterId: 'vol1-01', paragraphId: 'P000001', textHash: fnv1a36(P1), selector: SEL_A }))
    mountComponent(ReaderHighlightPopover)
    mountComponent(ReaderSearchHighlight)
    await vi.waitFor(() => expect(userMarks().length).toBeGreaterThanOrEqual(1), { timeout: 3000 })
    await vi.waitFor(() => expect(searchMarks().length).toBeGreaterThanOrEqual(1), { timeout: 3000 })
    // 注入分享临时 mark（模拟分享落地残留；URL 同一时刻只能携带一种定位参数）
    const p2 = para('P000002')
    const text = p2.firstChild as Text
    const tail = text.splitText(3)
    const shareMark = document.createElement('mark')
    shareMark.dataset.readerShare = ''
    tail.replaceWith(shareMark)
    shareMark.append(tail)
    expect(shareMarks()).toHaveLength(1)
    // 用户重渲染
    await putHighlight(hl({ id: 'h2', chapterId: 'vol1-01', paragraphId: 'P000001', textHash: fnv1a36(P1), selector: SEL_B, color: 'blue' }))
    await vi.waitFor(() => expect(document.querySelector('mark[data-reader-highlight="h2"]')).toBeTruthy(), { timeout: 3000 })
    expect(shareMarks()).toHaveLength(1)
    // 搜索重定位
    window.dispatchEvent(new Event('reader-search:navigate'))
    await new Promise((r) => setTimeout(r, 120))
    expect(shareMarks()).toHaveLength(1)
    expect(shareMarks()[0].textContent).toBe(P2.slice(3))
  })

  it('重叠嵌套 mark：清理用户层保留嵌套的搜索 mark 文本', async () => {
    window.location.search = '?search=很久以来'
    window.location.hash = '#P000001'
    await putHighlight(hl({ id: 'h1', chapterId: 'vol1-01', paragraphId: 'P000001', textHash: fnv1a36(P1), selector: SEL_A }))
    mountComponent(ReaderHighlightPopover)
    mountComponent(ReaderSearchHighlight)
    await vi.waitFor(() => expect(userMarks().length).toBeGreaterThanOrEqual(1), { timeout: 3000 })
    await vi.waitFor(() => expect(searchMarks().length).toBeGreaterThanOrEqual(1), { timeout: 3000 })
    // 删除用户高亮（同步过 → 墓碑）→ 用户层清理后搜索 mark 仍在且文本完整
    await currentDb().highlights.update('h1', { 'local.baseEtag': 'e' })
    await currentDb().cloudState.put({ id: 'h1', eTag: 'e', syncedRev: 1 })
    await softDeleteHighlight('h1')
    await vi.waitFor(() => expect(userMarks()).toHaveLength(0), { timeout: 3000 })
    expect(searchMarks().length).toBeGreaterThanOrEqual(1)
    expect([...searchMarks()].map((m) => m.textContent).join('')).toBe('很久以来')
    expect(para('P000001').textContent).toBe(P1)
  })

  it('降级段落与精确 mark 同页共存；删除降级记录只清降级 class', async () => {
    await putHighlight(hl({ id: 'ok', chapterId: 'vol1-01', paragraphId: 'P000001', textHash: fnv1a36(P1), selector: SEL_A }))
    await putHighlight(hl({ id: 'dead', chapterId: 'vol1-01', paragraphId: 'P000002', textHash: 'stale', selector: { exact: '不相干文', prefix: '', suffix: '', start: { paragraphId: 'P000002', offset: 0 }, end: { paragraphId: 'P000002', offset: 4 } } }))
    mountComponent(ReaderHighlightPopover)
    await vi.waitFor(() => expect(para('P000002').classList.contains('reader-highlight-degraded')).toBe(true), { timeout: 3000 })
    expect(document.querySelector('mark[data-reader-highlight="ok"]')).toBeTruthy()
    expect(para('P000002').dataset.readerHighlightDegraded).toBe('dead')
    await softDeleteHighlight('dead') // 未同步 → 硬删
    await vi.waitFor(() => expect(para('P000002').classList.contains('reader-highlight-degraded')).toBe(false), { timeout: 3000 })
    expect(para('P000002').dataset.readerHighlightDegraded).toBeUndefined()
    expect(document.querySelector('mark[data-reader-highlight="ok"]')).toBeTruthy()
  })

  it('★ NFC 组合字符：渲染 mark 必须覆盖 NFC 偏移对应的原文（protocol §2.2 两套基准不得混用）', async () => {
    // raw = 'a' + U+0301 + 'b'（3 个 UTF-16 单元），NFC = 'áb'（2 单元）
    const raw = 'áb'
    const nfcText = raw.normalize('NFC')
    mountChapter([{ id: 'P000001', text: P1 }, { id: 'P000003', text: raw }])
    await putHighlight(hl({
      id: 'nfc',
      chapterId: 'vol1-01',
      paragraphId: 'P000003',
      textHash: fnv1a36(raw),
      selector: { exact: nfcText, prefix: '', suffix: '', start: { paragraphId: 'P000003', offset: 0 }, end: { paragraphId: 'P000003', offset: 2 } },
    }))
    mountComponent(ReaderHighlightPopover)
    await vi.waitFor(() => expect(document.querySelector('mark[data-reader-highlight="nfc"]')).toBeTruthy(), { timeout: 3000 })
    const mark = document.querySelector<HTMLElement>('mark[data-reader-highlight="nfc"]')!
    // 级别 1 校验通过（NFC 切片一致），渲染也必须落在同一文字上
    expect(mark.textContent!.normalize('NFC')).toBe(nfcText)
    expect(mark.textContent).toBe(nfcText)
  })
})
