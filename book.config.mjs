/**
 * 书目元数据与打包配置。
 *
 * 译文（polish/{版本}/chapters）才是唯一内容源；这里只放无法从正文推导、
 * 但站点与电子书都要用到的信息。
 */
export const bookConfig = {
  bookId: 'in-search-of-lost-time',
  title: '追忆似水年华',
  subtitle: '全七卷 · 中文新译',
  author: '马塞尔·普鲁斯特',
  authorFr: 'Marcel Proust',
  translator: '孙齐宏（Qri）',
  license: 'CC BY-NC-SA 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh-hans',
  repository: 'https://github.com/QriDoki/in-search-of-lost-time-translation-project',
  onlineReader: 'https://qridoki.github.io/in-search-of-lost-time-translation-project/',
  language: 'zh-Hans',
  description: '马塞尔·普鲁斯特《追忆似水年华》全七卷中文译文的在线阅读与电子书版本。',

  /** 目录树：卷 / 部 / 章 / 节 的分层与每个产物页面的组成。 */
  arrangeFile: 'publish/arrange.json',
  /** 版权页，站点与每本电子书的第一页。 */
  copyrightFile: 'publish/版权页.md',

  /** EPUB 产物目录（站点产物由 VitePress 输出到 site/.vitepress/dist）。 */
  epubOutDir: 'dist/epub',
}
