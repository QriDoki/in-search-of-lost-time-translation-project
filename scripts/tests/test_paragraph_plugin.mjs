import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import MarkdownIt from 'markdown-it'
import {
  extractSearchRecords,
  paragraphAnchorsPlugin,
  resetParagraphIdMap,
  rewriteParagraphIds,
  setParagraphIdMap,
} from '../../site/.vitepress/paragraphs.mjs'

beforeEach(() => resetParagraphIdMap())

const render = (source, relativePath, map) => {
  if (map) setParagraphIdMap(map)
  const md = new MarkdownIt({ html: true }).use(paragraphAnchorsPlugin)
  return md.render(source, { relativePath })
}

test('★ 命中映射：输出位置编码 <p id="vol1-1_0003">（无 data-legacy），替换序 === 映射序', () => {
  const source = '正文一\n\n<p class="chapter-subtitle">副题</p>\n\n正文二'
  const ids = ['vol1-1_0003', 'vol1-1_0004', 'vol1-1_0005']
  const html = render(source, 'chapters/vol1-01.md', { dev: { 'vol1-01': ids } })
  const matches = [...html.matchAll(/<p[^>]*id="([^"]+)"/g)]
  assert.deepEqual(matches.map((m) => m[1]), ids)
  assert.ok(!html.includes('data-legacy'), '渲染产物不含 data-legacy')
})

test('版本路径解析：versions/{v}/chapters 取对应版本映射', () => {
  const source = '正文'
  const html = render(source, 'versions/20261102182045/chapters/vol1-01.md', {
    '20261102182045': { 'vol1-01': ['vol1-1_0099'] },
    dev: { 'vol1-01': ['vol1-1_0001'] },
  })
  assert.ok(html.includes('id="vol1-1_0099"'))
  assert.ok(!html.includes('data-legacy'))
})

test('copyright 页恒为旧行为（页内序号 ID，无 data-legacy）', () => {
  const html = render('版权正文', 'chapters/copyright.md', { dev: { copyright: ['vol1-1_0001'] } })
  assert.ok(html.includes('id="p-000001"'))
  assert.ok(!html.includes('data-legacy'))
})

test('映射缺失 → 旧行为页内序号 ID', () => {
  const html = render('正文', 'chapters/vol1-01.md', { dev: {} })
  assert.ok(html.includes('id="p-000001"'))
  assert.ok(!html.includes('data-legacy'))
})

test('★ 映射长度不一致 → 整页回退旧行为', () => {
  const html = render('正文一\n\n正文二', 'chapters/vol1-01.md', { dev: { 'vol1-01': ['vol1-1_0001'] } })
  assert.ok(html.includes('id="p-000001"'))
  assert.ok(html.includes('id="p-000002"'))
  assert.ok(!html.includes('data-legacy'))
})

test('非 chapters 路径不注入', () => {
  const html = render('正文', 'index.md', { dev: { 'vol1-01': ['vol1-1_0001'] } })
  assert.ok(!html.includes('id="p-'))
  assert.ok(!html.includes('data-legacy'))
})

test('★ 搜索索引用位置 ID：rewriteParagraphIds 后 extractSearchRecords 一致（无 data-legacy）', () => {
  const source = '## 第一章 {#c1}\n\n很久以来，我都是早早就躺下了。'
  const md = new MarkdownIt({ html: true }).use(paragraphAnchorsPlugin)
  const legacy = md.render(source, { relativePath: 'chapters/vol1-01.md' })
  const ids = ['vol1-1_0042']
  const rewritten = rewriteParagraphIds(legacy, ids)
  assert.ok(!rewritten.includes('data-legacy'), '搜索改写也不输出 data-legacy')
  const records = extractSearchRecords(rewritten, { path: '/chapters/vol1-01.html', volumeTitle: '第一卷' })
  assert.ok(records.some((r) => r.id === '/chapters/vol1-01.html#vol1-1_0042'))
  assert.ok(!records.some((r) => r.id.includes('#p-000001')))
})

test('原 id 属性被去除，不重复', () => {
  const html = render('<p id="old">正文</p>', 'chapters/vol1-01.md', { dev: { 'vol1-01': ['vol1-1_0001'] } })
  assert.ok(html.includes('id="vol1-1_0001"'))
  assert.ok(!html.includes('id="old"'))
  assert.equal((html.match(/id="/g) ?? []).length, 1)
})

test('★ 迁移走 public map 的页内序号（legacy 索引），不依赖渲染 data-legacy', () => {
  const html = render('正文一\n\n正文二', 'chapters/vol1-01.md', { dev: { 'vol1-01': ['vol1-1_0001', 'vol1-1_0002'] } })
  assert.ok(!html.includes('data-legacy'))
  assert.ok(html.includes('id="vol1-1_0001"'))
  assert.ok(html.includes('id="vol1-1_0002"'))
})
