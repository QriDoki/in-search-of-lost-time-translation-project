import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import ReaderDataTools from '../../site/.vitepress/theme/components/ReaderDataTools.vue'
import {
  _resetUserStorage,
  initUserStorage,
  putHighlight,
  fnv1a36,
} from '../../site/.vitepress/theme/composables/user-storage'
import { useToasts } from '../../site/.vitepress/theme/composables/useToasts'
import { resetVitepressMock } from './vitepress-mock'
import { P1, mountChapter } from './helpers'
import { hl } from '../storage/fixtures'

const mocks = vi.hoisted(() => ({
  account: null as unknown as { value: { scope: string; displayName: string; email: string } | null },
  auth: { getToken: vi.fn(async () => 'token'), login: vi.fn(), logout: vi.fn(), init: vi.fn(), current: vi.fn(() => null), onChange: vi.fn(() => () => {}) },
  transport: { write: vi.fn(async (_path: string = '', _body?: unknown) => ({ eTag: 'e' })), list: vi.fn(async (_f: string = '') => []), read: vi.fn(), remove: vi.fn() },
}))

vi.mock('../../site/.vitepress/theme/composables/user-storage', async (importOriginal) => {
  const { ref } = await import('vue')
  const actual = await importOriginal<Record<string, unknown>>()
  mocks.account = ref(null)
  return {
    ...actual,
    getSyncAuth: () => mocks.auth,
    createGraphTransport: () => mocks.transport,
    useUserStorage: () => {
      const real = (actual.useUserStorage as () => Record<string, unknown>)()
      return { ...real, account: mocks.account }
    },
  }
})

vi.mock('vitepress', () => import('./vitepress-mock'))

const { clear: clearToasts, toasts } = useToasts()
const SEL = { exact: '很久以来', prefix: '', suffix: '，我都是', start: { paragraphId: 'P000001', offset: 0 }, end: { paragraphId: 'P000001', offset: 4 } }

describe('F2-2 摘录集生成对话框', () => {
  let wrapper: VueWrapper | null = null
  let blobs: Blob[]

  beforeEach(async () => {
    resetVitepressMock()
    clearToasts()
    mountChapter()
    blobs = []
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })))
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn((b: Blob) => { blobs.push(b); return 'blob:test' }),
      revokeObjectURL: vi.fn(),
    })
    mocks.account.value = null
    mocks.transport.write.mockClear()
    _resetUserStorage()
    await initUserStorage()
    await putHighlight(hl({ id: 'h1', chapterId: 'vol1-01', paragraphId: 'P000001', textHash: fnv1a36(P1), selector: SEL, note: '批注甲' }))
    await putHighlight(hl({ id: 'h2', chapterId: 'vol1-01', paragraphId: 'P000001', textHash: fnv1a36(P1), selector: SEL, note: '批注乙', color: 'green' }))
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    clearToasts()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  function genDialog(): HTMLDialogElement {
    return document.getElementById('reader-gen-title')!.closest('dialog') as HTMLDialogElement
  }

  async function openGen(props: Record<string, unknown> = {}): Promise<void> {
    wrapper = mount(ReaderDataTools, { attachTo: document.body, props })
    wrapper.find('.reader-data-tools__trigger').element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
    ;[...document.querySelectorAll<HTMLButtonElement>('#reader-data-menu button')].find((b) => b.textContent!.includes('生成摘录集'))!.click()
    await nextTick()
    expect(genDialog().open).toBe(true)
  }

  function buttonByText(text: string, root: ParentNode): HTMLButtonElement {
    return [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.trim().includes(text))!
  }

  it('Markdown：范围/选项生效 + 每条附永久链接 + 下载 + toast', async () => {
    await openGen()
    const dialog = genDialog()
    dialog.querySelector<HTMLInputElement>('input[value="md"]')!.click()
    await nextTick()
    buttonByText('生成并下载', dialog).click()
    await vi.waitFor(() => expect(toasts.value.some((t) => t.message.includes('摘录集已生成'))).toBe(true), { timeout: 5000 })
    expect(blobs).toHaveLength(1)
    const text = await blobs[0].text()
    expect(text).toContain('很久以来')
    expect(text).toContain('批注甲')
    expect(text).toContain('批注乙')
    expect(text).toContain('[永久链接](')
    expect(text).toContain('#share=')
    expect(text).toContain('第一卷') // 按卷分章
  })

  it('范围「勾选条目」：仅导出选中', async () => {
    await openGen({ selectedIds: ['h1'] })
    const dialog = genDialog()
    dialog.querySelector<HTMLInputElement>('input[value="md"]')!.click()
    dialog.querySelector<HTMLInputElement>('input[value="selected"]')!.click()
    await nextTick()
    buttonByText('生成并下载', dialog).click()
    await vi.waitFor(() => expect(blobs).toHaveLength(1), { timeout: 5000 })
    const text = await blobs[0].text()
    expect(text).toContain('批注甲')
    expect(text).not.toContain('批注乙')
  })

  it('范围「当前筛选结果」', async () => {
    await openGen({ filteredIds: ['h2'] })
    const dialog = genDialog()
    dialog.querySelector<HTMLInputElement>('input[value="md"]')!.click()
    dialog.querySelector<HTMLInputElement>('input[value="filtered"]')!.click()
    await nextTick()
    buttonByText('生成并下载', dialog).click()
    await vi.waitFor(() => expect(blobs).toHaveLength(1), { timeout: 5000 })
    const text = await blobs[0].text()
    expect(text).toContain('批注乙')
    expect(text).not.toContain('批注甲')
  })

  it('选项：不含批注 / 不含链接', async () => {
    await openGen()
    const dialog = genDialog()
    dialog.querySelector<HTMLInputElement>('input[value="md"]')!.click()
    const checks = [...dialog.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')]
    checks[0].click() // 含批注 → off
    checks[1].click() // 含永久链接 → off
    await nextTick()
    buttonByText('生成并下载', dialog).click()
    await vi.waitFor(() => expect(blobs).toHaveLength(1), { timeout: 5000 })
    const text = await blobs[0].text()
    expect(text).not.toContain('批注：')
    expect(text).not.toContain('[永久链接](')
  })

  it('DOCX：懒加载生成 Blob + spinner 态', async () => {
    await openGen()
    const dialog = genDialog()
    const btn = buttonByText('生成并下载', dialog)
    btn.click()
    await nextTick()
    expect(btn.disabled).toBe(true)
    expect(btn.textContent).toContain('生成中…')
    await vi.waitFor(() => expect(toasts.value.some((t) => t.message.includes('摘录集已生成'))).toBe(true), { timeout: 15000 })
    expect(blobs).toHaveLength(1)
    expect(blobs[0].size).toBeGreaterThan(0)
  })

  it('已连接 + DOCX + 勾选 OneDrive → 上传 exports/（encodeURIComponent 文件名）', async () => {
    mocks.account.value = { scope: 'ms-x', displayName: 'u', email: 'u@x.com' }
    await openGen()
    const dialog = genDialog()
    const checks = [...dialog.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')]
    const oneDrive = checks.find((c) => c.parentElement!.textContent!.includes('OneDrive'))!
    oneDrive.click()
    await nextTick()
    buttonByText('生成并下载', dialog).click()
    await vi.waitFor(() => expect(mocks.transport.write).toHaveBeenCalled(), { timeout: 15000 })
    const path = mocks.transport.write.mock.calls[0][0] as string
    expect(path).toBe(`exports/${encodeURIComponent('我的摘录.docx')}`)
  })

  it('空范围 → 提示不下载', async () => {
    await openGen({ filteredIds: [] })
    const dialog = genDialog()
    dialog.querySelector<HTMLInputElement>('input[value="md"]')!.click()
    dialog.querySelector<HTMLInputElement>('input[value="filtered"]')!.click()
    await nextTick()
    buttonByText('生成并下载', dialog).click()
    await vi.waitFor(() => expect(toasts.value.some((t) => t.message.includes('没有可导出的摘录'))).toBe(true))
    expect(blobs).toHaveLength(0)
  })
})