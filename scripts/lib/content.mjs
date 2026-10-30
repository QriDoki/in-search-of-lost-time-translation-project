/**
 * 打包内容模型。
 *
 * 输入：
 *   publish/arrange.json         七卷目录树（书 → 卷 → 部/章 → 章/节）
 *   polish/{版本}/chapters/*.md  润色稿（唯一内容源）
 *   publish/版权页.md            版权页
 *
 * 输出：一组「产物页面」。每个页面都是完整的 Markdown（含标题），
 * 供站点与 EPUB 两种打包器直接使用。
 *
 * 层级约定（与 arrange.json 的说明一致）：
 *   书 = 0 级，卷 = 1 级，部/章 = 2 级，章/节 = 3 级，节 = 4 级。
 *   每个 2 级节点单独成为一个产物页面；3、4 级节点是页面内的锚点。
 *   卷本身也各有一个页面（书名页），EPUB 目录的第一层就落在它上面。
 *
 * 注意：产物页面不按润色稿的文件切分，而是按 arrange.json 的
 * parts 取段/拼接——同一个 md 可以拆给两个页面，一个页面也可以
 * 由多个 md 拼成。
 */
import fs from 'node:fs'
import path from 'node:path'
import MarkdownIt from 'markdown-it'
import { bookConfig } from '../../book.config.mjs'
import { resolveContentVersion } from './content-version.mjs'
import { annotationIsVisible, defaultAnnotationTypes, splitAnnotationTypes } from './annotation-types.mjs'

const noteMarkdown = new MarkdownIt({ html: true })

/** 润色稿中用于切段的「黄瓜行」。 */
const SEPARATOR_LINE = /^[ \t]*🥒+[ \t]*$/u
const HEADING_LINE = /^(#{1,6})[ \t]+(.+?)[ \t]*$/
const TRAILING_ATTRS = /\s*\{[^}]*\}\s*$/

/** 与 AGENTS.md 一致：译文里不应出现的出版机构信息。 */
const FORBIDDEN = ['伽利玛', 'BeQ', '魁北克', 'Gallimard', '杜皮伊']

const SCENE_BREAK_HTML = '<p class="scene-break">　</p>'

/* ------------------------------------------------------------------ */
/* 文本工具                                                            */
/* ------------------------------------------------------------------ */

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** 按「黄瓜行」把一份润色稿切成若干段（分隔符本身不入正文，段号从 0 起）。 */
function splitSections(text) {
  const sections = []
  let current = []
  for (const line of text.split(/\r?\n/)) {
    if (SEPARATOR_LINE.test(line)) {
      sections.push(current.join('\n'))
      current = []
    } else {
      current.push(line)
    }
  }
  sections.push(current.join('\n'))
  return sections
}

function plainTitle(value) {
  return String(value).replace(TRAILING_ATTRS, '').trim()
}

/* ------------------------------------------------------------------ */
/* 取段                                                                */
/* ------------------------------------------------------------------ */

function createPartReader(chaptersDir) {
  const rawCache = new Map()
  const sectionCache = new Map()

  return function readPart(part) {
    const file = typeof part === 'string' ? part : part?.file
    if (!file) throw new Error(`arrange.json 中有无法识别的 part：${JSON.stringify(part)}`)

    let raw = rawCache.get(file)
    if (raw === undefined) {
      const full = path.join(chaptersDir, file)
      if (!fs.existsSync(full)) {
        throw new Error(`arrange.json 引用的文件不存在：${file}（目录 ${chaptersDir}）`)
      }
      raw = fs.readFileSync(full, 'utf8')
      rawCache.set(file, raw)
    }

    if (typeof part === 'string') return { file, text: raw, label: file }

    let sections = sectionCache.get(file)
    if (!sections) {
      sections = splitSections(raw)
      sectionCache.set(file, sections)
    }

    const range = Array.isArray(part.section) ? part.section : [part.section, part.section]
    const [from, to] = range
    const valid =
      Number.isInteger(from) &&
      Number.isInteger(to) &&
      from >= 0 &&
      to >= from &&
      to < sections.length
    if (!valid) {
      throw new Error(
        `arrange.json 的取段超出范围：${file} section=${JSON.stringify(part.section)}（共 ${sections.length} 段）`,
      )
    }
    return {
      file,
      text: sections.slice(from, to + 1).join('\n\n'),
      label: `${file}#${JSON.stringify(part.section)}`,
    }
  }
}

/* ------------------------------------------------------------------ */
/* 稿件的块解析                                                        */
/* ------------------------------------------------------------------ */

function isHazardousParagraph(text) {
  if (/^[ \t]*([-+]|\*[ \t]|\d+[.)][ \t])/.test(text)) return true
  if (/^[ \t]*>/.test(text)) return true
  if (/^[ \t]*\|/.test(text)) return true
  if (/^ {4,}\S/.test(text)) return true
  return false
}

/**
 * 强调标记转成 HTML 标签。
 *
 * 中文正文里 `*《费加罗报》*` 这种写法，按 CommonMark 的定界规则两侧都
 * 是标点，星号根本不成对（markdown-it 与 pandoc 都一样），于是源码里的
 * `*` 会直接露出来；原作还有几处引文被分成两段，星号落在段落两端。
 *
 * 所以这里自己处理，不指望渲染器的强调语法：`**…**` 变 `<strong>`，
 * 其余 `*` 按出现顺序成对开合；段落里星号是奇数时，最后一个开着的
 * 强调在段尾闭合——那些跨段的引文，两段便各自成为一段斜体。
 */
function emphasisToHtml(text) {
  const withStrong = text.replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>')
  if (!withStrong.includes('*')) return withStrong

  let out = ''
  let open = false
  for (const char of withStrong) {
    if (char !== '*') {
      out += char
      continue
    }
    out += open ? '</em>' : '<em>'
    open = !open
  }
  if (open) out += '</em>'
  return out
}

/** `*  Landeriri*`（星号后跟空格）会被当成列表项，去掉那个空格。 */
function fixListLikeEmphasis(text) {
  return text.replace(/^\*(\s{2,})(\S(?:[\s\S]*?\S)?)\*$/, '*$2*')
}

/**
 * 去掉一份 part 开头重复的祖先/自身标题（arrange.json 约定：
 * 同一节点的标题只在其首个 part 出现一次，分册续文从正文开始）。
 */
function stripLeadingHeadings(text, allowedTitles, ctx, label) {
  const lines = text.split(/\r?\n/)
  let index = 0
  while (index < lines.length) {
    const line = lines[index]
    if (!line.trim()) {
      index += 1
      continue
    }
    const match = line.match(HEADING_LINE)
    if (!match) break
    const title = plainTitle(match[2])
    if (!allowedTitles.has(title)) {
      ctx.warn(`${label}：开头出现非本节点的标题「${title}」，已保留为章内小标题`)
      break
    }
    index += 1
  }
  return lines.slice(index).join('\n')
}

/**
 * 一行正文的处理：注释 → 站点浮层标记 / EPUB 脚注，强调 → HTML 标签。
 *
 * 注释内容单独处理强调，注记里的 `*fa*` 与正文的斜体互不干扰；
 * 正文与注记的标记文本分别处理，被标注的词仍留在原处。
 */
function formatInline(text, ctx, label) {
  const parts = []
  const pattern = /⊂([^⊃]*?)⊃≼([^≽]*?)≽|≼([^≽]*?)≽/g
  let cursor = 0
  let match

  const prose = (chunk) => emphasisToHtml(fixListLikeEmphasis(chunk))

  while ((match = pattern.exec(text))) {
    parts.push(prose(text.slice(cursor, match.index)))
    if (ctx.annotationStyle === 'popover') {
      const anchored = match[3] === undefined
      const parsed = splitAnnotationTypes(anchored ? match[2] : match[3])
      const note = noteMarkdown.renderInline(emphasisToHtml(parsed.note))
      const hidden = annotationIsVisible(parsed.types, defaultAnnotationTypes) ? '' : ' is-note-hidden'
      const anchor = anchored
        ? `<span class="reader-annotation__anchor">${prose(match[1])}</span>`
        : ''
      parts.push(
        `<span class="reader-annotation${hidden}" data-reader-note-types="${escapeHtml(parsed.types.join(' '))}">${anchor}` +
        `<button type="button" class="reader-annotation__trigger" data-reader-note="${escapeHtml(note)}" ` +
        'aria-label="查看注解" aria-haspopup="dialog" aria-expanded="false"></button></span>',
      )
    } else if (match[3] !== undefined) {
      parts.push(`^[${emphasisToHtml(match[3].trim())}]`)
    } else {
      parts.push(prose(match[1]))
      parts.push(`^[${emphasisToHtml(match[2].trim())}]`)
    }
    cursor = pattern.lastIndex
  }
  parts.push(prose(text.slice(cursor)))

  const converted = parts.join('')
  if (/[⊂⊃≼≽]/.test(converted)) {
    ctx.warn(`${label}：注释标记未能完整解析：${converted.slice(0, 40)}…`)
  }
  if (converted.includes('*')) {
    ctx.warn(`${label}：仍有未处理的 * 号：${converted.slice(0, 40)}…`)
  }
  return converted
}

function paragraphBlocks(text, ctx, label) {
  const trimmed = text.trim()
  if (!trimmed) return []

  for (const word of FORBIDDEN) {
    if (trimmed.includes(word)) ctx.warn(`${label}：正文出现应忽略的出版机构信息「${word}」`)
  }
  if (trimmed.includes('[TODO]')) ctx.warn(`${label}：正文残留 [TODO]`)
  if (trimmed.includes('![')) ctx.warn(`${label}：正文包含图片，按规则不予打包`)

  const converted = formatInline(trimmed, ctx, label)
  if (isHazardousParagraph(converted)) {
    ctx.warn(`${label}：段首字符会被解析成 Markdown 结构：${converted.slice(0, 40)}…`)
  }

  return [{ type: 'para', text: converted }]
}

/**
 * 原书的「概要式副题」——「夏吕斯先生在上流社会。一位医生。……」这类
 * 章节内容提要。它是标题级排版，却不是一个可导航的条目，因此不写成
 * Markdown 标题，而是渲染成带 class 的容器：
 *   - EPUB 的 nav 只收真标题，`心灵的间歇` 这类下级条目不会被它带丢；
 *   - 站点目录本就只认 arrange.json，不读正文标题。
 * EPUB 容器开启 Markdown 解析，让副题与正文共用脚注；站点直接生成浮层标记。
 */
function subtitleHtml(text, ctx, label) {
  if (ctx.annotationStyle === 'popover') {
    return `<p class="chapter-subtitle">${formatInline(escapeHtml(text), ctx, label)}</p>`
  }
  return `<div class="chapter-subtitle" markdown="1">\n${formatInline(escapeHtml(text), ctx, label)}\n</div>`
}

/**
 * 把一段稿件正文解析成块。
 */
function parseText(text, options) {
  const { ctx, allowedTitles, label, stripHeading } = options
  const body = stripHeading
    ? stripLeadingHeadings(text, allowedTitles, ctx, label)
    : text

  const blocks = []
  let paragraph = []

  const flush = () => {
    if (!paragraph.length) return
    blocks.push(...paragraphBlocks(paragraph.join('\n'), ctx, label))
    paragraph = []
  }

  for (const line of body.split(/\r?\n/)) {
    if (SEPARATOR_LINE.test(line)) {
      flush()
      blocks.push({ type: 'raw', html: SCENE_BREAK_HTML })
      continue
    }
    const heading = line.match(HEADING_LINE)
    if (heading) {
      flush()
      blocks.push({ type: 'raw', html: subtitleHtml(plainTitle(heading[2]), ctx, label) })
      continue
    }
    if (!line.trim()) {
      flush()
      continue
    }
    paragraph.push(line.trim())
  }
  flush()

  return blocks
}

/* ------------------------------------------------------------------ */
/* 页面组装                                                            */
/* ------------------------------------------------------------------ */

function nextStructuralId(counts, pageId, level) {
  if (level === 3) {
    counts.chapter += 1
    counts.section = 0
    return `${pageId}-c${counts.chapter}`
  }
  if (level === 4) {
    counts.section += 1
    return `${pageId}-c${counts.chapter}-s${counts.section}`
  }
  counts.extra += 1
  return `${pageId}-n${counts.extra}`
}

function renderNode(node, level, state) {
  const blocks = []
  const id = level === 2 ? state.pageId : nextStructuralId(state.counts, state.pageId, level)
  blocks.push({ type: 'heading', level, text: node.title, id, listed: true })

  const allowedTitles = new Set([node.title, ...state.ancestors.map((item) => item.title)])
  ;(node.parts ?? []).forEach((part, index) => {
    const { text, label } = state.readPart(part)
    blocks.push(
      ...parseText(text, {
        ctx: state.ctx,
        label,
        allowedTitles,
        stripHeading: index === 0,
      }),
    )
  })

  const childState = { ...state, ancestors: [...state.ancestors, node] }
  for (const child of node.children ?? []) {
    blocks.push(...renderNode(child, level + 1, childState))
  }

  return blocks
}

/** 页面字数：去掉 HTML 标签、脚注标记与空白后统计正文字符。 */
function countChars(blocks) {
  let chars = 0
  for (const block of blocks) {
    if (block.type === 'heading') chars += block.text.replace(/\s+/g, '').length
    else if (block.type === 'para') {
      chars += block.text
        .replace(/<[^>]+>/g, '')
        .replace(/\^\[[^\]]*\]/g, '')
        .replace(/\s+/g, '').length
    }
  }
  return chars
}

function blocksToMarkdown(blocks) {
  return blocks
    .map((block) => {
      if (block.type === 'heading') {
        const attrs = [block.id ? `#${block.id}` : '', block.listed ? '' : '.unlisted']
          .filter(Boolean)
          .join(' ')
        return `${'#'.repeat(block.level)} ${block.text}${attrs ? ` {${attrs}}` : ''}`
      }
      if (block.type === 'raw') return block.html
      return block.text
    })
    .join('\n\n')
}

/** 页面内的 3、4 级标题锚点，用来生成带锚点的目录。 */
function collectAnchorIds(blocks, pageId) {
  const anchors = []
  for (const block of blocks) {
    if (block.type !== 'heading' || !block.id || block.id === pageId) continue
    anchors.push({ id: block.id, level: block.level, title: block.text, listed: block.listed })
  }
  return anchors
}

function makePage(fields) {
  return {
    path: `/chapters/${fields.id}.html`,
    file: `chapters/${fields.id}.md`,
    ...fields,
  }
}

/* ------------------------------------------------------------------ */
/* 版权页                                                              */
/* ------------------------------------------------------------------ */

function readCopyrightPage(root, ctx, buildVersion) {
  const file = path.join(root, bookConfig.copyrightFile)
  if (!fs.existsSync(file)) {
    throw new Error(`找不到版权页：${bookConfig.copyrightFile}`)
  }
  const raw = `${fs.readFileSync(file, 'utf8').trimEnd()}\n\n版本: ${buildVersion}\n`

  const blocks = []
  let paragraph = []
  let seenHeading = false
  const flush = () => {
    if (!paragraph.length) return
    blocks.push(...paragraphBlocks(paragraph.join('\n'), ctx, bookConfig.copyrightFile))
    paragraph = []
  }

  for (const line of raw.split(/\r?\n/)) {
    const heading = line.match(HEADING_LINE)
    if (heading) {
      flush()
      if (!seenHeading) {
        seenHeading = true
        blocks.push({
          type: 'heading',
          level: 1,
          text: plainTitle(heading[2]),
          id: 'copyright',
          listed: false,
        })
      } else {
        blocks.push({
          type: 'heading',
          level: heading[1].length,
          text: plainTitle(heading[2]),
          listed: false,
        })
      }
      continue
    }
    if (!line.trim()) {
      flush()
      continue
    }
    paragraph.push(line.trim())
  }
  flush()

  if (!seenHeading) {
    blocks.unshift({ type: 'heading', level: 1, text: '版权页', id: 'copyright', listed: false })
  }

  return makePage({
    id: 'copyright',
    kind: 'copyright',
    level: 0,
    volumeId: '',
    volumeTitle: '',
    volumeTitleFr: '',
    volumeOrder: 0,
    title: '版权页',
    titleFr: '',
    breadcrumb: [],
    blocks,
    markdown: blocksToMarkdown(blocks),
    chars: countChars(blocks),
    anchors: [],
  })
}

/* ------------------------------------------------------------------ */
/* 主入口                                                              */
/* ------------------------------------------------------------------ */

export function buildBook(options = {}) {
  const root = options.root ? path.resolve(options.root) : process.cwd()
  const arrangePath = path.join(root, bookConfig.arrangeFile)
  if (!fs.existsSync(arrangePath)) {
    throw new Error(`找不到目录文件：${bookConfig.arrangeFile}`)
  }
  const arrange = JSON.parse(fs.readFileSync(arrangePath, 'utf8'))

  const resolved = resolveContentVersion(root, options.version, { allowDev: options.allowDev })
  const buildVersion = resolved.version
  const readPart = createPartReader(resolved.chaptersDir)

  const warnings = []
  const ctx = {
    annotationStyle: options.annotationStyle ?? 'footnote',
    warn(message) {
      if (!warnings.includes(message)) warnings.push(message)
    },
    readPart,
  }

  if (arrange.source && !arrange.source.replace(/^\.\//, '').startsWith(resolved.sourceLabel)) {
    ctx.warn(
      `publish/arrange.json 的 source 是 ${arrange.source}，本次打包使用 ${resolved.sourceLabel}；` +
        '若两者结构不同，请先更新 arrange.json。',
    )
  }

  const volumeNodes = arrange.book?.children ?? []
  if (!volumeNodes.length) throw new Error('publish/arrange.json 中没有卷。')

  const copyrightPage = readCopyrightPage(root, ctx, buildVersion)

  const pages = [copyrightPage]
  const volumes = []

  volumeNodes.forEach((volumeNode, volumeIndex) => {
    const volumeId = volumeNode.id ?? `vol${volumeIndex + 1}`
    const volumeOrder = volumeIndex + 1
    const volumeTitle = volumeNode.title
    const volumeTitleFr = volumeNode.titleFr ?? ''

    const volumePageId = `${volumeId}-00`
    const volumeBlocks = [
      { type: 'heading', level: 1, text: volumeTitle, id: volumeId, listed: true },
    ]
    if (volumeTitleFr) {
      volumeBlocks.push({ type: 'raw', html: `<p class="title-fr">${escapeHtml(volumeTitleFr)}</p>` })
    }

    const volumeState = {
      ctx,
      counts: { chapter: 0, section: 0, extra: 0 },
      pageId: volumePageId,
      ancestors: [],
      readPart,
    }
    ;(volumeNode.parts ?? []).forEach((part, index) => {
      const { text, label } = readPart(part)
      volumeBlocks.push(
        ...parseText(text, {
          ctx,
          label,
          allowedTitles: new Set([volumeTitle]),
          stripHeading: index === 0,
        }),
      )
    })

    const volumePage = makePage({
      id: volumePageId,
      kind: 'volume',
      level: 1,
      volumeId,
      volumeTitle,
      volumeTitleFr,
      volumeOrder,
      title: volumeTitle,
      titleFr: volumeTitleFr,
      breadcrumb: [],
      blocks: volumeBlocks,
      markdown: blocksToMarkdown(volumeBlocks),
      chars: countChars(volumeBlocks),
      anchors: [],
    })
    pages.push(volumePage)

    const volumePages = [volumePage]
    const entries = []

    let unitIndex = 0
    for (const unitNode of volumeNode.children ?? []) {
      unitIndex += 1
      const pageId = `${volumeId}-${String(unitIndex).padStart(2, '0')}`
      const state = {
        ctx,
        counts: { chapter: 0, section: 0, extra: 0 },
        pageId,
        ancestors: [volumeNode],
        readPart,
      }
      const blocks = renderNode(unitNode, 2, state)
      const anchorIds = collectAnchorIds(blocks, pageId)

      const unitPage = makePage({
        id: pageId,
        kind: 'unit',
        level: 2,
        volumeId,
        volumeTitle,
        volumeTitleFr,
        volumeOrder,
        title: unitNode.title,
        titleFr: '',
        breadcrumb: [{ title: volumeTitle, path: `/chapters/${volumePageId}.html` }],
        blocks,
        markdown: blocksToMarkdown(blocks),
        chars: countChars(blocks),
        anchors: anchorIds,
      })
      pages.push(unitPage)
      volumePages.push(unitPage)

      entries.push(buildEntry(unitNode, unitPage, 2, anchorIds))
    }

    volumes.push({
      id: volumeId,
      title: volumeTitle,
      titleFr: volumeTitleFr,
      order: volumeOrder,
      chars: volumePages.reduce((sum, page) => sum + page.chars, 0),
      pages: volumePages,
      entries: [
        {
          title: volumeTitle,
          titleFr: volumeTitleFr,
          level: 1,
          pageId: volumePage.id,
          path: `/chapters/${volumePage.id}.html`,
          children: entries,
        },
      ],
    })
  })

  const totalChars = pages.reduce((sum, page) => sum + page.chars, 0)

  return {
    buildVersion,
    version: resolved.version,
    versions: resolved.versions,
    sourceLabel: resolved.sourceLabel,
    chaptersDir: resolved.chaptersDir,
    arrange,
    book: {
      bookId: bookConfig.bookId,
      title: bookConfig.title,
      subtitle: bookConfig.subtitle,
      author: bookConfig.author,
      authorFr: bookConfig.authorFr,
      translator: bookConfig.translator,
      license: bookConfig.license,
      licenseUrl: bookConfig.licenseUrl,
      repository: bookConfig.repository,
      onlineReader: bookConfig.onlineReader,
      language: bookConfig.language,
      description: bookConfig.description,
    },
    copyrightPage,
    pages,
    volumes,
    warnings,
    stats: {
      totalChars,
      totalPages: pages.length,
      totalVolumes: volumes.length,
    },
  }
}

/**
 * 目录条目：3 级条目指向页面锚点，4 级条目挂在 3 级之下。
 * 若某一层缺失（例如没有分节），层级会自然压缩。
 */
function buildEntry(node, page, level, anchorIds) {
  const anchor = anchorIds.find((item) => item.level === level && item.title === node.title)
  const path = `/chapters/${page.id}.html`
  const entry = {
    title: node.title,
    level,
    pageId: page.id,
    path: anchor ? `${path}#${anchor.id}` : path,
    children: [],
  }
  for (const child of node.children ?? []) {
    entry.children.push(buildEntry(child, page, level + 1, anchorIds))
  }
  if (!entry.children.length) delete entry.children
  return entry
}
