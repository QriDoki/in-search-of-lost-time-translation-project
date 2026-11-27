<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useData, withBase } from 'vitepress'
import { useBook, versionPrefix } from '../composables/book'
import { useToasts } from '../composables/useToasts'
import { highlightParts, queryTerms } from '../../search.mjs'
import ReaderDataTools from './ReaderDataTools.vue'
import {
  buildShareUrl,
  collectAnchorParagraphs,
  deviceId,
  downloadJson,
  buildExportEnvelope,
  listBookmarks,
  liveBookmarks,
  liveHighlights,
  loadVersionMap,
  nowIso,
  pidLocation,
  putBookmark,
  putHighlight,
  resolveHighlight,
  softDeleteBookmark,
  softDeleteHighlight,
  useSyncState,
  useUserStorage,
  type Highlight,
  type HighlightColor,
  type LocalBookmark,
  type LocalHighlight,
  type VersionMap,
} from '../composables/user-storage'

const emit = defineEmits<{
  navigate: [pageId: string, paragraphId: string, highlightId?: string]
  openSync: []
}>()

const { book } = useBook()
const { frontmatter } = useData()
const { mode, scope, account } = useUserStorage()
const { status } = useSyncState()
const { push } = useToasts()

/* ------------------------------------------------------------------ */
/* 数据订阅（scope 切换重绑）                                            */
/* ------------------------------------------------------------------ */

const highlights = ref<LocalHighlight[]>([])
const bookmarks = ref<LocalBookmark[]>([])
let liveSub: { unsubscribe(): void } | null = null
let bmSub: { unsubscribe(): void } | null = null

function bindLive(): void {
  liveSub?.unsubscribe()
  bmSub?.unsubscribe()
  if (mode.value !== 'idb') {
    highlights.value = []
    bookmarks.value = []
    return
  }
  liveSub = liveHighlights().subscribe({ next: (rows) => (highlights.value = rows), error: () => {} })
  bmSub = liveBookmarks().subscribe({ next: (rows) => (bookmarks.value = rows), error: () => {} })
}
watch([mode, scope], bindLive, { immediate: true })
onBeforeUnmount(() => {
  liveSub?.unsubscribe()
  bmSub?.unsubscribe()
})

/* ------------------------------------------------------------------ */
/* tab / 排序 / 筛选                                                    */
/* ------------------------------------------------------------------ */

const tab = ref<'excerpts' | 'bookmarks'>('excerpts')
const sort = ref<'position' | 'created' | 'updated'>('position')
const volumeFilter = ref('')
const chapterFilter = ref('')
const colorFilter = ref<Set<HighlightColor>>(new Set())
const onlyNotes = ref(false)
const onlyDegraded = ref(false)

const colorOptions: { value: HighlightColor; label: string }[] = [
  { value: 'yellow', label: '黄' },
  { value: 'green', label: '绿' },
  { value: 'blue', label: '蓝' },
  { value: 'pink', label: '粉' },
  { value: 'purple', label: '紫' },
]

const volumeOptions = computed(() => book.value.volumes.map((v) => ({ id: v.id, title: v.title })))
const chapterOptions = computed(() =>
  book.value.pages
    .filter((p) => p.kind !== 'copyright' && (!volumeFilter.value || p.volumeId === volumeFilter.value))
    .map((p) => ({ id: p.id, title: p.label })),
)

/* 下拉菜单（复用 ReaderAnnotationTypes 范式） */
const openMenu = ref<'volume' | 'chapter' | 'colors' | null>(null)
const menuPos = ref({ left: '0px', top: '0px', width: '0px', maxHeight: '0px' })
const menuEl = ref<HTMLElement | null>(null)
const menuButtons: Record<string, HTMLButtonElement | null> = { volume: null, chapter: null, colors: null }

function setMenuButton(which: string, el: unknown): void {
  menuButtons[which] = el as HTMLButtonElement | null
}

async function toggleMenu(which: 'volume' | 'chapter' | 'colors'): Promise<void> {
  if (openMenu.value === which) {
    openMenu.value = null
    return
  }
  const bounds = menuButtons[which]?.getBoundingClientRect()
  if (!bounds) return
  const margin = 12
  const gap = 6
  const below = window.innerHeight - bounds.bottom - margin - gap
  const above = bounds.top - margin - gap
  const opensAbove = above > below
  const width = Math.min(Math.max(bounds.width, 220), window.innerWidth - margin * 2)
  menuPos.value = {
    left: `${Math.max(margin, Math.min(bounds.left, window.innerWidth - width - margin))}px`,
    top: `${opensAbove ? margin : bounds.bottom + gap}px`,
    width: `${width}px`,
    maxHeight: `${Math.max(0, opensAbove ? above : below)}px`,
  }
  openMenu.value = which
  await nextTick()
  if (opensAbove && menuEl.value) {
    menuPos.value.top = `${Math.max(margin, bounds.top - menuEl.value.getBoundingClientRect().height - gap)}px`
  }
}

function onDocPointerDown(event: PointerEvent): void {
  if (!openMenu.value) return
  if (!(event.target instanceof Node)) return
  const btn = menuButtons[openMenu.value]
  if (!btn?.contains(event.target) && !menuEl.value?.contains(event.target)) openMenu.value = null
}
function onDocScroll(event: Event): void {
  if (event.target instanceof Node && menuEl.value?.contains(event.target)) return
  openMenu.value = null
}
/** F2-1：失效 toast「查看」→ 直达失效筛选。 */
function onShowDegraded(): void {
  tab.value = 'excerpts'
  onlyDegraded.value = true
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocPointerDown)
  window.addEventListener('scroll', onDocScroll, true)
  window.addEventListener('reader-excerpts:show-degraded', onShowDegraded)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocPointerDown)
  window.removeEventListener('scroll', onDocScroll, true)
  window.removeEventListener('reader-excerpts:show-degraded', onShowDegraded)
})

function toggleColor(color: HighlightColor): void {
  const next = new Set(colorFilter.value)
  if (next.has(color)) next.delete(color)
  else next.add(color)
  colorFilter.value = next
}

/* ------------------------------------------------------------------ */
/* 搜索（100ms 防抖 + isComposing + sequence 守卫 + 键盘导航）           */
/* ------------------------------------------------------------------ */

const query = ref('')
const appliedQuery = ref('')
const selected = ref(0)
const searchInput = ref<HTMLInputElement | null>(null)
let searchTimer: ReturnType<typeof setTimeout> | undefined
let sequence = 0

watch(query, () => {
  clearTimeout(searchTimer)
  const current = ++sequence
  selected.value = 0
  searchTimer = setTimeout(() => {
    if (current !== sequence) return
    appliedQuery.value = query.value.trim()
  }, 100)
})

function matchesQuery(text: string, q: string): boolean {
  const terms = queryTerms(q)
  if (!terms.length) return true
  const lower = text.toLowerCase()
  return terms.every((t) => lower.includes(t.toLowerCase()))
}

function parts(text: string): { text: string; match: boolean }[] {
  if (!appliedQuery.value) return [{ text, match: false }]
  return highlightParts(text, appliedQuery.value) as { text: string; match: boolean }[]
}

function onSearchKeydown(event: KeyboardEvent): void {
  if (event.isComposing) return
  if (event.key === 'Escape') {
    if (query.value) {
      event.preventDefault()
      event.stopPropagation()
      query.value = ''
      appliedQuery.value = ''
    }
    return
  }
  const list = filteredHighlights.value
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    if (!list.length) return
    event.preventDefault()
    selected.value = (selected.value + (event.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length
    void nextTick(() => document.getElementById(`reader-excerpt-item-${selected.value}`)?.scrollIntoView({ block: 'nearest' }))
  } else if (event.key === 'Enter') {
    event.preventDefault()
    const item = list[selected.value]
    if (item) navigateTo(item)
  }
}

/* ------------------------------------------------------------------ */
/* 定位状态 / 排序键                                                    */
/* ------------------------------------------------------------------ */

let versionMap: VersionMap | null = null
const mapReady = ref(0)
onMounted(async () => {
  try {
    versionMap = await loadVersionMap(book.value.contentVersion)
  } catch {
    versionMap = null
  }
  mapReady.value += 1
})

const pageOrder = computed(() => new Map(book.value.pages.map((p, i) => [p.id, i])))
const activePageId = computed(() => String(frontmatter.value.readerPageId ?? ''))

function ordinalOf(chapterId: string, paragraphId: string): number {
  void mapReady.value
  if (versionMap) {
    const loc = pidLocation(versionMap, paragraphId)
    if (loc) return loc.index + 1
  }
  const m = paragraphId.match(/_(\d+)$/)
  return m ? Number.parseInt(m[1], 10) : 0
}

function posKey(chapterId: string, paragraphId: string): number {
  void mapReady.value
  const pi = pageOrder.value.get(chapterId) ?? 9999
  return pi * 1000000 + ordinalOf(chapterId, paragraphId)
}

type ItemStatus = 'ok' | 'relocated' | 'degraded' | 'missing'
function statusOf(h: Highlight): ItemStatus {
  void mapReady.value
  const root = document.querySelector<HTMLElement>('.reader-chapter .vp-doc')
  // 当前页：用真实定位结果
  if (root && h.chapterId === activePageId.value) {
    const paras = collectAnchorParagraphs(root)
    const result = resolveHighlight(h, { pageId: h.chapterId, paragraphs: paras })
    if (result.status === 'fuzzy') return 'relocated'
    if (result.status === 'paragraph') return 'degraded'
    if (result.status === 'missing') return 'missing'
    return 'ok'
  }
  if (versionMap) {
    if (pidLocation(versionMap, h.paragraphId)) return 'ok'
    return 'missing'
  }
  return 'ok'
}

const statusBadgeText: Record<ItemStatus, string> = {
  ok: '',
  relocated: '已重新定位',
  degraded: '定位失效',
  missing: '段落已不存在',
}

/* ------------------------------------------------------------------ */
/* 过滤 + 排序                                                          */
/* ------------------------------------------------------------------ */

const liveHighlightsOnly = computed(() => highlights.value.filter((h) => !h.deletedAt))
const liveBookmarksOnly = computed(() => bookmarks.value.filter((b) => !b.deletedAt))

const filteredHighlights = computed(() => {
  let list = liveHighlightsOnly.value
  if (volumeFilter.value) {
    list = list.filter((h) => book.value.pages.find((p) => p.id === h.chapterId)?.volumeId === volumeFilter.value)
  }
  if (chapterFilter.value) list = list.filter((h) => h.chapterId === chapterFilter.value)
  if (colorFilter.value.size) list = list.filter((h) => colorFilter.value.has(h.color))
  if (onlyNotes.value) list = list.filter((h) => Boolean(h.note))
  if (onlyDegraded.value) list = list.filter((h) => statusOf(h) === 'degraded' || statusOf(h) === 'missing')
  if (appliedQuery.value) list = list.filter((h) => matchesQuery(`${h.selector.exact}\n${h.note}`, appliedQuery.value))
  const sorted = [...list]
  if (sort.value === 'position') sorted.sort((a, b) => posKey(a.chapterId, a.paragraphId) - posKey(b.chapterId, b.paragraphId))
  else if (sort.value === 'created') sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  else sorted.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return sorted
})

const filteredBookmarks = computed(() => {
  let list = liveBookmarksOnly.value
  if (volumeFilter.value) {
    list = list.filter((b) => book.value.pages.find((p) => p.id === b.chapterId)?.volumeId === volumeFilter.value)
  }
  if (chapterFilter.value) list = list.filter((b) => b.chapterId === chapterFilter.value)
  if (appliedQuery.value) list = list.filter((b) => matchesQuery(`${b.label} ${firstSentence(b)}`, appliedQuery.value))
  const sorted = [...list]
  if (sort.value === 'position') sorted.sort((a, b) => posKey(a.chapterId, a.paragraphId) - posKey(b.chapterId, b.paragraphId))
  else if (sort.value === 'created') sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  else sorted.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return sorted
})

/* ------------------------------------------------------------------ */
/* 条目操作                                                            */
/* ------------------------------------------------------------------ */

function metaOf(chapterId: string): string {
  const meta = book.value.pages.find((p) => p.id === chapterId)
  return meta ? `${meta.volumeTitle} · ${meta.label}` : chapterId
}

function dateLabel(iso: string): string {
  return iso.slice(0, 10)
}

function firstSentence(b: LocalBookmark): string {
  if (b.label) return b.label
  const node = document.getElementById(b.paragraphId)
  const text = node?.textContent ?? ''
  if (!text) return `¶${ordinalOf(b.chapterId, b.paragraphId) || '?'}`
  let out = (text.split(/[。！？]/)[0] ?? text).slice(0, 40)
  if (text.length > out.length) out += '…'
  return out
}

function navigateTo(h: Highlight): void {
  emit('navigate', h.chapterId, h.paragraphId, h.id)
}

function navigateBookmark(b: LocalBookmark): void {
  emit('navigate', b.chapterId, b.paragraphId)
}

async function copyLink(h: Highlight): Promise<void> {
  try {
    const url = buildShareUrl(
      { chapterId: h.chapterId, start: h.selector.start, end: h.selector.end, exact: h.selector.exact, prefix: h.selector.prefix, suffix: h.selector.suffix },
      { base: `${window.location.origin}${withBase('')}`, versionPrefix: versionPrefix(book.value.contentVersion) },
    )
    await navigator.clipboard.writeText(url)
    push('链接已复制（不含批注）')
  } catch {
    push('链接生成或复制失败，请重试。', { kind: 'error' })
  }
}

async function removeHighlight(h: LocalHighlight): Promise<void> {
  const snapshot = { ...h }
  await softDeleteHighlight(h.id)
  push('已删除摘录', {
    action: {
      label: '撤销',
      run: () => void putHighlight({ ...snapshot, deletedAt: null, rev: snapshot.rev + 1, updatedAt: nowIso(), deviceId: deviceId() }),
    },
  })
}

async function removeBookmark(b: LocalBookmark): Promise<void> {
  const snapshot = { ...b }
  await softDeleteBookmark(b.id)
  push('已删除书签', {
    action: {
      label: '撤销',
      run: () => void putBookmark({ ...snapshot, deletedAt: null, rev: snapshot.rev + 1, updatedAt: nowIso(), deviceId: deviceId() }),
    },
  })
}

/* 批注原位编辑（同弹层规则：650ms 防抖 + Cmd/Ctrl+Enter + Esc 放弃） */
const editingId = ref<string | null>(null)
const draft = ref('')
let saveTimer: ReturnType<typeof setTimeout> | undefined
let discarding = false

function startEdit(h: LocalHighlight): void {
  editingId.value = h.id
  draft.value = h.note
}

async function saveDraft(): Promise<void> {
  const h = highlights.value.find((x) => x.id === editingId.value)
  if (!h || discarding || draft.value === h.note) return
  await putHighlight({ ...h, note: draft.value, updatedAt: nowIso(), rev: h.rev + 1, deviceId: deviceId() })
}

watch(draft, () => {
  if (!editingId.value) return
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => void saveDraft(), 650)
})

function onEditKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault()
    clearTimeout(saveTimer)
    void saveDraft().then(() => (editingId.value = null))
  } else if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    discarding = true
    clearTimeout(saveTimer)
    editingId.value = null
    void nextTick(() => (discarding = false))
  }
}

function onEditBlur(): void {
  if (!editingId.value || discarding) return
  clearTimeout(saveTimer)
  void saveDraft()
  editingId.value = null
}

/* ------------------------------------------------------------------ */
/* 批量模式                                                            */
/* ------------------------------------------------------------------ */

const batchMode = ref(false)
const selectedIds = ref<Set<string>>(new Set())
const batchDialog = ref<HTMLDialogElement | null>(null)

function toggleSelect(id: string): void {
  const next = new Set(selectedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedIds.value = next
}

function selectAll(): void {
  const list = tab.value === 'excerpts' ? filteredHighlights.value : filteredBookmarks.value
  selectedIds.value = new Set(list.map((x) => x.id))
}

function exitBatch(): void {
  batchMode.value = false
  selectedIds.value = new Set()
}

function askBatchDelete(): void {
  if (!selectedIds.value.size) return
  batchDialog.value?.showModal()
}

async function confirmBatchDelete(): Promise<void> {
  const ids = [...selectedIds.value]
  batchDialog.value?.close()
  if (tab.value === 'excerpts') {
    for (const id of ids) await softDeleteHighlight(id)
  } else {
    for (const id of ids) await softDeleteBookmark(id)
  }
  push(`已删除 ${ids.length} 条${tab.value === 'excerpts' ? '摘录' : '书签'}`)
  exitBatch()
}

async function exportSelected(): Promise<void> {
  try {
    const env = await buildExportEnvelope()
    const ids = selectedIds.value
    env.data.highlights = env.data.highlights.filter((h) => ids.has(h.id))
    env.data.bookmarks = env.data.bookmarks.filter((b) => ids.has(b.id))
    downloadJson(env)
    push(`已导出所选 ${ids.size} 条。`)
  } catch (e) {
    push(`导出失败：${(e as Error).message}`, { kind: 'error' })
  }
}

/* ------------------------------------------------------------------ */
/* 状态行（P0 恒「仅保存在本机」；P1 同步状态文案）                      */
/* ------------------------------------------------------------------ */

function relativeTime(iso: string | null): string {
  if (!iso) return ''
  const diff = Date.now() - Date.parse(iso)
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
  return iso.slice(0, 10)
}

const syncText = computed(() => {
  const s = status.value
  switch (s.state) {
    case 'synced': return `已同步 · ${relativeTime(s.lastSyncAt)}`
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

const degradedCount = computed(() => liveHighlightsOnly.value.filter((h) => statusOf(h) === 'degraded' || statusOf(h) === 'missing').length)
watch(degradedCount, (count) => {
  window.dispatchEvent(new CustomEvent('reader-excerpts:degraded', { detail: { count } }))
})
</script>

<template>
  <div class="reader-excerpts">
    <div class="reader-excerpts__toolbar">
      <div class="reader-segmented" role="tablist" aria-label="摘录与书签">
        <button role="tab" :aria-selected="tab === 'excerpts'" :class="{ 'is-active': tab === 'excerpts' }" @click="tab = 'excerpts'; exitBatch()">摘录</button>
        <button role="tab" :aria-selected="tab === 'bookmarks'" :class="{ 'is-active': tab === 'bookmarks' }" @click="tab = 'bookmarks'; exitBatch()">书签</button>
      </div>
      <input
        ref="searchInput"
        v-model="query"
        type="search"
        class="reader-excerpts__search"
        placeholder="搜索摘录"
        maxlength="200"
        autocomplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-controls="reader-excerpts-list"
        :aria-expanded="filteredHighlights.length > 0"
        :aria-activedescendant="filteredHighlights.length ? `reader-excerpt-item-${selected}` : undefined"
        aria-label="搜索摘录"
        @keydown="onSearchKeydown"
      />
    </div>

    <div class="reader-excerpts__filters">
      <button :ref="(el) => setMenuButton('volume', el)" type="button" class="reader-note-select reader-excerpts__filter" :aria-expanded="openMenu === 'volume'" @click="toggleMenu('volume')">
        {{ volumeFilter ? volumeOptions.find((v) => v.id === volumeFilter)?.title : '全卷' }} ▾
      </button>
      <button :ref="(el) => setMenuButton('chapter', el)" type="button" class="reader-note-select reader-excerpts__filter" :aria-expanded="openMenu === 'chapter'" @click="toggleMenu('chapter')">
        {{ chapterFilter ? chapterOptions.find((c) => c.id === chapterFilter)?.title : '全部章节' }} ▾
      </button>
      <button :ref="(el) => setMenuButton('colors', el)" type="button" class="reader-note-select reader-excerpts__filter" :aria-expanded="openMenu === 'colors'" @click="toggleMenu('colors')">
        颜色{{ colorFilter.size ? ` (${colorFilter.size})` : '' }} ▾
      </button>
      <label class="reader-excerpts__check"><input v-model="onlyNotes" type="checkbox" /> 只看有批注</label>
      <label class="reader-excerpts__check"><input v-model="onlyDegraded" type="checkbox" /> 定位失效</label>
    </div>

    <Teleport to="body">
      <div
        v-if="openMenu"
        ref="menuEl"
        class="reader-note-select__options reader-ui reader-excerpts__menu"
        :style="menuPos"
        role="group"
        aria-label="筛选"
        @keydown.esc.stop.prevent="openMenu = null"
      >
        <template v-if="openMenu === 'volume'">
          <label><input v-model="volumeFilter" type="radio" value="" /> 全卷</label>
          <label v-for="v in volumeOptions" :key="v.id"><input v-model="volumeFilter" type="radio" :value="v.id" /> {{ v.title }}</label>
        </template>
        <template v-else-if="openMenu === 'chapter'">
          <label><input v-model="chapterFilter" type="radio" value="" /> 全部章节</label>
          <label v-for="c in chapterOptions" :key="c.id"><input v-model="chapterFilter" type="radio" :value="c.id" /> {{ c.title }}</label>
        </template>
        <template v-else>
          <label v-for="c in colorOptions" :key="c.value">
            <input type="checkbox" :checked="colorFilter.has(c.value)" @change="toggleColor(c.value)" />
            <span class="reader-excerpts__swatch" :class="`reader-excerpts__swatch--${c.value}`" aria-hidden="true" /> {{ c.label }}
          </label>
        </template>
      </div>
    </Teleport>

    <div class="reader-excerpts__statusrow">
      <button type="button" class="reader-excerpts__status" @click="emit('openSync')">
        <template v-if="account">☁︎ {{ syncText }}</template>
        <template v-else>仅保存在本机</template>
      </button>
      <button v-if="account && status.conflicts > 0" type="button" class="reader-excerpts__conflicts" @click="emit('openSync')">{{ status.conflicts }} 条冲突待处理</button>
      <ReaderDataTools :selected-ids="[...selectedIds]" :filtered-ids="filteredHighlights.map((h) => h.id)" />
    </div>

    <div class="reader-excerpts__sortrow">
      <div class="reader-segmented" aria-label="排序">
        <button :class="{ 'is-active': sort === 'position' }" @click="sort = 'position'">正文位置</button>
        <button :class="{ 'is-active': sort === 'created' }" @click="sort = 'created'">最近创建</button>
        <button :class="{ 'is-active': sort === 'updated' }" @click="sort = 'updated'">最近修改</button>
      </div>
      <button type="button" class="reader-text-button" @click="batchMode ? exitBatch() : (batchMode = true)">
        {{ batchMode ? '退出批量' : '批量管理' }}
      </button>
    </div>

    <ul id="reader-excerpts-list" class="reader-excerpts__list" role="listbox" aria-label="摘录列表">
      <template v-if="tab === 'excerpts'">
        <li
          v-for="(h, index) in filteredHighlights"
          :id="`reader-excerpt-item-${index}`"
          :key="h.id"
          class="reader-excerpts__item"
          :class="{ selected: selected === index }"
          :style="{ borderLeftColor: `var(--reader-highlight-${h.color})` }"
          role="option"
          :aria-selected="selected === index"
        >
          <label v-if="batchMode" class="reader-excerpts__select">
            <input type="checkbox" :checked="selectedIds.has(h.id)" :aria-label="`选择摘录 ${index + 1}`" @change="toggleSelect(h.id)" />
          </label>
          <div class="reader-excerpts__body" @click="!batchMode && navigateTo(h)">
            <p class="reader-excerpts__exact">
              <template v-for="(part, pi) in parts(h.selector.exact)" :key="pi"><mark v-if="part.match">{{ part.text }}</mark><template v-else>{{ part.text }}</template></template>
            </p>
            <textarea
              v-if="editingId === h.id"
              v-model="draft"
              class="reader-excerpts__editor"
              aria-label="编辑批注"
              maxlength="20000"
              @keydown="onEditKeydown"
              @blur="onEditBlur"
              @click.stop
            />
            <p v-else-if="h.note" class="reader-excerpts__note" @click.stop="startEdit(h)">批注：{{ h.note }}</p>
            <p class="reader-excerpts__meta">
              {{ metaOf(h.chapterId) }} · {{ dateLabel(sort === 'created' ? h.createdAt : h.updatedAt) }}
              <span v-if="statusOf(h) !== 'ok'" class="reader-excerpts__badge">{{ statusBadgeText[statusOf(h)] }}</span>
            </p>
          </div>
          <div class="reader-excerpts__actions">
            <button type="button" class="reader-text-button" @click="navigateTo(h)">跳转</button>
            <button type="button" class="reader-text-button" :aria-label="`复制摘录 ${index + 1} 的永久链接`" @click="copyLink(h)">🔗</button>
            <button type="button" class="reader-text-button" :aria-label="`删除摘录 ${index + 1}`" @click="removeHighlight(h)">🗑</button>
          </div>
        </li>
      </template>
      <template v-else>
        <li
          v-for="(b, index) in filteredBookmarks"
          :key="b.id"
          class="reader-excerpts__item reader-excerpts__item--bookmark"
          role="option"
          :aria-selected="false"
        >
          <label v-if="batchMode" class="reader-excerpts__select">
            <input type="checkbox" :checked="selectedIds.has(b.id)" :aria-label="`选择书签 ${index + 1}`" @change="toggleSelect(b.id)" />
          </label>
          <div class="reader-excerpts__body" @click="!batchMode && navigateBookmark(b)">
            <p class="reader-excerpts__exact">🔖 {{ firstSentence(b) }}</p>
            <p class="reader-excerpts__meta">{{ metaOf(b.chapterId) }} · {{ dateLabel(b.createdAt) }}</p>
          </div>
          <div class="reader-excerpts__actions">
            <button type="button" class="reader-text-button" @click="navigateBookmark(b)">跳转</button>
            <button type="button" class="reader-text-button" :aria-label="`删除书签 ${index + 1}`" @click="removeBookmark(b)">🗑</button>
          </div>
        </li>
      </template>
    </ul>

    <p v-if="tab === 'excerpts' && !liveHighlightsOnly.length" class="reader-excerpts__empty">
      选中正文文字即可划线摘录。摘录保存在本机，连接 OneDrive 后可跨设备同步。
    </p>
    <p v-else-if="tab === 'bookmarks' && !liveBookmarksOnly.length" class="reader-excerpts__empty">
      在选区工具条上点 🔖，为段落加书签。
    </p>
    <p v-else-if="tab === 'excerpts' && !filteredHighlights.length" class="reader-excerpts__empty">没有符合筛选条件的摘录。</p>
    <p v-else-if="tab === 'bookmarks' && !filteredBookmarks.length" class="reader-excerpts__empty">没有符合筛选条件的书签。</p>

    <div v-if="batchMode" class="reader-excerpts__batchbar">
      <button type="button" class="reader-text-button" @click="selectAll">全选</button>
      <button type="button" class="reader-text-button" :disabled="!selectedIds.size" @click="exportSelected">导出所选</button>
      <button type="button" class="reader-excerpts__batchdelete" :disabled="!selectedIds.size" @click="askBatchDelete">删除所选 ({{ selectedIds.size }})</button>
    </div>

    <dialog
      ref="batchDialog"
      class="reader-data-dialog reader-ui"
      aria-labelledby="reader-batch-title"
      @cancel.prevent="batchDialog?.close()"
      @click="($event.target === batchDialog) && batchDialog?.close()"
    >
      <div class="reader-data-dialog__header">
        <h2 id="reader-batch-title">批量删除</h2>
        <button type="button" class="reader-data-dialog__close" aria-label="关闭确认对话框" autofocus @click="batchDialog?.close()">×</button>
      </div>
      <p class="reader-data-dialog__meta">删除 {{ selectedIds.size }} 条{{ tab === 'excerpts' ? '摘录' : '书签' }}？此操作不可撤销。</p>
      <div class="reader-data-dialog__actions">
        <button type="button" class="reader-text-button" @click="batchDialog?.close()">取消</button>
        <button type="button" class="reader-data-dialog__primary" @click="confirmBatchDelete">确认删除</button>
      </div>
    </dialog>
  </div>
</template>