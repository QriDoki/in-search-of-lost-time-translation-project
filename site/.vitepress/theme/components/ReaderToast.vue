<script setup lang="ts">
import { useToasts } from '../composables/useToasts'

const { toasts, dismiss, runAction } = useToasts()
</script>

<template>
  <Teleport to="body">
    <div class="reader-toast-stack reader-ui" aria-label="通知">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="reader-toast"
        :class="`reader-toast--${toast.kind}`"
        role="status"
        aria-live="polite"
      >
        <span class="reader-toast__message">{{ toast.message }}</span>
        <button
          v-if="toast.action"
          type="button"
          class="reader-toast__action"
          @click="runAction(toast.id)"
        >{{ toast.action.label }}</button>
        <button
          type="button"
          class="reader-toast__close"
          aria-label="关闭提示"
          @click="dismiss(toast.id)"
        >×</button>
      </div>
    </div>
  </Teleport>
</template>