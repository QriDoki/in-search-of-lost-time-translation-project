<script setup lang="ts">
import { reading } from '../composables/reader'
</script>

<template>
  <div
    class="reader-progress"
    role="progressbar"
    aria-label="本页阅读进度"
    aria-valuemin="0"
    aria-valuemax="100"
    :aria-valuenow="Math.round(reading.pageProgress * 100)"
  >
    <span
      class="reader-progress__fill"
      :style="{ transform: `scaleX(${reading.pageProgress})` }"
    />
  </div>
</template>
