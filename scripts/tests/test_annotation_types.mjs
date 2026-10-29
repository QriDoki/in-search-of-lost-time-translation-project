import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { annotationIsVisible, defaultAnnotationTypes, sanitizeAnnotationTypes, splitAnnotationTypes } from '../lib/annotation-types.mjs'
import { buildBook } from '../lib/content.mjs'

test('消费多个类型前缀，兼容变体选择符，保留正文 emoji 和旧注解', () => {
  assert.deepEqual(splitAnnotationTypes('🏛️🔤🏛️正文 🧵'), { types: ['🏛️', '🔤'], note: '正文 🧵' })
  assert.deepEqual(splitAnnotationTypes('⚖🧵比较'), { types: ['⚖️', '🧵'], note: '比较' })
  assert.deepEqual(splitAnnotationTypes('旧注解'), { types: [], note: '旧注解' })
})

test('默认排除三类；任一选中即显示；空选择与旧偏好正确恢复', () => {
  for (const type of ['⚖️', '🧵', '🧩']) assert.equal(annotationIsVisible([type], defaultAnnotationTypes), false)
  assert.equal(annotationIsVisible(['🧵', '🔤'], defaultAnnotationTypes), true)
  assert.equal(annotationIsVisible(['🔤'], []), false)
  assert.equal(annotationIsVisible([], []), true)
  assert.deepEqual(sanitizeAnnotationTypes(undefined), defaultAnnotationTypes)
  assert.deepEqual(sanitizeAnnotationTypes(JSON.parse(JSON.stringify([]))), [])
  assert.deepEqual(sanitizeAnnotationTypes(['🧩', 'unknown', '🧩']), ['🧩'])
})

test('站点生成隐藏 emoji 元数据和默认过滤状态，保留锚点及 EPUB 原有行为', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'annotation-types-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  fs.mkdirSync(path.join(root, 'polish/test/chapters'), { recursive: true })
  fs.mkdirSync(path.join(root, 'publish'))
  fs.writeFileSync(path.join(root, 'publish/版权页.md'), '# 版权页\n')
  fs.writeFileSync(path.join(root, 'publish/arrange.json'), JSON.stringify({ book: { children: [
    { title: '第一卷', children: [{ title: '第一章', parts: ['one.md'] }] },
  ] } }))
  fs.writeFileSync(path.join(root, 'polish/test/chapters/one.md'), '正文⊂锚点⊃≼🧵🧩隐藏注解≽，≼⚖️🔤**显示注解**≽。≼旧注解≽')
  // CI sets POLISH_VERSION for the published book; this fixture has its own version.
  const html = buildBook({ root, version: 'test', annotationStyle: 'popover' }).pages.at(-1).markdown
  assert.match(html, /class="reader-annotation is-note-hidden" data-reader-note-types="🧵 🧩"/)
  assert.match(html, /reader-annotation__anchor">锚点<\/span>/)
  assert.match(html, /class="reader-annotation" data-reader-note-types="⚖️ 🔤"/)
  assert.match(html, /data-reader-note="&lt;strong&gt;显示注解&lt;\/strong&gt;"/)
  assert.match(html, /data-reader-note="旧注解"/)
  assert.doesNotMatch(html, /data-reader-note="[🧵🧩⚖️🔤]/u)
  assert.match(buildBook({ root, version: 'test' }).pages.at(-1).markdown, /\^\[🧵🧩隐藏注解\]/)
})
