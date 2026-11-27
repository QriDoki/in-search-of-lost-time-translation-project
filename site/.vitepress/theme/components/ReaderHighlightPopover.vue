<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { onContentUpdated, useData, useRouter, withBase } from 'vitepress'
import { useBook, versionPrefix } from '../composables/book'
import { usePopoverPosition } from '../composables/usePopoverPosition'
import { useSelection } from '../composables/useSelection'
import { useToasts } from '../composables/useToasts'
import {
  buildShareUrl,
  clearHighlightMarks,
  collectAnchorParagraphs,
  currentDb,
  deviceId,
  getHighlight,
  liveBookmarks,
  liveHighlights,
  loadFuzzyMatcher,
  loadVersionMap,
  nowIso,
  pidLocation,
  putBookmark,
  putHighlight,
  reanchor,
  renderHighlights,
  resolveHighlight,
  softDeleteBookmark,
  softDeleteHighlight,
  useSyncState,
  useUserStorage,
  uuidv7,
  type AnchorResult,
  type HighlightColor,
  type LocalBookmark,
  type LocalHighlight,
  type ParagraphInfo,
} from '../composables/user-storage'

/** 属性选择器转义（id 可能来自导入数据）。 */
function cssEscape(value: string): string {
  return value.replace(/["\\]/g, '\\$&')
}

const props = defineProps<{
  highlightId?: string | null
  anchorEl?: HTMLElement | null
  startInEdit?: boolean
}>()
const emit = defineEmits<{ close: [] }>()

const { frontmatter } = useData()
const { book } = useBook()
const router = useRouter()
const { mode, scope, account } = useUserStorage()
const { status: syncStatus } = useSyncState()
const { push } = useToasts()

const pageId = computed(() => String(frontmatter.value.readerPageId ?? ''))
const pageMeta = computed(() => book.value.pages.find((p) => p.id === pageId.value))
const isCopyright = computed(() => pageMeta.value?.kind === 'copyright')

/* ------------------------------------------------------------------ */
/* 正文 mark 渲染管线（摘录层宿主）                                      */
/* ------------------------------------------------------------------ */

const highlights = ref<LocalHighlight[]>([])
const bookmarks = ref<LocalBookmark[]>([])
const resolutions = new Map<string, AnchorResult>()
let liveSub: { unsubscribe(): void } | null = null
let bmSub: { unsubscribe(): void } | null = null
let renderGeneration = 0
let mounted = false

function bindLive(): void {
  liveSub?.unsubscribe()
  bmSub?.unsubscribe()
  liveSub = null
  bmSub = null
  if (mode.value !== 'idb') {
    highlights.value = []
    bookmarks.value = []
    return
  }
  liveSub = liveHighlights().subscribe({
    next: (rows) => {
      highlights.value = rows
      void renderMarks()
      refreshActive()
    },
    error: () => {},
  })
  bmSub = liveBookmarks().subscribe({
    next: (rows) => {
      bookmarks.value = rows
      void renderMarks()
    },
    error: () => {},
  })
}

function doubleRaf(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
}

async function renderMarks(): Promise<void> {
  const generation = ++renderGeneration
  const root = document.querySelector<HTMLElement>('.reader-chapter .vp-doc')
  const pid = pageId.value
  if (!root || !pid || isCopyright.value) return
  await nextTick()
  await doubleRaf()
  if (generation !== renderGeneration || !mounted) return
  const paras = collectAnchorParagraphs(root)
  if (generation !== renderGeneration || !mounted) return
  clearHighlightMarks(root)
  resolutions.clear()
  const ctx = { pageId: pid, paragraphs: paras }
  const items: { id: string; color: HighlightColor; result: AnchorResult; hasNote: boolean }[] = []
  for (const h of highlights.value) {
    if (h.deletedAt || h.chapterId !== pid) continue
    const result = resolveHighlight(h, ctx)
    resolutions.set(h.id, result)
    items.push({ id: h.id, color: h.color, result, hasNote: Boolean(h.note) })
  }
  // F2-1：级别 1/2 失败才懒加载 dmp（主 bundle 不吸收），重解析降级项。
  if (items.some((i) => i.result.status === 'paragraph' || i.result.status === 'missing')) {
    try {
      await loadFuzzyMatcher()
    } catch {
      // dmp 不可用 → 保持段落级降级
    }
    if (generation !== renderGeneration || !mounted) return
    for (const item of items) {
      if (item.result.status !== 'paragraph' && item.result.status !== 'missing') continue
      const h = highlights.value.find((x) => x.id === item.id)
      if (!h) continue
      item.result = resolveHighlight(h, ctx)
      resolutions.set(item.id, item.result)
    }
  }
  renderHighlights(items, root)
  renderBookmarkIcons(root, paras)
  const degradedIds = items.filter((i) => i.result.status === 'paragraph' || i.result.status === 'missing').map((i) => i.id)
  window.dispatchEvent(new CustomEvent('reader-excerpts:degraded', { detail: { count: degradedIds.length } }))
  void notifyNewDegraded(degradedIds)
  // 弹层先于 mark 打开时（工具条创建即开弹层），渲染完成后补定位。
  if (activeId.value) {
    update()
    observe()
  }
  consumePendingOpen()
}

/* 书签页边图标（F0-5）：空按钮 + CSS ::before，避免污染段落 textContent/指纹。 */
function renderBookmarkIcons(root: HTMLElement, paras: ParagraphInfo[]): void {
  root.querySelectorAll('.reader-bookmark-toggle').forEach((el) => el.remove())
  root.querySelectorAll('.reader-bookmark-host').forEach((el) => el.classList.remove('reader-bookmark-host'))
  const byPara = new Map(bookmarks.value.filter((b) => !b.deletedAt && b.chapterId === pageId.value).map((b) => [b.paragraphId, b]))
  for (const para of paras) {
    const bm = byPara.get(para.id)
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = `reader-bookmark-toggle${bm ? ' is-bookmarked' : ''}`
    btn.dataset.bookmarkParagraph = para.id
    btn.setAttribute('aria-label', bm ? '移除书签' : '添加书签')
    para.node.classList.add('reader-bookmark-host')
    para.node.append(btn)
  }
}

async function onBookmarkClick(event: MouseEvent): Promise<void> {
  const btn = event.target instanceof Element ? event.target.closest<HTMLElement>('.reader-bookmark-toggle') : null
  if (!btn) return
  event.preventDefault()
  const paragraphId = btn.dataset.bookmarkParagraph ?? ''
  const existing = bookmarks.value.find((b) => !b.deletedAt && b.chapterId === pageId.value && b.paragraphId === paragraphId)
  if (existing) {
    await softDeleteBookmark(existing.id)
    push('已移除书签', {
      action: {
        label: '撤销',
        run: () => void putBookmark({ ...existing, deletedAt: null, rev: existing.rev + 1, updatedAt: nowIso(), deviceId: deviceId() }),
      },
    })
  } else {
    const now = nowIso()
    await putBookmark({
      id: uuidv7(),
      schemaVersion: 1,
      chapterId: pageId.value,
      paragraphId,
      label: '',
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      rev: 1,
      deviceId: deviceId(),
    })
    push('已添加书签')
  }
}

/* ------------------------------------------------------------------ */
/* 弹层状态                                                            */
/* ------------------------------------------------------------------ */

const activeId = ref<string | null>(null)
const record = ref<LocalHighlight | null>(null)
const pinned = ref(false)
const editing = ref(false)
const draft = ref('')
const popoverEl = ref<HTMLElement | null>(null)
const textareaEl = ref<HTMLTextAreaElement | null>(null)
const locationLabel = ref('')
let externalAnchor: HTMLElement | null = null
let hideTimer: ReturnType<typeof setTimeout> | undefined
let hoverTimer: ReturnType<typeof setTimeout> | undefined
let saveTimer: ReturnType<typeof setTimeout> | undefined
let discarding = false
let pendingOpen: { id: string; startInEdit?: boolean; flash?: boolean; at: number } | null = null

/* F2-3：pink 第 5 色。 */
const colors: { value: HighlightColor; label: string }[] = [
  { value: 'yellow', label: '黄色' },
  { value: 'green', label: '绿色' },
  { value: 'blue', label: '蓝色' },
  { value: 'pink', label: '粉色' },
  { value: 'purple', label: '紫色' },
]

/* F2-3：重叠点击 → 列出覆盖该位置的摘录（嵌套 mark 祖先链）。 */
const listIds = ref<string[]>([])
const listRecords = ref<LocalHighlight[]>([])

function markChain(mark: HTMLElement): string[] {
  const ids: string[] = []
  let el: HTMLElement | null = mark
  while (el) {
    const id = el.dataset?.readerHighlight
    if (id && !ids.includes(id)) ids.push(id)
    el = el.parentElement?.closest<HTMLElement>('mark[data-reader-highlight]') ?? null
  }
  return ids
}

async function openList(ids: string[], anchor: HTMLElement): Promise<void> {
  cancelHide()
  const records = await Promise.all(ids.map((id) => getHighlight(id).catch(() => null)))
  listRecords.value = records.filter((r): r is LocalHighlight => !!r && !r.deletedAt)
  if (!listRecords.value.length) return
  listIds.value = ids
  activeId.value = null
  record.value = null
  pinned.value = true
  externalAnchor = anchor
  window.dispatchEvent(new CustomEvent('reader-popover:open', { detail: { source: 'highlight' } }))
  await nextTick()
  update()
  observe()
}

function openFromList(id: string): void {
  const anchor = externalAnchor
  listIds.value = []
  listRecords.value = []
  void open(id, { pin: true, anchor })
}

function openPanelFromList(): void {
  window.dispatchEvent(new CustomEvent('reader-panel:open', { detail: 'excerpts' }))
  close()
}

function anchorMark(): HTMLElement | null {
  if (externalAnchor?.isConnected) return externalAnchor
  const id = activeId.value
  if (!id) return null
  const mark = document.querySelector<HTMLElement>(`mark[data-reader-highlight="${cssEscape(id)}"]`)
  if (mark) return mark
  const result = resolutions.get(id)
  if (result?.status === 'paragraph') {
    return document.getElementById(result.paragraphId)
  }
  return null
}

const { position, positioned, update, observe, reset, start, dispose } = usePopoverPosition(
  anchorMark,
  () => popoverEl.value,
  { onAnchorMissing: () => close() },
)

const statusBadge = computed(() => {
  const id = activeId.value
  if (!id) return ''
  const result = resolutions.get(id)
  if (!result) return ''
  if (result.status === 'fuzzy') return '译文已更新，按相似文本定位'
  if (result.status === 'paragraph') return '定位失效'
  if (result.status === 'missing') return '段落已不存在'
  return ''
})

/**
 * G4（interaction §2.3）：仅「同步失败且该条受影响」时显示。
 * 健康 pending/dirty 不显示同步细节；error = 非网络失败重试耗尽（§6.1）。
 * 数据模型无逐条失败标记，以引擎失败态 + 该条 dirty 在队为「受影响」判据。
 */
const unsynced = computed(
  () => Boolean(account.value) && record.value?.local.dirty === 1 && syncStatus.value.state === 'error',
)
const hasConflict = computed(() => (record.value?.conflicts?.length ?? 0) > 0)

function cancelHide(): void {
  clearTimeout(hideTimer)
  clearTimeout(hoverTimer)
}

function close(restoreFocus = false): void {
  cancelHide()
  clearTimeout(saveTimer)
  const previous = anchorMark()
  activeId.value = null
  record.value = null
  listIds.value = []
  listRecords.value = []
  pinned.value = false
  editing.value = false
  externalAnchor = null
  reset()
  emit('close')
  if (restoreFocus) previous?.focus({ preventScroll: true })
}

async function open(
  id: string,
  opts: { pin?: boolean; startInEdit?: boolean; focus?: boolean; anchor?: HTMLElement | null } = {},
): Promise<void> {
  cancelHide()
  let rec: LocalHighlight | null = null
  try {
    rec = await getHighlight(id)
  } catch {
    return // db 未就绪
  }
  if (!rec || rec.deletedAt) return
  activeId.value = id
  record.value = rec
  pinned.value = opts.pin ?? true
  editing.value = false
  draft.value = rec.note
  externalAnchor = opts.anchor ?? null
  window.dispatchEvent(new CustomEvent('reader-popover:open', { detail: { source: 'highlight' } }))
  await nextTick()
  if (activeId.value !== id) return
  update()
  observe()
  void refreshLocationLabel()
  if (opts.startInEdit) startEdit()
  else if (opts.focus) popoverEl.value?.focus({ preventScroll: true })
}

function refreshActive(): void {
  const id = activeId.value
  if (!id) return
  const fresh = highlights.value.find((h) => h.id === id)
  if (!fresh || fresh.deletedAt) {
    close()
    return
  }
  // 外部变更（同步/面板编辑）刷新展示；编辑中不覆盖草稿。
  if (!editing.value) {
    record.value = fresh
    draft.value = fresh.note
  }
}

async function refreshLocationLabel(): Promise<void> {
  const rec = record.value
  if (!rec) return
  const meta = book.value.pages.find((p) => p.id === rec.chapterId)
  let ordinal = 0
  if (rec.chapterId === pageId.value) {
    const root = document.querySelector<HTMLElement>('.reader-chapter .vp-doc')
    if (root) ordinal = collectAnchorParagraphs(root).findIndex((p) => p.id === rec.paragraphId) + 1
  }
  if (!ordinal) {
    try {
      const map = await loadVersionMap(book.value.contentVersion)
      ordinal = (pidLocation(map, rec.paragraphId)?.index ?? -1) + 1
    } catch {
      ordinal = 0
    }
  }
  locationLabel.value = meta ? `${meta.volumeTitle} · ${meta.label}${ordinal ? ` · ¶${ordinal}` : ''}` : rec.chapterId
}

function consumePendingOpen(): void {
  if (!pendingOpen) return
  const { id, startInEdit, flash, at } = pendingOpen
  if (Date.now() - at > 5000) {
    pendingOpen = null
    return
  }
  const rec = highlights.value.find((h) => h.id === id && !h.deletedAt && h.chapterId === pageId.value)
  if (!rec) return
  pendingOpen = null
  if (flash) flashTarget(id)
  void open(id, { pin: true, startInEdit })
}

function hidePreview(): void {
  if (pinned.value) return
  cancelHide()
  hideTimer = setTimeout(() => close(), 120)
}

function flashTarget(id: string): void {
  const targets: HTMLElement[] = []
  document.querySelectorAll<HTMLElement>(`mark[data-reader-highlight="${cssEscape(id)}"]`).forEach((m) => targets.push(m))
  const result = resolutions.get(id)
  if (result?.status === 'paragraph') {
    const para = document.getElementById(result.paragraphId)
    if (para) targets.push(para)
  }
  for (const el of targets) {
    el.classList.add('reader-flash')
    setTimeout(() => el.classList.remove('reader-flash'), 2000)
  }
}

/* F2-1：译文更新后首次出现新失效摘录 → 一条非阻塞 toast（每版本一次）。 */
async function notifyNewDegraded(degradedIds: string[]): Promise<void> {
  if (!degradedIds.length || mode.value !== 'idb') return
  try {
    const key = `degradedSeen:${book.value.buildVersion}`
    const seen = ((await currentDb().meta.get(key))?.value as string[]) ?? []
    const fresh = degradedIds.filter((id) => !seen.includes(id))
    if (!fresh.length) return
    await currentDb().meta.put({ key, value: degradedIds })
    push(`译文已更新，${fresh.length} 条摘录需要重新定位`, {
      kind: 'info',
      action: {
        label: '查看',
        run: () => {
          window.dispatchEvent(new CustomEvent('reader-panel:open', { detail: 'excerpts' }))
          window.dispatchEvent(new CustomEvent('reader-excerpts:show-degraded'))
        },
      },
    })
  } catch {
    // meta 不可写不阻塞阅读
  }
}

/* ------------------------------------------------------------------ */
/* 手动重锚（F2-1：显式确认才写 selector；取消原样保留）                 */
/* ------------------------------------------------------------------ */

const reanchorMode = ref(false)
const reanchorRecord = ref<LocalHighlight | null>(null)
const reanchorSel = useSelection({ enabled: () => reanchorMode.value, debounce: 100 })
const reanchorSelection = reanchorSel.selection

const canReanchor = computed(() => {
  const result = resolutions.get(activeId.value ?? '')
  return result?.status === 'paragraph' || result?.status === 'missing'
})

function startReanchor(): void {
  const rec = record.value
  if (!rec) return
  reanchorRecord.value = rec
  reanchorMode.value = true
  close()
  window.dispatchEvent(new CustomEvent('reader-reanchor:active', { detail: true }))
  reanchorSel.start()
  const result = resolutions.get(rec.id)
  const target = result?.status === 'paragraph' ? document.getElementById(result.paragraphId) : null
  ;(target ?? document.querySelector('.reader-chapter .vp-doc'))?.scrollIntoView({ block: 'center' })
}

async function confirmReanchor(): Promise<void> {
  const rec = reanchorRecord.value
  const sel = reanchorSelection.value
  if (!rec || !sel) return
  try {
    await putHighlight(reanchor(rec, sel.anchor, book.value.buildVersion))
    push('已重新关联')
  } catch (e) {
    push(`重新关联失败：${(e as Error).message}`, { kind: 'error' })
  }
  exitReanchor()
}

function reselectReanchor(): void {
  reanchorSel.dismiss()
  window.getSelection()?.removeAllRanges()
}

function exitReanchor(): void {
  reanchorMode.value = false
  reanchorRecord.value = null
  reanchorSel.stop()
  window.dispatchEvent(new CustomEvent('reader-reanchor:active', { detail: false }))
}

/* ------------------------------------------------------------------ */
/* hover 预览 / click pin（复用 ReaderAnnotations 双态范式）             */
/* ------------------------------------------------------------------ */

function findMark(target: EventTarget | null): HTMLElement | null {
  return target instanceof Element ? target.closest<HTMLElement>('mark[data-reader-highlight]') : null
}

function onPointerOver(event: PointerEvent): void {
  if (event.pointerType !== 'mouse' || !window.matchMedia('(any-hover: hover)').matches || pinned.value) return
  const mark = findMark(event.target)
  if (!mark) return
  const id = mark.dataset.readerHighlight ?? ''
  cancelHide()
  hoverTimer = setTimeout(() => void open(id, { pin: false, anchor: mark }), 300)
}

function onPointerOut(event: PointerEvent): void {
  if (event.pointerType !== 'mouse' || pinned.value) return
  const mark = findMark(event.target)
  if (!mark || mark.dataset.readerHighlight !== activeId.value) return
  if (event.relatedTarget instanceof Node && popoverEl.value?.contains(event.relatedTarget)) return
  cancelHide()
  hideTimer = setTimeout(() => close(), 120)
}

function onClick(event: MouseEvent): void {
  const mark = findMark(event.target)
  if (!mark) return
  event.preventDefault()
  const chain = markChain(mark)
  if (chain.length > 1) {
    void openList(chain, mark)
    return
  }
  void open(chain[0] ?? '', { pin: true, focus: event.detail === 0, anchor: mark })
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && reanchorMode.value) {
    event.preventDefault()
    event.stopPropagation()
    exitReanchor()
    return
  }
  // Esc：编辑态交给编辑器；否则关闭弹层并归还焦点（capture 先于 Dock 面板监听）。
  if (event.key === 'Escape' && activeId.value) {
    if (editing.value && popoverEl.value?.contains(event.target as Node)) return
    event.preventDefault()
    event.stopPropagation()
    close(true)
    return
  }
  if (event.key === 'Enter' && event.target instanceof HTMLElement) {
    const mark = event.target.closest<HTMLElement>('mark[data-reader-highlight]')
    if (mark) {
      event.preventDefault()
      void open(mark.dataset.readerHighlight ?? '', { pin: true, focus: true, anchor: mark })
    }
  }
}

function onPopoverOpen(event: Event): void {
  const source = (event as CustomEvent<{ source: string }>).detail?.source
  if (source && source !== 'highlight') close()
}

function onOpenRequest(event: Event): void {
  const detail = (event as CustomEvent<{ id: string; startInEdit?: boolean; flash?: boolean }>).detail
  if (!detail?.id) return
  const rec = highlights.value.find((h) => h.id === detail.id && !h.deletedAt)
  if (rec && rec.chapterId === pageId.value) {
    if (detail.flash) flashTarget(detail.id)
    void open(detail.id, { pin: true, startInEdit: detail.startInEdit })
  } else {
    // 跨页跳转：等新页渲染完成后消费。
    pendingOpen = { ...detail, at: Date.now() }
  }
}

/* ------------------------------------------------------------------ */
/* 批注编辑（650ms 防抖 + Cmd/Ctrl+Enter + Esc 放弃）                    */
/* ------------------------------------------------------------------ */

function startEdit(): void {
  if (!record.value) return
  editing.value = true
  draft.value = record.value.note
  void nextTick(() => {
    const el = textareaEl.value
    if (!el) return
    el.focus({ preventScroll: true })
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`
  })
}

async function saveDraft(): Promise<void> {
  const rec = record.value
  if (!rec || discarding) return
  if (draft.value === rec.note) return
  const updated = { ...rec, note: draft.value, updatedAt: nowIso(), rev: rec.rev + 1, deviceId: deviceId() }
  try {
    await putHighlight(updated)
    record.value = { ...updated, local: rec.local }
  } catch (e) {
    push(`批注保存失败：${(e as Error).message}`, { kind: 'error' })
  }
}

watch(draft, () => {
  if (!editing.value) return
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => void saveDraft(), 650)
})

function onEditorKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault()
    clearTimeout(saveTimer)
    void saveDraft().then(() => {
      editing.value = false
    })
  } else if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    discarding = true
    clearTimeout(saveTimer)
    draft.value = record.value?.note ?? ''
    editing.value = false
    void nextTick(() => {
      discarding = false
    })
  }
}

function onEditorBlur(): void {
  if (!editing.value || discarding) return
  clearTimeout(saveTimer)
  void saveDraft()
  editing.value = false
}

/* ------------------------------------------------------------------ */
/* 改色 / 删除撤销 / 复制链接 / 跳转                                     */
/* ------------------------------------------------------------------ */

async function setColor(color: HighlightColor): Promise<void> {
  const rec = record.value
  if (!rec || rec.color === color) return
  const updated = { ...rec, color, updatedAt: nowIso(), rev: rec.rev + 1, deviceId: deviceId() }
  await putHighlight(updated)
  record.value = { ...updated, local: rec.local }
}

async function remove(): Promise<void> {
  const rec = record.value
  if (!rec) return
  const snapshot = { ...rec }
  await softDeleteHighlight(rec.id)
  close()
  push('已删除摘录', {
    action: {
      label: '撤销',
      run: () => void putHighlight({ ...snapshot, deletedAt: null, rev: snapshot.rev + 1, updatedAt: nowIso(), deviceId: deviceId() }),
    },
  })
}

async function copyLink(): Promise<void> {
  const rec = record.value
  if (!rec) return
  try {
    const url = buildShareUrl(
      {
        chapterId: rec.chapterId,
        start: rec.selector.start,
        end: rec.selector.end,
        exact: rec.selector.exact,
        prefix: rec.selector.prefix,
        suffix: rec.selector.suffix,
      },
      { base: `${window.location.origin}${withBase('')}`, versionPrefix: versionPrefix(book.value.contentVersion) },
    )
    await navigator.clipboard.writeText(url)
    push('链接已复制（不含批注）')
  } catch {
    push('链接生成或复制失败，请重试。', { kind: 'error' })
  }
}

function scrollToTarget(id: string): void {
  let el = anchorMark()
  if (!el) {
    const result = resolutions.get(id)
    if (result?.status === 'paragraph') el = document.getElementById(result.paragraphId)
  }
  if (!el) return
  const top = el.getBoundingClientRect().top + window.scrollY - Math.max(90, window.innerHeight * 0.35)
  window.scrollTo({ top: Math.max(0, top), behavior: 'instant' })
  flashTarget(id)
}

async function navigateTo(): Promise<void> {
  const rec = record.value
  if (!rec) return
  if (rec.chapterId === pageId.value) {
    scrollToTarget(rec.id)
    return
  }
  const meta = book.value.pages.find((p) => p.id === rec.chapterId)
  if (!meta) return
  close()
  pendingOpen = { id: rec.id, flash: true, at: Date.now() }
  await router.go(`${withBase(meta.path)}#${rec.paragraphId}`)
}

function openSync(): void {
  window.dispatchEvent(new CustomEvent('reader-panel:open', { detail: 'sync' }))
}

/* ------------------------------------------------------------------ */
/* 生命周期                                                            */
/* ------------------------------------------------------------------ */

watch([mode, scope], bindLive)
watch(pageId, () => {
  close()
  void renderMarks()
})
watch(
  () => props.highlightId,
  (id) => {
    if (id) void open(id, { pin: true, startInEdit: props.startInEdit, anchor: props.anchorEl ?? null })
    else close()
  },
  { immediate: true },
)

onContentUpdated(() => {
  if (mounted) void renderMarks()
})

onMounted(() => {
  mounted = true
  start()
  bindLive()
  void renderMarks()
  document.addEventListener('pointerover', onPointerOver)
  document.addEventListener('pointerout', onPointerOut)
  document.addEventListener('click', onClick)
  document.addEventListener('click', onBookmarkClick)
  document.addEventListener('keydown', onKeydown, true)
  window.addEventListener('reader-popover:open', onPopoverOpen)
  window.addEventListener('reader-highlight:open', onOpenRequest)
})

onBeforeUnmount(() => {
  mounted = false
  close()
  dispose()
  liveSub?.unsubscribe()
  bmSub?.unsubscribe()
  document.removeEventListener('pointerover', onPointerOver)
  document.removeEventListener('pointerout', onPointerOut)
  document.removeEventListener('click', onClick)
  document.removeEventListener('click', onBookmarkClick)
  document.removeEventListener('keydown', onKeydown, true)
  window.removeEventListener('reader-popover:open', onPopoverOpen)
  window.removeEventListener('reader-highlight:open', onOpenRequest)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="activeId && pinned"
      class="reader-annotation-backdrop reader-ui"
      aria-hidden="true"
      @click="close()"
    />
    <aside
      v-if="(activeId && record) || listIds.length"
      id="reader-highlight-popover"
      ref="popoverEl"
      class="reader-highlight-popover reader-ui"
      :class="{ 'is-preview': !pinned }"
      role="dialog"
      aria-label="摘录"
      tabindex="-1"
      :style="{ ...position, visibility: positioned ? 'visible' : 'hidden' }"
      @pointerenter="cancelHide"
      @pointerleave="hidePreview"
    >
      <template v-if="listIds.length">
        <p class="reader-highlight-popover__listtitle">此位置有 {{ listRecords.length }} 条摘录</p>
        <button
          v-for="r in listRecords.slice(0, 3)"
          :key="r.id"
          type="button"
          class="reader-highlight-popover__listitem"
          @click="openFromList(r.id)"
        >
          <span class="reader-highlight-popover__listswatch" :class="`reader-highlight-popover__listswatch--${r.color}`" aria-hidden="true" />
          <span>{{ r.selector.exact.length > 40 ? r.selector.exact.slice(0, 40) + '…' : r.selector.exact }}</span>
        </button>
        <button v-if="listRecords.length > 3" type="button" class="reader-text-button" @click="openPanelFromList">在摘录面板中查看全部</button>
      </template>
      <template v-else-if="record">
      <blockquote class="reader-highlight-popover__exact">{{ record.selector.exact }}</blockquote>
      <p v-if="statusBadge" class="reader-highlight-popover__badge">{{ statusBadge }}</p>

      <textarea
        v-if="editing && pinned"
        ref="textareaEl"
        v-model="draft"
        class="reader-highlight-popover__editor"
        aria-label="批注"
        maxlength="20000"
        @keydown="onEditorKeydown"
        @blur="onEditorBlur"
      />
      <p
        v-else
        class="reader-highlight-popover__note"
        :class="{ 'is-empty': !record.note }"
        @click="pinned && startEdit()"
      >{{ record.note || '添加批注…' }}</p>

      <template v-if="pinned">
        <div class="reader-highlight-popover__meta">
          <div class="reader-highlight-popover__colors" role="group" aria-label="高亮颜色">
            <button
              v-for="color in colors"
              :key="color.value"
              type="button"
              class="reader-highlight-popover__color"
              :class="`reader-highlight-popover__color--${color.value}`"
              :aria-label="`${color.label}高亮`"
              :aria-pressed="record.color === color.value"
              @click="setColor(color.value)"
            />
          </div>
          <button type="button" class="reader-highlight-popover__location" @click="navigateTo">{{ locationLabel }}</button>
        </div>
        <div class="reader-highlight-popover__actions">
          <button type="button" class="reader-text-button" @click="startEdit">✎ 编辑批注</button>
          <button type="button" class="reader-text-button" @click="copyLink">🔗 复制链接</button>
          <button type="button" class="reader-text-button" @click="remove">🗑 删除</button>
          <button v-if="canReanchor" type="button" class="reader-text-button" @click="startReanchor">重新关联</button>
        </div>
        <button v-if="unsynced" type="button" class="reader-highlight-popover__unsynced" @click="openSync">未同步 · 查看详情</button>
        <button v-if="hasConflict" type="button" class="reader-highlight-popover__unsynced" @click="openSync">冲突待处理</button>
      </template>
      </template>
    </aside>

    <div v-if="reanchorMode" class="reader-reanchor-banner reader-ui" role="dialog" aria-label="重新关联摘录">
      <div class="reader-reanchor-banner__row">
        <span v-if="!reanchorSelection" class="reader-reanchor-banner__hint">选中与摘录对应的文字</span>
        <template v-else>
          <span class="reader-reanchor-banner__hint">关联到这段文字？</span>
          <button type="button" class="reader-reanchor-banner__confirm" @click="confirmReanchor">确认</button>
          <button type="button" class="reader-text-button" @click="reselectReanchor">重选</button>
        </template>
        <button type="button" class="reader-text-button reader-reanchor-banner__cancel" @click="exitReanchor">取消</button>
      </div>
      <details class="reader-reanchor-banner__compare">
        <summary>摘录原文对照</summary>
        <blockquote>{{ reanchorRecord?.selector.exact }}</blockquote>
      </details>
    </div>
  </Teleport>
</template>