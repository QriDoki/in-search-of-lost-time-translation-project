import { describe, expect, it, vi } from 'vitest'
import {
  buildDocxExcerpt,
  buildMarkdownExcerpt,
  COLOR_HEX,
  type ExcerptItem,
} from '../../site/.vitepress/theme/composables/user-storage/export'
import { hl } from './fixtures'

const items: ExcerptItem[] = [
  { highlight: hl({ id: 'a', chapterId: 'vol1-01', color: 'yellow', note: '批注甲', selector: { exact: '很久以来', prefix: '', suffix: '', start: { paragraphId: 'P1', offset: 0 }, end: { paragraphId: 'P1', offset: 4 } } }), chapterLabel: '第一卷 · 贡布雷', permalink: 'https://x.test/vol1-01#share=abc' },
  { highlight: hl({ id: 'b', chapterId: 'vol2-01', color: 'green', note: '', selector: { exact: '在花季', prefix: '', suffix: '', start: { paragraphId: 'P2', offset: 0 }, end: { paragraphId: 'P2', offset: 3 } } }), chapterLabel: '第二卷 · 在花季少女倩影下', permalink: 'https://x.test/vol2-01#share=def' },
]
const opts = { includeNotes: true, includeLinks: true, groupByVolume: true }

describe('Markdown 摘录集', () => {
  it('含原文/批注/链接/按卷分章', () => {
    const md = buildMarkdownExcerpt(items, opts)
    expect(md).toContain('# 我的摘录')
    expect(md).toContain('## vol1')
    expect(md).toContain('## vol2')
    expect(md).toContain('> 很久以来')
    expect(md).toContain('批注：批注甲')
    expect(md).toContain('[永久链接](https://x.test/vol1-01#share=abc)')
    expect(md).toContain('黄色摘录')
  })
  it('选项关闭：不含批注/链接/分卷', () => {
    const md = buildMarkdownExcerpt(items, { includeNotes: false, includeLinks: false, groupByVolume: false })
    expect(md).not.toContain('批注：')
    expect(md).not.toContain('永久链接')
    expect(md).not.toContain('## vol')
  })
  it('空批注不输出批注行', () => {
    const md = buildMarkdownExcerpt([items[1]], opts)
    expect(md).not.toContain('批注：')
  })
})

describe('DOCX 摘录集（懒加载）', () => {
  it('★ 生成 Blob；docx 仅在调用时动态加载', async () => {
    const blob = await buildDocxExcerpt(items, opts)
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.size).toBeGreaterThan(0)
  })

  it('色 token → hex 映射表（数据不携带色值）', () => {
    expect(COLOR_HEX.yellow).toMatch(/^#[0-9a-f]{6}$/i)
    expect(Object.keys(COLOR_HEX).sort()).toEqual(['blue', 'green', 'pink', 'purple', 'yellow'])
  })
})