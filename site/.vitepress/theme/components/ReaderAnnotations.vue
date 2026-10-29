<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { onContentUpdated, useRoute } from 'vitepress'
import { prefs } from '../composables/reader'
import { annotationIsVisible } from '../../../../scripts/lib/annotation-types.mjs'

const route = useRoute()
const trigger = shallowRef<HTMLButtonElement | null>(null)
const popover = ref<HTMLElement | null>(null)
const content = ref('')
const pinned = ref(false)
const positioned = ref(false)
const position = ref({ left: '0px', top: '0px' })
const popoverId = 'reader-annotation-popover'
let hideTimer: ReturnType<typeof setTimeout> | undefined
let resizeObserver: ResizeObserver | undefined
let frame = 0

function cancelHide() {
  clearTimeout(hideTimer)
}

function close(restoreFocus = false) {
  cancelHide()
  const previous = trigger.value
  previous?.setAttribute('aria-expanded', 'false')
  previous?.removeAttribute('aria-controls')
  trigger.value = null
  pinned.value = false
  positioned.value = false
  resizeObserver?.disconnect()
  if (restoreFocus) previous?.focus({ preventScroll: true })
}

function updatePosition() {
  const button = trigger.value
  const panel = popover.value
  if (!button || !panel) return
  if (!button.isConnected) return close()

  const anchor = button.getBoundingClientRect()
  const bounds = panel.getBoundingClientRect()
  const margin = 12
  const gap = 10
  const width = document.documentElement.clientWidth
  const height = window.innerHeight
  const left = Math.max(margin, Math.min(anchor.left + anchor.width / 2 - bounds.width / 2, width - bounds.width - margin))
  const below = anchor.bottom + gap
  const above = anchor.top - bounds.height - gap
  const preferredTop = below + bounds.height <= height - margin ? below : above
  const top = Math.max(margin, Math.min(preferredTop, height - bounds.height - margin))
  position.value = { left: `${left}px`, top: `${top}px` }
  positioned.value = true
}

function schedulePosition() {
  if (!trigger.value || frame) return
  frame = requestAnimationFrame(() => {
    frame = 0
    updatePosition()
  })
}

async function open(button: HTMLButtonElement, pin: boolean, focus = false) {
  cancelHide()
  if (trigger.value !== button) {
    close()
    trigger.value = button
    content.value = button.dataset.readerNote ?? ''
  }
  pinned.value = pin
  button.setAttribute('aria-expanded', 'true')
  button.setAttribute('aria-controls', popoverId)
  await nextTick()
  if (trigger.value !== button) return
  updatePosition()
  if (popover.value) resizeObserver?.observe(popover.value)
  if (focus) popover.value?.focus({ preventScroll: true })
}

function findTrigger(target: EventTarget | null) {
  const button = target instanceof Element
    ? target.closest<HTMLButtonElement>('.reader-chapter .reader-annotation__trigger')
    : null
  return button?.closest('.is-note-hidden') ? null : button
}

function applyAnnotationFilter() {
  document.querySelectorAll<HTMLElement>('.reader-annotation').forEach((annotation) => {
    const types = (annotation.dataset.readerNoteTypes ?? '').split(' ').filter(Boolean)
    const visible = annotationIsVisible(types, prefs.annotationTypes)
    if (!visible && annotation.contains(trigger.value)) close()
    annotation.classList.toggle('is-note-hidden', !visible)
  })
}

watch(() => prefs.annotationTypes, applyAnnotationFilter, { deep: true })
onContentUpdated(applyAnnotationFilter)

function onPointerOver(event: PointerEvent) {
  // Touch browsers can synthesize mouse events; only a real mouse may preview notes.
  if (event.pointerType !== 'mouse' || !window.matchMedia('(any-hover: hover)').matches || pinned.value) return
  const button = findTrigger(event.target)
  if (button) open(button, false)
}

function hidePreview() {
  if (pinned.value) return
  cancelHide()
  // Allow the pointer to cross the small gap into the note to read or select it.
  hideTimer = setTimeout(() => close(), 120)
}

function onPointerOut(event: PointerEvent) {
  if (event.pointerType !== 'mouse' || pinned.value) return
  const button = findTrigger(event.target)
  if (!button || button !== trigger.value) return
  if (event.relatedTarget instanceof Node && popover.value?.contains(event.relatedTarget)) return
  hidePreview()
}

function onClick(event: MouseEvent) {
  const button = findTrigger(event.target)
  if (!button) return
  event.preventDefault()
  open(button, true, event.detail === 0)
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && trigger.value) {
    event.preventDefault()
    close(true)
  }
}

watch(() => route.path, () => close())

onMounted(() => {
  applyAnnotationFilter()
  resizeObserver = new ResizeObserver(schedulePosition)
  document.addEventListener('pointerover', onPointerOver)
  document.addEventListener('pointerout', onPointerOut)
  document.addEventListener('click', onClick)
  document.addEventListener('keydown', onKeydown)
  window.addEventListener('scroll', schedulePosition, { passive: true, capture: true })
  window.addEventListener('resize', schedulePosition)
})

onBeforeUnmount(() => {
  close()
  cancelAnimationFrame(frame)
  document.removeEventListener('pointerover', onPointerOver)
  document.removeEventListener('pointerout', onPointerOut)
  document.removeEventListener('click', onClick)
  document.removeEventListener('keydown', onKeydown)
  window.removeEventListener('scroll', schedulePosition, true)
  window.removeEventListener('resize', schedulePosition)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="trigger && pinned"
      class="reader-annotation-backdrop reader-ui"
      aria-hidden="true"
      @click="close()"
    />
    <aside
      v-if="trigger"
      :id="popoverId"
      ref="popover"
      class="reader-annotation-popover reader-ui"
      role="dialog"
      aria-label="书内注解"
      tabindex="-1"
      :style="{ ...position, visibility: positioned ? 'visible' : 'hidden' }"
      @pointerenter="cancelHide"
      @pointerleave="hidePreview"
    >
      <div class="reader-annotation-popover__content" v-html="content" />
    </aside>
  </Teleport>
</template>
