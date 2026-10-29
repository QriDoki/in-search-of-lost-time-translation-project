#!/usr/bin/env node
/**
 * 生成 VitePress 站点内容。
 *
 * 内容源：polish/{版本}/chapters（按 publish/arrange.json 取段拼接）。
 * 产物：site/chapters/*.md、site/toc.md、site/.vitepress/generated/book.json。
 *
 * 页面划分以 arrange.json 为准，不按润色稿的文件切分：
 * 每个 2 级节点（部 / 无部卷的章）单独一页；卷另有一页书名页；
 * 版权页是所有内容的第一页。3、4 级节点是页面内的锚点。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { bookConfig } from '../book.config.mjs'
import { buildBook } from './lib/content.mjs'
import { createMarkdownRenderer } from 'vitepress'
import { configureMarkdown } from '../site/.vitepress/markdown.mjs'
import { extractSearchRecords } from '../site/.vitepress/paragraphs.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const siteRoot = path.join(root, 'site')
const chaptersOut = path.join(siteRoot, 'chapters')
const generatedOut = path.join(siteRoot, '.vitepress', 'generated')

const quote = (value) => JSON.stringify(String(value))

/** 阅读器里显示的短标签：卷名做上下文，页面标题做主体。 */
function pageLabel(page) {
  if (page.kind === 'copyright') return '版权页'
  return page.title
}

function pageContext(page) {
  if (page.kind === 'copyright') return bookConfig.title
  return page.volumeTitle
}

/** 浏览器标签与搜索结果里的标题：带上卷名，避免只剩一个「第一章」。 */
function documentTitle(page) {
  if (page.kind === 'copyright') return '版权页'
  if (page.kind === 'volume') return page.title
  return `${page.volumeTitle} · ${page.title}`
}

function frontmatter(page, index) {
  const lines = [
    '---',
    `title: ${quote(documentTitle(page))}`,
    `pageTitle: ${quote(pageLabel(page))}`,
    `pageContext: ${quote(pageContext(page))}`,
    `pageKind: ${quote(page.kind)}`,
    `pageLevel: ${page.level}`,
    `readerPageId: ${quote(page.id)}`,
    `volumeId: ${quote(page.volumeId)}`,
    `volumeTitle: ${quote(page.volumeTitle)}`,
    `volumeOrder: ${page.volumeOrder}`,
    `pageIndex: ${index}`,
    `pageClass: ${quote(`reader-chapter reader-${page.kind}`)}`,
    'sidebar: false',
    'aside: false',
    'outline: false',
    'prev: false',
    'next: false',
    '---',
    '',
  ]
  return `${lines.join('\n')}\n`
}

function writePages(book) {
  fs.mkdirSync(chaptersOut, { recursive: true })
  for (const entry of fs.readdirSync(chaptersOut)) {
    if (entry.endsWith('.md')) fs.rmSync(path.join(chaptersOut, entry))
  }

  book.pages.forEach((page, index) => {
    const content = `${frontmatter(page, index)}${page.markdown}\n`
    fs.writeFileSync(path.join(chaptersOut, `${page.id}.md`), content)
  })
}

function tocLines(book) {
  const lines = [
    '---',
    'title: 目录',
    'sidebar: false',
    'aside: false',
    'outline: false',
    'prev: false',
    'next: false',
    'pageClass: reader-toc',
    '---',
    '',
    '# 目录',
    '',
    `- [版权页](./chapters/${book.copyrightPage.id}.md)`,
    '',
  ]

  const toDoc = (path) => `.${path.replace(/^\/chapters\//, '/chapters/').replace(/\.html/, '.md')}`

  const renderEntry = (entry, depth) => {
    const indent = '  '.repeat(depth)
    lines.push(`${indent}- [${entry.title}](${toDoc(entry.path)})`)
    for (const child of entry.children ?? []) renderEntry(child, depth + 1)
  }

  for (const volume of book.volumes) {
    const volumeEntry = volume.entries[0]
    lines.push(`## [${volume.title}](${toDoc(volumeEntry.path)})`, '')
    if (volume.titleFr) lines.push(`*${volume.titleFr}*`, '')
    for (const entry of volumeEntry.children ?? []) renderEntry(entry, 0)
    lines.push('')
  }

  lines.push(
    '> 阅读进度与字号、主题等设置保存在当前浏览器中，不会上传到服务器。',
    '',
  )
  return lines.join('\n')
}

function siteManifest(book) {
  const pages = book.pages.map((page, index) => ({
    id: page.id,
    kind: page.kind,
    level: page.level,
    title: page.title,
    titleFr: page.titleFr,
    label: pageLabel(page),
    context: pageContext(page),
    volumeId: page.volumeId,
    volumeTitle: page.volumeTitle,
    volumeOrder: page.volumeOrder,
    path: page.path,
    chars: page.chars,
    index,
  }))

  return {
    bookId: book.book.bookId,
    title: book.book.title,
    subtitle: book.book.subtitle,
    author: book.book.author,
    translator: book.book.translator,
    license: book.book.license,
    licenseUrl: book.book.licenseUrl,
    repository: book.book.repository,
    language: book.book.language,
    description: book.book.description,
    contentVersion: book.version,
    buildVersion: book.buildVersion,
    totalChars: book.stats.totalChars,
    totalPages: book.stats.totalPages,
    pages,
    volumes: book.volumes.map((volume) => ({
      id: volume.id,
      title: volume.title,
      titleFr: volume.titleFr,
      order: volume.order,
      chars: volume.chars,
      entries: volume.entries,
    })),
  }
}

async function main() {
  const book = buildBook({ root, annotationStyle: 'popover' })

  writePages(book)
  fs.writeFileSync(path.join(siteRoot, 'toc.md'), `${tocLines(book)}\n`)

  fs.rmSync(generatedOut, { recursive: true, force: true })
  fs.mkdirSync(generatedOut, { recursive: true })
  fs.writeFileSync(
    path.join(generatedOut, 'book.json'),
    `${JSON.stringify(siteManifest(book), null, 2)}\n`,
  )

  const md = await createMarkdownRenderer(siteRoot, { html: true, config: configureMarkdown })
  const records = book.pages.flatMap((page, index) => extractSearchRecords(
    md.render(`${frontmatter(page, index)}${page.markdown}`, { relativePath: `chapters/${page.id}.md` }),
    { ...page, path: `/chapters/${page.id}.html` },
  ))
  fs.writeFileSync(path.join(generatedOut, 'search.json'), JSON.stringify({ version: book.version, records }))
  console.log(`[site] 全文搜索：${records.length.toLocaleString('zh-CN')} 个段落与标题`)

  for (const warning of book.warnings) console.warn(`[site] 提示：${warning}`)

  const { totalChars, totalPages, totalVolumes } = book.stats
  console.log(
    `[site] ${book.sourceLabel} → ${totalPages} 页 / ${totalVolumes} 卷 / ` +
      `${totalChars.toLocaleString('zh-CN')} 字（版本 ${book.version}）`,
  )
}

main()
