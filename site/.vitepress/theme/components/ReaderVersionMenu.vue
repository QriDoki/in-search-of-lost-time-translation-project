<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useData, withBase } from 'vitepress'
import { books, useBook, versions, versionPrefix, VERSION_KEY } from '../composables/book'

const { book } = useBook()
const { page } = useData()
const expanded = ref(false)
const root = ref<HTMLElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)

function close(restoreFocus = false) {
  expanded.value = false
  if (restoreFocus) trigger.value?.focus()
}

function remember(version: string) {
  try { localStorage.setItem(VERSION_KEY, version) } catch { /* 存储不可用时仍可切换。 */ }
}

function targetPath(version: string) {
  const pageId = page.value.frontmatter.readerPageId
  const suffix = pageId && books[version].pages.some((entry) => entry.id === pageId)
    ? `/chapters/${pageId}.html`
    : page.value.relativePath.endsWith('toc.md') ? '/toc.html' : '/'
  return withBase(`${versionPrefix(version)}${suffix}`)
}

function versionUrl(version: string) {
  const url = new URL(targetPath(version), window.location.origin)
  url.search = window.location.search
  url.searchParams.set('version', version)
  url.hash = window.location.hash
  return url.href
}

function selectVersion(version: string) {
  remember(version)
  close()
  if (version !== book.value.contentVersion) {
    window.location.assign(versionUrl(version))
  } else {
    window.history.replaceState(window.history.state, '', versionUrl(version))
  }
}

function onPointerDown(event: PointerEvent) {
  if (event.target instanceof Node && !root.value?.contains(event.target)) close()
}

onMounted(() => {
  document.addEventListener('pointerdown', onPointerDown)
  const version = book.value.contentVersion
  let saved: string | null = null
  try { saved = localStorage.getItem(VERSION_KEY) } catch { /* ignore */ }
  const parameter = new URLSearchParams(window.location.search).get('version')
  const preferred = parameter && books[parameter] ? parameter
    : saved && books[saved] ? saved : 'dev'
  remember(preferred)
  if (preferred !== version) window.location.replace(versionUrl(preferred))
})

onBeforeUnmount(() => document.removeEventListener('pointerdown', onPointerDown))
</script>

<template>
  <div ref="root" class="VPNavBarTitle reader-version-menu" @keydown.esc.stop.prevent="close(true)">
    <button
      ref="trigger"
      class="title"
      aria-label="版本与首页"
      aria-controls="reader-version-panel"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      <span class="reader-title-desktop">追忆似水年华</span>
      <span class="reader-title-mobile" aria-label="追忆似水年华">🕰️</span>
      <span class="reader-build-version">
        <span class="reader-version-prefix">版本: </span><span class="reader-version-value">{{ book.buildVersion }}</span>
        <span aria-hidden="true">{{ expanded ? '▴' : '▾' }}</span>
      </span>
    </button>
    <div v-if="expanded" id="reader-version-panel" class="reader-version-panel reader-ui">
      <span id="reader-version-label" class="reader-setting__label">翻译版本</span>
      <details class="reader-version-select">
        <summary class="reader-note-select">{{ book.buildVersion }} <span aria-hidden="true">▾</span></summary>
        <div class="reader-version-options" role="radiogroup" aria-labelledby="reader-version-label">
          <label v-for="version in versions" :key="version">
            <input
              type="radio"
              name="translation-version"
              :value="version"
              :checked="version === book.contentVersion"
              @change="selectVersion(version)"
            />
            <span>{{ version }}{{ version === 'dev' ? '（开发版）' : '' }}</span>
          </label>
        </div>
      </details>
      <a class="reader-version-home reader-text-button" :href="withBase(`${versionPrefix(book.contentVersion)}/?version=${book.contentVersion}`)" @click="close()">回到首页</a>
    </div>
  </div>
</template>
