<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { annotationTypes } from '../../../../scripts/lib/annotation-types.mjs'
import { prefs } from '../composables/reader'

const expanded = ref(false)
const button = ref<HTMLButtonElement | null>(null)
const menu = ref<HTMLElement | null>(null)
const position = ref({ left: '0px', top: '0px', width: '0px', maxHeight: '0px' })

function close(restoreFocus = false) {
  expanded.value = false
  if (restoreFocus) button.value?.focus()
}

async function toggle() {
  if (expanded.value) return close()
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

function onPointerDown(event: PointerEvent) {
  if (!(event.target instanceof Node)) return
  if (!button.value?.contains(event.target) && !menu.value?.contains(event.target)) close()
}

function onScroll(event: Event) {
  // 菜单内部滚动不收起；阅读设置或页面滚动后收起，避免浮层与按钮错位。
  if (event.target instanceof Node && menu.value?.contains(event.target)) return
  close()
}

function onResize() { close() }

onMounted(() => {
  document.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('scroll', onScroll, true)
  window.addEventListener('resize', onResize)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onPointerDown)
  window.removeEventListener('scroll', onScroll, true)
  window.removeEventListener('resize', onResize)
})
</script>

<template>
  <div class="reader-setting" @keydown.esc.stop.prevent="close(true)">
    <span class="reader-setting__label" id="reader-note-types-label">注解类型</span>
    <button
      ref="button"
      class="reader-note-select"
      aria-labelledby="reader-note-types-label reader-note-types-summary"
      aria-controls="reader-note-types-menu"
      :aria-expanded="expanded"
      @click="toggle"
    >
      <span id="reader-note-types-summary">已选 {{ prefs.annotationTypes.length }} / {{ annotationTypes.length }} 类</span>
      <span aria-hidden="true">{{ expanded ? '▴' : '▾' }}</span>
    </button>
    <Teleport to="body">
      <div
        v-if="expanded"
        id="reader-note-types-menu"
        ref="menu"
        class="reader-note-select__options reader-ui"
        :style="position"
        role="group"
        aria-labelledby="reader-note-types-label"
        @keydown.esc.stop.prevent="close(true)"
      >
        <label v-for="type in annotationTypes" :key="type.emoji">
          <input v-model="prefs.annotationTypes" type="checkbox" :value="type.emoji" />
          <span>{{ type.emoji }} {{ type.label }}</span>
        </label>
        <p>多类型注解任一类型选中即显示；未分类注解始终显示。</p>
      </div>
    </Teleport>
  </div>
</template>
