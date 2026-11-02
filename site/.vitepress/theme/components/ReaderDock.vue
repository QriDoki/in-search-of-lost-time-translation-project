<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onContentUpdated, useData, withBase } from 'vitepress'
import { useBook, versionPrefix } from '../composables/book'
import ReaderAnnotationTypes from './ReaderAnnotationTypes.vue'
import {
  clearReadingProgress,
  initReader,
  overallProgress,
  pagePercent,
  percent,
  prefs,
  progress,
  reading,
  resetPreferences,
  savePosition,
  setActivePage,
  setActiveProgress,
  type ReaderFont,
  type ReaderTheme,
} from '../composables/reader'
import {
  currentEntryPath,
  flattenEntries,
  type FlatTocEntry,
} from '../composables/toc'

const { page } = useData()
const { book } = useBook()

const panel = defineModel<'toc' | 'settings' | null>('panel', { default: null })
const currentPageId = computed(() => String(page.value.frontmatter.readerPageId ?? ''))
const currentPage = computed(() => book.value.pages.find((entry) => entry.id === currentPageId.value))
const currentHash = ref('')

const tocRows = computed(() =>
  flattenEntries(book.value.volumes).map((row) => {
    const number = row.title.match(/^第[零〇一二三四五六七八九十百\d]+[卷部章节]/)?.[0] ?? ''
    const name = row.title.slice(number.length).replace(/^[\s·・]+/, '')
    return { ...row, number: name ? number : '', name: name || row.title }
  }),
)
const activeEntry = computed(() =>
  currentEntryPath(tocRows.value, currentPageId.value, currentHash.value),
)
// 路径集合的首项是实际阅读位置，其余为祖先；只给当前位置加底色。
const currentEntryKey = computed(() => activeEntry.value.values().next().value)

const fontOptions: { value: ReaderFont; label: string }[] = [
  { value: 'serif', label: '宋体' },
  { value: 'sans', label: '黑体' },
  { value: 'kai', label: '楷体' },
]

const themeOptions: { value: ReaderTheme; label: string; color: string }[] = [
  { value: 'paper', label: '纸张', color: '#f7f2e8' },
  { value: 'light', label: '浅色', color: '#ffffff' },
  { value: 'sepia', label: '护眼', color: '#e7ead9' },
  { value: 'dark', label: '深色', color: '#171513' },
]

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

watch(panel, (which) => {
  if (which === 'toc') {
    // 打开目录时把当前所在条目滚到面板中间，长目录里不必自己找。
    nextTick(() => {
      requestAnimationFrame(() => {
        const active = document.querySelector<HTMLElement>(
          '.reader-panel--toc .reader-toc-link.is-current',
        )
        active?.scrollIntoView({ block: 'center' })
      })
    })
  }
})

function linkFor(entry: FlatTocEntry) {
  if (entry.pageId !== currentPageId.value) return withBase(entry.path)
  return `#${entry.id}`
}

/* ------------------------------------------------------------------ */
/* 段落定位与阅读进度                                                   */
/* ------------------------------------------------------------------ */

let pageNodes: HTMLElement[] = []
let charWeights: number[] = []
let charPrefix: number[] = []
let pageChars = 0
let currentIndex = 0
let currentOffset = 0
let activeId = ''
let interacted = false
let mounted = false
let setupGeneration = 0
let settingUp = false
let scrollRaf = 0
let saveTimer: ReturnType<typeof setTimeout> | undefined

function hashText(text: string) {
  const normalized = text.replace(/\s+/g, ' ').trim()
  let hash = 2166136261
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function navHeight() {
  const nav = document.querySelector<HTMLElement>('.VPNav')
  if (!nav) return 64
  const rect = nav.getBoundingClientRect()
  return Math.max(0, Math.min(rect.height, rect.bottom))
}

function collectParagraphs() {
  const root = document.querySelector<HTMLElement>('.vp-doc')
  const nodes = root ? Array.from(root.querySelectorAll<HTMLElement>('p')) : []

  pageNodes = nodes
  charWeights = []
  charPrefix = []
  pageChars = 0

  nodes.forEach((node, index) => {
    // 新页面在构建时已有锚点，回退兼容尚未重新构建的页面。
    if (!node.id) node.id = `p-${String(index + 1).padStart(6, '0')}`
    node.dataset.readerParagraph = String(index)
    node.dataset.readerHash = hashText(node.textContent ?? '')

    const weight = Math.max((node.textContent ?? '').replace(/\s+/g, '').length, 1)
    charWeights.push(weight)
    charPrefix.push(pageChars)
    pageChars += weight
  })
}

function updateProgressFromScroll() {
  if (!pageNodes.length) return

  const scrollY = window.scrollY
  const anchor = scrollY + navHeight() + Math.min(window.innerHeight * 0.25, 220)
  let low = 0
  let high = pageNodes.length - 1
  let index = 0

  while (low <= high) {
    const middle = (low + high) >> 1
    const top = pageNodes[middle].getBoundingClientRect().top + scrollY
    if (top <= anchor) {
      index = middle
      low = middle + 1
    } else {
      high = middle - 1
    }
  }

  const rect = pageNodes[index].getBoundingClientRect()
  const top = rect.top + scrollY
  let offset = rect.height > 0 ? clamp((anchor - top) / rect.height, 0, 1) : 0
  let value = pageChars
    ? (charPrefix[index] + charWeights[index] * offset) / pageChars
    : (index + offset) / pageNodes.length

  const maxScroll = document.documentElement.scrollHeight - window.innerHeight
  if (maxScroll - scrollY < 12) {
    index = pageNodes.length - 1
    offset = 1
    value = 1
  }

  currentIndex = index
  currentOffset = offset
  setActiveProgress(value)
  updateHash(index)
  scheduleSave()
}

/** 记录当前段落所在的结构性小节（供目录高亮）。 */
function updateHash(index: number) {
  const root = document.querySelector<HTMLElement>('.vp-doc')
  if (!root) return
  const node = pageNodes[index]
  if (!node) return
  let current = ''
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT)
  while (walker.nextNode()) {
    const element = walker.currentNode as HTMLElement
    if (element === node) break
    if (/^H[1-4]$/.test(element.tagName) && element.id) current = element.id
  }
  if (currentHash.value !== current) currentHash.value = current
}

function scheduleSave() {
  if (!interacted) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(saveNow, 650)
}

function saveNow() {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = undefined
  }
  if (settingUp || !interacted || !activeId || !pageNodes.length) return

  const node = pageNodes[currentIndex]
  if (!node) return

  savePosition({
    pageId: activeId,
    paragraphId: node.id,
    paragraphHash: node.dataset.readerHash ?? '',
    offset: currentOffset,
    pageProgress: reading.pageProgress,
    maxProgress: reading.pageProgress,
    updatedAt: new Date().toISOString(),
  })
}

function onScroll() {
  if (settingUp || scrollRaf) return
  scrollRaf = requestAnimationFrame(() => {
    scrollRaf = 0
    if (settingUp || !activeId || !pageNodes.length) return
    interacted = true
    updateProgressFromScroll()
  })
}

function maybeResume() {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  if (url.searchParams.has('search')) return
  // 显式目录/段落锚点优先；普通打开、刷新和继续阅读均恢复进度。
  if (url.hash && url.searchParams.get('resume') !== '1') return

  const saved = progress.pages[activeId]
  if (!saved) return

  let node = pageNodes.find((item) => item.id === saved.paragraphId)
  if (!node || node.dataset.readerHash !== saved.paragraphHash) {
    node =
      pageNodes.find((item) => item.dataset.readerHash === saved.paragraphHash) ?? node
  }

  if (!node) {
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight
    window.scrollTo({ top: Math.max(0, maxScroll * saved.pageProgress), behavior: 'instant' })
  } else {
    const rect = node.getBoundingClientRect()
    const top = rect.top + window.scrollY
    const anchor = navHeight() + Math.min(window.innerHeight * 0.25, 220)
    window.scrollTo({
      top: Math.max(0, top + saved.offset * rect.height - anchor),
      behavior: 'instant',
    })
  }

  url.searchParams.delete('resume')
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
}

async function setupPage() {
  const generation = ++setupGeneration
  const nextId = currentPageId.value
  if (activeId && activeId !== nextId) saveNow()
  settingUp = true
  if (scrollRaf) cancelAnimationFrame(scrollRaf)
  scrollRaf = 0
  activeId = nextId
  currentHash.value = nextId ? window.location.hash.slice(1) : ''
  interacted = false
  currentIndex = 0
  currentOffset = 0
  pageNodes = []

  setActivePage(nextId)
  // 首页和完整目录页只提供目录面板，不采集段落或继续写入上一章进度。
  if (!nextId) {
    settingUp = false
    return
  }
  await nextTick()
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (!mounted || generation !== setupGeneration || currentPageId.value !== nextId) return
      collectParagraphs()
      maybeResume()
      // 同步段落位置但不写盘，避免初始化滚动把已有进度覆盖为页首。
      updateProgressFromScroll()
      settingUp = false
    })
  })
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') panel.value = null
}

function onPageHide() {
  saveNow()
}

function handleClearProgress() {
  if (!window.confirm('确定清除所有阅读进度吗？此操作不可撤销。')) return
  clearReadingProgress()
  setActivePage(activeId)
}

watch(
  () => page.value.relativePath,
  () => saveNow(),
  { flush: 'pre' },
)

onMounted(() => {
  initReader()
  mounted = true
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('pagehide', onPageHide)
  document.addEventListener('keydown', onKeydown)
  setupPage()
})

onContentUpdated(() => {
  if (mounted) setupPage()
})

onBeforeUnmount(() => {
  saveNow()
  mounted = false
  ++setupGeneration
  window.removeEventListener('scroll', onScroll)
  window.removeEventListener('pagehide', onPageHide)
  document.removeEventListener('keydown', onKeydown)
  if (scrollRaf) cancelAnimationFrame(scrollRaf)
})
</script>

<template>
  <div class="reader-ui">
    <Transition name="reader-fade">
      <div v-if="panel" class="reader-backdrop" @click="panel = null" />
    </Transition>

    <Transition name="reader-panel">
      <section
        v-if="panel === 'toc'"
        id="reader-toc-panel"
        class="reader-panel reader-panel--toc"
        role="dialog"
        aria-label="全书目录"
      >
        <header class="reader-panel__header">
          <div>
            <strong>目录</strong>
            <span class="reader-panel__subtitle">{{ book.title }}</span>
          </div>
          <button class="reader-icon-button" aria-label="关闭目录" @click="panel = null">×</button>
        </header>

        <div class="reader-panel__body">
          <nav class="reader-toc" aria-label="全书章节">
            <a
              v-for="row in tocRows"
              :key="row.key"
              class="reader-toc-link"
              :class="[
                `reader-toc-link--level-${row.level}`,
                {
                  'reader-toc-link--volume': row.level === 1,
                  'is-current': row.key === currentEntryKey,
                  'is-ancestor': row.key !== currentEntryKey && activeEntry.has(row.key),
                },
              ]"
              :href="linkFor(row)"
              :aria-current="row.key === currentEntryKey ? 'location' : undefined"
              @click="panel = null"
            >
              <span class="reader-toc-link__title">
                <span v-if="row.number" class="reader-toc-link__number">{{ row.number }}</span>
                <span class="reader-toc-link__name">{{ row.name }}</span>
              </span>
              <span v-if="row.key === currentEntryKey" class="reader-toc-link__progress">
                在读<span v-if="pagePercent(row.pageId)"> · {{ pagePercent(row.pageId) }}%</span>
              </span>
            </a>
          </nav>
        </div>

        <footer class="reader-panel__footer">
          <span>全书 {{ percent(overallProgress) }}</span>
          <a class="reader-text-button" :href="withBase(`${versionPrefix(book.contentVersion)}/toc.html`)">完整目录</a>
          <button class="reader-text-button" @click="handleClearProgress">清除阅读进度</button>
        </footer>
      </section>
    </Transition>

    <Transition name="reader-panel">
      <section
        v-if="panel === 'settings'"
        id="reader-settings-panel"
        class="reader-panel reader-panel--settings"
        role="dialog"
        aria-label="阅读设置"
      >
        <header class="reader-panel__header">
          <div>
            <strong>阅读设置</strong>
            <span class="reader-panel__subtitle">设置只保存在当前浏览器</span>
          </div>
          <button class="reader-icon-button" aria-label="关闭设置" @click="panel = null">×</button>
        </header>

        <div class="reader-panel__body">
          <div class="reader-setting">
            <span class="reader-setting__label">字号</span>
            <div class="reader-stepper">
              <button
                aria-label="减小字号"
                @click="prefs.fontSize = clamp(prefs.fontSize - 1, 15, 32)"
              >
                A−
              </button>
              <span>{{ prefs.fontSize }}px</span>
              <button
                aria-label="增大字号"
                @click="prefs.fontSize = clamp(prefs.fontSize + 1, 15, 32)"
              >
                A+
              </button>
            </div>
          </div>

          <div class="reader-setting">
            <span class="reader-setting__label">行距</span>
            <input
              v-model.number="prefs.lineHeight"
              type="range"
              min="1.4"
              max="2.8"
              step="0.1"
              aria-label="行距"
            />
            <span class="reader-setting__value">{{ prefs.lineHeight.toFixed(1) }}</span>
          </div>

          <div class="reader-setting">
            <span class="reader-setting__label">字体</span>
            <div class="reader-segmented">
              <button
                v-for="font in fontOptions"
                :key="font.value"
                :class="{ 'is-active': prefs.fontFamily === font.value }"
                @click="prefs.fontFamily = font.value"
              >
                {{ font.label }}
              </button>
            </div>
          </div>

          <div class="reader-setting">
            <span class="reader-setting__label">主题</span>
            <div class="reader-themes">
              <button
                v-for="theme in themeOptions"
                :key="theme.value"
                class="reader-theme-button"
                :class="{ 'is-active': prefs.theme === theme.value }"
                :aria-label="theme.label"
                :title="theme.label"
                @click="prefs.theme = theme.value"
              >
                <span class="reader-theme-swatch" :style="{ background: theme.color }" />
                {{ theme.label }}
              </button>
            </div>
          </div>

          <div class="reader-setting">
            <span class="reader-setting__label">版心</span>
            <input
              v-model.number="prefs.width"
              type="range"
              min="580"
              max="960"
              step="20"
              aria-label="版心宽度"
            />
            <span class="reader-setting__value">{{ prefs.width }}px</span>
          </div>

          <ReaderAnnotationTypes />

          <div class="reader-progress-summary">
            <div v-if="currentPage" class="reader-progress-summary__row">
              <span>本页</span>
              <span class="reader-progress-summary__percent">{{ percent(reading.pageProgress) }}</span>
              <progress
                class="reader-progress-summary__bar"
                :value="reading.pageProgress"
                max="1"
                aria-label="本页阅读进度"
              >{{ percent(reading.pageProgress) }}</progress>
            </div>
            <div class="reader-progress-summary__row">
              <span>全书</span>
              <span class="reader-progress-summary__percent">{{ percent(overallProgress) }}</span>
              <progress
                class="reader-progress-summary__bar"
                :value="overallProgress"
                max="1"
                aria-label="全书阅读进度"
              >{{ percent(overallProgress) }}</progress>
            </div>
          </div>

          <div class="reader-panel__actions">
            <button class="reader-text-button" @click="resetPreferences">恢复默认设置</button>
            <button class="reader-text-button" @click="handleClearProgress">清除阅读进度</button>
          </div>
        </div>
      </section>
    </Transition>

  </div>
</template>
