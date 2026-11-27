<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useBook } from '../composables/book'
import type { ReadingPosition } from '../composables/user-storage'

const props = defineProps<{ remote: ReadingPosition }>()
const emit = defineEmits<{ jump: []; stay: [] }>()

const { book } = useBook()

const label = computed(() => {
  const meta = book.value.pages.find((p) => p.id === props.remote.pageId)
  const percent = Math.round(props.remote.pageProgress * 100)
  return meta ? `${meta.volumeTitle} · ${meta.label} · ${percent}%` : `${props.remote.pageId} · ${percent}%`
})

function onScroll(): void {
  // 开始滚动 → 横幅消失，本地位置成为最新。绝不自动跳转。
  emit('stay')
}

onMounted(() => window.addEventListener('scroll', onScroll, { passive: true, once: true }))
onBeforeUnmount(() => window.removeEventListener('scroll', onScroll))
</script>

<template>
  <div class="reader-progress-banner reader-ui" role="status" aria-live="polite">
    <span class="reader-progress-banner__text">另一台设备读到了 {{ label }}</span>
    <span class="reader-progress-banner__actions">
      <button type="button" class="reader-progress-banner__jump" @click="emit('jump')">跳转过去</button>
      <button type="button" class="reader-text-button" @click="emit('stay')">留在这里</button>
    </span>
  </div>
</template>