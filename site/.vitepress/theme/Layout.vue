<script setup lang="ts">
import DefaultTheme from 'vitepress/theme'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useData, useRouter, withBase } from 'vitepress'
import ChapterNav from './components/ChapterNav.vue'
import ReadingProgress from './components/ReadingProgress.vue'
import ReaderDock from './components/ReaderDock.vue'
import ReaderAnnotations from './components/ReaderAnnotations.vue'
import ReaderSearchHighlight from './components/ReaderSearchHighlight.vue'
import ReaderAIEdit from './components/ReaderAIEdit.vue'
import ReaderToast from './components/ReaderToast.vue'
import ReaderSelectionToolbar from './components/ReaderSelectionToolbar.vue'
import ReaderHighlightPopover from './components/ReaderHighlightPopover.vue'
import ReaderShareLanding from './components/ReaderShareLanding.vue'
import ReaderProgressBanner from './components/ReaderProgressBanner.vue'
import { useBook } from './composables/book'
import { progress } from './composables/reader'
import { deviceId, initUserStorage, useSyncState, useUserStorage, type ReaderPanel, type ReadingPosition } from './composables/user-storage'

const { book } = useBook()

const { Layout } = DefaultTheme
const { page, frontmatter } = useData()
const router = useRouter()
const { account } = useUserStorage()
const { status: syncStatus } = useSyncState()

const isReaderPage = computed(() => Boolean(frontmatter.value.readerPageId))
const readerPanel = ref<ReaderPanel>(null)
const headerHidden = ref(false)
let lastScrollY = 0
let scrollFrame = 0

function scrollTop() {
  const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
  return Math.min(maxScroll, Math.max(0, window.scrollY))
}

function showHeader() {
  headerHidden.value = false
  if (typeof window !== 'undefined') lastScrollY = scrollTop()
}

function onScroll() {
  if (scrollFrame) return
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = 0
    const y = scrollTop()
    const headerHeight = document.querySelector<HTMLElement>('.VPNav')?.offsetHeight ?? 64
    if (!isReaderPage.value || readerPanel.value) {
      showHeader()
      return
    }
    // 滚动只收起页头；重新显示由整页点击（含触屏轻点）触发。
    if (Math.abs(y - lastScrollY) < 8) return
    if (y > lastScrollY && y > headerHeight) headerHidden.value = true
    lastScrollY = y
  })
}

function onNavFocus(event: FocusEvent) {
  if (event.target instanceof Element && event.target.closest('.VPNav')) showHeader()
}

function onReaderClick() {
  if (!isReaderPage.value) return
  // 选取正文时保持阅读状态，触屏滑动由浏览器自动排除在 click 事件外。
  if (window.getSelection()?.isCollapsed === false) return
  showHeader()
}

/** D33：弹层「未同步」小字 / 面板状态行 → 打开对应面板。 */
function onPanelOpen(event: Event) {
  const panel = (event as CustomEvent<ReaderPanel>).detail
  if (panel) readerPanel.value = panel
}

/* 摘录按钮红点：未处理冲突（P1）或失效摘录。 */
const degradedCount = ref(0)
function onDegraded(event: Event) {
  degradedCount.value = (event as CustomEvent<{ count: number }>).detail?.count ?? 0
}
const excerptAlert = computed(() => degradedCount.value > 0 || syncStatus.value.conflicts > 0)

/* ☁︎ 同步状态图标（F1-2：八态映射；仅已连接时显示）。 */
const syncIcon = computed(() => {
  const s = syncStatus.value
  switch (s.state) {
    case 'synced': return '☁︎✓'
    case 'syncing': return '☁︎'
    case 'pending': return `☁︎·${s.pending}`
    case 'offline': return '☁︎̸'
    case 'conflict': return '☁︎⚠'
    case 'error': return '☁︎!'
    case 'paused': return '☁︎⏸'
    case 'needs-auth': return '☁︎!'
    default: return '☁︎'
  }
})
const syncTitle = computed(() => {
  const s = syncStatus.value
  switch (s.state) {
    case 'synced': return '已同步'
    case 'syncing': return '正在同步…'
    case 'pending': return `${s.pending} 项待同步`
    case 'offline': return '离线 · 更改已保存在本机'
    case 'conflict': return `${s.conflicts} 条冲突待处理`
    case 'error': return '同步失败 · 重试'
    case 'paused': return '同步已暂停'
    case 'needs-auth': return '需要重新登录'
    default: return '数据仅保存在本机'
  }
})

/* 跨设备进度横幅（F1-4：异页且另一设备较新才显示；绝不自动跳转）。 */
const bannerRemote = ref<ReadingPosition | null>(null)
watch(
  () => progress.last,
  (next, prev) => {
    const currentPage = String(frontmatter.value.readerPageId ?? '')
    if (
      next &&
      isReaderPage.value &&
      next.pageId !== currentPage &&
      next.deviceId &&
      next.deviceId !== deviceId() &&
      (!prev || next.updatedAt > prev.updatedAt)
    ) {
      bannerRemote.value = next
    } else {
      bannerRemote.value = null
    }
  },
)
async function onBannerJump(): Promise<void> {
  const remote = bannerRemote.value
  bannerRemote.value = null
  if (!remote) return
  const meta = book.value.pages.find((p) => p.id === remote.pageId)
  if (meta) await router.go(`${withBase(meta.path)}?resume=1`)
}

watch(() => page.value.relativePath, () => {
  readerPanel.value = null
  showHeader()
})
watch(readerPanel, (panel) => { if (panel) showHeader() })

onMounted(() => {
  showHeader()
  void initUserStorage()
  window.addEventListener('scroll', onScroll, { passive: true })
  document.addEventListener('focusin', onNavFocus)
  document.addEventListener('click', onReaderClick)
  window.addEventListener('reader-panel:open', onPanelOpen)
  window.addEventListener('reader-excerpts:degraded', onDegraded)
})
onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll)
  document.removeEventListener('focusin', onNavFocus)
  document.removeEventListener('click', onReaderClick)
  window.removeEventListener('reader-panel:open', onPanelOpen)
  window.removeEventListener('reader-excerpts:degraded', onDegraded)
  if (scrollFrame) cancelAnimationFrame(scrollFrame)
})
</script>

<template>
  <Layout :class="{ 'reader-nav-hidden': headerHidden }">
    <template #home-hero-info>
      <h1 class="home-book-title">{{ frontmatter.hero.name }}</h1>
      <p class="home-book-version">版本: {{ book.buildVersion }}</p>
      <p class="home-book-subtitle">{{ frontmatter.hero.text }}</p>
      <p class="home-book-tagline" v-html="frontmatter.hero.tagline" />
    </template>
    <template #layout-top>
      <ReadingProgress v-if="isReaderPage" />
      <ReaderProgressBanner
        v-if="bannerRemote"
        :remote="bannerRemote"
        @jump="onBannerJump"
        @stay="bannerRemote = null"
      />
    </template>
    <template #nav-bar-content-before>
      <a
        class="reader-epub-link"
        :href="`${book.repository}/releases/`"
        target="_blank"
        rel="noopener noreferrer"
      >下载EPUB</a>
      <a
        class="reader-github-link"
        :href="book.repository"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="GitHub 主仓库（新窗口打开）"
        title="GitHub 主仓库"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
          <path d="M12 .297a12 12 0 0 0-3.793 23.385c.6.111.82-.261.82-.577v-2.234c-3.338.726-4.043-1.416-4.043-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.09-.745.083-.729.083-.729 1.205.085 1.839 1.237 1.839 1.237 1.071 1.835 2.809 1.305 3.495.998.108-.776.419-1.305.762-1.605-2.665-.303-5.467-1.334-5.467-5.931 0-1.31.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23a11.52 11.52 0 0 1 6.006 0c2.291-1.552 3.297-1.23 3.297-1.23.654 1.652.243 2.873.12 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.625-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.216.694.825.576A12 12 0 0 0 12 .297Z" />
        </svg>
      </a>
    </template>
    <template #nav-bar-content-after>
      <nav class="reader-nav" aria-label="站点导航">
        <button
          class="reader-nav__button"
          :class="{ 'is-active': readerPanel === 'toc' }"
          aria-controls="reader-toc-panel"
          :aria-expanded="readerPanel === 'toc'"
          @click="readerPanel = readerPanel === 'toc' ? null : 'toc'"
        >目录</button>
        <button
          class="reader-nav__button"
          :class="{ 'is-active': readerPanel === 'excerpts' }"
          aria-controls="reader-excerpts-panel"
          :aria-expanded="readerPanel === 'excerpts'"
          @click="readerPanel = readerPanel === 'excerpts' ? null : 'excerpts'"
        >摘录<span v-if="excerptAlert" class="reader-nav__dot" role="status" aria-label="存在失效摘录或未处理冲突" /></button>
        <button
          v-if="isReaderPage"
          class="reader-nav__button"
          :class="{ 'is-active': readerPanel === 'settings' }"
          aria-controls="reader-settings-panel"
          :aria-expanded="readerPanel === 'settings'"
          @click="readerPanel = readerPanel === 'settings' ? null : 'settings'"
        >阅读设置</button>
        <button
          v-if="account"
          class="reader-nav__button reader-sync-icon"
          :class="{ 'is-active': readerPanel === 'sync', 'is-spinning': syncStatus.state === 'syncing' }"
          aria-controls="reader-sync-panel"
          :aria-expanded="readerPanel === 'sync'"
          :aria-label="`云同步：${syncTitle}`"
          :title="syncTitle"
          @click="readerPanel = readerPanel === 'sync' ? null : 'sync'"
        >{{ syncIcon }}<span v-if="syncStatus.conflicts > 0" class="reader-nav__dot" aria-hidden="true" /></button>
      </nav>
    </template>
    <template #doc-after>
      <ChapterNav v-if="isReaderPage" />
    </template>
    <template #layout-bottom>
      <ReaderDock v-model:panel="readerPanel" />
      <ReaderAnnotations v-if="isReaderPage" />
      <ReaderSearchHighlight v-if="isReaderPage" />
      <ReaderAIEdit v-if="isReaderPage" />
      <ReaderSelectionToolbar v-if="isReaderPage" />
      <ReaderHighlightPopover v-if="isReaderPage" />
      <ReaderShareLanding v-if="isReaderPage" />
      <ReaderToast />
    </template>
  </Layout>
</template>
