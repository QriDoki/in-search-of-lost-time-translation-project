import { decodeHTML } from 'entities'

export const paragraphId = (index) => `p-${String(index + 1).padStart(6, '0')}`

// 与阅读进度原有的 p-000001 顺序一致，包括副题与场景分隔段。
// 处理渲染后的 HTML，让 Markdown 和原稿里的 HTML 段落共用编号。
export function paragraphAnchorsPlugin(md) {
  const render = md.renderer.render.bind(md.renderer)
  md.renderer.render = (tokens, options, env) => {
    const html = render(tokens, options, env)
    if (!/(?:^|\/)chapters\//.test(env.relativePath ?? '')) return html
    let index = 0
    return html.replace(/<p(?=[\s>])([^>]*)>/gi, (_, attrs) => {
      const id = paragraphId(index++)
      return `<p${attrs.replace(/\s+id="[^"]*"/g, '')} id="${id}">`
    })
  }
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
