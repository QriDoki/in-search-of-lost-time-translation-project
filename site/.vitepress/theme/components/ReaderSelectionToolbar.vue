<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useData, withBase } from 'vitepress'
import { useBook, versionPrefix } from '../composables/book'
import { useSelection } from '../composables/useSelection'
import { computePopoverPosition } from '../composables/usePopoverPosition'
import { useToasts } from '../composables/useToasts'
import {
  buildShareUrl,
  collectAnchorParagraphs,
  deviceId,
  fnv1a36,
  listBookmarks,
  listHighlights,
  nowIso,
  putBookmark,
  putHighlight,
  resolveHighlight,
  softDeleteBookmark,
  useUserStorage,
  uuidv7,
  type Bookmark,
  type Highlight,
  type HighlightColor,
  type LocalHighlight,
  type ParagraphInfo,
  type ParagraphRange,
  type SelectionAnchor,
} from '../composables/user-storage'

const { frontmatter } = useData()
const { book } = useBook()
const { mode } = useUserStorage()
const { push } = useToasts()

/** 属性选择器转义（id 可能来自导入数据）。 */
function cssEscape(value: string): string {
  return value.replace(/["\\]/g, '\\$&')
}

const pageId = computed(() => String(frontmatter.value.readerPageId ?? ''))
const pageKind = computed(() => book.value.pages.find((p) => p.id === pageId.value)?.kind ?? '')
const reanchorActive = ref(false)
const enabled = computed(
  () => Boolean(pageId.value) && pageKind.value !== 'copyright' && mode.value === 'idb' && !reanchorActive.value,
)

const { selection, dismiss, start, stop } = useSelection({ enabled: () => enabled.value })
const visible = computed(() => enabled.value && selection.value !== null)

/* 触屏 = 底部固定动作栏（不覆盖系统选区菜单）；桌面 = 选区上方浮动工具条。 */
const touchMode = ref(false)
const toolbarEl = ref<HTMLElement | null>(null)
const posStyle = ref<{ left: string; top: string }>({ left: '0px', top: '0px' })

/* F2-3：pink 第 5 色补齐（D22：数据 5 色，P2 UI 5 色）。 */
const colors = ref<{ value: HighlightColor; label: string }[]>([
  { value: 'yellow', label: '黄色' },
  { value: 'green', label: '绿色' },
  { value: 'blue', label: '蓝色' },
  { value: 'pink', label: '粉色' },
  { value: 'purple', label: '紫色' },
])

/* ------------------------------------------------------------------ */
/* 重叠检测（D24：P0 禁止重叠创建）与 aria-pressed 态                    */
/* ------------------------------------------------------------------ */

interface OverlapHit {
  h: LocalHighlight
  ranges: ParagraphRange[]
}
const overlapHits = ref<OverlapHit[]>([])
const bookmarkActive = ref(false)
let overlapGeneration = 0

function anchorRanges(anchor: SelectionAnchor, paras: ParagraphInfo[]): ParagraphRange[] {
  const si = paras.findIndex((p) => p.id === anchor.start.paragraphId)
  const ei = paras.findIndex((p) => p.id === anchor.end.paragraphId)
  if (si < 0 || ei < 0 || ei < si) return []
  if (si === ei) {
    return [{ paragraphId: anchor.start.paragraphId, start: anchor.start.offset, end: anchor.end.offset }]
  }
  const ranges: ParagraphRange[] = [{ paragraphId: paras[si].id, start: anchor.start.offset, end: paras[si].text.length }]
  for (let i = si + 1; i < ei; i += 1) ranges.push({ paragraphId: paras[i].id, start: 0, end: paras[i].text.length })
  ranges.push({ paragraphId: paras[ei].id, start: 0, end: anchor.end.offset })
  return ranges
}

function rangesOverlap(a: ParagraphRange[], b: ParagraphRange[]): boolean {
  return a.some((x) => b.some((y) => x.paragraphId === y.paragraphId && x.start < y.end && y.start < x.end))
}

function sameRanges(a: ParagraphRange[], b: ParagraphRange[]): boolean {
  return a.length === b.length && a.every((x, i) => x.paragraphId === b[i].paragraphId && x.start === b[i].start && x.end === b[i].end)
}

async function refreshOverlap(): Promise<void> {
  const generation = ++overlapGeneration
  const snap = selection.value
  if (!snap || !enabled.value) {
    overlapHits.value = []
    bookmarkActive.value = false
    return
  }
  const root = document.querySelector<HTMLElement>('.reader-chapter .vp-doc')
  if (!root) return
  const paras = collectAnchorParagraphs(root)
  const target = anchorRanges(snap.anchor, paras)
  const [highlights, bookmarks] = await Promise.all([listHighlights(), listBookmarks()])
  if (generation !== overlapGeneration) return
  const hits: OverlapHit[] = []
  for (const h of highlights) {
    if (h.deletedAt || h.chapterId !== pageId.value) continue
    const result = resolveHighlight(h, { pageId: pageId.value, paragraphs: paras })
    if (result.status === 'exact' || result.status === 'fuzzy') {
      if (rangesOverlap(target, result.ranges)) hits.push({ h, ranges: result.ranges })
    } else if (result.status === 'paragraph') {
      if (target.some((r) => r.paragraphId === result.paragraphId)) hits.push({ h, ranges: [] })
    }
  }
  overlapHits.value = hits
  bookmarkActive.value = bookmarks.some(
    (b) => !b.deletedAt && b.chapterId === pageId.value && b.paragraphId === snap.anchor.start.paragraphId,
  )
}

watch(selection, () => {
  void refreshOverlap()
  void reposition()
})

/* ------------------------------------------------------------------ */
/* 创建高亮 / 批注                                                       */
/* ------------------------------------------------------------------ */

function collapseSelection(): void {
  window.getSelection()?.removeAllRanges()
}

async function create(color: HighlightColor, startInEdit = false): Promise<void> {
  const snap = selection.value
  if (!snap) return
  if (mode.value !== 'idb') {
    push('当前浏览器无法持久保存摘录，请及时导出。', { kind: 'error' })
    return
  }
  // 同范围同色重复创建 → 直接打开已有弹层（interaction §2.4）。
  // F2-3：P2 放开重叠创建（D24 限制解除），叠加渲染。
  if (overlapHits.value.length) {
    const root = document.querySelector<HTMLElement>('.reader-chapter .vp-doc')
    const paras = root ? collectAnchorParagraphs(root) : []
    const target = anchorRanges(snap.anchor, paras)
    const same = overlapHits.value.find((hit) => hit.h.color === color && sameRanges(target, hit.ranges))
    if (same) {
      window.dispatchEvent(new CustomEvent('reader-highlight:open', { detail: { id: same.h.id } }))
      dismiss()
      collapseSelection()
      return
    }
  }
  const root = document.querySelector<HTMLElement>('.reader-chapter .vp-doc')
  const startPara = root?.querySelector<HTMLElement>(`p[id="${cssEscape(snap.anchor.start.paragraphId)}"]`)
  const now = nowIso()
  const highlight: Highlight = {
    id: uuidv7(),
    schemaVersion: 1,
    kind: 'highlight',
    chapterId: pageId.value,
    paragraphId: snap.anchor.start.paragraphId,
    revision: book.value.buildVersion,
    textHash: fnv1a36(startPara?.textContent ?? ''),
    selector: {
      exact: snap.anchor.exact,
      prefix: snap.anchor.prefix,
      suffix: snap.anchor.suffix,
      start: snap.anchor.start,
      end: snap.anchor.end,
    },
    note: '',
    types: [],
    color,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    rev: 1,
    deviceId: deviceId(),
  }
  try {
    await putHighlight(highlight)
  } catch (e) {
    push(`摘录保存失败：${(e as Error).message}`, { kind: 'error' })
    return
  }
  dismiss()
  collapseSelection()
  if (startInEdit) {
    window.dispatchEvent(new CustomEvent('reader-highlight:open', { detail: { id: highlight.id, startInEdit: true } }))
  }
}

/* ------------------------------------------------------------------ */
/* 书签 toggle（段落级）                                                 */
/* ------------------------------------------------------------------ */

async function toggleBookmark(): Promise<void> {
  const snap = selection.value
  if (!snap) return
  const paragraphId = snap.anchor.start.paragraphId
  const bookmarks = await listBookmarks()
  const existing = bookmarks.find((b) => !b.deletedAt && b.chapterId === pageId.value && b.paragraphId === paragraphId)
  if (existing) {
    await softDeleteBookmark(existing.id)
    push('已移除书签', {
      action: {
        label: '撤销',
        run: () => {
          void putBookmark({ ...existing, deletedAt: null, rev: existing.rev + 1, updatedAt: nowIso(), deviceId: deviceId() })
        },
      },
    })
  } else {
    const now = nowIso()
    const bookmark: Bookmark = {
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
    }
    await putBookmark(bookmark)
    push('已添加书签')
  }
  bookmarkActive.value = !existing
  dismiss()
  collapseSelection()
}

/* ------------------------------------------------------------------ */
/* 复制 / 链接 / AI 修订                                                 */
/* ------------------------------------------------------------------ */

async function copyText(): Promise<void> {
  const snap = selection.value
  if (!snap) return
  try {
    await navigator.clipboard.writeText(snap.text)
    push('已复制')
  } catch {
    push('复制失败，请允许浏览器访问剪切板后重试。', { kind: 'error' })
  }
  dismiss()
}

async function copyLink(): Promise<void> {
  const snap = selection.value
  if (!snap) return
  try {
    const url = buildShareUrl(
      {
        chapterId: pageId.value,
        start: snap.anchor.start,
        end: snap.anchor.end,
        exact: snap.anchor.exact,
        prefix: snap.anchor.prefix,
        suffix: snap.anchor.suffix,
      },
      { base: `${window.location.origin}${withBase('')}`, versionPrefix: versionPrefix(book.value.contentVersion) },
    )
    await navigator.clipboard.writeText(url)
    push('链接已复制（不含批注）')
  } catch {
    push('链接生成或复制失败，请重试。', { kind: 'error' })
  }
  dismiss()
}

function aiEdit(): void {
  const snap = selection.value
  if (!snap) return
  window.dispatchEvent(new CustomEvent('reader-ai-edit:trigger', { detail: snap.text }))
  dismiss()
}

/* ------------------------------------------------------------------ */
/* 定位与消失条件                                                        */
/* ------------------------------------------------------------------ */

async function reposition(): Promise<void> {
  if (touchMode.value) return
  const snap = selection.value
  await nextTick()
  const el = toolbarEl.value
  if (!snap?.rect || !el) return
  const bounds = el.getBoundingClientRect()
  posStyle.value = computePopoverPosition(
    snap.rect,
    { width: bounds.width, height: bounds.height },
    { width: document.documentElement.clientWidth, height: window.innerHeight },
    { preferAbove: true },
  )
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && visible.value) {
    event.preventDefault()
    event.stopPropagation()
    dismiss() // Esc 关闭并保留选区
  }
}

function onPointerDown(event: PointerEvent): void {
  if (!visible.value) return
  if (event.target instanceof Node && toolbarEl.value?.contains(event.target)) return
  dismiss()
}

function onScroll(): void {
  // 触屏底部动作栏不随滚动消失（选区清除才消失）；桌面浮动工具条滚动即收起。
  if (!touchMode.value && visible.value) dismiss()
}

function onReanchorActive(event: Event): void {
  reanchorActive.value = Boolean((event as CustomEvent<boolean>).detail)
  if (reanchorActive.value) dismiss()
}

watch(pageId, () => dismiss())

onMounted(() => {
  touchMode.value = !window.matchMedia('(any-hover: hover)').matches
  start()
  document.addEventListener('keydown', onKeydown, true)
  document.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('scroll', onScroll, { passive: true, capture: true })
  window.addEventListener('reader-reanchor:active', onReanchorActive)
})

onBeforeUnmount(() => {
  stop()
  document.removeEventListener('keydown', onKeydown, true)
  document.removeEventListener('pointerdown', onPointerDown)
  window.removeEventListener('scroll', onScroll, true)
  window.removeEventListener('reader-reanchor:active', onReanchorActive)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      ref="toolbarEl"
      class="reader-selection-toolbar reader-ui"
      :class="{ 'reader-selection-toolbar--touch': touchMode }"
      role="toolbar"
      aria-label="摘录动作"
      :style="touchMode ? undefined : posStyle"
    >
      <button
        v-for="color in colors"
        :key="color.value"
        type="button"
        class="reader-selection-toolbar__color"
        :class="`reader-selection-toolbar__color--${color.value}`"
        :aria-label="`${color.label}高亮`"
        :aria-pressed="overlapHits.some((hit) => hit.h.color === color.value)"
        :title="`${color.label}高亮`"
        @pointerdown.prevent
        @click="create(color.value)"
      />
      <span class="reader-selection-toolbar__sep" aria-hidden="true" />
      <button type="button" class="reader-selection-toolbar__action" aria-label="批注" title="批注" @pointerdown.prevent @click="create('yellow', true)">✎ 批注</button>
      <button
        type="button"
        class="reader-selection-toolbar__action"
        aria-label="书签"
        title="书签（段落级开关）"
        :aria-pressed="bookmarkActive"
        @pointerdown.prevent
        @click="toggleBookmark"
      >🔖 书签</button>
      <button type="button" class="reader-selection-toolbar__action" aria-label="复制" title="复制" @pointerdown.prevent @click="copyText">⧉ 复制</button>
      <button type="button" class="reader-selection-toolbar__action" aria-label="链接" title="复制永久链接" @pointerdown.prevent @click="copyLink">🔗 链接</button>
      <button type="button" class="reader-selection-toolbar__action" aria-label="AI修订" title="AI修订 · 复制修订提示词" @pointerdown.prevent @click="aiEdit">✦ AI修订</button>
    </div>
  </Teleport>
</template>