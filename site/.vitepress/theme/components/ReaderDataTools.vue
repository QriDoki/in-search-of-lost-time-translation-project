<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { withBase } from 'vitepress'
import { useBook, versionPrefix } from '../composables/book'
import { useToasts } from '../composables/useToasts'
import {
  applyImport,
  buildDocxExcerpt,
  buildExportEnvelope,
  buildMarkdownExcerpt,
  buildShareUrl,
  createGraphTransport,
  deepClone,
  downloadJson,
  getSyncAuth,
  listHighlights,
  parseImportFile,
  previewImport,
  useUserStorage,
  type ExcerptItem,
  type ExportEnvelope,
  type ImportPreview,
  type ImportStrategy,
} from '../composables/user-storage'

const props = defineProps<{
  /** 批量勾选的条目（范围「勾选条目」用）。 */
  selectedIds?: string[]
  /** 当前筛选结果（范围「当前筛选结果」用）。 */
  filteredIds?: string[]
}>()

const { push } = useToasts()
const { book } = useBook()
const { account } = useUserStorage()

/* 导出 ▾ 菜单（复用 ReaderAnnotationTypes 的 Teleport + 上下翻转 + 外点关闭范式）。 */
const expanded = ref(false)
const button = ref<HTMLButtonElement | null>(null)
const menu = ref<HTMLElement | null>(null)
const position = ref({ left: '0px', top: '0px', width: '0px', maxHeight: '0px' })

function closeMenu(restoreFocus = false): void {
  expanded.value = false
  if (restoreFocus) button.value?.focus()
}

async function toggleMenu(): Promise<void> {
  if (expanded.value) return closeMenu()
  const bounds = button.value?.getBoundingClientRect()
  if (!bounds) return
  const margin = 12
  const gap = 6
  const below = window.innerHeight - bounds.bottom - margin - gap
  const above = bounds.top - margin - gap
  const opensAbove = above > below
  const maxHeight = Math.max(0, opensAbove ? above : below)
  const width = Math.min(Math.max(bounds.width, 260), window.innerWidth - margin * 2)
  position.value = {
    left: `${Math.max(margin, Math.min(bounds.left, window.innerWidth - width - margin))}px`,
    top: `${opensAbove ? margin : bounds.bottom + gap}px`,
    width: `${width}px`,
    maxHeight: `${maxHeight}px`,
  }
  expanded.value = true
  await nextTick()
  if (opensAbove && menu.value) {
    position.value.top = `${Math.max(margin, bounds.top - menu.value.getBoundingClientRect().height - gap)}px`
  }
}

function onPointerDown(event: PointerEvent): void {
  if (!(event.target instanceof Node)) return
  if (!button.value?.contains(event.target) && !menu.value?.contains(event.target)) closeMenu()
}

function onScroll(event: Event): void {
  if (event.target instanceof Node && menu.value?.contains(event.target)) return
  closeMenu()
}

/* ------------------------------------------------------------------ */
/* JSON 导出 / 导入（P0）                                                */
/* ------------------------------------------------------------------ */

const fileInput = ref<HTMLInputElement | null>(null)
const importDialog = ref<HTMLDialogElement | null>(null)
const preview = ref<ImportPreview | null>(null)
const envelope = ref<ExportEnvelope | null>(null)
const strategy = ref<ImportStrategy>('local')
const importing = ref(false)
const backupLabel = ref('')

async function exportJson(): Promise<void> {
  closeMenu()
  try {
    const env = await buildExportEnvelope()
    downloadJson(env)
    push('导出成功，备份文件已下载。')
  } catch (e) {
    push(`导出失败：${(e as Error).message}`, { kind: 'error' })
  }
}

function pickFile(): void {
  closeMenu()
  fileInput.value?.click()
}

async function onFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  const text = await file.text()
  const parsed = parseImportFile(text)
  if (!parsed.ok) {
    push(`导入失败：${parsed.error}（未写入任何数据）`, { kind: 'error' })
    return
  }
  envelope.value = parsed.envelope
  preview.value = await previewImport(parsed.envelope)
  strategy.value = 'local'
  backupLabel.value = parsed.envelope.exportedAt.slice(0, 10)
  await nextTick()
  importDialog.value?.showModal()
}

async function confirmImport(): Promise<void> {
  if (!envelope.value || importing.value) return
  importing.value = true
  try {
    // ref 深层响应式 Proxy 无法 structuredClone 入 IDB → 传纯对象。
    const result = await applyImport(deepClone(envelope.value), strategy.value)
    importDialog.value?.close()
    push(`导入完成：新增 ${result.added} · 更新 ${result.updated}${result.conflictsKept ? ` · 冲突副本 ${result.conflictsKept}` : ''}`)
  } catch (e) {
    push(`导入失败：${(e as Error).message}`, { kind: 'error' })
  } finally {
    importing.value = false
    envelope.value = null
    preview.value = null
  }
}

function cancelImport(): void {
  importDialog.value?.close()
  envelope.value = null
  preview.value = null
}

/* ------------------------------------------------------------------ */
/* 可读摘录集（F2-2：DOCX 懒加载 docx / Markdown 自研；OneDrive 可选）   */
/* ------------------------------------------------------------------ */

const genDialog = ref<HTMLDialogElement | null>(null)
const genFormat = ref<'docx' | 'md'>('docx')
const genScope = ref<'all' | 'filtered' | 'selected'>('all')
const includeNotes = ref(true)
const includeLinks = ref(true)
const groupByVolume = ref(true)
const toOneDrive = ref(false)
const generating = ref(false)

function openGenerate(): void {
  closeMenu()
  genDialog.value?.showModal()
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.append(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

async function generate(): Promise<void> {
  if (generating.value) return
  generating.value = true
  try {
    const rows = (await listHighlights()).filter((h) => !h.deletedAt)
    let items = rows
    if (genScope.value === 'selected' && props.selectedIds?.length) {
      const ids = new Set(props.selectedIds)
      items = rows.filter((h) => ids.has(h.id))
    } else if (genScope.value === 'filtered' && props.filteredIds) {
      const ids = new Set(props.filteredIds)
      items = rows.filter((h) => ids.has(h.id))
    }
    if (!items.length) {
      push('没有可导出的摘录。', { kind: 'info' })
      return
    }
    const excerptItems: ExcerptItem[] = items.map((h) => {
      const meta = book.value.pages.find((p) => p.id === h.chapterId)
      let permalink = ''
      try {
        permalink = buildShareUrl(
          { chapterId: h.chapterId, start: h.selector.start, end: h.selector.end, exact: h.selector.exact, prefix: h.selector.prefix, suffix: h.selector.suffix },
          { base: `${window.location.origin}${withBase('')}`, versionPrefix: versionPrefix(book.value.contentVersion) },
        )
      } catch {
        permalink = ''
      }
      return { highlight: h, chapterLabel: meta ? `${meta.volumeTitle} · ${meta.label}` : h.chapterId, permalink }
    })
    const opts = { includeNotes: includeNotes.value, includeLinks: includeLinks.value, groupByVolume: groupByVolume.value }
    let blob: Blob
    let filename: string
    if (genFormat.value === 'md') {
      blob = new Blob([buildMarkdownExcerpt(excerptItems, opts)], { type: 'text/markdown;charset=utf-8' })
      filename = '我的摘录.md'
    } else {
      blob = await buildDocxExcerpt(excerptItems, opts)
      filename = '我的摘录.docx'
    }
    downloadBlob(blob, filename)
    if (toOneDrive.value && genFormat.value === 'docx' && account.value) {
      const auth = getSyncAuth()
      if (auth) {
        const transport = createGraphTransport(() => auth.getToken())
        await transport.write(`exports/${encodeURIComponent(filename)}`, await blob.arrayBuffer())
      }
    }
    genDialog.value?.close()
    push('摘录集已生成并下载。')
  } catch (e) {
    push(`摘录集生成失败：${(e as Error).message}`, { kind: 'error' })
  } finally {
    generating.value = false
  }
}

/** 供云同步面板「立即备份」复用。 */
defineExpose({ exportJson })

onMounted(() => {
  document.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('scroll', onScroll, true)
  window.addEventListener('resize', closeMenu)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onPointerDown)
  window.removeEventListener('scroll', onScroll, true)
  window.removeEventListener('resize', closeMenu)
})
</script>

<template>
  <div class="reader-data-tools">
    <button
      ref="button"
      type="button"
      class="reader-note-select reader-data-tools__trigger"
      aria-controls="reader-data-menu"
      :aria-expanded="expanded"
      aria-haspopup="menu"
      @click="toggleMenu"
    >
      <span>导出 ▾</span>
    </button>
    <input ref="fileInput" type="file" accept=".json,application/json" hidden aria-label="选择备份文件" @change="onFile" />

    <Teleport to="body">
      <div
        v-if="expanded"
        id="reader-data-menu"
        ref="menu"
        class="reader-note-select__options reader-ui reader-data-tools__menu"
        :style="position"
        role="menu"
        aria-label="导出与导入"
        @keydown.esc.stop.prevent="closeMenu(true)"
      >
        <button type="button" role="menuitem" class="reader-data-tools__item" @click="exportJson">导出 JSON 备份</button>
        <button type="button" role="menuitem" class="reader-data-tools__item" @click="pickFile">导入 JSON</button>
        <button type="button" role="menuitem" class="reader-data-tools__item" @click="openGenerate">生成摘录集（DOCX / Markdown）</button>
        <slot name="extra-items" />
      </div>
    </Teleport>

    <dialog
      ref="importDialog"
      class="reader-data-dialog reader-ui"
      aria-labelledby="reader-import-title"
      @cancel.prevent="cancelImport"
      @click="($event.target === importDialog) && cancelImport()"
    >
      <div class="reader-data-dialog__header">
        <h2 id="reader-import-title">导入 JSON 备份</h2>
        <button type="button" class="reader-data-dialog__close" aria-label="关闭导入对话框" autofocus @click="cancelImport">×</button>
      </div>
      <template v-if="preview && envelope">
        <p class="reader-data-dialog__meta">
          备份文件：{{ backupLabel }} · {{ envelope.data.highlights.length }} 条摘录 · {{ envelope.data.bookmarks.length }} 书签
        </p>
        <p class="reader-data-dialog__meta">
          与本机合并：新增 {{ preview.added }} · 更新 {{ preview.updated }} · 跳过 {{ preview.skipped }}
        </p>
        <fieldset v-if="preview.conflicts.length" class="reader-data-dialog__strategies">
          <legend>其中 {{ preview.conflicts.length }} 条与本机修改时间冲突：</legend>
          <label><input v-model="strategy" type="radio" value="import" /> 以导入文件为准</label>
          <label><input v-model="strategy" type="radio" value="local" /> 以本机为准</label>
          <label><input v-model="strategy" type="radio" value="both" /> 都保留</label>
        </fieldset>
        <div class="reader-data-dialog__actions">
          <button type="button" class="reader-text-button" @click="cancelImport">取消</button>
          <button type="button" class="reader-data-dialog__primary" :disabled="importing" @click="confirmImport">
            {{ importing ? '导入中…' : '导入并合并' }}
          </button>
        </div>
      </template>
    </dialog>

    <dialog
      ref="genDialog"
      class="reader-data-dialog reader-ui"
      aria-labelledby="reader-gen-title"
      @cancel.prevent="genDialog?.close()"
      @click="($event.target === genDialog) && genDialog?.close()"
    >
      <div class="reader-data-dialog__header">
        <h2 id="reader-gen-title">生成摘录集</h2>
        <button type="button" class="reader-data-dialog__close" aria-label="关闭生成对话框" autofocus @click="genDialog?.close()">×</button>
      </div>
      <fieldset class="reader-data-dialog__strategies">
        <legend>格式</legend>
        <label><input v-model="genFormat" type="radio" value="docx" /> DOCX</label>
        <label><input v-model="genFormat" type="radio" value="md" /> Markdown</label>
      </fieldset>
      <fieldset class="reader-data-dialog__strategies">
        <legend>范围</legend>
        <label><input v-model="genScope" type="radio" value="all" /> 全部</label>
        <label v-if="filteredIds"><input v-model="genScope" type="radio" value="filtered" /> 当前筛选结果</label>
        <label v-if="selectedIds && selectedIds.length"><input v-model="genScope" type="radio" value="selected" /> 勾选条目（{{ selectedIds.length }}）</label>
      </fieldset>
      <fieldset class="reader-data-dialog__strategies">
        <legend>选项</legend>
        <label><input v-model="includeNotes" type="checkbox" /> 含批注</label>
        <label><input v-model="includeLinks" type="checkbox" /> 含永久链接</label>
        <label><input v-model="groupByVolume" type="checkbox" /> 按卷分章</label>
        <label v-if="account && genFormat === 'docx'"><input v-model="toOneDrive" type="checkbox" /> 同时存到 OneDrive exports/</label>
      </fieldset>
      <div class="reader-data-dialog__actions">
        <button type="button" class="reader-text-button" @click="genDialog?.close()">取消</button>
        <button type="button" class="reader-data-dialog__primary" :disabled="generating" @click="generate">
          {{ generating ? '生成中…' : '生成并下载' }}
        </button>
      </div>
    </dialog>
  </div>
</template>