import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { buildBook } from '../lib/content.mjs'

// EPUB 路径（buildBook footnote 风格）不经过段落插件，产物与永久 ID 体系隔离。
// 本快照守护 content.mjs 的 EPUB 输出不被段落 ID 改动污染（protocol §2.1 / D6）。
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'epub-invariance-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  fs.mkdirSync(path.join(root, 'publish'))
  fs.mkdirSync(path.join(root, 'polish', '20260101000000', 'chapters'), { recursive: true })
  fs.writeFileSync(path.join(root, 'publish', '版权页.md'), '# 版权页\n\n测试版权。\n')
  fs.writeFileSync(path.join(root, 'publish', 'arrange.json'), JSON.stringify({
    book: { children: [{ id: 'vol1', title: '第一卷', titleFr: 'Du côté de chez Swann', children: [{ title: '第一章', parts: ['one.md'] }] }] },
  }))
  fs.writeFileSync(path.join(root, 'polish', '20260101000000', 'chapters', 'one.md'),
    '## 第一章\n\n正文⊂被标注⊃≼🔤 注记≽延续。\n\n🥒🥒🥒🥒🥒\n\n### 副题\n\n末段≼纯注≽。\n')
  return root
}

test('★ EPUB footnote 输出快照：含脚注语法，无永久 ID / data-legacy', (t) => {
  // 显式指定 fixture 版本，避免 CI 的 POLISH_VERSION 环境变量泄漏进 resolveContentVersion。
  const book = buildBook({ root: fixture(t), version: '20260101000000', annotationStyle: 'footnote' })
  const unit = book.pages.find((p) => p.kind === 'unit')
  const md = unit.markdown
  // 脚注语法保留（pandoc 解析依赖）
  assert.ok(md.includes('^[🔤 注记]'), '锚定注解转脚注')
  assert.ok(md.includes('^[纯注]'), '纯注转脚注')
  assert.ok(md.includes('<div class="chapter-subtitle" markdown="1">'), '副题为 EPUB div')
  assert.ok(md.includes('<p class="scene-break">'), '场景分隔段')
  // 永久 ID 体系不渗入 EPUB
  assert.ok(!/id="P[0-9]/.test(md))
  assert.ok(!md.includes('data-legacy'))
  assert.ok(!md.includes('reader-annotation'))
  // 快照（content.mjs 零改动 → 稳定）
  assert.equal(md, [
    '## 第一章 {#vol1-01}',
    '正文被标注^[🔤 注记]延续。',
    '<p class="scene-break">　</p>',
    '<div class="chapter-subtitle" markdown="1">\n副题\n</div>',
    '末段^[纯注]。',
  ].join('\n\n'))
})