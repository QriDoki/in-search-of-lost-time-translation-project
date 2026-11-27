import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import ReaderToast from '../../site/.vitepress/theme/components/ReaderToast.vue'
import { useToasts } from '../../site/.vitepress/theme/composables/useToasts'

vi.mock('vitepress', () => import('./vitepress-mock'))

describe('useToasts + ReaderToast（§7.4 toast 矩阵）', () => {
  const { push, dismiss, clear, toasts } = useToasts()

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    clear()
  })

  afterEach(() => {
    clear()
    vi.useRealTimers()
  })

  it('push 渲染 role=status aria-live=polite', async () => {
    const wrapper = mount(ReaderToast, { attachTo: document.body })
    push('已复制')
    await nextTick()
    const toast = document.querySelector('.reader-toast')!
    expect(toast.getAttribute('role')).toBe('status')
    expect(toast.getAttribute('aria-live')).toBe('polite')
    expect(toast.textContent).toContain('已复制')
    wrapper.unmount()
  })

  it('自动消失计时：默认 4000ms', async () => {
    const wrapper = mount(ReaderToast, { attachTo: document.body })
    push('临时提示')
    await nextTick()
    expect(document.querySelector('.reader-toast')).toBeTruthy()
    await vi.advanceTimersByTimeAsync(3999)
    expect(document.querySelector('.reader-toast')).toBeTruthy()
    await vi.advanceTimersByTimeAsync(2)
    expect(document.querySelector('.reader-toast')).toBeNull()
    wrapper.unmount()
  })

  it('action 槽：执行回调并立即收起；带 action 默认 5s 窗口', async () => {
    const wrapper = mount(ReaderToast, { attachTo: document.body })
    const run = vi.fn()
    push('已删除摘录', { action: { label: '撤销', run } })
    await nextTick()
    const action = document.querySelector<HTMLButtonElement>('.reader-toast__action')!
    expect(action.textContent).toBe('撤销')
    await vi.advanceTimersByTimeAsync(4999)
    expect(document.querySelector('.reader-toast')).toBeTruthy()
    action.click()
    await nextTick()
    expect(run).toHaveBeenCalledTimes(1)
    expect(document.querySelector('.reader-toast')).toBeNull()
    wrapper.unmount()
  })

  it('action 超时未点 → 自动消失且不执行', async () => {
    const run = vi.fn()
    push('已删除摘录', { action: { label: '撤销', run } })
    await vi.advanceTimersByTimeAsync(5001)
    expect(toasts.value).toHaveLength(0)
    expect(run).not.toHaveBeenCalled()
  })

  it('成功/失败两态 class', async () => {
    const wrapper = mount(ReaderToast, { attachTo: document.body })
    push('失败', { kind: 'error' })
    push('成功', { kind: 'success' })
    await nextTick()
    expect(document.querySelector('.reader-toast--error')).toBeTruthy()
    expect(document.querySelector('.reader-toast--success')).toBeTruthy()
    wrapper.unmount()
  })

  it('关闭按钮 dismiss 单条，不影响其他', async () => {
    const wrapper = mount(ReaderToast, { attachTo: document.body })
    push('甲')
    push('乙')
    await nextTick()
    const closes = document.querySelectorAll<HTMLButtonElement>('.reader-toast__close')
    closes[0].click()
    await nextTick()
    expect(document.querySelectorAll('.reader-toast')).toHaveLength(1)
    expect(document.querySelector('.reader-toast')!.textContent).toContain('乙')
    wrapper.unmount()
  })

  it('duration=0 不自动消失；dismiss 可手动清', async () => {
    const id = push('常驻', { duration: 0 })
    await vi.advanceTimersByTimeAsync(60000)
    expect(toasts.value).toHaveLength(1)
    dismiss(id)
    expect(toasts.value).toHaveLength(0)
  })

  it('撤销语义：action 内重建快照（集成示例）', async () => {
    const wrapper = mount(ReaderToast, { attachTo: document.body })
    let restored: string | null = null
    const snapshot = '快照内容'
    push('已删除', { action: { label: '撤销', run: () => { restored = snapshot } } })
    await nextTick()
    document.querySelector<HTMLButtonElement>('.reader-toast__action')!.click()
    expect(restored).toBe('快照内容')
    wrapper.unmount()
  })
})