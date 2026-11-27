/**
 * 全局轻提示单例（protocol §4.2 / interaction §6）：push/dismiss + 撤销 action 槽。
 * 泛化自 ReaderAIEdit 的 reader-ai-notice（role=status + aria-live=polite + 成功/失败两态）。
 * 模块级单例：任何组件 push，ReaderToast 统一渲染。
 */
import { ref, type Ref } from 'vue'

export interface ToastAction {
  label: string
  run: () => void | Promise<void>
}

export interface ToastOptions {
  kind?: 'success' | 'error' | 'info'
  action?: ToastAction
  /** 自动消失毫秒；缺省：带 action 5000（撤销窗口），否则 4000；0 = 不自动消失。 */
  duration?: number
}

export interface ToastItem {
  id: number
  message: string
  kind: 'success' | 'error' | 'info'
  action?: ToastAction
  duration: number
}

const toasts = ref<ToastItem[]>([])
const timers = new Map<number, ReturnType<typeof setTimeout>>()
let nextId = 1

export function useToasts(): {
  toasts: Ref<ToastItem[]>
  push: (message: string, opts?: ToastOptions) => number
  dismiss: (id: number) => void
  runAction: (id: number) => void
  clear: () => void
} {
  function dismiss(id: number): void {
    const timer = timers.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.delete(id)
    }
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }

  function push(message: string, opts: ToastOptions = {}): number {
    const id = nextId++
    const duration = opts.duration ?? (opts.action ? 5000 : 4000)
    toasts.value = [...toasts.value, { id, message, kind: opts.kind ?? 'success', action: opts.action, duration }]
    if (duration > 0) timers.set(id, setTimeout(() => dismiss(id), duration))
    return id
  }

  /** 执行 action（撤销等）并立即收起该条。 */
  function runAction(id: number): void {
    const toast = toasts.value.find((t) => t.id === id)
    dismiss(id)
    void toast?.action?.run()
  }

  function clear(): void {
    for (const id of [...timers.keys()]) dismiss(id)
    toasts.value = []
  }

  return { toasts, push, dismiss, runAction, clear }
}