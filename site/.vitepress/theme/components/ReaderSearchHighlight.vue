<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted } from 'vue'
import { onContentUpdated } from 'vitepress'
import { matchRanges } from '../../search.mjs'

let generation = 0
let lastLocation = ''
let mounted = false

function clearMarks() {
  document.querySelectorAll('mark[data-reader-search]').forEach((mark) => {
    const parent = mark.parentNode
    mark.replaceWith(...mark.childNodes)
    parent?.normalize()
  })
}

async function locate(force = false) {
  const current = ++generation
  const location = window.location.href
  if (!force && lastLocation === location) return
  await nextTick()
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  if (current !== generation || !mounted) return
  clearMarks()
  const url = new URL(location)
  const query = url.searchParams.get('search') ?? ''
  let id = ''
  try { id = decodeURIComponent(url.hash.slice(1)) } catch { return }
  const target = document.getElementById(id)
  if (!query || !target?.closest('.vp-doc')) { lastLocation = location; return }
  const ranges = matchRanges(target.textContent ?? '', query)
  if (!ranges.length) { lastLocation = location; return }

  const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT)
  const nodes: { node: Text; start: number }[] = []
  let offset = 0
  while (walker.nextNode()) {
    const node = walker.currentNode as Text
    nodes.push({ node, start: offset })
    offset += node.length
  }
  // 按节点从后往前拆分，跨强调/注解锚点的短语也能完整高亮。
  for (const { node, start } of nodes.reverse()) {
    const end = start + node.length
    for (const range of [...ranges].reverse()) {
      const from = Math.max(start, range.start)
      const to = Math.min(end, range.end)
      if (from >= to) continue
      const text = node.splitText(from - start)
      text.splitText(to - from)
      const mark = document.createElement('mark')
      mark.dataset.readerSearch = ''
      text.replaceWith(mark)
      mark.append(text)
    }
  }
  const first = target.querySelector<HTMLElement>('mark[data-reader-search]')
  if (first) {
    const top = first.getBoundingClientRect().top + window.scrollY - Math.max(90, window.innerHeight * .35)
    window.scrollTo({ top: Math.max(0, top), behavior: 'instant' })
  }
  lastLocation = location
}

function onNavigate() { locate(true) }
function onLocation() { locate() }
onMounted(() => {
  mounted = true
  window.addEventListener('reader-search:navigate', onNavigate)
  window.addEventListener('hashchange', onLocation)
  window.addEventListener('popstate', onLocation)
  locate()
})
onContentUpdated(() => { if (mounted) locate() })
onBeforeUnmount(() => {
  mounted = false
  ++generation
  window.removeEventListener('reader-search:navigate', onNavigate)
  window.removeEventListener('hashchange', onLocation)
  window.removeEventListener('popstate', onLocation)
  clearMarks()
})
</script>

<template><span hidden /></template>

<style>
.vp-doc mark[data-reader-search] { color: inherit; background: var(--vp-c-brand-soft); outline: 1px solid var(--vp-c-brand-1); border-radius: 2px; }
</style>
