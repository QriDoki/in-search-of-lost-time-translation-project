<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter, withBase } from 'vitepress'
import { runSearch, type SearchResult } from '../composables/search'

const emit = defineEmits<{ close: [] }>()
const router = useRouter()
const dialog = ref<HTMLDialogElement>()
const input = ref<HTMLInputElement>()
const query = ref('')
const results = ref<SearchResult[]>([])
const total = ref(0)
const limit = ref(30)
const selected = ref(0)
const busy = ref(false)
const error = ref('')
let timer: ReturnType<typeof setTimeout>
let sequence = 0
let previousOverflow = ''
let mounted = false
const storageKey = 'lost-time:search-query'

function hrefFor(result: SearchResult) {
  const [path, anchor] = result.id.split('#')
  return `${withBase(path)}?search=${encodeURIComponent(query.value.trim())}#${anchor}`
}

async function search() {
  const current = ++sequence
  const value = query.value.trim()
  error.value = ''
  if (!value) {
    busy.value = false
    total.value = 0
    results.value = []
    return
  }
  busy.value = true
  try {
    const response = await runSearch(value, limit.value)
    if (current !== sequence || !mounted) return
    results.value = response.results
    total.value = response.total
    selected.value = Math.min(selected.value, Math.max(0, results.value.length - 1))
  } catch (cause) {
    if (current === sequence && mounted) error.value = (cause as Error).message
  } finally {
    if (current === sequence) busy.value = false
  }
}

watch(query, () => {
  clearTimeout(timer)
  ++sequence // 立即作废旧查询，即使新查询仍在防抖等待中。
  results.value = []
  total.value = 0
  selected.value = 0
  limit.value = 30
  busy.value = Boolean(query.value.trim())
  try { sessionStorage.setItem(storageKey, query.value) } catch {}
  timer = setTimeout(search, 100)
})

async function navigate(event: MouseEvent | KeyboardEvent, result: SearchResult) {
  if (event instanceof MouseEvent && (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0)) return
  event.preventDefault()
  const href = hrefFor(result)
  emit('close')
  await router.go(href)
  window.dispatchEvent(new Event('reader-search:navigate'))
}

async function onKeydown(event: KeyboardEvent) {
  if (event.isComposing) return
  // 阅读页也监听 Escape，先在弹窗内处理，避免被页面事件取消原生 cancel。
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    emit('close')
    return
  }
  if (event.target !== input.value) return
  if (event.key === 'Enter') {
    event.preventDefault()
    if (!busy.value && results.value[selected.value]) navigate(event, results.value[selected.value])
  } else if (['ArrowDown', 'ArrowUp'].includes(event.key) && results.value.length) {
    event.preventDefault()
    selected.value = (selected.value + (event.key === 'ArrowDown' ? 1 : -1) + results.value.length) % results.value.length
    await nextTick()
    document.getElementById(`reader-search-item-${selected.value}`)?.scrollIntoView({ block: 'nearest' })
  }
}

function loadMore() {
  limit.value += 30
  search()
}

onMounted(() => {
  mounted = true
  previousOverflow = document.documentElement.style.overflow
  document.documentElement.style.overflow = 'hidden'
  dialog.value?.showModal()
  try { query.value = sessionStorage.getItem(storageKey) ?? '' } catch {}
  input.value?.focus()
})
onBeforeUnmount(() => {
  mounted = false
  ++sequence
  clearTimeout(timer)
  dialog.value?.close()
  document.documentElement.style.overflow = previousOverflow
})
</script>

<template>
  <Teleport to="body">
    <dialog
      ref="dialog"
      class="reader-search reader-ui"
      aria-label="全文搜索"
      @cancel.prevent="emit('close')"
      @click="($event.target === dialog) && emit('close')"
      @keydown="onKeydown"
    >
      <div class="reader-search__panel">
        <div class="reader-search__form">
          <label for="reader-search-input" class="reader-search__label">搜索全文</label>
          <input
            id="reader-search-input" ref="input" v-model="query" type="search" maxlength="200"
            placeholder="搜索全文" autocomplete="off" spellcheck="false"
            role="combobox" aria-autocomplete="list" aria-controls="reader-search-results"
            :aria-expanded="results.length > 0"
            :aria-activedescendant="results.length ? `reader-search-item-${selected}` : undefined"
          >
          <button v-if="query" type="button" aria-label="清除搜索" @click="query = ''; input?.focus()">清除</button>
          <button type="button" aria-label="关闭搜索" @click="emit('close')">关闭</button>
        </div>
        <p class="reader-search__hint">连续文字精确匹配；空格分隔的关键词须在同一段出现。</p>
        <p class="reader-search__status" role="status" aria-live="polite">
          <template v-if="error">{{ error }}</template>
          <template v-else-if="busy">正在搜索…</template>
          <template v-else-if="query.trim()">{{ total ? `找到 ${total} 处，已显示 ${results.length} 处` : '没有找到相关内容' }}</template>
          <template v-else>输入文字搜索全书</template>
        </p>
        <button v-if="error" type="button" class="reader-search__more" @click="search">重试</button>
        <ul id="reader-search-results" class="reader-search__results" role="listbox" aria-label="搜索结果" :aria-busy="busy">
          <li
            v-for="(result, index) in results" :id="`reader-search-item-${index}`" :key="result.id"
            role="option" :aria-selected="selected === index" :class="{ selected: selected === index }"
          >
            <a :href="hrefFor(result)" @click="navigate($event, result)" @focus="selected = index">
              <span class="reader-search__title">{{ result.title }}</span>
              <span class="reader-search__excerpt"><template v-for="(part, partIndex) in result.parts" :key="partIndex"><mark v-if="part.match">{{ part.text }}</mark><template v-else>{{ part.text }}</template></template></span>
            </a>
          </li>
        </ul>
        <button v-if="results.length < total" type="button" class="reader-search__more" :disabled="busy" @click="loadMore">显示更多</button>
        <p class="reader-search__footer">↑ ↓ 切换　Enter 选择　Esc 关闭</p>
      </div>
    </dialog>
  </Teleport>
</template>

<style scoped>
.reader-search { position: fixed; inset: 0; width: 100%; max-width: none; height: 100%; max-height: none; margin: 0; padding: 0; border: 0; background: transparent; color: var(--vp-c-text-1); }
.reader-search::backdrop { background: rgb(0 0 0 / 45%); }
.reader-search__panel { display: flex; flex-direction: column; width: min(720px, calc(100% - 32px)); max-height: calc(100dvh - 96px); margin: 48px auto; padding: 20px; border: 1px solid var(--vp-c-divider); border-radius: 12px; background: var(--vp-c-bg); box-shadow: 0 12px 48px rgb(0 0 0 / 18%); }
.reader-search__form { display: flex; align-items: center; gap: 12px; }
.reader-search__label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
.reader-search input { min-width: 0; flex: 1; padding: 10px; border: 1px solid var(--vp-c-divider); border-radius: 6px; font: inherit; background: var(--vp-c-bg-alt); }
.reader-search input:focus { outline: 2px solid var(--vp-c-brand-1); outline-offset: 1px; }
.reader-search button { flex-shrink: 0; font-size: 14px; cursor: pointer; }
.reader-search__hint, .reader-search__status, .reader-search__footer { margin: 12px 0 0; font-size: 13px; line-height: 1.6; color: var(--vp-c-text-2); }
.reader-search__results { overflow-y: auto; overscroll-behavior: contain; min-height: 0; margin: 12px 0 0; padding: 0; list-style: none; }
.reader-search__results li { margin-bottom: 10px; border: 1px solid var(--vp-c-divider); border-radius: 6px; }
.reader-search__results li.selected { border-color: var(--vp-c-brand-1); background: var(--vp-c-bg-soft); }
.reader-search__results a { display: block; padding: 12px; color: inherit; }
.reader-search__results a:focus-visible { outline: 2px solid var(--vp-c-brand-1); }
.reader-search__title { display: block; font-size: 13px; color: var(--vp-c-text-2); }
.reader-search__excerpt { display: block; margin-top: 6px; font-size: 16px; line-height: 1.75; overflow-wrap: anywhere; }
.reader-search mark { padding: 0; color: inherit; background: var(--vp-c-brand-soft); font-weight: 600; }
.reader-search__more { align-self: center; margin-top: 10px; padding: 6px 20px; color: var(--vp-c-brand-1); }
.reader-search__more:disabled { opacity: .5; }
@media (max-width: 640px) { .reader-search__panel { width: calc(100% - 16px); margin: 8px auto; max-height: calc(100dvh - 16px); padding: 12px; } .reader-search__form { gap: 8px; } }
</style>
