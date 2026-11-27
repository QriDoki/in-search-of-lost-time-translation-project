/**
 * 对抗性测试 · 摘录面板（interaction §3/§4，protocol §6.1/§7.4）。
 * 聚焦：最近修改排序、正文位置=map 反查（非 P 号猜测）、键盘循环边界、
 * isComposing 全键保护、空列表 Enter、Esc 传播语义、批量书签、批量模式防跳转、
 * 全选仅筛选结果、失效直达事件、菜单外点关闭、已连接状态行。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import ReaderExcerpts from '../../site/.vitepress/theme/components/ReaderExcerpts.vue'
import {
  _resetUserStorage,
  currentDb,
  initUserStorage,
  listBookmarks,
  putBookmark,
  putHighlight,
  fnv1a36,
  type SyncStatus,
} from '../../site/.vitepress/theme/composables/user-storage'
import { resetAnchorCaches } from '../../site/.vitepress/theme/composables/user-storage/anchor'
import { _setAccount, _setEngine } from '../../site/.vitepress/theme/composables/user-storage/vue'
import { useToasts } from '../../site/.vitepress/theme/composables/useToasts'
import { resetVitepressMock } from './vitepress-mock'
import { P1, P2, flush, mountChapter, pressKey, stubClipboard } from './helpers'
import { hl, bm } from '../storage/fixtures'

vi.mock('vitepress', () => import('./vitepress-mock'))

const { clear: clearToasts, toasts } = useToasts()

const SEL1 = { exact: '很久以来', prefix: '', suffix: '，我都是', start: { paragraphId: 'P000001', offset: 0 }, end: { paragraphId: 'P000001', offset: 4 } }
const SEL2 = { exact: '有时候', prefix: '', suffix: '，蜡烛才灭', start: { paragraphId: 'P000002', offset: 0 }, end: { paragraphId: 'P000002', offset: 3 } }
const ACCOUNT = { scope: 'ms-abc', displayName: '用户', email: 'u@example.com' }

describe('对抗 · 摘录面板', () => {
  let wrapper: VueWrapper | null = null

  beforeEach(async () => {
    resetVitepressMock()
    resetAnchorCaches()
    clearToasts()
    mountChapter()
    stubClipboard()
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
  })

  function mountPanel(): VueWrapper {
    wrapper = mount(ReaderExcerpts, { attachTo: document.body })
    return wrapper
  }

  async function seedTwo(): Promise<void> {
    // h1：创建早、修改早；h2：创建晚、修改晚
    await putHighlight(hl({ id: 'h1', chapterId: 'vol1-01', paragraphId: 'P000001', textHash: fnv1a36(P1), selector: SEL1, color: 'yellow', note: '甲', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }))
    await putHighlight(hl({ id: 'h2', chapterId: 'vol1-01', paragraphId: 'P000002', textHash: fnv1a36(P2), selector: SEL2, color: 'green', note: '', createdAt: '2026-02-01T00:00:00.000Z', updatedAt: '2026-02-01T00:00:00.000Z' }))
    await flush()
  }

  function items(): HTMLElement[] {
    return [...document.querySelectorAll<HTMLElement>('.reader-excerpts__item')]
  }

  function sortButton(text: string): HTMLButtonElement {
    return [...document.querySelectorAll<HTMLButtonElement>('.reader-excerpts__sortrow button')].find((b) => b.textContent === text)!
  }

  function searchInput(): HTMLInputElement {
    return document.querySelector<HTMLInputElement>('.reader-excerpts__search')!
  }

  it('排序「最近修改」倒序（interaction §3：可切换最近创建/最近修改）', async () => {
    await seedTwo()
    // 让 h1 成为最近修改（updatedAt 晚于 h2），但创建仍早
    await putHighlight(hl({ id: 'h1', chapterId: 'vol1-01', paragraphId: 'P000001', textHash: fnv1a36(P1), selector: SEL1, note: '甲改', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-03-01T00:00:00.000Z' }))
    mountPanel()
    await flush()
    sortButton('最近修改').click()
    await nextTick()
    expect(items()[0].textContent).toContain('很久以来')
    sortButton('最近创建').click()
    await nextTick()
    expect(items()[0].textContent).toContain('有时候')
    sortButton('正文位置').click()
    await nextTick()
    expect(items()[0].textContent).toContain('很久以来')
  })

  it('★ 正文位置排序 = map 反查段序（protocol §6.1：pageIndex×段序，非 P 号大小）', async () => {
    // 映射表中 P000002 排在 P000001 之前（段序与 P 号不一致）
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('paragraph-ids-')) {
        return { ok: true, json: async () => ({ schemaVersion: 1, version: 'dev', pages: { 'vol1-01': ['P000002', 'P000001'] } }) }
      }
      return { ok: false }
    }))
    await seedTwo()
    mountPanel()
    await flush()
    await vi.waitFor(() => expect(items()[0].textContent).toContain('有时候'), { timeout: 2000 })
    expect(items()[1].textContent).toContain('很久以来')
  })

  it('键盘 ↑↓ 循环选择 + aria-activedescendant 跟随（interaction §3 沿用 ReaderSearch）', async () => {
    await seedTwo()
    mountPanel()
    await flush()
    const input = searchInput()
    input.focus()
    expect(input.getAttribute('aria-activedescendant')).toBe('reader-excerpt-item-0')
    pressKey(input, 'ArrowUp') // 0 → 末项（循环）
    await nextTick()
    expect(items()[1].classList.contains('selected')).toBe(true)
    expect(input.getAttribute('aria-activedescendant')).toBe('reader-excerpt-item-1')
    pressKey(input, 'ArrowDown') // 末项 → 0（循环）
    await nextTick()
    expect(items()[0].classList.contains('selected')).toBe(true)
    expect(input.getAttribute('aria-activedescendant')).toBe('reader-excerpt-item-0')
  })

  it('空列表 Enter 不跳转不崩溃；Esc 空查询不阻断（交给面板关闭）', async () => {
    const w = mountPanel()
    await flush()
    const input = searchInput()
    input.focus()
    pressKey(input, 'Enter')
    expect(w.emitted('navigate')).toBeUndefined()
    const esc = pressKey(input, 'Escape')
    expect(esc.defaultPrevented).toBe(false)
  })

  it('isComposing 期间 ↑↓ 不移动选择（中文输入法保护，interaction §3）', async () => {
    await seedTwo()
    mountPanel()
    await flush()
    const input = searchInput()
    input.focus()
    pressKey(input, 'ArrowDown', { isComposing: true })
    await nextTick()
    expect(items()[0].classList.contains('selected')).toBe(true)
    expect(items()[1].classList.contains('selected')).toBe(false)
  })

  it('批量删除书签：确认对话框数量 + 软删（interaction §3 批量模式）', async () => {
    await putBookmark(bm({ id: 'b1', chapterId: 'vol1-01', paragraphId: 'P000001' }))
    await putBookmark(bm({ id: 'b2', chapterId: 'vol1-01', paragraphId: 'P000002' }))
    // 标记已同步 → 软删墓碑路径
    await currentDb().bookmarks.update('b1', { 'local.baseEtag': 'e' })
    await currentDb().bookmarks.update('b2', { 'local.baseEtag': 'e' })
    await currentDb().cloudState.put({ id: 'b1', eTag: 'e', syncedRev: 1 })
    await currentDb().cloudState.put({ id: 'b2', eTag: 'e', syncedRev: 1 })
    mountPanel()
    await flush()
    ;[...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((b) => b.textContent === '书签')!.click()
    await nextTick()
    ;[...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === '批量管理')!.click()
    await nextTick()
    const checks = [...document.querySelectorAll<HTMLInputElement>('.reader-excerpts__select input')]
    checks[0].click()
    checks[1].click()
    await nextTick()
    const delBtn = [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.includes('删除所选'))!
    expect(delBtn.textContent).toContain('(2)')
    delBtn.click()
    await nextTick()
    const dialog = document.getElementById('reader-batch-title')!.closest('dialog') as HTMLDialogElement
    expect(dialog.textContent).toContain('删除 2 条书签？此操作不可撤销。')
    ;[...dialog.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === '确认删除')!.click()
    await vi.waitFor(async () => {
      const rows = await listBookmarks()
      expect(rows.every((b) => b.deletedAt)).toBe(true)
    }, { timeout: 3000 })
    expect(toasts.value.some((t) => t.message === '已删除 2 条书签')).toBe(true)
  })

  it('批量模式下点击条目主体不跳转（防误触）', async () => {
    await seedTwo()
    const w = mountPanel()
    await flush()
    ;[...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === '批量管理')!.click()
    await nextTick()
    items()[0].querySelector<HTMLElement>('.reader-excerpts__body')!.click()
    await nextTick()
    expect(w.emitted('navigate')).toBeUndefined()
  })

  it('全选仅选当前筛选结果（interaction §3 批量模式）', async () => {
    await seedTwo()
    mountPanel()
    await flush()
    // 颜色筛选：绿
    ;[...document.querySelectorAll<HTMLButtonElement>('.reader-excerpts__filter')].find((b) => b.textContent!.includes('颜色'))!.click()
    await nextTick()
    const greenCheck = [...document.querySelectorAll<HTMLInputElement>('.reader-excerpts__menu input[type="checkbox"]')][1]
    greenCheck.click()
    await nextTick()
    expect(items()).toHaveLength(1)
    ;[...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === '批量管理')!.click()
    await nextTick()
    ;[...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === '全选')!.click()
    await nextTick()
    const delBtn = [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.includes('删除所选'))!
    expect(delBtn.textContent).toContain('(1)')
  })

  it('reader-excerpts:show-degraded → 直达失效筛选（D33/F2-1）', async () => {
    await seedTwo()
    await putHighlight(hl({ id: 'h-dead', chapterId: 'vol1-01', paragraphId: 'P000001', textHash: 'stale', selector: { exact: '不相干文', prefix: '', suffix: '', start: { paragraphId: 'P000001', offset: 0 }, end: { paragraphId: 'P000001', offset: 4 } } }))
    mountPanel()
    await flush()
    expect(items()).toHaveLength(3)
    window.dispatchEvent(new Event('reader-excerpts:show-degraded'))
    await nextTick()
    const checks = [...document.querySelectorAll<HTMLInputElement>('.reader-excerpts__check input')]
    expect(checks[1].checked).toBe(true)
    expect(items()).toHaveLength(1)
    expect(items()[0].textContent).toContain('不相干文')
  })

  it('筛选菜单外点关闭（复用 ReaderAnnotationTypes 范式，interaction §3）', async () => {
    await seedTwo()
    mountPanel()
    await flush()
    ;[...document.querySelectorAll<HTMLButtonElement>('.reader-excerpts__filter')].find((b) => b.textContent!.includes('颜色'))!.click()
    await nextTick()
    expect(document.querySelector('.reader-excerpts__menu')).toBeTruthy()
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' }))
    await nextTick()
    expect(document.querySelector('.reader-excerpts__menu')).toBeNull()
  })

  it('书签列表删除 + 撤销恢复（快照含 label）', async () => {
    await putBookmark(bm({ id: 'b1', chapterId: 'vol1-01', paragraphId: 'P000001', label: '我的标签' }))
    await currentDb().bookmarks.update('b1', { 'local.baseEtag': 'e' })
    await currentDb().cloudState.put({ id: 'b1', eTag: 'e', syncedRev: 1 })
    mountPanel()
    await flush()
    ;[...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((b) => b.textContent === '书签')!.click()
    await nextTick()
    ;[...items()[0].querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === '🗑')!.click()
    await vi.waitFor(async () => expect((await listBookmarks())[0].deletedAt).toBeTruthy(), { timeout: 3000 })
    const toast = toasts.value.find((t) => t.message === '已删除书签')!
    toast.action!.run()
    await vi.waitFor(async () => {
      const b = (await listBookmarks())[0]
      expect(b.deletedAt).toBeNull()
      expect(b.label).toBe('我的标签')
    })
  })

  it('已连接状态行显示同步文案 + 冲突入口（interaction §3 状态行）', async () => {
    await seedTwo()
    _setAccount(ACCOUNT)
    const base: SyncStatus = { state: 'conflict', pending: 0, conflicts: 2, lastSyncAt: null, lastError: null, unknownFiles: false }
    _setEngine({
      getStatus: () => base,
      subscribe: () => () => {},
      trigger: () => {}, syncNow: async () => ({ uploaded: 0, downloaded: 0, merged: 0, conflicts: 0, failed: 0, purged: 0 }),
      pause: () => {}, resume: () => {}, listConflicts: async () => [], resolveConflict: async () => {}, dispose: () => {},
    } as never)
    const w = mountPanel()
    await flush()
    const status = document.querySelector<HTMLButtonElement>('.reader-excerpts__status')!
    expect(status.textContent).toContain('2 条冲突待处理')
    const conflictBtn = document.querySelector<HTMLButtonElement>('.reader-excerpts__conflicts')!
    conflictBtn.click()
    expect(w.emitted('openSync')).toHaveLength(1)
  })
})
