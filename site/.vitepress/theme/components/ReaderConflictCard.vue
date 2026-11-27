<script setup lang="ts">
import { computed } from 'vue'
import type { ConflictInfo } from '../composables/user-storage'

const props = defineProps<{
  conflict: ConflictInfo
  index: number
  total: number
}>()
const emit = defineEmits<{
  resolve: [choice: 'local' | 'remote' | 'both']
  later: []
}>()

const copy = computed(() => props.conflict.copies[0] ?? null)
const current = computed(() => props.conflict.current)
const entityLabel = computed(() => (props.conflict.entity === 'highlight' ? '摘录' : '书签'))

function timeLabel(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function noteOf(side: 'local' | 'remote'): string {
  if (side === 'local') {
    const c = current.value as { note?: string; label?: string }
    return c.note ?? c.label ?? ''
  }
  const snap = copy.value?.snapshot as { note?: string; label?: string } | undefined
  return snap?.note ?? snap?.label ?? ''
}

function deletedOf(side: 'local' | 'remote'): boolean {
  return side === 'local' ? Boolean(current.value.deletedAt) : Boolean(copy.value?.snapshot.deletedAt)
}

function colorOf(side: 'local' | 'remote'): string {
  if (side === 'local') return (current.value as { color?: string }).color ?? 'yellow'
  return (copy.value?.snapshot as { color?: string } | undefined)?.color ?? 'yellow'
}
</script>

<template>
  <article class="reader-conflict-card" role="group" :aria-label="`${entityLabel}冲突 ${index + 1}/${total}`">
    <header class="reader-conflict-card__header">
      <strong>{{ entityLabel }}冲突 ({{ index + 1 }}/{{ total }})</strong>
      <button type="button" class="reader-text-button" @click="emit('later')">稍后处理</button>
    </header>

    <blockquote v-if="conflict.entity === 'highlight'" class="reader-conflict-card__exact">
      原文：「{{ (current as { selector?: { exact?: string } }).selector?.exact ?? '' }}」
    </blockquote>

    <div class="reader-conflict-card__versions">
      <section class="reader-conflict-card__version" aria-label="本机版本">
        <h3>本机版本</h3>
        <p v-if="deletedOf('local')" class="reader-conflict-card__deleted">已删除</p>
        <template v-else>
          <p v-if="conflict.entity === 'highlight'" class="reader-conflict-card__note">
            <span class="reader-conflict-card__swatch" :class="`reader-conflict-card__swatch--${colorOf('local')}`" aria-hidden="true" />
            批注：{{ noteOf('local') || '（无）' }}
          </p>
          <p v-else class="reader-conflict-card__note">标签：{{ noteOf('local') || '（无）' }}</p>
        </template>
        <p class="reader-conflict-card__time">修改于 {{ timeLabel(current.updatedAt) }}</p>
      </section>

      <section class="reader-conflict-card__version" aria-label="云端版本">
        <h3>云端版本</h3>
        <template v-if="copy">
          <p v-if="deletedOf('remote')" class="reader-conflict-card__deleted">已删除</p>
          <template v-else>
            <p v-if="conflict.entity === 'highlight'" class="reader-conflict-card__note">
              <span class="reader-conflict-card__swatch" :class="`reader-conflict-card__swatch--${colorOf('remote')}`" aria-hidden="true" />
              批注：{{ noteOf('remote') || '（无）' }}
            </p>
            <p v-else class="reader-conflict-card__note">标签：{{ noteOf('remote') || '（无）' }}</p>
          </template>
          <p class="reader-conflict-card__time">修改于 {{ timeLabel(copy.updatedAt) }}</p>
        </template>
      </section>
    </div>

    <div class="reader-conflict-card__actions">
      <button type="button" class="reader-conflict-card__button" @click="emit('resolve', 'local')">保留本机版本</button>
      <button type="button" class="reader-conflict-card__button" @click="emit('resolve', 'remote')">保留云端版本</button>
      <button type="button" class="reader-conflict-card__button" @click="emit('resolve', 'both')">两者都保留</button>
    </div>
  </article>
</template>