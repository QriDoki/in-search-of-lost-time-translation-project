<script setup lang="ts">
import DefaultTheme from 'vitepress/theme'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useData } from 'vitepress'
import ChapterNav from './components/ChapterNav.vue'
import ReadingProgress from './components/ReadingProgress.vue'
import ReaderDock from './components/ReaderDock.vue'
import ReaderAnnotations from './components/ReaderAnnotations.vue'
import ReaderSearchHighlight from './components/ReaderSearchHighlight.vue'
import { book } from './composables/book'

const { Layout } = DefaultTheme
const { page, frontmatter } = useData()

const isReaderPage = computed(() => page.value.relativePath.startsWith('chapters/'))
const readerPanel = ref<'toc' | 'settings' | null>(null)
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
    // 滚动只收起页头；重新显示由正文点击（含触屏轻点）触发。
    if (Math.abs(y - lastScrollY) < 8) return
    if (y > lastScrollY && y > headerHeight) headerHidden.value = true
    lastScrollY = y
  })
}

function onNavFocus(event: FocusEvent) {
  if (event.target instanceof Element && event.target.closest('.VPNav')) showHeader()
}

function onReaderClick(event: MouseEvent) {
  if (!isReaderPage.value || !(event.target instanceof Element)) return
  if (!event.target.closest('.VPDoc .vp-doc')) return
  // 选取正文时保持阅读状态，触屏滑动由浏览器自动排除在 click 事件外。
  if (window.getSelection()?.isCollapsed === false) return
  showHeader()
}

watch(() => page.value.relativePath, () => {
  readerPanel.value = null
  showHeader()
})
watch(readerPanel, (panel) => { if (panel) showHeader() })

onMounted(() => {
  showHeader()
  window.addEventListener('scroll', onScroll, { passive: true })
  document.addEventListener('focusin', onNavFocus)
  document.addEventListener('click', onReaderClick)
})
onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll)
  document.removeEventListener('focusin', onNavFocus)
  document.removeEventListener('click', onReaderClick)
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
    <template #nav-bar-title-after>
      <span class="reader-build-version"><span class="reader-version-prefix">版本: </span>{{ book.buildVersion }}</span>
    </template>
    <template #layout-top>
      <ReadingProgress v-if="isReaderPage" />
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
          v-if="isReaderPage"
          class="reader-nav__button"
          :class="{ 'is-active': readerPanel === 'settings' }"
          aria-controls="reader-settings-panel"
          :aria-expanded="readerPanel === 'settings'"
          @click="readerPanel = readerPanel === 'settings' ? null : 'settings'"
        >字体设置</button>
      </nav>
    </template>
    <template #doc-after>
      <ChapterNav v-if="isReaderPage" />
    </template>
    <template #layout-bottom>
      <ReaderDock v-model:panel="readerPanel" />
      <ReaderAnnotations v-if="isReaderPage" />
      <ReaderSearchHighlight v-if="isReaderPage" />
    </template>
  </Layout>
</template>
