<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { withBase } from 'vitepress'
import { book, firstPage } from '../composables/book'
import {
  initReader,
  lastPage,
  lastPosition,
  overallProgress,
  percent,
  progress,
} from '../composables/reader'

onMounted(initReader)

const target = computed(() => lastPage.value ?? firstPage)

const link = computed(() => {
  if (!target.value) return withBase('/toc.html')
  return lastPage.value
    ? `${withBase(lastPage.value.path)}?resume=1`
    : withBase(target.value.path)
})

const hasProgress = computed(() => Boolean(lastPage.value))

const updatedLabel = computed(() => {
  const timestamp = lastPosition.value?.updatedAt
  if (!timestamp) return ''
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
})

const readPages = computed(() => Object.keys(progress.pages).length)
</script>

<template>
  <section class="continue-reading" aria-label="阅读入口">
    <div class="continue-reading__inner">
      <p class="continue-reading__eyebrow">
        {{ hasProgress ? '继续阅读' : '开始阅读' }}
      </p>
      <h2 class="continue-reading__title">
        {{ lastPage ? lastPage.label : book.title }}
      </h2>
      <p class="continue-reading__meta">
        <template v-if="lastPage">
          {{ lastPage.context }}
          <span aria-hidden="true">·</span>
          更新于 {{ updatedLabel }}
        </template>
        <template v-else>
          {{ book.subtitle }} · {{ book.author }}
        </template>
      </p>

      <div class="continue-reading__progress">
        <div
          class="continue-reading__track"
          role="progressbar"
          aria-label="全书阅读进度"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-valuenow="Math.round(overallProgress * 100)"
        >
          <span
            class="continue-reading__fill"
            :style="{ transform: `scaleX(${overallProgress})` }"
          />
        </div>
        <span class="continue-reading__percent">{{ percent(overallProgress) }}</span>
      </div>

      <p class="continue-reading__hint">
        <template v-if="hasProgress">
          全书已读 {{ percent(overallProgress) }}，共读过 {{ readPages }} 页。
        </template>
        <template v-else>
          阅读进度、字号与主题都会保存在你自己的浏览器中。
        </template>
      </p>

      <a class="continue-reading__button" :href="link">
        {{ hasProgress ? '从上次位置继续' : '从第一页开始' }}
      </a>
    </div>
  </section>
</template>
