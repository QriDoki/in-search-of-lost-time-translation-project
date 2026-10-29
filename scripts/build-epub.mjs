#!/usr/bin/env node
/**
 * 打包 EPUB。
 *
 * 产出 8 个文件：
 *   dist/epub/《追忆似水年华》第一卷：在斯万家那边-孙齐宏译本-{版本号}.epub 等七卷
 *   dist/epub/《追忆似水年华》全七卷-孙齐宏译本-{版本号}.epub
 *
 * 每本书的第一页都是 publish/版权页.md；目录只写进 EPUB 的 nav
 * （阅读器可据此跳转），书里不放读者能看到的目录页。
 *
 * 章节划分来自 publish/arrange.json：每个 2 级节点一个 xhtml，
 * 3、4 级节点是文件内锚点 —— 与在线版的页面划分完全一致。
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { bookConfig } from '../book.config.mjs'
import { buildBook } from './lib/content.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const cssPath = path.join(root, 'scripts', 'epub.css')
const notesFilterPath = path.join(root, 'scripts', 'epub-notes.lua')
const outDir = path.join(root, bookConfig.epubOutDir)
const releaseOutDir = path.join(outDir, 'release-assets')

const quote = (value) => JSON.stringify(String(value))

/** 版权页在每本书里都排在第一页，且不进目录。 */
function copyrightMarkdown(book) {
  return `${book.copyrightPage.markdown}\n`
}

function volumeMarkdown(book, volume) {
  const sections = [
    copyrightMarkdown(book),
    ...volume.pages.map((page) => `${page.markdown}\n`),
  ]
  return sections.join('\n\n')
}

function allMarkdown(book) {
  const sections = [copyrightMarkdown(book)]
  for (const volume of book.volumes) {
    for (const page of volume.pages) sections.push(`${page.markdown}\n`)
  }
  return sections.join('\n\n')
}

/** 从 YYYYMMDDhhmmss 或旧版 YYMMDD 文件夹名提取 dc:date。 */
function releaseDate(version) {
  const full = /^(\d{4})(\d{2})(\d{2})\d{6}(?:-\d+)?$/.exec(version)
  if (full) return `${full[1]}-${full[2]}-${full[3]}`
  const legacy = /^(\d{2})(\d{2})(\d{2})(?:-\d+)?$/.exec(version)
  if (legacy) return `20${legacy[1]}-${legacy[2]}-${legacy[3]}`
  return (process.env.SOURCE_DATE_EPOCH
    ? new Date(Number(process.env.SOURCE_DATE_EPOCH) * 1000)
    : new Date()
  )
    .toISOString()
    .slice(0, 10)
}

function metadataFor(book, volume) {
  const isAll = !volume
  // pandoc 的 subtitle 不会写进 EPUB 的 dc:title，所以卷名直接并进主标题。
  const title = isAll
    ? `${book.book.title}（全${book.volumes.length}卷）`
    : `${book.book.title}：${volume.title}`

  return [
    '---',
    `title: ${quote(title)}`,
    `author: ${quote(book.book.author)}`,
    `lang: ${quote(book.book.language)}`,
    `date: ${quote(releaseDate(book.version))}`,
    `identifier: ${quote(`urn:${book.book.bookId}:${volume?.id ?? 'all'}@${book.version}`)}`,
    `rights: ${quote(book.book.license)}`,
    `description: ${quote(book.book.description)}`,
    '...',
    '',
  ].join('\n')
}

function runPandoc({ markdown, meta, output, splitLevel }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lost-time-epub-'))
  try {
    const mdPath = path.join(dir, 'book.md')
    const metaPath = path.join(dir, 'meta.yaml')
    fs.writeFileSync(mdPath, markdown)
    fs.writeFileSync(metaPath, meta)

    execFileSync(
      'pandoc',
      [
        mdPath,
        '--from', 'markdown-smart+raw_html',
        '--to', 'epub3',
        '--lua-filter', notesFilterPath,
        // 不用 --toc：pandoc 会把 nav 文档放进 spine，读者就会看到一页目录。
        // 不给 --toc 时 nav 仍会生成（EPUB 3 必需），只是不落在阅读顺序里。
        '--toc-depth', '4',
        '--split-level', String(splitLevel),
        '--epub-title-page=false',
        '--css', cssPath,
        '--metadata-file', metaPath,
        '--output', output,
      ],
      { stdio: ['ignore', 'inherit', 'inherit'] },
    )
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

function describe(file) {
  return {
    file: path.basename(file),
    bytes: fs.statSync(file).size,
  }
}

function buildEpub(book, volume) {
  const markdown = volume ? volumeMarkdown(book, volume) : allMarkdown(book)
  const title = volume ? volume.title.replace(/\s*·\s*/, '：') : '全七卷'
  // 文件名和版权页均使用选中的 polish 文件夹名。
  const file = `《${book.book.title}》${title}-孙齐宏译本-${book.buildVersion}.epub`
  const output = path.join(outDir, file)

  runPandoc({
    markdown,
    meta: metadataFor(book, volume),
    output,
    // 2 级标题（部 / 章）各起一个文件；1 级（卷）自然也各自起头。
    splitLevel: 2,
  })

  // GitHub 会改写含中文或全角符号的附件名；发布副本使用唯一的 ASCII 名称。
  // 本地产物仍保留完整中文书名，书内元数据也保持中文。
  const releaseFile = `${book.book.bookId}-${volume?.id ?? 'all'}-sunqihong-${book.buildVersion}.epub`
  if (!/^[A-Za-z0-9_-]+\.epub$/.test(releaseFile)) {
    throw new Error(`Release 附件名必须只含 ASCII 字母、数字、连字符和下划线：${releaseFile}`)
  }
  fs.copyFileSync(output, path.join(releaseOutDir, releaseFile), fs.constants.COPYFILE_EXCL)

  const chars = volume
    ? volume.chars
    : book.volumes.reduce((sum, item) => sum + item.chars, 0)
  const pages = volume
    ? volume.pages.length
    : book.pages.length - 1

  return {
    ...describe(output),
    releaseFile,
    volumeId: volume?.id ?? 'all',
    title: volume?.title ?? '全七卷',
    pages,
    chars,
  }
}

function writeReleaseNotes(results, book) {
  const lines = [
    '## 电子书',
    '',
    `本次发布由 \`${book.sourceLabel}\`（版本 ${book.version}）自动构建。`,
    '',
    '| 文件 | 卷 | 页 | 字数 | 大小 |',
    '| --- | --- | ---: | ---: | ---: |',
    ...results.map(
      (item) =>
        `| \`${item.releaseFile}\` | ${item.title} | ${item.pages} | ${item.chars.toLocaleString('zh-CN')} | ${(item.bytes / 1024 / 1024).toFixed(2)} MB |`,
    ),
    '',
    '每本电子书的第一页是版权页；目录由 EPUB 自身的 nav 提供，书内不放目录页。',
    '',
    `在线阅读：<${book.book.onlineReader}>`,
    `项目地址：<${book.book.repository}>`,
  ]

  const sha = process.env.GITHUB_SHA
  if (sha) lines.push('', `构建提交：\`${sha.slice(0, 7)}\``)

  fs.writeFileSync(path.join(outDir, 'release-notes.md'), `${lines.join('\n')}\n`)
}

function main() {
  try {
    execFileSync('pandoc', ['--version'], { stdio: 'ignore' })
  } catch {
    throw new Error('未找到 pandoc，请先安装：https://pandoc.org/installing.html')
  }

  const book = buildBook({ root })
  for (const warning of book.warnings) console.warn(`[epub] 提示：${warning}`)

  fs.rmSync(outDir, { recursive: true, force: true })
  fs.mkdirSync(outDir, { recursive: true })
  fs.mkdirSync(releaseOutDir)

  const results = []
  for (const volume of book.volumes) {
    const result = buildEpub(book, volume)
    results.push(result)
    console.log(
      `[epub] ${result.file} — ${result.pages} 页 / ${result.chars.toLocaleString('zh-CN')} 字 / ` +
        `${(result.bytes / 1024 / 1024).toFixed(2)} MB`,
    )
  }

  const all = buildEpub(book)
  results.push(all)
  console.log(
    `[epub] ${all.file} — ${all.pages} 页 / ${all.chars.toLocaleString('zh-CN')} 字 / ` +
      `${(all.bytes / 1024 / 1024).toFixed(2)} MB`,
  )

  writeReleaseNotes(results, book)
  console.log(`[epub] 已生成 ${results.length} 个 EPUB，输出目录：${outDir}`)
}

main()
