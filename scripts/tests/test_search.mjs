import assert from 'node:assert/strict'
import { test } from 'node:test'
import MarkdownIt from 'markdown-it'
import { createMarkdownRenderer } from 'vitepress'
import { searchDocuments, highlightParts, matchRanges } from '../../site/.vitepress/search.mjs'
import { extractSearchRecords, paragraphAnchorsPlugin, visibleText } from '../../site/.vitepress/paragraphs.mjs'
import { configureMarkdown } from '../../site/.vitepress/markdown.mjs'

const documents = [
  { id: '/chapters/vol1-01.html#p-000001', title: '第一部 贡布雷', text: '长期以来，我都是早早就上床睡觉的。姑妈给我的那块蘸了椴花茶的玛德莱娜小蛋糕。' },
  { id: '/chapters/vol2-01.html', title: '在花季少女倩影下', text: '我想起了斯万先生。' },
  { id: '/chapters/vol7-03.html', title: '重现的时光', text: 'Marcel Proust，版本 20261028234325。' },
  { id: 'phrase', title: '斯万之恋', text: '似乎要在他们两人之间牵起一段传奇式的情缘，这番暗示使他莞尔。' },
  { id: 'scattered', title: '分散词', text: '小说很长。式微的家族，彼此失去联系。传奇只是一种文体，情缘则另当别论。' },
  { id: 'novelist', title: '小说家', text: '一位小说家的作品。' },
  { id: 'old-phrase', title: '旧稿样例', text: '似乎要在他们两人之间牵起一种小说式的联系。' },
]

const ids = (query, source = documents) => searchDocuments(JSON.parse(JSON.stringify(source)), query).results.map((result) => result.id)

test('中文句中连续子串不依赖分词边界', () => {
  for (const query of ['早早就上床', '椴花茶', '玛德莱娜', '就上床睡']) {
    assert.deepEqual(ids(query), [documents[0].id], query)
  }
  assert.deepEqual(ids('斯万'), [documents[1].id])
  assert.deepEqual(ids('小说'), ['scattered', 'novelist', 'old-phrase'])
})

test('多个关键词须在同一段出现；空白、标点和不存在的词不返回结果', () => {
  assert.deepEqual(ids('玛德莱娜 椴花茶'), [documents[0].id])
  for (const query of ['玛德莱娜 斯万', '量子计算机', '', ' ，。 ']) {
    assert.deepEqual(ids(query), [], query)
  }
})

test('保留英文大小写无关的子串和数字搜索', () => {
  for (const query of ['marcel proust', 'Prou', '20261028234325']) {
    assert.deepEqual(ids(query), [documents[2].id], query)
  }
})

test('新旧短语均须连续出现，不因式、的、联系等分散词误命中', () => {
  assert.deepEqual(ids('一段传奇式的情缘'), ['phrase'])
  assert.deepEqual(ids('传奇式的情缘'), ['phrase'])
  assert.deepEqual(ids('小说式的联系'), ['old-phrase'])
  assert.deepEqual(ids('小说式的联系', documents.filter((document) => document.id !== 'old-phrase')), [])
})

test('摘要围绕命中位置生成，长段不会从开头截取；高亮保留实际文字', () => {
  const text = '开头'.repeat(1000) + '一段传奇式的情缘' + '结尾'.repeat(1000)
  const result = searchDocuments([{ id: 'long', title: '长段', text }], '传奇式的情缘').results[0]
  assert.ok(result.parts.map((part) => part.text).join('').length < 150)
  assert.deepEqual(result.parts.filter((part) => part.match).map((part) => part.text), ['传奇式的情缘'])
  assert.equal(result.parts[0].text, '…')
  assert.deepEqual(highlightParts('Marcel <script>', 'marcel')[0], { text: 'Marcel', match: true })
  assert.deepEqual(matchRanges('a+b A+B', 'a+b'), [{ start: 0, end: 3 }, { start: 4, end: 7 }])
})

test('分页限制不改变总数、顺序或遗漏同一章的多个段落', () => {
  const source = Array.from({ length: 65 }, (_, index) => ({ id: `p-${index}`, title: '同一章', text: '小说' }))
  const response = searchDocuments(source, '小说', 30)
  assert.equal(response.total, 65)
  assert.equal(response.results.length, 30)
  assert.deepEqual(searchDocuments(source, '小说', 60).results.slice(0, 30), response.results)
})

test('静态段落锚点包括原生 HTML 段落，与原阅读进度编号一致', () => {
  const md = new MarkdownIt({ html: true }).use(paragraphAnchorsPlugin)
  const source = '正文\n\n<p class="chapter-subtitle">副题</p>\n\n末段'
  const html = md.render(source, { relativePath: 'chapters/test.md' })
  assert.deepEqual([...html.matchAll(/id="([^"]+)"/g)].map((match) => match[1]), ['p-000001', 'p-000002', 'p-000003'])
  assert.ok(!md.render(source, { relativePath: 'index.md' }).includes('id="p-'))
})

test('渲染后索引与页面同源：跨斜体和注解锚点、实体可连续搜索，隐藏注释不参与', async () => {
  const md = await createMarkdownRenderer(process.cwd(), { html: true, config: configureMarkdown })
  const source = '## 斯万之恋 {#test}\n\n牵起一段*传奇式*的<span class="reader-annotation"><span class="reader-annotation__anchor">情缘</span><button data-reader-note="秘密注释">' +
    '</button></span>，A &amp; B。\n\n<p class="chapter-subtitle">概要</p>\n\n＊　＊　＊'
  const html = md.render(source, { relativePath: 'chapters/test.md' })
  const records = extractSearchRecords(html, { path: '/chapters/test.html', title: '斯万之恋', volumeTitle: '第一卷' })
  assert.deepEqual(ids('一段传奇式的情缘', records), ['/chapters/test.html#p-000001'])
  assert.deepEqual(ids('秘密注释', records), [])
  assert.deepEqual(ids('概要', records), ['/chapters/test.html#p-000002'])
  assert.deepEqual(ids('斯万之恋', records), ['/chapters/test.html#test'])
  assert.ok(records[0].title.includes('第一卷'))
  assert.ok(!records[0].text.includes('¶'))
  assert.equal(visibleText('A &amp; B &lt;C&gt; &#x1f600;'), 'A & B <C> 😀')
})


test('历史版本的正文与默认正文使用相同段落锚点，搜索链接保留版本', async () => {
  const md = await createMarkdownRenderer(process.cwd(), { html: true, config: configureMarkdown })
  const source = '## 第一章 {#chapter}\n\n版本正文。'
  const html = md.render(source, { relativePath: 'versions/20261030003000/chapters/test.md' })
  const records = extractSearchRecords(html, { path: '/versions/20261030003000/chapters/test.html', volumeTitle: '第一卷' })
  assert.deepEqual(ids('版本正文', records), ['/versions/20261030003000/chapters/test.html#p-000001'])
})
