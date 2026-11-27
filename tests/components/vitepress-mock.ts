/**
 * 组件测试用 vitepress mock（vi.mock('vitepress', () => import('./vitepress-mock'))）。
 * 提供可控的 useData/useRoute/useRouter/withBase/onContentUpdated。
 */
import { computed, reactive, ref } from 'vue'
import { vi } from 'vitest'

export const routeState = reactive({ path: '/chapters/vol1-01.html' })

export const pageState = reactive({
  relativePath: 'chapters/vol1-01.md',
  frontmatter: { readerPageId: 'vol1-01', contentVersion: 'dev' } as Record<string, unknown>,
})

const pageRef = ref(pageState)
const frontmatterRef = computed(() => pageState.frontmatter)

export const routerGo = vi.fn(async (_href?: string) => {})

export const contentUpdatedCallbacks: (() => void)[] = []

export function useData() {
  return {
    page: pageRef,
    frontmatter: frontmatterRef,
    site: ref({ title: 'test' }),
    theme: ref({}),
    params: ref({}),
    isDark: ref(false),
  }
}

export function useRoute() {
  return routeState
}

export function useRouter() {
  return { go: routerGo, route: routeState }
}

export function withBase(path: string): string {
  return path
}

export function onContentUpdated(cb: () => void): void {
  contentUpdatedCallbacks.push(cb)
}

/** 测试手动触发内容更新（模拟 VitePress 路由切换后 DOM 就绪）。 */
export function triggerContentUpdated(): void {
  for (const cb of [...contentUpdatedCallbacks]) cb()
}

export function resetVitepressMock(): void {
  routeState.path = '/chapters/vol1-01.html'
  pageState.relativePath = 'chapters/vol1-01.md'
  pageState.frontmatter = { readerPageId: 'vol1-01', contentVersion: 'dev' }
  contentUpdatedCallbacks.length = 0
  routerGo.mockClear()
}