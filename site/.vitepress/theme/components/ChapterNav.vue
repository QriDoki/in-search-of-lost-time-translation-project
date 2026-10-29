<script setup lang="ts">
import { computed } from 'vue'
import { useData, withBase } from 'vitepress'
import { neighbourPages } from '../composables/book'

const { page } = useData()

const pageId = computed(() => String(page.value.frontmatter.readerPageId ?? ''))
const neighbours = computed(() => neighbourPages(pageId.value))
</script>

<template>
  <nav class="chapter-nav" aria-label="翻页导航">
    <a
      v-if="neighbours.previous"
      class="chapter-nav__card chapter-nav__card--previous"
      :href="withBase(neighbours.previous.path)"
    >
      <span class="chapter-nav__direction">← 上一页</span>
      <span class="chapter-nav__title">{{ neighbours.previous.context }}</span>
      <span
        v-if="neighbours.previous.label !== neighbours.previous.context"
        class="chapter-nav__subtitle"
      >
        {{ neighbours.previous.label }}
      </span>
    </a>
    <span v-else class="chapter-nav__card chapter-nav__card--empty" />

    <a class="chapter-nav__toc" :href="withBase('/toc.html')">目录</a>

    <a
      v-if="neighbours.next"
      class="chapter-nav__card chapter-nav__card--next"
      :href="withBase(neighbours.next.path)"
    >
      <span class="chapter-nav__direction">下一页 →</span>
      <span class="chapter-nav__title">{{ neighbours.next.context }}</span>
      <span
        v-if="neighbours.next.label !== neighbours.next.context"
        class="chapter-nav__subtitle"
      >
        {{ neighbours.next.label }}
      </span>
    </a>
    <span v-else class="chapter-nav__card chapter-nav__card--empty" />
  </nav>
</template>
