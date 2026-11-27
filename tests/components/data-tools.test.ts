import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import ReaderDataTools from '../../site/.vitepress/theme/components/ReaderDataTools.vue'
import {
  _resetUserStorage,
  currentDb,
  initUserStorage,
  listHighlights,
  putHighlight,
  type ExportEnvelope,
} from '../../site/.vitepress/theme/composables/user-storage'
import { useToasts } from '../../site/.vitepress/theme/composables/useToasts'
import { resetVitepressMock } from './vitepress-mock'
import { flush, mountChapter } from './helpers'
import { hl } from '../storage/fixtures'

vi.mock('vitepress', () => import('./vitepress-mock'))

const { clear: clearToasts, toasts } = useToasts()

function envelope(records: ReturnType<typeof hl>[]): ExportEnvelope {
  return {
    format: 'proust-reader-export',
    formatVersion: 1,
    app: { name: 'proust-reader', buildVersion: 'dev' },
    exportedAt: '2026-11-01T00:00:00.000Z',
    scope: 'anon',
    data: { highlights: records, bookmarks: [], progress: { schemaVersion: 1, last: null, pages: {} }, settings: { schemaVersion: 1, prefs: { fontSize: 20, lineHeight: 1.9, fontFamily: 'sans', theme: 'paper', annotationTypes: [] }, stamps: {} } },
  }
}

async function pickFile(wrapper: VueWrapper, text: string): Promise<void> {
  const input = wrapper.find('input[type="file"]').element as HTMLInputElement
  const file = new File([text], 'backup.json', { type: 'application/json' })
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  input.dispatchEvent(new Event('change', { bubbles: true }))
  await flush()
}

describe('ReaderDataTools（F0-7：JSON 导入导出 UI）', () => {
  let wrapper: VueWrapper | null = null

  beforeEach(async () => {
    resetVitepressMock()
    clearToasts()
    mountChapter()
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })))
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:test'), revokeObjectURL: vi.fn() })
    _resetUserStorage()
    await initUserStorage()
    wrapper = mount(ReaderDataTools, { attachTo: document.body })
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    clearToasts()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  function importDialog(): HTMLDialogElement {
    return document.getElementById('reader-import-title')!.closest('dialog') as HTMLDialogElement
  }

  async function openMenu(): Promise<void> {
    wrapper!.find('.reader-data-tools__trigger').element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
  }

  it('导出 JSON：下载 + toast + meta.lastExportAt', async () => {
    await putHighlight(hl({ id: 'h1' }))
    await openMenu()
    ;[...document.querySelectorAll<HTMLButtonElement>('#reader-data-menu button')].find((b) => b.textContent === '导出 JSON 备份')!.click()
    await vi.waitFor(() => expect(toasts.value.some((t) => t.message.includes('导出成功'))).toBe(true), { timeout: 3000 })
    expect(await currentDb().meta.get('lastExportAt')).toBeTruthy()
  })

  it('★ 非法 JSON / 高 formatVersion → 明确错误 + 零写入', async () => {
    await putHighlight(hl({ id: 'h1' }))
    await pickFile(wrapper!, '{invalid json')
    expect(toasts.value.some((t) => t.kind === 'error' && t.message.includes('非法 JSON'))).toBe(true)
    expect(importDialog().open).toBe(false)
    expect(await listHighlights()).toHaveLength(1)

    await pickFile(wrapper!, JSON.stringify({ ...envelope([]), formatVersion: 2 }))
    expect(toasts.value.some((t) => t.kind === 'error' && t.message.includes('formatVersion'))).toBe(true)
    expect(await listHighlights()).toHaveLength(1)
  })

  it('预览计数准确：新增 / 更新 / 跳过 / 冲突', async () => {
    // skipped：与本机完全相同
    await putHighlight(hl({ id: 'same', note: 'A' }))
    // updated：本机未改（baseSnapshot=原值），远端改
    await putHighlight(hl({ id: 'upd', note: 'A' }))
    const updRow = (await currentDb().highlights.get('upd'))!
    const { local: _l, dirty: _d, ...updCloud } = updRow
    await currentDb().highlights.update('upd', { 'local.baseSnapshot': updCloud })
    // conflict：两侧都改且不同
    await putHighlight(hl({ id: 'conf', note: 'A' }))
    const confRow = (await currentDb().highlights.get('conf'))!
    const { local: _l2, dirty: _d2, ...confCloud } = confRow
    await currentDb().highlights.update('conf', { 'local.baseSnapshot': confCloud })
    await putHighlight(hl({ id: 'conf', note: '本机改' }))

    const env = envelope([
      hl({ id: 'same', note: 'A' }),
      hl({ id: 'upd', note: '远端改' }),
      hl({ id: 'conf', note: '远端改' }),
      hl({ id: 'new1', note: '' }),
    ])
    await pickFile(wrapper!, JSON.stringify(env))
    const dialog = importDialog()
    expect(dialog.open).toBe(true)
    expect(dialog.textContent).toContain('新增 1 · 更新 2 · 跳过 1')
    expect(dialog.textContent).toContain('其中 1 条与本机修改时间冲突')
    // 默认本机胜
    const checked = dialog.querySelector<HTMLInputElement>('input[value="local"]')!
    expect(checked.checked).toBe(true)
  })

  it('默认本机胜：冲突败者仍存副本；结果 toast', async () => {
    await putHighlight(hl({ id: 'conf', note: 'A' }))
    const row = (await currentDb().highlights.get('conf'))!
    const { local: _l, dirty: _d, ...cloud } = row
    await currentDb().highlights.update('conf', { 'local.baseSnapshot': cloud })
    await putHighlight(hl({ id: 'conf', note: '本机改' }))
    await pickFile(wrapper!, JSON.stringify(envelope([hl({ id: 'conf', note: '远端改' })])))
    ;[...importDialog().querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === '导入并合并')!.click()
    await vi.waitFor(() => expect(toasts.value.some((t) => t.message.includes('导入完成'))).toBe(true), { timeout: 3000 })
    const after = (await currentDb().highlights.get('conf'))!
    expect(after.note).toBe('本机改')
    expect(after.conflicts!.length).toBe(1)
    expect(after.conflicts![0].snapshot.note).toBe('远端改')
  })

  it('以导入文件为准：远端胜', async () => {
    await putHighlight(hl({ id: 'conf', note: 'A' }))
    const row = (await currentDb().highlights.get('conf'))!
    const { local: _l, dirty: _d, ...cloud } = row
    await currentDb().highlights.update('conf', { 'local.baseSnapshot': cloud })
    await putHighlight(hl({ id: 'conf', note: '本机改' }))
    await pickFile(wrapper!, JSON.stringify(envelope([hl({ id: 'conf', note: '远端改' })])))
    importDialog().querySelector<HTMLInputElement>('input[value="import"]')!.click()
    await nextTick()
    ;[...importDialog().querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === '导入并合并')!.click()
    await vi.waitFor(async () => expect((await currentDb().highlights.get('conf'))!.note).toBe('远端改'), { timeout: 3000 })
  })

  it('都保留：导入侧另存新记录（新 UUID）', async () => {
    await putHighlight(hl({ id: 'conf', note: 'A' }))
    const row = (await currentDb().highlights.get('conf'))!
    const { local: _l, dirty: _d, ...cloud } = row
    await currentDb().highlights.update('conf', { 'local.baseSnapshot': cloud })
    await putHighlight(hl({ id: 'conf', note: '本机改' }))
    await pickFile(wrapper!, JSON.stringify(envelope([hl({ id: 'conf', note: '远端改' })])))
    importDialog().querySelector<HTMLInputElement>('input[value="both"]')!.click()
    await nextTick()
    ;[...importDialog().querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === '导入并合并')!.click()
    await vi.waitFor(async () => expect(await listHighlights()).toHaveLength(2), { timeout: 3000 })
    const rows = await listHighlights()
    const copy = rows.find((r) => r.id !== 'conf')!
    expect(copy.note).toBe('远端改')
    expect(copy.selector).toEqual(rows.find((r) => r.id === 'conf')!.selector)
  })

  it('★ 导入永不整库覆盖：本地独有记录存活', async () => {
    await putHighlight(hl({ id: 'local-only', note: '独有' }))
    await pickFile(wrapper!, JSON.stringify(envelope([hl({ id: 'imported' })])))
    ;[...importDialog().querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === '导入并合并')!.click()
    await vi.waitFor(async () => expect(await listHighlights()).toHaveLength(2), { timeout: 3000 })
    expect((await currentDb().highlights.get('local-only'))!.note).toBe('独有')
  })

  it('取消导入 → 零写入', async () => {
    await pickFile(wrapper!, JSON.stringify(envelope([hl({ id: 'new1' })])))
    expect(importDialog().open).toBe(true)
    ;[...importDialog().querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === '取消')!.click()
    await flush(1)
    expect(await listHighlights()).toHaveLength(0)
  })
})