---
layout: home
pageClass: home-page

hero:
  name: 追忆似水年华
  text: 全七卷 · 中文新译
  tagline: 马塞尔·普鲁斯特<br>孙齐宏 with ✧AI 译
  actions:
    - theme: brand
      text: 开始阅读
      link: chapters/copyright.html
    - theme: alt
      text: 查看目录
      link: toc.html
    - theme: alt
      text: 下载EPUB
      link: https://github.com/QriDoki/in-search-of-lost-time-translation-project/releases/
      target: _blank
      rel: noopener noreferrer
---

<ClientOnly>
  <ContinueReading />
  <template #fallback>
    <div class="continue-reading continue-reading--placeholder" aria-hidden="true" />
  </template>
</ClientOnly>
