<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { onContentUpdated, useData } from 'vitepress'
import { useBook } from '../composables/book'
import { useToasts } from '../composables/useToasts'
import {
  collectAnchorParagraphs,
  deviceId,
  fnv1a36,
  nfcRangeToRawOffsets,
  nowIso,
  parseShareUrl,
  putHighlight,
  resolveShare,
  useUserStorage,
  uuidv7,
  wrapRawRange,
  type AnchorResult,
  type ParagraphInfo,
  type ParagraphRange,
  type SharePayload,
} from '../composables/user-storage'

const { frontmatter } = useData()
const { book } = useBook()
const { mode } = useUserStorage()
const { push } = useToasts()

const pageId = computed(() => String(frontmatter.value.readerPageId ?? ''))
const payload = ref<SharePayload | null>(null)
const result = ref<AnchorResult | null>(null)
const cardState = ref<'hidden' | 'ready' | 'degraded' | 'saved'>('hidden')
let generation = 0
let mounted = false
let saveCollapseTimer: ReturnType<typeof setTimeout> | undefined

/* ------------------------------------------------------------------ */
/* 临时高亮（mark[data-reader-share]，各认各的 data 标记）               */
/* ------------------------------------------------------------------ */

function clearShareMarks(): void {
  document.querySelectorAll('mark[data-reader-share]').forEach((mark) => {
    const parent = mark.parentNode
    mark.replaceWith(...mark.childNodes)
    parent?.normalize()
  })
}

function wrapShareRange(para: ParagraphInfo, range: ParagraphRange): void {
  // range 为 NFC 偏移基准 → 逆映射到 raw DOM 偏移再拆分（G2，与用户高亮共用助手）
  const raw = para.node.textContent ?? ''
  const [rs, re] = nfcRangeToRawOffsets(raw, range.start, range.end)
  wrapRawRange(para.node, rs, re, (mark) => {
    mark.dataset.readerShare = ''
  })
}

/* ------------------------------------------------------------------ */
/* 落地流程                                                            */
/* ------------------------------------------------------------------ */

function doubleRaf(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
}

async function locate(): Promise<void> {
  const current = ++generation
  const url = new URL(window.location.href)
  if (url.searchParams.has('search')) return
  const parsed = parseShareUrl(url)
  if (!parsed || parsed.c !== pageId.value) {
    payload.value = null
    cardState.value = 'hidden'
    clearShareMarks()
    return
  }
  payload.value = parsed
  await nextTick()
  await doubleRaf()
  if (current !== generation || !mounted) return
  const root = document.querySelector<HTMLElement>('.reader-chapter .vp-doc')
  if (!root) return
  const paras = collectAnchorParagraphs(root)
  if (current !== generation || !mounted) return
  clearShareMarks()
  const resolved = resolveShare(parsed, { pageId: pageId.value, paragraphs: paras })
  result.value = resolved

  // 滚动定位（沿用全站公式 max(90, innerHeight*.35)）
  let target: HTMLElement | null = null
  if (resolved.status === 'exact' || resolved.status === 'fuzzy') {
    for (const range of resolved.ranges) {
      const para = paras.find((p) => p.id === range.paragraphId)
      if (para) wrapShareRange(para, range)
    }
    target = paras.find((p) => p.id === resolved.ranges[0]?.paragraphId)?.node ?? null
    cardState.value = 'ready'
  } else if (resolved.status === 'paragraph') {
    target = document.getElementById(resolved.paragraphId)
    cardState.value = 'degraded'
  } else {
    cardState.value = 'degraded'
  }
  if (target) {
    const top = target.getBoundingClientRect().top + window.scrollY - Math.max(90, window.innerHeight * 0.35)
    window.scrollTo({ top: Math.max(0, top), behavior: 'instant' })
  }
}

async function saveToMine(): Promise<void> {
  const p = payload.value
  if (!p || mode.value !== 'idb') {
    push('当前浏览器无法持久保存摘录，请及时导出。', { kind: 'error' })
    return
  }
  const resolved = result.value
  const root = document.querySelector<HTMLElement>('.reader-chapter .vp-doc')
  const paras = root ? collectAnchorParagraphs(root) : []
  let start = { paragraphId: p.s, offset: 0 }
  let end = { paragraphId: p.e ?? p.s, offset: p.q.length }
  if (resolved && (resolved.status === 'exact' || resolved.status === 'fuzzy') && resolved.ranges.length) {
    const first = resolved.ranges[0]
    const last = resolved.ranges[resolved.ranges.length - 1]
    start = { paragraphId: first.paragraphId, offset: first.start }
    end = { paragraphId: last.paragraphId, offset: last.end }
  }
  const startPara = paras.find((x) => x.id === start.paragraphId)
  const now = nowIso()
  try {
    await putHighlight({
      id: uuidv7(),
      schemaVersion: 1,
      kind: 'highlight',
      chapterId: p.c,
      paragraphId: start.paragraphId,
      revision: book.value.buildVersion,
      textHash: fnv1a36(startPara?.node.textContent ?? ''),
      selector: { exact: p.q, prefix: p.b ?? '', suffix: p.a ?? '', start, end },
      note: '',
      types: [],
      color: 'yellow',
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      rev: 1,
      deviceId: deviceId(),
    })
    cardState.value = 'saved'
    saveCollapseTimer = setTimeout(() => (cardState.value = 'hidden'), 1200)
  } catch (e) {
    push(`保存失败：${(e as Error).message}`, { kind: 'error' })
  }
}

async function copyExact(): Promise<void> {
  if (!payload.value) return
  try {
    await navigator.clipboard.writeText(payload.value.q)
    push('已复制')
  } catch {
    push('复制失败，请允许浏览器访问剪切板后重试。', { kind: 'error' })
  }
}

function closeCard(): void {
  // 关闭卡保留临时高亮至离开页面。
  cardState.value = 'hidden'
}

function onHashChange(): void {
  void locate()
}

onContentUpdated(() => {
  if (mounted) void locate()
})

onMounted(() => {
  mounted = true
  void locate()
  window.addEventListener('hashchange', onHashChange)
  window.addEventListener('popstate', onHashChange)
})

onBeforeUnmount(() => {
  mounted = false
  generation += 1
  clearTimeout(saveCollapseTimer)
  window.removeEventListener('hashchange', onHashChange)
  window.removeEventListener('popstate', onHashChange)
  clearShareMarks()
})
</script>

<template>
  <Teleport to="body">
    <section
      v-if="payload && cardState !== 'hidden'"
      class="reader-share-landing reader-ui"
      role="dialog"
      aria-label="来自分享的摘录"
    >
      <p class="reader-share-landing__eyebrow">来自分享的摘录</p>
      <p v-if="cardState === 'degraded'" class="reader-share-landing__notice">译文已更新，原文可能略有出入</p>
      <blockquote class="reader-share-landing__exact">{{ payload.q }}</blockquote>
      <div v-if="cardState === 'saved'" class="reader-share-landing__saved">已保存 ✓</div>
      <div v-else class="reader-share-landing__actions">
        <button type="button" class="reader-share-landing__primary" @click="saveToMine">保存到我的摘录</button>
        <button type="button" class="reader-text-button" @click="copyExact">复制正文</button>
        <button type="button" class="reader-share-landing__close" aria-label="关闭分享卡片" @click="closeCard">×</button>
      </div>
    </section>
  </Teleport>
</template>