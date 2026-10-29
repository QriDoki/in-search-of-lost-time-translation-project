/**
 * 标题属性清理：`### 标题 {#id .class}`。
 *
 * VitePress 会把标题末尾的 `{#id .class}` 用作锚点与类名，但这段属性
 * 文本仍留在标题的 inline 内容里——显示时虽被去掉，锚点的 aria-label
 * 与无标题链接里却照样出现。这里在 anchor 规则之前把它从 inline
 * 内容中摘掉，id / class 仍交给 VitePress 自己的属性处理。
 */
const TRAILING_ATTRS = /\s*\{#[^{}]*\}\s*$|\s*\{\.[^{}]*\}\s*$|\s*\{[#.][^{}]*\}\s*$/

export function headingAttrsPlugin(md) {
  md.core.ruler.before('anchor', 'heading-attrs', (state) => {
    const tokens = state.tokens

    for (let index = 0; index < tokens.length; index += 1) {
      const open = tokens[index]
      if (open.type !== 'heading_open') continue

      const inline = tokens[index + 1]
      if (!inline || inline.type !== 'inline') continue
      if (!TRAILING_ATTRS.test(inline.content)) continue

      inline.content = inline.content.replace(TRAILING_ATTRS, '').trimEnd()

      const children = inline.children ?? []
      for (let cursor = children.length - 1; cursor >= 0; cursor -= 1) {
        const child = children[cursor]
        if (child.type !== 'text') continue
        const next = child.content.replace(TRAILING_ATTRS, '').trimEnd()
        if (next !== child.content) {
          child.content = next
          break
        }
      }
    }
  })
}
