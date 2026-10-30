import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitepress'
import { configureMarkdown } from './markdown.mjs'

const configDir = path.dirname(fileURLToPath(import.meta.url))
const bookPath = path.join(configDir, 'generated', 'book.json')

const book = fs.existsSync(bookPath)
  ? JSON.parse(fs.readFileSync(bookPath, 'utf8'))
  : { title: '追忆似水年华', subtitle: '全七卷 · 中文新译', description: '马塞尔·普鲁斯特《追忆似水年华》中文译文。' }

const base = (process.env.VITEPRESS_BASE || '/').replace(/\/?$/, '/')

const PREFIX = 'lost-time'

export default defineConfig({
  lang: 'zh-CN',
  title: '追忆似水年华',
  description: book.description,
  base,
  cleanUrls: false,
  appearance: false,
  lastUpdated: false,
  vite: {
    resolve: {
      alias: [{
        find: /^.*\/VPNavBarTitle\.vue$/,
        replacement: path.join(configDir, 'theme/components/ReaderVersionMenu.vue'),
      }, {
        find: /^.*\/VPLocalSearchBox\.vue$/,
        replacement: path.join(configDir, 'theme/components/ReaderSearch.vue'),
      }],
    },
  },
  markdown: {
    // 正文含少量行内 HTML（法文书名、分隔符）。
    html: true,
    // 稿件注解已由内容生成器转成浮层标记；保留普通 Markdown 脚注支持。
    config: configureMarkdown,
  },
  head: [
    ['link', {
      rel: 'icon',
      href: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E🕰️%3C/text%3E%3C/svg%3E",
    }],
    ['meta', { name: 'theme-color', content: '#f7f2e8' }],
    ['meta', { name: 'format-detection', content: 'telephone=no' }],
    [
      'script',
      {},
      `(function(){try{
        var p=JSON.parse(localStorage.getItem('${PREFIX}:reader-prefs:v2')||'{}');
        var th=p.theme||((window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'paper');
        var fs=p.fontSize||20, lh=p.lineHeight||1.9, ff=p.fontFamily||'sans', w=p.width||720;
        var r=document.documentElement;
        r.setAttribute('data-reader-theme',th);
        r.setAttribute('data-reader-font',ff);
        if(th==='dark')r.classList.add('dark');
        r.style.setProperty('--reader-font-size',fs+'px');
        r.style.setProperty('--reader-line-height',String(lh));
        r.style.setProperty('--reader-width',w+'px');
        var m=document.querySelector('meta[name="theme-color"]');
        if(m&&th==='dark')m.setAttribute('content','#171513');
      }catch(e){}})();`,
    ],
  ],
  themeConfig: {
    siteTitle: '<span class="reader-title-desktop">追忆似水年华</span><span class="reader-title-mobile" aria-label="追忆似水年华">🕰️</span>',
    logo: false,
    outline: false,
    search: {
      provider: 'local',
      options: {
        // 段落索引替代默认的整章分词索引，沿用原来的入口与快捷键。
        _render: () => '',
        detailedView: true,
        translations: {
          button: { buttonText: '搜索全文', buttonAriaLabel: '搜索全文' },
          modal: {
            displayDetails: '显示详情',
            resetButtonTitle: '清除',
            backButtonTitle: '返回',
            noResultsText: '没有找到相关内容',
            footer: {
              selectText: '选择',
              navigateText: '切换',
              closeText: '关闭',
            },
          },
        },
      },
    },
    docFooter: { prev: '上一页', next: '下一页' },
    returnToTopLabel: '回到顶部',
    sidebarMenuLabel: '目录',
    darkModeSwitchLabel: '主题',
    lightModeSwitchTitle: '浅色模式',
    darkModeSwitchTitle: '深色模式',
    footer: {
      message:
        '译文采用 <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh-hans" target="_blank" rel="noreferrer">CC BY-NC-SA 4.0</a> 许可协议',
    },
  },
})
