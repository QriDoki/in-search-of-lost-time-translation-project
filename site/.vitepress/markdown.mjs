import footnote from 'markdown-it-footnote'
import { headingAttrsPlugin } from './heading-attrs.mjs'
import { paragraphAnchorsPlugin } from './paragraphs.mjs'

// 索引与页面共用渲染配置，避免标签、实体和段落编号不一致。
export function configureMarkdown(md) {
  md.use(footnote)
  md.use(headingAttrsPlugin)
  md.use(paragraphAnchorsPlugin)
}
