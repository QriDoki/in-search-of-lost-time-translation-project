import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import ReaderProgressBanner from '../../site/.vitepress/theme/components/ReaderProgressBanner.vue'
import Layout from '../../site/.vitepress/theme/Layout.vue'
import { progress } from '../../site/.vitepress/theme/composables/reader'
import { _resetUserStorage, initUserStorage, type ReadingPosition, type SyncStatus } from '../../site/.vitepress/theme/composables/user-storage'
import { _setAccount, _setEngine } from '../../site/.vitepress/theme/composables/user-storage/vue'
import { pageState, resetVitepressMock, routerGo } from './vitepress-mock'
import { flush, mountChapter } from './helpers'

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

describe('ReaderProgressBanner 组件（§7.4）', () => {
  it('显示另一台设备位置 + 百分比；jump/stay emit；绝不自动跳转', async () => {
    const wrapper = mount(ReaderProgressBanner, { props: { remote: remote() }, attachTo: document.body })
    expect(wrapper.text()).toContain('另一台设备读到了')
    expect(wrapper.text()).toContain('62%')
    expect(wrapper.text()).toContain('第二卷')
    expect(routerGo).not.toHaveBeenCalled()
    await wrapper.find('.reader-progress-banner__jump').trigger('click')
    expect(wrapper.emitted('jump')).toHaveLength(1)
    await wrapper.find('.reader-progress-banner__actions .reader-text-button').trigger('click')
    expect(wrapper.emitted('stay')).toHaveLength(1)
    wrapper.unmount()
  })

  it('开始滚动 → 消失（emit stay）', async () => {
    const wrapper = mount(ReaderProgressBanner, { props: { remote: remote() }, attachTo: document.body })
    window.dispatchEvent(new Event('scroll'))
    expect(wrapper.emitted('stay')).toHaveLength(1)
    wrapper.unmount()
  })
})

describe('Layout 横幅接线（异页且另一设备较新才显示）', () => {
  let wrapper: VueWrapper | null = null

  beforeEach(async () => {
    resetVitepressMock()
    mountChapter()
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })))
    progress.last = null
    progress.pages = {}
    _resetUserStorage()
    await initUserStorage()
    localStorage.setItem('lost-time:device-id', 'local-device')
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    progress.last = null
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  function banner(): HTMLElement | null {
    return document.querySelector('.reader-progress-banner')
  }

  it('异页 + 另一设备较新 → 显示；同页 → 静默', async () => {
    wrapper = mount(Layout, { attachTo: document.body })
    await flush()
    expect(banner()).toBeNull()
    progress.last = remote()
    await nextTick()
    expect(banner()).toBeTruthy()
    // 同页 → 不显示
    progress.last = remote({ pageId: 'vol1-01', updatedAt: '2026-11-27T11:00:00.000Z' })
    await nextTick()
    expect(banner()).toBeNull()
  })

  it('本机设备更新 → 不显示；旧于 prev → 不显示', async () => {
    wrapper = mount(Layout, { attachTo: document.body })
    await flush()
    progress.last = remote({ deviceId: 'local-device' })
    await nextTick()
    expect(banner()).toBeNull()
    progress.last = remote({ updatedAt: '2026-11-27T12:00:00.000Z' })
    await nextTick()
    expect(banner()).toBeTruthy()
    progress.last = remote({ updatedAt: '2026-11-27T09:00:00.000Z' })
    await nextTick()
    expect(banner()).toBeNull()
  })

  it('跳转 → 导航 ?resume=1；留下 → 消失', async () => {
    wrapper = mount(Layout, { attachTo: document.body })
    await flush()
    progress.last = remote()
    await nextTick()
    document.querySelector<HTMLButtonElement>('.reader-progress-banner__jump')!.click()
    await vi.waitFor(() => expect(routerGo).toHaveBeenCalledWith('/chapters/vol2-01.html?resume=1'))
    expect(banner()).toBeNull()
    progress.last = remote({ updatedAt: '2026-11-27T13:00:00.000Z' })
    await nextTick()
    expect(banner()).toBeTruthy()
    ;[...document.querySelectorAll<HTMLButtonElement>('.reader-progress-banner button')].find((b) => b.textContent === '留在这里')!.click()
    await nextTick()
    expect(banner()).toBeNull()
  })

  it('非阅读页不显示', async () => {
    pageState.frontmatter = { contentVersion: 'dev' }
    wrapper = mount(Layout, { attachTo: document.body })
    await flush()
    progress.last = remote()
    await nextTick()
    expect(banner()).toBeNull()
  })

  it('☁︎ 图标八态映射 + 仅已连接显示 + 冲突红点（F1-2）', async () => {
    wrapper = mount(Layout, { attachTo: document.body })
    await flush()
    expect(document.querySelector('.reader-sync-icon')).toBeNull()
    _setAccount({ scope: 'ms-x', displayName: 'u', email: 'u@x.com' })
    let emit: ((s: SyncStatus) => void) | null = null
    const base: SyncStatus = { state: 'synced', pending: 0, conflicts: 0, lastSyncAt: null, lastError: null, unknownFiles: false }
    _setEngine({
      getStatus: () => base,
      subscribe: (cb: (s: SyncStatus) => void) => { emit = cb; return () => {} },
      trigger: () => {}, syncNow: async () => ({ uploaded: 0, downloaded: 0, merged: 0, conflicts: 0, failed: 0, purged: 0 }),
      pause: () => {}, resume: () => {}, listConflicts: async () => [], resolveConflict: async () => {}, dispose: () => {},
    } as never)
    await nextTick()
    const icon = () => document.querySelector<HTMLElement>('.reader-sync-icon')!
    expect(icon().textContent).toContain('☁︎✓')
    const cases: [SyncStatus['state'], string][] = [
      ['syncing', '☁︎'], ['pending', '☁︎·3'], ['offline', '☁︎'], ['conflict', '☁︎⚠'], ['error', '☁︎!'], ['paused', '☁︎⏸'], ['needs-auth', '☁︎!'],
    ]
    for (const [state, glyph] of cases) {
      emit!({ ...base, state, pending: 3, conflicts: state === 'conflict' ? 2 : 0 })
      await nextTick()
      expect(icon().textContent).toContain(glyph)
      expect(icon().getAttribute('aria-label')).toContain('云同步')
    }
    emit!({ ...base, state: 'conflict', conflicts: 2 })
    await nextTick()
    expect(icon().querySelector('.reader-nav__dot')).toBeTruthy()
    expect(icon().classList.contains('is-spinning')).toBe(false)
    emit!({ ...base, state: 'syncing' })
    await nextTick()
    expect(icon().classList.contains('is-spinning')).toBe(true)
    _setAccount(null)
    _setEngine(null)
    await nextTick()
    expect(document.querySelector('.reader-sync-icon')).toBeNull()
  })
})