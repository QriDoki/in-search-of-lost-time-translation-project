import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import ReaderSyncPanel from '../../site/.vitepress/theme/components/ReaderSyncPanel.vue'
import {
  _resetUserStorage,
  currentDb,
  initUserStorage,
  listHighlights,
  putHighlight,
} from '../../site/.vitepress/theme/composables/user-storage'
import { useToasts } from '../../site/.vitepress/theme/composables/useToasts'
import { resetVitepressMock } from './vitepress-mock'
import { flush, mountChapter } from './helpers'
import { hl } from '../storage/fixtures'

const mocks = vi.hoisted(() => ({
  auth: {
    login: vi.fn(),
    logout: vi.fn(async () => {}),
    init: vi.fn(async () => {}),
    current: vi.fn(() => null),
    getToken: vi.fn(async () => 'token'),
    onChange: vi.fn(() => () => {}),
  },
  transport: { list: vi.fn(async (_folder: string = '') => [] as { name: string; eTag: string; id: string }[]) },
  deleteScope: vi.fn(async () => {}),
  // 真 ref 在 mock 工厂内创建（工厂先于测试体执行）。
  status: null as unknown as { value: Record<string, unknown> },
  engine: null as unknown as { value: Record<string, ReturnType<typeof vi.fn>> },
  account: null as unknown as { value: { scope: string; displayName: string; email: string } | null },
}))

vi.mock('../../site/.vitepress/theme/composables/user-storage', async (importOriginal) => {
  const { ref } = await import('vue')
  const actual = await importOriginal<Record<string, unknown>>()
  mocks.status = ref({ state: 'disconnected', pending: 0, conflicts: 0, lastSyncAt: null, lastError: null, unknownFiles: false })
  mocks.engine = ref({
    syncNow: vi.fn(async () => ({})),
    pause: vi.fn(),
    resume: vi.fn(),
    trigger: vi.fn(),
    listConflicts: vi.fn(async () => [] as unknown[]),
    resolveConflict: vi.fn(async () => {}),
  })
  mocks.account = ref(null)
  return {
    ...actual,
    getSyncAuth: () => mocks.auth,
    createGraphTransport: () => mocks.transport,
    deleteScopeDatabase: mocks.deleteScope,
    useSyncState: () => ({ status: mocks.status, engine: mocks.engine }),
    useUserStorage: () => {
      const real = (actual.useUserStorage as () => Record<string, unknown>)()
      return { ...real, account: mocks.account }
    },
  }
})

vi.mock('vitepress', () => import('./vitepress-mock'))

const { clear: clearToasts, toasts } = useToasts()
const ACCOUNT = { scope: 'ms-abc123', displayName: '用户', email: 'user@example.com' }

describe('ReaderSyncPanel（§7.4 同步面板矩阵）', () => {
  let wrapper: VueWrapper | null = null

  beforeEach(async () => {
    resetVitepressMock()
    clearToasts()
    mountChapter()
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })))
    localStorage.removeItem('lost-time:sync-explained')
    mocks.account.value = null
    mocks.status.value = { state: 'disconnected', pending: 0, conflicts: 0, lastSyncAt: null, lastError: null, unknownFiles: false }
    mocks.auth.login.mockReset()
    mocks.auth.logout.mockClear()
    mocks.engine.value.syncNow.mockClear()
    mocks.engine.value.pause.mockClear()
    mocks.engine.value.resume.mockClear()
    mocks.engine.value.listConflicts.mockResolvedValue([])
    mocks.transport.list.mockResolvedValue([])
    mocks.deleteScope.mockClear()
    _resetUserStorage()
    await initUserStorage()
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    clearToasts()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  function mountPanel(): VueWrapper {
    wrapper = mount(ReaderSyncPanel, { attachTo: document.body })
    return wrapper
  }

  function dialogByTitle(id: string): HTMLDialogElement {
    return document.getElementById(id)!.closest('dialog') as HTMLDialogElement
  }

  function buttonByText(text: string, root: ParentNode = document): HTMLButtonElement {
    const btn = [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.trim().includes(text))
    if (!btn) throw new Error(`button "${text}" not found`)
    return btn
  }

  it('状态机文案映射（八态 + needs-auth）', async () => {
    mocks.account.value = ACCOUNT
    mountPanel()
    const cases: [string, string][] = [
      ['synced', '已同步'],
      ['syncing', '正在同步…'],
      ['pending', '3 项待同步'],
      ['offline', '离线 · 更改已保存在本机'],
      ['conflict', '2 条冲突待处理'],
      ['error', '同步失败 · 重试'],
      ['paused', '同步已暂停'],
      ['needs-auth', '需要重新登录'],
    ]
    for (const [state, text] of cases) {
      mocks.status.value = { ...mocks.status.value, state, pending: 3, conflicts: 2 }
      await nextTick()
      expect(document.querySelector('.reader-sync-panel__status')!.textContent).toContain(text)
    }
  })

  it('未连接：提示 + 连接入口；无状态行', async () => {
    mountPanel()
    await flush(1)
    expect(document.querySelector('.reader-sync-panel__hint')!.textContent).toContain('未连接 · 数据仅保存在本机')
    expect(buttonByText('连接 OneDrive')).toBeTruthy()
    expect(document.querySelector('.reader-sync-panel__statusrow')).toBeNull()
  })

  it('连接两对话框流程：说明 → login → 预览计数 → 开始同步', async () => {
    await putHighlight(hl({ id: 'h1' }))
    mocks.auth.login.mockImplementation(async () => {
      mocks.account.value = ACCOUNT
      return ACCOUNT
    })
    mocks.transport.list.mockImplementation(async (folder?: string) =>
      folder === 'highlights'
        ? [{ name: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.json', eTag: 'e', id: '1' }, { name: 'unknown.txt', eTag: 'e', id: '2' }]
        : [],
    )
    mountPanel()
    buttonByText('连接 OneDrive').click()
    await nextTick()
    const explain = dialogByTitle('reader-sync-explain-title')
    expect(explain.open).toBe(true)
    expect(explain.textContent).toContain('只能访问这一个文件夹')
    expect(explain.textContent).toContain('Proust Reader')
    buttonByText('前往微软登录', explain).click()
    await vi.waitFor(() => expect(dialogByTitle('reader-sync-preview-title').open).toBe(true), { timeout: 3000 })
    const preview = dialogByTitle('reader-sync-preview-title')
    expect(preview.textContent).toContain('user@example.com')
    expect(preview.textContent).toContain('本机已有 1 条摘录')
    expect(preview.textContent).toContain('云端已有 1 条摘录') // unknown.txt 不计入
    buttonByText('开始同步', preview).click()
    await vi.waitFor(() => expect(mocks.engine.value.syncNow).toHaveBeenCalled())
  })

  it('稍后 = pause（保持已连接）', async () => {
    mocks.auth.login.mockImplementation(async () => {
      mocks.account.value = ACCOUNT
      return ACCOUNT
    })
    mountPanel()
    buttonByText('连接 OneDrive').click()
    await nextTick()
    buttonByText('前往微软登录', dialogByTitle('reader-sync-explain-title')).click()
    await vi.waitFor(() => expect(dialogByTitle('reader-sync-preview-title').open).toBe(true), { timeout: 3000 })
    buttonByText('稍后', dialogByTitle('reader-sync-preview-title')).click()
    expect(mocks.engine.value.pause).toHaveBeenCalled()
    expect(mocks.account.value).toEqual(ACCOUNT)
  })

  it('login 失败（popup-closed）→ toast 未完成登录，回未连接态', async () => {
    mocks.auth.login.mockRejectedValue(Object.assign(new Error('未完成登录'), { code: 'popup-closed' }))
    mountPanel()
    buttonByText('连接 OneDrive').click()
    await nextTick()
    buttonByText('前往微软登录', dialogByTitle('reader-sync-explain-title')).click()
    await vi.waitFor(() => expect(toasts.value.some((t) => t.message === '未完成登录')).toBe(true))
    expect(dialogByTitle('reader-sync-preview-title').open).toBe(false)
    expect(mocks.account.value).toBeNull()
  })

  it('不再提示：勾选后二次连接跳过说明对话框', async () => {
    mocks.auth.login.mockImplementation(async () => {
      mocks.account.value = ACCOUNT
      return ACCOUNT
    })
    mountPanel()
    buttonByText('连接 OneDrive').click()
    await nextTick()
    const explain = dialogByTitle('reader-sync-explain-title')
    explain.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click()
    buttonByText('前往微软登录', explain).click()
    await vi.waitFor(() => expect(dialogByTitle('reader-sync-preview-title').open).toBe(true), { timeout: 3000 })
    expect(localStorage.getItem('lost-time:sync-explained')).toBe('1')
    buttonByText('稍后', dialogByTitle('reader-sync-preview-title')).click()
    mocks.account.value = null
    await nextTick()
    buttonByText('连接 OneDrive').click()
    await vi.waitFor(() => expect(mocks.auth.login).toHaveBeenCalledTimes(2))
    expect(dialogByTitle('reader-sync-explain-title').open).toBe(false)
  })

  it('断开保留本地：logout 调用，摘录仍在，OneDrive 文件说明', async () => {
    await putHighlight(hl({ id: 'h1' }))
    mocks.account.value = ACCOUNT
    mountPanel()
    await flush(1)
    expect(document.querySelector('.reader-sync-panel__email')!.textContent).toContain('user@example.com')
    buttonByText('断开连接').click()
    await nextTick()
    const dialog = dialogByTitle('reader-sync-disconnect-title')
    expect(dialog.open).toBe(true)
    expect(dialog.textContent).toContain('断开不会删除 OneDrive 中已同步的文件')
    buttonByText('断开并保留本机数据', dialog).click()
    await vi.waitFor(() => expect(mocks.auth.logout).toHaveBeenCalled())
    expect(await listHighlights()).toHaveLength(1)
    expect(mocks.deleteScope).not.toHaveBeenCalled()
  })

  it('断开 + 清除缓存勾选 → deleteScopeDatabase(scope)', async () => {
    mocks.account.value = ACCOUNT
    mountPanel()
    await flush(1)
    buttonByText('断开连接').click()
    await nextTick()
    const dialog = dialogByTitle('reader-sync-disconnect-title')
    dialog.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click()
    buttonByText('断开并保留本机数据', dialog).click()
    await vi.waitFor(() => expect(mocks.deleteScope).toHaveBeenCalledWith('ms-abc123'))
  })

  it('切换账号：命名空间说明 + logout 后进入连接流程', async () => {
    mocks.account.value = ACCOUNT
    mocks.auth.login.mockImplementation(async () => ACCOUNT)
    mountPanel()
    await flush(1)
    buttonByText('切换账号').click()
    await nextTick()
    const dialog = dialogByTitle('reader-sync-disconnect-title')
    expect(dialog.textContent).toContain('旧账号数据保留在其命名空间')
    buttonByText('断开并保留本机数据', dialog).click()
    await vi.waitFor(() => expect(mocks.auth.logout).toHaveBeenCalled())
    await vi.waitFor(() => expect(dialogByTitle('reader-sync-explain-title').open).toBe(true))
  })

  it('needs-auth 横幅 + 重新登录', async () => {
    mocks.account.value = ACCOUNT
    mocks.status.value = { ...mocks.status.value, state: 'needs-auth' }
    mocks.auth.login.mockResolvedValue(ACCOUNT)
    mountPanel()
    await flush(1)
    const banner = document.querySelector('.reader-sync-panel__banner')!
    expect(banner.getAttribute('role')).toBe('alert')
    buttonByText('重新登录', banner).click()
    await vi.waitFor(() => expect(mocks.auth.login).toHaveBeenCalled())
  })

  it('暂停/恢复 + 立即同步禁用态 + 错误重试文案', async () => {
    mocks.account.value = ACCOUNT
    mocks.status.value = { ...mocks.status.value, state: 'synced' }
    mountPanel()
    await flush(1)
    buttonByText('暂停').click()
    expect(mocks.engine.value.pause).toHaveBeenCalled()
    mocks.status.value = { ...mocks.status.value, state: 'paused' }
    await nextTick()
    buttonByText('恢复同步').click()
    expect(mocks.engine.value.resume).toHaveBeenCalled()
    mocks.status.value = { ...mocks.status.value, state: 'syncing' }
    await nextTick()
    const syncBtn = buttonByText('同步中…')
    expect(syncBtn.disabled).toBe(true)
    mocks.status.value = { ...mocks.status.value, state: 'error' }
    await nextTick()
    expect(buttonByText('重试')).toBeTruthy()
  })

  it('备份提醒 30 天边界', async () => {
    mocks.account.value = ACCOUNT
    mountPanel()
    await flush(1)
    // 从未备份 → 提醒
    expect(document.querySelector('.reader-sync-panel__backup')!.classList.contains('is-overdue')).toBe(true)
    expect(document.querySelector('.reader-sync-panel__backup')!.textContent).toContain('从未')
    // 29 天前 → 不提醒
    await currentDb().meta.put({ key: 'lastExportAt', value: new Date(Date.now() - 29 * 86400000).toISOString() })
    wrapper!.unmount()
    wrapper = mount(ReaderSyncPanel, { attachTo: document.body })
    await flush(1)
    expect(document.querySelector('.reader-sync-panel__backup')!.classList.contains('is-overdue')).toBe(false)
    // 31 天前 → 提醒 + 立即备份
    await currentDb().meta.put({ key: 'lastExportAt', value: new Date(Date.now() - 31 * 86400000).toISOString() })
    wrapper!.unmount()
    wrapper = mount(ReaderSyncPanel, { attachTo: document.body })
    await flush(1)
    expect(document.querySelector('.reader-sync-panel__backup')!.classList.contains('is-overdue')).toBe(true)
    expect(buttonByText('立即备份')).toBeTruthy()
  })

  it('unknownFiles 提示', async () => {
    mocks.account.value = ACCOUNT
    mocks.status.value = { ...mocks.status.value, unknownFiles: true }
    mountPanel()
    await flush(1)
    expect(document.body.textContent).toContain('云端目录存在本应用之外的文件')
  })

  it('冲突入口 → 卡片列表 → 三裁决 → 处理完 toast', async () => {
    mocks.account.value = ACCOUNT
    mocks.status.value = { ...mocks.status.value, state: 'conflict', conflicts: 2 }
    const c1 = { entity: 'highlight', id: 'h1', current: hl({ id: 'h1', note: 'A' }), copies: [{ deviceId: 'devB', rev: 2, updatedAt: '2026-01-02T00:00:00.000Z', keptAt: '2026-01-02T00:00:00.000Z', snapshot: { note: 'B', types: [], color: 'green', selector: hl().selector, deletedAt: null } }] }
    const c2 = { entity: 'highlight', id: 'h2', current: hl({ id: 'h2', note: 'C' }), copies: [{ deviceId: 'devB', rev: 2, updatedAt: '2026-01-02T00:00:00.000Z', keptAt: '2026-01-02T00:00:00.000Z', snapshot: { note: 'D', types: [], color: 'blue', selector: hl().selector, deletedAt: null } }] }
    mocks.engine.value.listConflicts.mockResolvedValueOnce([c1, c2]).mockResolvedValueOnce([c2]).mockResolvedValue([])
    mountPanel()
    await flush(1)
    buttonByText('查看').click()
    await vi.waitFor(() => expect(document.querySelector('.reader-conflict-card')).toBeTruthy())
    expect(document.querySelector('.reader-conflict-card__header')!.textContent).toContain('(1/2)')
    buttonByText('保留云端版本').click()
    await vi.waitFor(() => expect(mocks.engine.value.resolveConflict).toHaveBeenCalledWith('highlight', 'h1', 0, 'remote'))
    await vi.waitFor(() => expect(document.querySelector('.reader-conflict-card__header')!.textContent).toContain('(2/2)'))
    buttonByText('两者都保留').click()
    await vi.waitFor(() => expect(mocks.engine.value.resolveConflict).toHaveBeenCalledWith('highlight', 'h2', 0, 'both'))
    await vi.waitFor(() => expect(toasts.value.some((t) => t.message === '冲突已处理，正在同步')).toBe(true))
    expect(document.querySelector('.reader-conflict-card')).toBeNull()
  })
})