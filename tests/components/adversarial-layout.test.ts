/**
 * 对抗性测试 · Layout 集成（interaction §1.1/§6.1/§6.2，protocol §6.1/§7.4）。
 * 聚焦：同步状态切换不打断阅读（无全屏 loading/无 toast）、摘录红点（失效事件）、
 * ☁︎ 点击开面板 + Esc 关闭、横幅缺 deviceId 不显示、绝不自动跳转、未知页降级标签。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import Layout from '../../site/.vitepress/theme/Layout.vue'
import ReaderProgressBanner from '../../site/.vitepress/theme/components/ReaderProgressBanner.vue'
import { progress } from '../../site/.vitepress/theme/composables/reader'
import {
  _resetUserStorage,
  initUserStorage,
  type ReadingPosition,
  type SyncStatus,
} from '../../site/.vitepress/theme/composables/user-storage'
import { _setAccount, _setEngine } from '../../site/.vitepress/theme/composables/user-storage/vue'
import { useToasts } from '../../site/.vitepress/theme/composables/useToasts'
import { pageState, resetVitepressMock, routerGo } from './vitepress-mock'
import { flush, mountChapter, pressKey } from './helpers'

vi.mock('vitepress', () => import('./vitepress-mock'))
vi.mock('vitepress/theme', () => ({
  default: {
    Layout: defineComponent({
      name: 'LayoutStub',
      setup(_, { slots }) {
        return () =>
          h('div', [
            slots['layout-top']?.(),
            slots['nav-bar-content-after']?.(),
            slots['layout-bottom']?.(),
          ])
      },
    }),
  },
}))

const { clear: clearToasts, toasts } = useToasts()

const remote = (over: Partial<ReadingPosition> = {}): ReadingPosition => ({
  pageId: 'vol2-01',
  paragraphId: 'P000100',
  paragraphHash: 'h',
  offset: 0.4,
  pageProgress: 0.62,
  maxProgress: 0.62,
  updatedAt: '2026-11-27T10:00:00.000Z',
  deviceId: 'other-device',
  ...over,
})

describe('对抗 · Layout 集成', () => {
  let wrapper: VueWrapper | null = null
  let emitStatus: ((s: SyncStatus) => void) | null = null
  const base: SyncStatus = { state: 'synced', pending: 0, conflicts: 0, lastSyncAt: null, lastError: null, unknownFiles: false }

  beforeEach(async () => {
    resetVitepressMock()
    clearToasts()
    mountChapter()
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })))
    progress.last = null
    progress.pages = {}
    _resetUserStorage()
    await initUserStorage()
    localStorage.setItem('lost-time:device-id', 'local-device')
    emitStatus = null
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    progress.last = null
    progress.pages = {}
    clearToasts()
    _setAccount(null)
    _setEngine(null)
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  function mountLayout(): VueWrapper {
    wrapper = mount(Layout, { attachTo: document.body })
    return wrapper
  }

  function installEngine(): void {
    _setEngine({
      getStatus: () => base,
      subscribe: (cb: (s: SyncStatus) => void) => { emitStatus = cb; return () => {} },
      trigger: () => {}, syncNow: async () => ({ uploaded: 0, downloaded: 0, merged: 0, conflicts: 0, failed: 0, purged: 0 }),
      pause: () => {}, resume: () => {}, listConflicts: async () => [], resolveConflict: async () => {}, dispose: () => {},
    } as never)
  }

  function syncIcon(): HTMLElement | null {
    return document.querySelector('.reader-sync-icon')
  }

  it('★ 同步状态切换不打断阅读：无全屏 loading、无遮罩、无 toast（interaction §6.1）', async () => {
    mountLayout()
    await flush()
    _setAccount({ scope: 'ms-x', displayName: 'u', email: 'u@x.com' })
    installEngine()
    await nextTick()
    for (const state of ['syncing', 'pending', 'offline', 'conflict', 'error', 'paused', 'needs-auth', 'synced'] as const) {
      emitStatus!({ ...base, state, pending: 2, conflicts: state === 'conflict' ? 1 : 0 })
      await nextTick()
      expect(syncIcon()).toBeTruthy() // 图标原位变化
      expect(document.querySelector('dialog[open]')).toBeNull()
      expect(document.querySelector('.reader-backdrop')).toBeNull()
      expect(document.body.getAttribute('aria-busy')).not.toBe('true')
    }
    expect(toasts.value).toHaveLength(0)
    expect(routerGo).not.toHaveBeenCalled()
  })

  it('摘录按钮红点：失效事件驱动，处理后消失（interaction §1.1）', async () => {
    mountLayout()
    await flush()
    const excerptButton = [...document.querySelectorAll<HTMLButtonElement>('.reader-nav__button')].find((b) => b.textContent!.includes('摘录'))!
    expect(excerptButton.querySelector('.reader-nav__dot')).toBeNull()
    window.dispatchEvent(new CustomEvent('reader-excerpts:degraded', { detail: { count: 2 } }))
    await nextTick()
    expect(excerptButton.querySelector('.reader-nav__dot')).toBeTruthy()
    window.dispatchEvent(new CustomEvent('reader-excerpts:degraded', { detail: { count: 0 } }))
    await nextTick()
    expect(excerptButton.querySelector('.reader-nav__dot')).toBeNull()
  })

  it('☁︎ 点击打开云同步面板；Esc 关闭（interaction §1.1/§5.1）', async () => {
    mountLayout()
    await flush()
    _setAccount({ scope: 'ms-x', displayName: 'u', email: 'u@x.com' })
    installEngine()
    await nextTick()
    syncIcon()!.click()
    await nextTick()
    expect(document.querySelector('.reader-sync-panel')).toBeTruthy()
    expect(syncIcon()!.getAttribute('aria-expanded')).toBe('true')
    pressKey(document, 'Escape')
    await nextTick()
    expect(document.querySelector('.reader-sync-panel')).toBeNull()
  })

  it('横幅：缺 deviceId（旧数据）→ 不显示（D12 可选字段缺省规则）', async () => {
    mountLayout()
    await flush()
    progress.last = remote({ deviceId: undefined })
    await nextTick()
    expect(document.querySelector('.reader-progress-banner')).toBeNull()
  })

  it('横幅出现后等待 → 绝不自动跳转（interaction §6.2）', async () => {
    mountLayout()
    await flush()
    progress.last = remote()
    await nextTick()
    expect(document.querySelector('.reader-progress-banner')).toBeTruthy()
    await new Promise((r) => setTimeout(r, 300))
    expect(routerGo).not.toHaveBeenCalled()
    expect(document.querySelector('.reader-progress-banner')).toBeTruthy()
  })

  it('横幅 role=status + aria-live=polite（interaction §12 非阻塞）', async () => {
    mountLayout()
    await flush()
    progress.last = remote()
    await nextTick()
    const banner = document.querySelector('.reader-progress-banner')!
    expect(banner.getAttribute('role')).toBe('status')
    expect(banner.getAttribute('aria-live')).toBe('polite')
  })

  it('未知页 remote → 降级标签 pageId·百分比（不崩溃）', async () => {
    const w = mount(ReaderProgressBanner, { props: { remote: remote({ pageId: 'vol99-99' }) }, attachTo: document.body })
    expect(w.text()).toContain('vol99-99 · 62%')
    w.unmount()
  })

  it('非阅读页：☁︎ 与摘录入口仍可见，但工具条/弹层不挂载（protocol §4.3）', async () => {
    pageState.frontmatter = { contentVersion: 'dev' }
    mountLayout()
    await flush()
    _setAccount({ scope: 'ms-x', displayName: 'u', email: 'u@x.com' })
    installEngine()
    await nextTick()
    expect(syncIcon()).toBeTruthy()
    expect(document.querySelector('.reader-selection-toolbar')).toBeNull()
  })
})
