/**
 * 对抗性测试 · 摘录弹层（interaction §2.3，protocol §6.1/§6.3/§7.4）。
 * 聚焦：失焦保存、Esc 放弃与 blur 竞态、撤销快照保真、过期撤销不复活、
 * 多撤销快照独立、「未同步」小字条件（仅同步失败）、冲突待处理小字、
 * 与书内注解弹层真实互斥（双向）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import ReaderHighlightPopover from '../../site/.vitepress/theme/components/ReaderHighlightPopover.vue'
import ReaderAnnotations from '../../site/.vitepress/theme/components/ReaderAnnotations.vue'
import {
  _resetUserStorage,
  currentDb,
  getHighlight,
  initUserStorage,
  putHighlight,
  fnv1a36,
  type SyncStatus,
} from '../../site/.vitepress/theme/composables/user-storage'
import { _setAccount, _setEngine } from '../../site/.vitepress/theme/composables/user-storage/vue'
import { useToasts } from '../../site/.vitepress/theme/composables/useToasts'
import { resetVitepressMock } from './vitepress-mock'
import { P1, mountChapter, para, pressKey, stubClipboard, stubMatchMedia } from './helpers'
import { hl } from '../storage/fixtures'

vi.mock('vitepress', () => import('./vitepress-mock'))

const { clear: clearToasts, toasts, runAction } = useToasts()

const SEL = { exact: '很久以来', prefix: '', suffix: '，我都是', start: { paragraphId: 'P000001', offset: 0 }, end: { paragraphId: 'P000001', offset: 4 } }
const ACCOUNT = { scope: 'ms-abc', displayName: '用户', email: 'u@example.com' }

describe('对抗 · 摘录弹层', () => {
  let wrapper: VueWrapper | null = null
  let annotations: VueWrapper | null = null
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
    annotations?.unmount()
    annotations = null
    clearToasts()
    _setAccount(null)
    _setEngine(null)
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  function mountPopover(): VueWrapper {
    wrapper = mount(ReaderHighlightPopover, { attachTo: document.body })
    return wrapper
  }

  async function seed(over = {}): Promise<string> {
    const h = hl({ id: 'h1', chapterId: 'vol1-01', paragraphId: 'P000001', textHash: fnv1a36(P1), selector: SEL, ...over })
    await putHighlight(h)
    return h.id
  }

  async function markSynced(id = 'h1'): Promise<void> {
    await currentDb().highlights.update(id, { 'local.baseEtag': 'etag-1' })
    await currentDb().cloudState.put({ id, eTag: 'etag-1', syncedRev: 1 })
  }

  async function waitMarks(): Promise<void> {
    await vi.waitFor(() => expect(document.querySelector('mark[data-reader-highlight]')).toBeTruthy(), { timeout: 3000 })
  }

  function popover(): HTMLElement | null {
    return document.getElementById('reader-highlight-popover')
  }

  async function openPopover(): Promise<void> {
    await waitMarks()
    document.querySelector<HTMLElement>('mark[data-reader-highlight]')!.click()
    await vi.waitFor(() => expect(popover()).toBeTruthy())
  }

  function buttonByText(text: string, root: ParentNode = popover()!): HTMLButtonElement {
    const btn = [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.includes(text))
    if (!btn) throw new Error(`button "${text}" not found`)
    return btn
  }

  async function startEdit(): Promise<HTMLTextAreaElement> {
    buttonByText('编辑批注').click()
    await nextTick()
    return popover()!.querySelector<HTMLTextAreaElement>('textarea')!
  }

  it('失焦保存（interaction §2.3：失焦或 Cmd/Ctrl+Enter 保存）', async () => {
    mountPopover()
    await seed()
    await openPopover()
    const textarea = await startEdit()
    textarea.value = '失焦保存的批注'
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    // 不等 650ms 防抖，直接失焦
    textarea.dispatchEvent(new FocusEvent('blur'))
    await vi.waitFor(async () => expect((await getHighlight('h1'))!.note).toBe('失焦保存的批注'), { timeout: 2000 })
    await vi.waitFor(() => expect(popover()!.querySelector('textarea')).toBeNull())
    expect((await getHighlight('h1'))!.rev).toBe(2)
  })

  it('Esc 放弃后立即失焦 → 仍不保存（discarding 竞态）', async () => {
    mountPopover()
    await seed({ note: '原批注' })
    await openPopover()
    const textarea = await startEdit()
    textarea.value = '不应保存'
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    pressKey(textarea, 'Escape')
    textarea.dispatchEvent(new FocusEvent('blur'))
    await new Promise((r) => setTimeout(r, 750))
    expect((await getHighlight('h1'))!.note).toBe('原批注')
    expect(popover()).toBeTruthy()
  })

  it('Cmd+Enter 保存后再编辑 → 草稿为已保存值（不残留旧草稿）', async () => {
    mountPopover()
    await seed()
    await openPopover()
    let textarea = await startEdit()
    textarea.value = '第一次'
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    pressKey(textarea, 'Enter', { ctrlKey: true })
    await vi.waitFor(async () => expect((await getHighlight('h1'))!.note).toBe('第一次'))
    await vi.waitFor(() => expect(popover()!.querySelector('textarea')).toBeNull())
    textarea = await startEdit()
    expect(textarea.value).toBe('第一次')
  })

  it('★ 撤销快照保真：note/color/selector 全量恢复（interaction §2.3 撤销=清除 deletedAt）', async () => {
    mountPopover()
    await seed({ note: '私密批注', color: 'green' })
    await markSynced()
    await openPopover()
    buttonByText('删除').click()
    await vi.waitFor(async () => expect((await getHighlight('h1'))!.deletedAt).toBeTruthy())
    const toast = toasts.value.find((t) => t.message === '已删除摘录')!
    toast.action!.run()
    await vi.waitFor(async () => {
      const h = await getHighlight('h1')
      expect(h!.deletedAt).toBeNull()
      expect(h!.note).toBe('私密批注')
      expect(h!.color).toBe('green')
      expect(h!.selector.exact).toBe('很久以来')
      expect(h!.rev).toBe(2)
    })
  })

  it('★ 撤销窗口过期后 runAction 不复活（5s 边界，protocol §7.4）', async () => {
    mountPopover()
    await seed()
    await markSynced()
    await openPopover()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    buttonByText('删除').click()
    await vi.waitFor(async () => expect((await getHighlight('h1'))!.deletedAt).toBeTruthy())
    const toast = toasts.value.find((t) => t.message === '已删除摘录')!
    const staleId = toast.id
    await vi.advanceTimersByTimeAsync(5001)
    expect(toasts.value.find((t) => t.id === staleId)).toBeUndefined()
    runAction(staleId) // 过期撤销：不得产生任何写入
    // IDB 走 setImmediate（未被 fake），直接断言库内状态
    expect((await getHighlight('h1'))!.deletedAt).toBeTruthy()
    expect(await currentDb().outbox.where('[entity+id]').equals(['highlight', 'h1']).count()).toBe(1)
  })

  it('★ 两条删除 toast 快照独立：撤销乙只恢复乙（interaction §0.4 可撤销）', async () => {
    mountPopover()
    await seed({ id: 'ha', note: '甲批注' })
    await putHighlight(hl({ id: 'hb', chapterId: 'vol1-01', paragraphId: 'P000001', textHash: fnv1a36(P1), color: 'blue', selector: { exact: '我都是', prefix: '很久以来，', suffix: '早早就', start: { paragraphId: 'P000001', offset: 5 }, end: { paragraphId: 'P000001', offset: 8 } }, note: '乙批注' }))
    await vi.waitFor(() => expect(document.querySelectorAll('mark[data-reader-highlight]').length).toBeGreaterThanOrEqual(2), { timeout: 3000 })
    // 删除甲
    window.dispatchEvent(new CustomEvent('reader-highlight:open', { detail: { id: 'ha' } }))
    await vi.waitFor(() => expect(popover()).toBeTruthy())
    buttonByText('删除').click()
    await vi.waitFor(async () => expect(await getHighlight('ha')).toBeNull())
    // 删除乙
    window.dispatchEvent(new CustomEvent('reader-highlight:open', { detail: { id: 'hb' } }))
    await vi.waitFor(() => expect(popover()).toBeTruthy())
    buttonByText('删除').click()
    await vi.waitFor(async () => expect(await getHighlight('hb')).toBeNull())
    const deletes = toasts.value.filter((t) => t.message === '已删除摘录')
    expect(deletes).toHaveLength(2)
    // 撤销第二条（乙）
    deletes[1].action!.run()
    await vi.waitFor(async () => expect(await getHighlight('hb')).toBeTruthy())
    expect(await getHighlight('ha')).toBeNull()
    expect((await getHighlight('hb'))!.note).toBe('乙批注')
    // 撤销第一条（甲）
    deletes[0].action!.run()
    await vi.waitFor(async () => expect(await getHighlight('ha')).toBeTruthy())
    expect((await getHighlight('ha'))!.note).toBe('甲批注')
  })

  it('★ 「未同步」小字仅在同步失败时显示（interaction §2.3：健康待同步队列不显示同步细节）', async () => {
    mountPopover()
    await seed()
    _setAccount(ACCOUNT)
    const base: SyncStatus = { state: 'pending', pending: 1, conflicts: 0, lastSyncAt: null, lastError: null, unknownFiles: false }
    _setEngine({
      getStatus: () => base,
      subscribe: () => () => {},
      trigger: () => {}, syncNow: async () => ({ uploaded: 0, downloaded: 0, merged: 0, conflicts: 0, failed: 0, purged: 0 }),
      pause: () => {}, resume: () => {}, listConflicts: async () => [], resolveConflict: async () => {}, dispose: () => {},
    } as never)
    await openPopover()
    // pending 是健康队列状态（非失败）：弹层内不显示同步状态细节
    const unsynced = [...popover()!.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.includes('未同步'))
    expect(unsynced).toBeUndefined()
  })

  it('冲突待处理小字 → 链到 sync 面板；正文按本机版本渲染（interaction §7）', async () => {
    mountPopover()
    await seed({
      color: 'yellow',
      note: '本机批注',
      conflicts: [{ deviceId: 'devB', rev: 2, updatedAt: '2026-01-02T00:00:00.000Z', keptAt: '2026-01-02T00:00:00.000Z', snapshot: { note: '云端批注', types: [], color: 'green', selector: SEL, deletedAt: null } }],
    })
    await waitMarks()
    // 正文渲染本机颜色（黄），不被云端副本（绿）覆盖
    expect(document.querySelector('mark.reader-highlight--yellow')).toBeTruthy()
    expect(document.querySelector('mark.reader-highlight--green')).toBeNull()
    window.dispatchEvent(new CustomEvent('reader-highlight:open', { detail: { id: 'h1' } }))
    await vi.waitFor(() => expect(popover()).toBeTruthy())
    const panels: unknown[] = []
    window.addEventListener('reader-panel:open', (e) => panels.push((e as CustomEvent).detail))
    buttonByText('冲突待处理').click()
    expect(panels).toEqual(['sync'])
  })

  it('复制链接不含批注与凭证（interaction §8.1）', async () => {
    mountPopover()
    await seed({ note: '绝密批注内容' })
    await openPopover()
    buttonByText('复制链接').click()
    await vi.waitFor(() => expect(clipboard.writeText).toHaveBeenCalled())
    const url = clipboard.writeText.mock.calls[0][0] as string
    expect(url).not.toContain('绝密批注内容')
    expect(url).not.toContain('token')
    expect(url).toContain('#share=')
  })
})

describe('对抗 · 弹层互斥（真实 ReaderAnnotations + ReaderHighlightPopover，protocol §6.3）', () => {
  let wrapper: VueWrapper | null = null
  let annotations: VueWrapper | null = null

  beforeEach(async () => {
    resetVitepressMock()
    clearToasts()
    mountChapter([
      { id: 'P000001', text: P1, legacy: 'p-000001' },
      { id: 'P000002', text: '有时候，蜡烛才灭，我的眼皮就随即阖上。', legacy: 'p-000002' },
      { id: 'P000003', text: '那是很久以前的事了，那时贡布雷的教堂。', legacy: 'p-000003' },
    ])
    // 书内注解触发器（第三段，避免污染 P1 指纹）
    const span = document.createElement('span')
    span.className = 'reader-annotation'
    span.innerHTML = '<button type="button" class="reader-annotation__trigger" data-reader-note="书内注解内容" aria-label="注解">1</button>'
    para('P000003').append(span)
    stubMatchMedia((q) => q.includes('any-hover'))
    stubClipboard()
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })))
    _resetUserStorage()
    await initUserStorage()
    await putHighlight(hl({ id: 'h1', chapterId: 'vol1-01', paragraphId: 'P000001', textHash: fnv1a36(P1), selector: SEL }))
    annotations = mount(ReaderAnnotations, { attachTo: document.body })
    wrapper = mount(ReaderHighlightPopover, { attachTo: document.body })
    await vi.waitFor(() => expect(document.querySelector('mark[data-reader-highlight]')).toBeTruthy(), { timeout: 3000 })
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    annotations?.unmount()
    annotations = null
    clearToasts()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  function highlightPopover(): HTMLElement | null {
    return document.getElementById('reader-highlight-popover')
  }
  function annotationPopover(): HTMLElement | null {
    return document.getElementById('reader-annotation-popover')
  }
  function trigger(): HTMLButtonElement {
    return document.querySelector<HTMLButtonElement>('.reader-annotation__trigger')!
  }

  it('打开书内注解 → 关闭摘录弹层（互斥）', async () => {
    document.querySelector<HTMLElement>('mark[data-reader-highlight]')!.click()
    await vi.waitFor(() => expect(highlightPopover()).toBeTruthy())
    trigger().click()
    await vi.waitFor(() => expect(annotationPopover()).toBeTruthy())
    expect(highlightPopover()).toBeNull()
  })

  it('打开摘录弹层 → 关闭书内注解（互斥反向）', async () => {
    trigger().click()
    await vi.waitFor(() => expect(annotationPopover()).toBeTruthy())
    document.querySelector<HTMLElement>('mark[data-reader-highlight]')!.click()
    await vi.waitFor(() => expect(highlightPopover()).toBeTruthy())
    expect(annotationPopover()).toBeNull()
  })

  it('书内注解 Esc 关闭并归还焦点到触发器（interaction §12）', async () => {
    trigger().click()
    await vi.waitFor(() => expect(annotationPopover()).toBeTruthy())
    pressKey(document, 'Escape')
    await vi.waitFor(() => expect(annotationPopover()).toBeNull())
    expect(document.activeElement).toBe(trigger())
    expect(trigger().getAttribute('aria-expanded')).toBe('false')
  })
})
