/**
 * 对抗性测试 · 云同步面板（interaction §5/§10.4/§11，protocol §6.1/§7.4）。
 * 聚焦：权限措辞与 AppFolder scope 一致（负面断言）、备份提醒恰好 30 天边界、
 * 断开默认项、预览 Esc=稍后、云端清单不可用诚实文案、登录中禁用、降级提示、
 * 多副本冲突 1/N 计数语义。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import ReaderSyncPanel from '../../site/.vitepress/theme/components/ReaderSyncPanel.vue'
import { _resetUserStorage, currentDb, initUserStorage } from '../../site/.vitepress/theme/composables/user-storage'
import { _setMode } from '../../site/.vitepress/theme/composables/user-storage/vue'
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

describe('对抗 · 云同步面板', () => {
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
    mocks.engine.value.resolveConflict.mockClear()
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
    vi.useRealTimers()
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

  it('★ 权限说明与 AppFolder scope 一致：不得出现「访问全部文件」类表述（interaction §5.2）', async () => {
    mountPanel()
    buttonByText('连接 OneDrive').click()
    await nextTick()
    const explain = dialogByTitle('reader-sync-explain-title')
    expect(explain.open).toBe(true)
    const text = explain.textContent!
    expect(text).toContain('只能访问这一个文件夹')
    expect(text).toContain('无法读取你的其他文件')
    expect(text).toContain('应用/Proust Reader')
    expect(text).not.toContain('全部文件')
    expect(text).not.toContain('所有文件')
    expect(text).toContain('不登录也能正常阅读和摘录')
    expect(text).toContain('可随时断开并导出全部数据')
  })

  it('★ 备份提醒恰好 30 天边界：=30d 不提醒，>30d 提醒（interaction §10.4：>30 天）', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const now = Date.now()
    mocks.account.value = ACCOUNT
    // 恰好 30 天 → 不提醒（严格大于）
    await currentDb().meta.put({ key: 'lastExportAt', value: new Date(now - 30 * 86400000).toISOString() })
    mountPanel()
    await flush(1)
    expect(document.querySelector('.reader-sync-panel__backup')!.classList.contains('is-overdue')).toBe(false)
    wrapper!.unmount()
    // 30 天 + 1ms → 提醒
    await currentDb().meta.put({ key: 'lastExportAt', value: new Date(now - 30 * 86400000 - 1).toISOString() })
    wrapper = mount(ReaderSyncPanel, { attachTo: document.body })
    await flush(1)
    expect(document.querySelector('.reader-sync-panel__backup')!.classList.contains('is-overdue')).toBe(true)
    expect(buttonByText('立即备份')).toBeTruthy()
  })

  it('断开确认：默认「断开并保留本机数据」，清除缓存默认不勾选（interaction §5.3）', async () => {
    mocks.account.value = ACCOUNT
    mountPanel()
    await flush(1)
    buttonByText('断开连接').click()
    await nextTick()
    const dialog = dialogByTitle('reader-sync-disconnect-title')
    expect(dialog.open).toBe(true)
    expect(dialog.textContent).toContain('断开不会删除 OneDrive 中已同步的文件')
    const checkbox = dialog.querySelector<HTMLInputElement>('input[type="checkbox"]')!
    expect(checkbox.checked).toBe(false)
    expect(buttonByText('断开并保留本机数据', dialog)).toBeTruthy()
    // 取消 → 不 logout
    buttonByText('取消', dialog).click()
    await flush(1)
    expect(mocks.auth.logout).not.toHaveBeenCalled()
    expect(mocks.account.value).toEqual(ACCOUNT)
  })

  it('切换账号对话框标题与命名空间说明（interaction §5.3）', async () => {
    mocks.account.value = ACCOUNT
    mountPanel()
    await flush(1)
    buttonByText('切换账号').click()
    await nextTick()
    const dialog = dialogByTitle('reader-sync-disconnect-title')
    expect(dialog.querySelector('h2')!.textContent).toBe('切换账号')
    expect(dialog.textContent).toContain('切换后界面只显示新账号空间')
    expect(dialog.textContent).toContain('旧账号数据保留在其命名空间，切回即恢复')
  })

  it('预览对话框 Esc = 稍后（pause，保持已连接）（interaction §5.2）', async () => {
    mocks.auth.login.mockImplementation(async () => {
      mocks.account.value = ACCOUNT
      return ACCOUNT
    })
    mountPanel()
    buttonByText('连接 OneDrive').click()
    await nextTick()
    buttonByText('前往微软登录', dialogByTitle('reader-sync-explain-title')).click()
    await vi.waitFor(() => expect(dialogByTitle('reader-sync-preview-title').open).toBe(true), { timeout: 3000 })
    dialogByTitle('reader-sync-preview-title').dispatchEvent(new Event('cancel', { bubbles: true, cancelable: true }))
    await flush(1)
    expect(mocks.engine.value.pause).toHaveBeenCalled()
    expect(mocks.account.value).toEqual(ACCOUNT)
    expect(dialogByTitle('reader-sync-preview-title').open).toBe(false)
  })

  it('云端清单不可用 → 诚实文案，不假装计数（interaction §0.5 状态诚实）', async () => {
    mocks.auth.login.mockImplementation(async () => {
      mocks.account.value = ACCOUNT
      return ACCOUNT
    })
    mocks.transport.list.mockRejectedValue(new Error('network'))
    mountPanel()
    buttonByText('连接 OneDrive').click()
    await nextTick()
    buttonByText('前往微软登录', dialogByTitle('reader-sync-explain-title')).click()
    await vi.waitFor(() => expect(dialogByTitle('reader-sync-preview-title').open).toBe(true), { timeout: 3000 })
    const preview = dialogByTitle('reader-sync-preview-title')
    expect(preview.textContent).toContain('云端清单暂不可用')
    expect(preview.textContent).not.toContain('云端已有 0 条')
  })

  it('登录中按钮禁用 + 文案「登录中…」（防重复触发）', async () => {
    let resolveLogin: (v: unknown) => void = () => {}
    mocks.auth.login.mockImplementation(() => new Promise((resolve) => { resolveLogin = resolve }))
    mountPanel()
    const connect = buttonByText('连接 OneDrive')
    connect.click()
    await nextTick()
    buttonByText('前往微软登录', dialogByTitle('reader-sync-explain-title')).click()
    await nextTick()
    const pending = buttonByText('登录中…')
    expect(pending.disabled).toBe(true)
    resolveLogin(ACCOUNT)
    await vi.waitFor(() => expect(dialogByTitle('reader-sync-preview-title').open).toBe(true), { timeout: 3000 })
  })

  it('IDB 降级（localStorage 模式）→ 常驻提示 + 导出按钮（interaction §11）', async () => {
    _setMode('localStorage')
    mountPanel()
    await flush(1)
    const notice = document.querySelector('.reader-sync-panel__notice')!
    expect(notice.textContent).toContain('当前浏览器无法持久保存，请及时导出')
    expect(buttonByText('导出', notice)).toBeTruthy()
    _setMode('idb')
  })

  it('★ 多副本冲突 1/N：分母应为待裁决总数（interaction §7：逐条处理，1/2 语义）', async () => {
    mocks.account.value = ACCOUNT
    mocks.status.value = { ...mocks.status.value, state: 'conflict', conflicts: 1 }
    const copy = (note: string) => ({ deviceId: 'devB', rev: 2, updatedAt: '2026-01-02T00:00:00.000Z', keptAt: '2026-01-02T00:00:00.000Z', snapshot: { note, types: [], color: 'green', selector: hl().selector, deletedAt: null } })
    const oneRecordTwoCopies = { entity: 'highlight', id: 'h1', current: hl({ id: 'h1', note: '本机' }), copies: [copy('云端甲'), copy('云端乙')] }
    mocks.engine.value.listConflicts.mockResolvedValue([oneRecordTwoCopies])
    mountPanel()
    await flush(1)
    buttonByText('查看').click()
    await vi.waitFor(() => expect(document.querySelector('.reader-conflict-card')).toBeTruthy())
    // 两条待裁决副本 → 应显示 1/2（而非 1/1 后又变 2/2）
    expect(document.querySelector('.reader-conflict-card__header')!.textContent).toContain('(1/2)')
  })
})
