import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { decodeHTML } from 'entities'

export const paragraphId = (index) => `p-${String(index + 1).padStart(6, '0')}`

/* ------------------------------------------------------------------ */
/* 永久 ID 映射（协议 §2.7）                                           */
/* ------------------------------------------------------------------ */

let injectedMap = null
let loadedMap = null
let loadAttempted = false
let warned = false

/** prepare-site 计算后进程内注入。 */
export function setParagraphIdMap(map) {
  injectedMap = map
}

/** 测试用：清空注入与懒加载缓存。 */
export function resetParagraphIdMap() {
  injectedMap = null
  loadedMap = null
  loadAttempted = false
  warned = false
}

function currentMap() {
  if (injectedMap) return injectedMap
  if (!loadAttempted) {
    loadAttempted = true
    try {
      const file = path.join(path.dirname(fileURLToPath(import.meta.url)), 'generated', 'paragraph-ids.json')
      loadedMap = JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch {
      loadedMap = null
    }
  }
  return loadedMap
}

function warnOnce(message) {
  if (!warned) {
    warned = true
    console.warn(message)
  }
}

const P_OPEN = /<p(?=[\s>])([^>]*)>/gi
const stripId = (attrs) => attrs.replace(/\s+id="[^"]*"/g, '')

function legacyReplace(html) {
  let index = 0
  return html.replace(P_OPEN, (_, attrs) => `<p${stripId(attrs)} id="${paragraphId(index++)}">`)
}

// 与阅读进度原有的 p-000001 顺序一致，包括副题与场景分隔段。
// 处理渲染后的 HTML，让 Markdown 和原稿里的 HTML 段落共用编号。
export function paragraphAnchorsPlugin(md) {
  const render = md.renderer.render.bind(md.renderer)
  md.renderer.render = (tokens, options, env) => {
    const html = render(tokens, options, env)
    const rel = env.relativePath ?? ''
    if (!/(?:^|\/)chapters\//.test(rel)) return html
    const match = rel.match(/^(?:versions\/([^/]+)\/)?chapters\/(.+)\.md$/)
    const version = match?.[1] ?? 'dev'
    const pageId = match?.[2]
    const map = currentMap()
    const ids = pageId && pageId !== 'copyright' && map ? map[version]?.[pageId] : undefined

    if (!Array.isArray(ids)) {
      // copyright 页恒为旧行为（不警告）；其余映射缺失警告一次。
      if (pageId !== 'copyright') warnOnce(`[paragraphs] 缺少 ${version}/${pageId} 的段落 ID 映射，回退页内序号 ID`)
      return legacyReplace(html)
    }
    const count = (html.match(/<p(?=[\s>])/gi) ?? []).length
    if (ids.length !== count) {
      warnOnce(`[paragraphs] ${version}/${pageId} 映射长度 ${ids.length} ≠ 段落数 ${count}，整页回退位置 ID`)
      return legacyReplace(html)
    }
    let index = 0
    return html.replace(P_OPEN, (_, attrs) => {
      const i = index++
      return `<p${stripId(attrs)} id="${ids[i]}">`
    })
  }
}

/** 按序把已渲染 HTML 的 <p> id 改写为给定永久 ID（prepare-site 搜索索引用，不二次渲染）。D17 窗口结束，不再输出 data-legacy。 */
export function rewriteParagraphIds(html, ids) {
  let index = 0
  return html.replace(P_OPEN, (_, attrs) => {
    const i = index++
    return `<p${stripId(attrs)} id="${ids[i]}">`
  })
}

export function visibleText(html) {
  return decodeHTML(html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<a\b[^>]*class="[^"]*\bheader-anchor\b[^"]*"[^>]*>[\s\S]*?<\/a>/gi, '')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<[^>]*>/g, ''))
}

// 输入为本站 Markdown 渲染器生成的 HTML，注释存于已转义的 data 属性中。
export function extractSearchRecords(html, page) {
  const records = []
  const sections = []
  for (const match of html.matchAll(/<(p|h[1-6])\b([^>]*)>([\s\S]*?)<\/\1>/gi)) {
    const [, tag, attrs, body] = match
    const anchor = attrs.match(/\bid="([^"]+)"/)?.[1]
    const text = visibleText(body)
    if (tag !== 'p') {
      const level = Number(tag.slice(1))
      sections.length = level - 1
      sections[level - 1] = text.trim()
    }
    if (!anchor || !text.trim() || /^[＊*\s]+$/u.test(text)) continue
    records.push({
      id: `${page.path}#${anchor}`,
      title: [page.volumeTitle, ...sections].filter((value, index, all) => value && all.indexOf(value) === index).join(' · '),
      text,
    })
  }
  return records
}