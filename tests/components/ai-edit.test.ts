import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import ReaderAIEdit from '../../site/.vitepress/theme/components/ReaderAIEdit.vue'
import { resetVitepressMock } from './vitepress-mock'
import { mountChapter, selectText, stubClipboard } from './helpers'

vi.mock('vitepress', () => import('./vitepress-mock'))

describe('ReaderAIEdit 收编（D20：圆钮退役，事件契约）', () => {
  let wrapper: VueWrapper | null = null
  let clipboard: { writeText: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    resetVitepressMock()
    mountChapter()
    clipboard = stubClipboard()
    wrapper = mount(ReaderAIEdit, { attachTo: document.body })
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    vi.unstubAllGlobals()
  })

  it('浮动圆钮退役：有选区也不出现 .reader-ai-edit', async () => {
    selectText('P000001', 0, 4)
    await nextTick()
    expect(document.querySelector('.reader-ai-edit')).toBeNull()
  })

  it('reader-ai-edit:trigger → copyPrompt 文案不变 + success notice', async () => {
    window.dispatchEvent(new CustomEvent('reader-ai-edit:trigger', { detail: '很久以来' }))
    await vi.waitFor(() => expect(clipboard.writeText).toHaveBeenCalled())
    const prompt = clipboard.writeText.mock.calls[0][0] as string
    expect(prompt).toContain('进行`https://github.com/QriDoki/in-search-of-lost-time-translation-project`项目的`.ai/skills/contribute/SKILL.md`中的工作流')
    expect(prompt).toContain('```\n很久以来\n```')
    await vi.waitFor(() => expect(document.querySelector('.reader-ai-notice')).toBeTruthy())
    expect(document.querySelector('.reader-ai-notice')!.textContent).toContain('AI修订提示词已复制')
  })

  it('Agent 对话框流程保留：notice 内 Agent 按钮打开 dialog', async () => {
    window.dispatchEvent(new CustomEvent('reader-ai-edit:trigger', { detail: '文本' }))
    await vi.waitFor(() => expect(document.querySelector('.reader-ai-agent-action')).toBeTruthy())
    document.querySelector<HTMLButtonElement>('.reader-ai-agent-action')!.click()
    await nextTick()
    const dialog = document.querySelector<HTMLDialogElement>('.reader-ai-dialog')!
    expect(dialog.open).toBe(true)
    expect(dialog.textContent).toContain('用 Agent 修订本书')
    expect(dialog.querySelectorAll('.reader-ai-agents a').length).toBe(7)
  })

  it('剪贴板失败 → error notice 文案不变', async () => {
    clipboard.writeText.mockRejectedValueOnce(new Error('denied'))
    window.dispatchEvent(new CustomEvent('reader-ai-edit:trigger', { detail: '文本' }))
    await vi.waitFor(() => expect(document.querySelector('.reader-ai-notice')).toBeTruthy())
    expect(document.querySelector('.reader-ai-notice')!.textContent).toContain('复制失败，请允许浏览器访问剪切板后重试。')
  })

  it('空 detail 不触发', async () => {
    window.dispatchEvent(new CustomEvent('reader-ai-edit:trigger', { detail: '  ' }))
    await new Promise((r) => setTimeout(r, 30))
    expect(clipboard.writeText).not.toHaveBeenCalled()
  })
})