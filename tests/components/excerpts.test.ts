import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import ReaderExcerpts from '../../site/.vitepress/theme/components/ReaderExcerpts.vue'
import {
  _resetUserStorage,
  initUserStorage,
  listHighlights,
  putBookmark,
  putHighlight,
  fnv1a36,
} from '../../site/.vitepress/theme/composables/user-storage'
import { useToasts } from '../../site/.vitepress/theme/composables/useToasts'
import { resetVitepressMock } from './vitepress-mock'
import { P1, P2, flush, mountChapter, pressKey, stubClipboard } from './helpers'
import { hl, bm } from '../storage/fixtures'

vi.mock('vitepress', () => import('./vitepress-mock'))

const { clear: clearToasts, toasts } = useToasts()

const SEL1 = { exact: '很久以来', prefix: '', suffix: '，我都是', start: { paragraphId: 'P000001', offset: 0 }, end: { paragraphId: 'P000001', offset: 4 } }
const SEL2 = { exact: '有时候', prefix: '', suffix: '，蜡烛才灭', start: { paragraphId: 'P000002', offset: 0 }, end: { paragraphId: 'P000002', offset: 3 } }

describe('ReaderExcerpts（§7.4 面板矩阵）', () => {
  let wrapper: VueWrapper | null = null

  beforeEach(async () => {
    resetVitepressMock()
    clearToasts()
    mountChapter()
    stubClipboard()
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })))
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:test'), revokeObjectURL: vi.fn() })
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
    wrapper = mount(ReaderExcerpts, { attachTo: document.body })
    return wrapper
  }

  async function seedTwo(): Promise<void> {
    await putHighlight(hl({ id: 'h1', chapterId: 'vol1-01', paragraphId: 'P000001', textHash: fnv1a36(P1), selector: SEL1, color: 'yellow', note: '第一条批注', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }))
    await putHighlight(hl({ id: 'h2', chapterId: 'vol1-01', paragraphId: 'P000002', textHash: fnv1a36(P2), selector: SEL2, color: 'green', note: '', createdAt: '2026-02-01T00:00:00.000Z', updatedAt: '2026-02-01T00:00:00.000Z' }))
    await flush()
  }

  function items(): HTMLElement[] {
    return [...document.querySelectorAll<HTMLElement>('.reader-excerpts__item')]
  }

  it('空态文案（摘录 / 书签 tab）', async () => {
    mountPanel()
    await flush()
    expect(document.querySelector('.reader-excerpts__empty')!.textContent).toContain('选中正文文字即可划线摘录')
    ;[...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((b) => b.textContent === '书签')!.click()
    await nextTick()
    expect(document.querySelector('.reader-excerpts__empty')!.textContent).toContain('在选区工具条上点 🔖')
  })

  it('状态行 P0 恒「仅保存在本机」，点击 emit openSync', async () => {
    const w = mountPanel()
    await flush()
    const status = document.querySelector<HTMLButtonElement>('.reader-excerpts__status')!
    expect(status.textContent).toContain('仅保存在本机')
    status.click()
    expect(w.emitted('openSync')).toHaveLength(1)
  })

  it('tab 切换：书签列表显示首句（≤40 字）+ 章节 + 时间', async () => {
    await putBookmark(bm({ id: 'b1', chapterId: 'vol1-01', paragraphId: 'P000001' }))
    mountPanel()
    await flush()
    ;[...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((b) => b.textContent === '书签')!.click()
    await nextTick()
    const item = items()[0]
    expect(item.textContent).toContain('很久以来，我都是早早就躺下了')
    expect(item.textContent).toContain('第一卷')
    expect(item.textContent).toContain('2026-01-01')
  })

  it('书签首句 >40 字截断（F0-5）', async () => {
    const long = '这是一个超过四十个字符的长段落首句，用来验证书签列表的首句截断逻辑是否正确工作，后面还有更多内容。'
    const node = document.createElement('p')
    node.id = 'P000003'
    node.textContent = long
    document.querySelector('.vp-doc')!.append(node)
    await putBookmark(bm({ id: 'b-long', chapterId: 'vol1-01', paragraphId: 'P000003' }))
    mountPanel()
    await flush()
    ;[...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((b) => b.textContent === '书签')!.click()
    await nextTick()
    const item = items().find((i) => i.textContent!.includes('长段落'))!
    const exact = item.querySelector('.reader-excerpts__exact')!.textContent!.replace('🔖 ', '')
    expect(exact.endsWith('…')).toBe(true)
    expect(exact.length).toBeLessThanOrEqual(41) // 40 字 + 省略号
    expect(exact.slice(0, 40)).toBe(long.split(/[。！？]/)[0].slice(0, 40))
  })

  it('排序切换：最近创建倒序', async () => {
    await seedTwo()
    mountPanel()
    await flush()
    expect(items()[0].textContent).toContain('很久以来') // 正文位置：P1 在前
    ;[...document.querySelectorAll<HTMLButtonElement>('.reader-excerpts__sortrow button')].find((b) => b.textContent === '最近创建')!.click()
    await nextTick()
    expect(items()[0].textContent).toContain('有时候') // h2 创建较新
  })

  it('筛选组合：颜色 + 只看有批注', async () => {
    await seedTwo()
    mountPanel()
    await flush()
    expect(items()).toHaveLength(2)
    // 颜色菜单选绿
    ;[...document.querySelectorAll<HTMLButtonElement>('.reader-excerpts__filter')].find((b) => b.textContent!.includes('颜色'))!.click()
    await nextTick()
    const greenCheck = [...document.querySelectorAll<HTMLInputElement>('.reader-excerpts__menu input[type="checkbox"]')][1]
    greenCheck.click()
    await nextTick()
    expect(items()).toHaveLength(1)
    expect(items()[0].textContent).toContain('有时候')
    // 叠加「只看有批注」→ 绿无批注 → 0
    document.querySelector<HTMLInputElement>('.reader-excerpts__check input')!.click()
    await nextTick()
    expect(items()).toHaveLength(0)
    expect(document.querySelector('.reader-excerpts__empty')!.textContent).toContain('没有符合筛选条件')
  })

  it('卷筛选：跨卷记录按卷过滤', async () => {
    await seedTwo()
    await putHighlight(hl({ id: 'h3', chapterId: 'vol2-01', paragraphId: 'P000100', textHash: 'x', selector: { exact: '少女', prefix: '', suffix: '', start: { paragraphId: 'P000100', offset: 0 }, end: { paragraphId: 'P000100', offset: 2 } }, color: 'blue' }))
    mountPanel()
    await flush()
    expect(items()).toHaveLength(3)
    ;[...document.querySelectorAll<HTMLButtonElement>('.reader-excerpts__filter')].find((b) => b.textContent!.includes('全卷'))!.click()
    await nextTick()
    const radios = [...document.querySelectorAll<HTMLInputElement>('.reader-excerpts__menu input[type="radio"]')]
    const vol2 = radios.find((r) => r.value === 'vol2')!
    vol2.click()
    await nextTick()
    expect(items()).toHaveLength(1)
    expect(items()[0].textContent).toContain('少女')
  })

  it('搜索：100ms 防抖 + 命中高亮 + sequence 竞态（旧查询作废）', async () => {
    await seedTwo()
    mountPanel()
    await flush()
    const input = document.querySelector<HTMLInputElement>('.reader-excerpts__search')!
    input.value = '有时候'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    expect(items()).toHaveLength(2) // 防抖未到
    await vi.waitFor(() => expect(items()).toHaveLength(1))
    expect(items()[0].querySelector('mark')!.textContent).toBe('有时候')
    // 竞态：快速连续输入，旧查询作废
    input.value = '很'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.value = '很久'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await vi.waitFor(() => {
      expect(items()).toHaveLength(1)
      expect(items()[0].textContent).toContain('很久以来')
    })
  })

  it('搜索键盘：↑↓ 循环 + Enter 跳转 + Esc 清空（isComposing 保护）', async () => {
    await seedTwo()
    const w = mountPanel()
    await flush()
    const input = document.querySelector<HTMLInputElement>('.reader-excerpts__search')!
    input.focus()
    pressKey(input, 'ArrowDown')
    await nextTick()
    expect(items()[1].classList.contains('selected')).toBe(true)
    pressKey(input, 'Enter')
    expect(w.emitted('navigate')![0]).toEqual(['vol1-01', 'P000002', 'h2'])
    // isComposing 时 Enter 不跳转
    pressKey(input, 'Enter', { isComposing: true })
    expect(w.emitted('navigate')).toHaveLength(1)
    // Esc 清空查询
    input.value = '很久'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await vi.waitFor(() => expect(items()).toHaveLength(1))
    const esc = pressKey(input, 'Escape')
    expect(esc.defaultPrevented).toBe(true)
    await vi.waitFor(() => expect(items()).toHaveLength(2))
  })

  it('条目跳转 emit navigate；🗑 软删除 + 撤销', async () => {
    await seedTwo()
    const w = mountPanel()
    await flush()
    ;[...items()[0].querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === '跳转')!.click()
    expect(w.emitted('navigate')![0]).toEqual(['vol1-01', 'P000001', 'h1'])
    ;[...items()[0].querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === '🗑')!.click()
    await vi.waitFor(async () => {
      const rows = await listHighlights()
      expect(rows.find((r) => r.id === 'h1')).toBeUndefined() // 未同步 → 硬删
    })
    const toast = toasts.value.find((t) => t.message === '已删除摘录')!
    toast.action!.run()
    await vi.waitFor(async () => expect((await listHighlights()).find((r) => r.id === 'h1')).toBeTruthy())
  })

  it('批量删除：确认对话框 + 数量 + 不可撤销提示', async () => {
    await seedTwo()
    mountPanel()
    await flush()
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
    expect(dialog.open).toBe(true)
    expect(dialog.textContent).toContain('删除 2 条摘录？此操作不可撤销。')
    ;[...dialog.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === '确认删除')!.click()
    await vi.waitFor(async () => expect(await listHighlights()).toHaveLength(0))
    expect(toasts.value.some((t) => t.message === '已删除 2 条摘录')).toBe(true)
  })

  it('失效徽标与筛选（当前页降级记录）', async () => {
    await seedTwo()
    await putHighlight(hl({ id: 'h-dead', chapterId: 'vol1-01', paragraphId: 'P000001', textHash: 'stale', selector: { exact: '不相干文', prefix: '', suffix: '', start: { paragraphId: 'P000001', offset: 0 }, end: { paragraphId: 'P000001', offset: 4 } } }))
    mountPanel()
    await flush()
    const dead = items().find((i) => i.textContent!.includes('不相干文'))!
    expect(dead.querySelector('.reader-excerpts__badge')!.textContent).toBe('定位失效')
    const checks = [...document.querySelectorAll<HTMLInputElement>('.reader-excerpts__check input')]
    checks[1].click() // 定位失效
    await nextTick()
    expect(items()).toHaveLength(1)
    expect(items()[0].textContent).toContain('不相干文')
  })

  it('导出 ▾ 菜单：JSON 导出触发下载 + toast', async () => {
    await seedTwo()
    mountPanel()
    await flush()
    ;[...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.includes('导出 ▾'))!.click()
    await nextTick()
    const menu = document.getElementById('reader-data-menu')!
    expect(menu.textContent).toContain('导出 JSON 备份')
    expect(menu.textContent).toContain('导入 JSON')
    ;[...menu.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === '导出 JSON 备份')!.click()
    await vi.waitFor(() => expect(toasts.value.some((t) => t.message.includes('导出成功'))).toBe(true))
  })

  it('批注原位编辑：650ms 防抖保存', async () => {
    await seedTwo()
    mountPanel()
    await flush()
    items()[0].querySelector<HTMLElement>('.reader-excerpts__note')!.click()
    await nextTick()
    const textarea = document.querySelector<HTMLTextAreaElement>('.reader-excerpts__editor')!
    textarea.value = '面板编辑'
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    await vi.waitFor(async () => {
      const rows = await listHighlights()
      expect(rows.find((r) => r.id === 'h1')!.note).toBe('面板编辑')
    }, { timeout: 2000 })
  })
})