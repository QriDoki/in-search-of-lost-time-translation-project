/**
 * 对抗性测试 · 导入导出 UI（interaction §10，protocol §5.8/§6.1/§7.4）。
 * 聚焦：导出文件名与内容（无 token/邮箱/local，含墓碑）、导入结果计数与 outbox、
 * 非法 format 零写入、预览头计数、策略每次重置默认本机胜、Esc 取消零写入、导出所选。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import ReaderDataTools from '../../site/.vitepress/theme/components/ReaderDataTools.vue'
import ReaderExcerpts from '../../site/.vitepress/theme/components/ReaderExcerpts.vue'
import {
  _resetUserStorage,
  currentDb,
  initUserStorage,
  listHighlights,
  putHighlight,
  softDeleteHighlight,
  type ExportEnvelope,
} from '../../site/.vitepress/theme/composables/user-storage'
import { useToasts } from '../../site/.vitepress/theme/composables/useToasts'
import { resetVitepressMock } from './vitepress-mock'
import { flush, mountChapter, stubClipboard } from './helpers'
import { hl } from '../storage/fixtures'

vi.mock('vitepress', () => import('./vitepress-mock'))

const { clear: clearToasts, toasts } = useToasts()

function envelope(records: ReturnType<typeof hl>[], bookmarks: unknown[] = []): ExportEnvelope {
  return {
    format: 'proust-reader-export',
    formatVersion: 1,
    app: { name: 'proust-reader', buildVersion: 'dev' },
    exportedAt: '2026-11-01T00:00:00.000Z',
    scope: 'anon',
    data: {
      highlights: records,
      bookmarks: bookmarks as never,
      progress: { schemaVersion: 1, last: null, pages: {} },
      settings: { schemaVersion: 1, prefs: { fontSize: 20, lineHeight: 1.9, fontFamily: 'sans', theme: 'paper', annotationTypes: [] }, stamps: {} },
    },
  }
}

describe('对抗 · 导入导出 UI', () => {
  let wrapper: VueWrapper | null = null
  let capturedBlob: Blob | null = null
  let capturedDownload: string | null = null
  let origCreate: typeof URL.createObjectURL
  let origRevoke: typeof URL.revokeObjectURL

  beforeEach(async () => {
    resetVitepressMock()
    clearToasts()
    mountChapter()
    stubClipboard()
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })))
    capturedBlob = null
    capturedDownload = null
    origCreate = URL.createObjectURL
    origRevoke = URL.revokeObjectURL
    URL.createObjectURL = ((blob: Blob) => {
      capturedBlob = blob
      return 'blob:mock'
    }) as typeof URL.createObjectURL
    URL.revokeObjectURL = (() => {}) as typeof URL.revokeObjectURL
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      capturedDownload = this.download
    })
    _resetUserStorage()
    await initUserStorage()
    wrapper = mount(ReaderDataTools, { attachTo: document.body })
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    clearToasts()
    URL.createObjectURL = origCreate
    URL.revokeObjectURL = origRevoke
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

  async function pickFile(text: string): Promise<void> {
    const input = wrapper!.find('input[type="file"]').element as HTMLInputElement
    const file = new File([text], 'backup.json', { type: 'application/json' })
    Object.defineProperty(input, 'files', { value: [file], configurable: true })
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await flush()
  }

  function menuItem(text: string): HTMLButtonElement {
    return [...document.querySelectorAll<HTMLButtonElement>('#reader-data-menu button')].find((b) => b.textContent === text)!
  }

  function dialogButton(text: string): HTMLButtonElement {
    return [...importDialog().querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === text)!
  }

  it('★ 导出文件名 proust-reader-backup-YYYYMMDD.json；内容无 token/邮箱/local，含墓碑（interaction §10.1）', async () => {
    await putHighlight(hl({ id: 'live', note: '存活批注' }))
    await putHighlight(hl({ id: 'tomb', note: '已删批注' }))
    await currentDb().highlights.update('tomb', { 'local.baseEtag': 'e' })
    await currentDb().cloudState.put({ id: 'tomb', eTag: 'e', syncedRev: 1 })
    await softDeleteHighlight('tomb')
    await openMenu()
    menuItem('导出 JSON 备份').click()
    await vi.waitFor(() => expect(toasts.value.some((t) => t.message.includes('导出成功'))).toBe(true), { timeout: 3000 })
    expect(capturedDownload).toMatch(/^proust-reader-backup-\d{8}\.json$/)
    expect(capturedBlob).toBeTruthy()
    const text = await capturedBlob!.text()
    expect(text.toLowerCase()).not.toContain('token')
    expect(text.toLowerCase()).not.toContain('email')
    expect(text).not.toContain('"local"')
    const env = JSON.parse(text) as ExportEnvelope
    expect(env.format).toBe('proust-reader-export')
    expect(env.formatVersion).toBe(1)
    const tomb = env.data.highlights.find((h) => h.id === 'tomb')!
    expect(tomb.deletedAt).toBeTruthy() // 全量含软删除标记
    expect(env.data.highlights.find((h) => h.id === 'live')!.note).toBe('存活批注')
  })

  it('导入结果 toast 计数与预览一致；每条进 outbox 单条 put（interaction §10.2）', async () => {
    await putHighlight(hl({ id: 'same', note: 'A' }))
    await currentDb().outbox.clear() // 清掉种子 op，只观察导入产生的队列
    const env = envelope([hl({ id: 'same', note: 'A' }), hl({ id: 'new1' }), hl({ id: 'new2' })])
    await pickFile(JSON.stringify(env))
    expect(importDialog().textContent).toContain('新增 2 · 更新 0 · 跳过 1')
    dialogButton('导入并合并').click()
    await vi.waitFor(() => expect(toasts.value.some((t) => t.message === '导入完成：新增 2 · 更新 0')).toBe(true), { timeout: 3000 })
    const ops = await currentDb().outbox.toArray()
    const recordOps = ops.filter((o) => o.entity === 'highlight')
    expect(recordOps.map((o) => o.id).sort()).toEqual(['new1', 'new2'])
    expect(recordOps.every((o) => o.type === 'put')).toBe(true)
    // 文档合并同样进队列（progress/settings 各单条）
    expect(ops.filter((o) => o.entity === 'progress' && o.id === 'doc')).toHaveLength(1)
    expect(ops.filter((o) => o.entity === 'settings' && o.id === 'doc')).toHaveLength(1)
    expect(await listHighlights()).toHaveLength(3)
  })

  it('非法 format / formatVersion 非数字 → 明确错误 + 零写入（protocol §5.8）', async () => {
    await putHighlight(hl({ id: 'h1' }))
    await pickFile(JSON.stringify({ ...envelope([]), format: 'other-app' }))
    expect(toasts.value.some((t) => t.kind === 'error' && t.message.includes('格式标识不符'))).toBe(true)
    expect(importDialog().open).toBe(false)
    await pickFile(JSON.stringify({ ...envelope([hl({ id: 'x' })]), formatVersion: '1' }))
    expect(toasts.value.some((t) => t.kind === 'error' && t.message.includes('formatVersion'))).toBe(true)
    expect(await listHighlights()).toHaveLength(1)
    expect(await currentDb().outbox.count()).toBe(1) // 仅 h1 的 put
  })

  it('预览头：备份日期 + 摘录/书签计数（interaction §10.2 预览对话框）', async () => {
    const env = envelope([hl({ id: 'a' }), hl({ id: 'b' })], [{ id: 'bm1', schemaVersion: 1, chapterId: 'vol1-01', paragraphId: 'P000001', label: '', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', deletedAt: null, rev: 1, deviceId: 'devA' }])
    await pickFile(JSON.stringify(env))
    expect(importDialog().open).toBe(true)
    expect(importDialog().textContent).toContain('备份文件：2026-11-01 · 2 条摘录 · 1 书签')
  })

  it('策略每次文件重置为默认本机胜（interaction §10.2：默认以本机为准）', async () => {
    // 制造冲突记录
    await putHighlight(hl({ id: 'conf', note: 'A' }))
    const row = (await currentDb().highlights.get('conf'))!
    const { local: _l, dirty: _d, ...cloud } = row
    await currentDb().highlights.update('conf', { 'local.baseSnapshot': cloud })
    await putHighlight(hl({ id: 'conf', note: '本机改' }))
    const env = envelope([hl({ id: 'conf', note: '远端改' })])
    await pickFile(JSON.stringify(env))
    importDialog().querySelector<HTMLInputElement>('input[value="import"]')!.click()
    await nextTick()
    expect(importDialog().querySelector<HTMLInputElement>('input[value="import"]')!.checked).toBe(true)
    dialogButton('取消').click()
    await flush(1)
    // 第二次文件 → 默认回到本机胜
    await pickFile(JSON.stringify(env))
    expect(importDialog().querySelector<HTMLInputElement>('input[value="local"]')!.checked).toBe(true)
  })

  it('Esc 取消导入对话框 → 零写入（原生 dialog cancel）', async () => {
    await pickFile(JSON.stringify(envelope([hl({ id: 'new1' })])))
    expect(importDialog().open).toBe(true)
    importDialog().dispatchEvent(new Event('cancel', { bubbles: true, cancelable: true }))
    await flush(1)
    expect(importDialog().open).toBe(false)
    expect(await listHighlights()).toHaveLength(0)
  })

  it('导出所选：仅勾选条目入信封（interaction §3 批量模式导出所选）', async () => {
    wrapper?.unmount()
    await putHighlight(hl({ id: 'h1', chapterId: 'vol1-01', paragraphId: 'P000001', selector: { exact: '很久以来', prefix: '', suffix: '，我都是', start: { paragraphId: 'P000001', offset: 0 }, end: { paragraphId: 'P000001', offset: 4 } } }))
    await putHighlight(hl({ id: 'h2', chapterId: 'vol1-01', paragraphId: 'P000001', selector: { exact: '我都是', prefix: '很久以来，', suffix: '早早就', start: { paragraphId: 'P000001', offset: 5 }, end: { paragraphId: 'P000001', offset: 8 } } }))
    wrapper = mount(ReaderExcerpts, { attachTo: document.body })
    await flush()
    ;[...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === '批量管理')!.click()
    await nextTick()
    const checks = [...document.querySelectorAll<HTMLInputElement>('.reader-excerpts__select input')]
    checks[0].click() // 仅 h1
    await nextTick()
    ;[...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === '导出所选')!.click()
    await vi.waitFor(() => expect(capturedBlob).toBeTruthy(), { timeout: 3000 })
    const env = JSON.parse(await capturedBlob!.text()) as ExportEnvelope
    expect(env.data.highlights.map((h) => h.id)).toEqual(['h1'])
    expect(toasts.value.some((t) => t.message === '已导出所选 1 条。')).toBe(true)
  })
})
