import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'
import { listContentVersions, resolveContentVersion } from '../lib/content-version.mjs'
import { buildBook } from '../lib/content.mjs'

const envNames = ['POLISH_VERSION', 'BUILD_VERSION', 'GITHUB_ACTIONS']
let savedEnv
beforeEach(() => {
  savedEnv = Object.fromEntries(envNames.map((name) => [name, process.env[name]]))
  for (const name of envNames) delete process.env[name]
})
afterEach(() => {
  for (const [name, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
})

function fixture(t, versions) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'polish-version-test-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  fs.mkdirSync(path.join(root, 'polish'))
  for (const version of versions) {
    const chapters = path.join(root, 'polish', version, 'chapters')
    fs.mkdirSync(chapters, { recursive: true })
    fs.writeFileSync(path.join(chapters, 'one.md'), `## 第一章\n\n正文版本 ${version}。\n`)
  }
  return root
}

test('按目录名排序，不受文件时间影响；非正文目录和文件不参与选择', (t) => {
  const root = fixture(t, ['20261027180000', '20261028180000', '20261028180000-001'])
  fs.utimesSync(path.join(root, 'polish/20261027180000'), new Date('2099-01-01'), new Date('2099-01-01'))
  fs.mkdirSync(path.join(root, 'polish/99999999999999'))
  fs.writeFileSync(path.join(root, 'polish/zz-file'), '')
  fs.mkdirSync(path.join(root, 'polish/zz-invalid'))
  fs.writeFileSync(path.join(root, 'polish/zz-invalid/chapters'), '')
  assert.deepEqual(listContentVersions(root), ['20261028180000-001', '20261028180000', '20261027180000'])
  assert.equal(resolveContentVersion(root).version, '20261028180000-001')
})

test('文件夹名按字符串比较，不转换为数字', (t) => {
  const root = fixture(t, ['9', '10'])
  assert.equal(resolveContentVersion(root).version, '9')
})

test('默认构建与 CI 选择忽略 dev，仅本地允许显式预览', (t) => {
  const root = fixture(t, ['20261028180000', 'dev'])
  assert.deepEqual(listContentVersions(root), ['20261028180000'])
  assert.equal(resolveContentVersion(root).version, '20261028180000')
  assert.equal(resolveContentVersion(root, 'dev').sourceLabel, 'polish/dev/chapters')
  process.env.POLISH_VERSION = 'dev'
  assert.equal(resolveContentVersion(root).version, 'dev')
  process.env.GITHUB_ACTIONS = 'true'
  assert.throws(() => resolveContentVersion(root), /CI\/CD 禁止/)
  assert.throws(() => resolveContentVersion(root, 'dev'), /CI\/CD 禁止/)
  delete process.env.POLISH_VERSION
  assert.equal(resolveContentVersion(root).version, '20261028180000')
  const onlyDev = fixture(t, ['dev'])
  assert.throws(() => resolveContentVersion(onlyDev), /没有可打包的润色稿/)
})

test('可指定已有版本，版本不存在或没有正文时明确失败', (t) => {
  const root = fixture(t, ['20261027180000', '20261028180000'])
  process.env.POLISH_VERSION = '20261027180000'
  assert.equal(resolveContentVersion(root).version, '20261027180000')
  assert.equal(resolveContentVersion(root, '20261028180000').version, '20261028180000')
  assert.throws(() => resolveContentVersion(root, 'missing'), /找不到润色版本/)
  const empty = fixture(t, [])
  assert.throws(() => resolveContentVersion(empty), /没有可打包的润色稿/)
})

test('CI 无需构建时间；内容、版权页和显示版本均来自选中的文件夹', (t) => {
  const root = fixture(t, ['20261027180000', '20261028180000'])
  fs.mkdirSync(path.join(root, 'publish'))
  fs.writeFileSync(path.join(root, 'publish/版权页.md'), '# 版权页\n\n测试版权。\n')
  fs.writeFileSync(path.join(root, 'publish/arrange.json'), JSON.stringify({ book: { children: [
    { id: 'vol1', title: '第一卷', children: [{ title: '第一章', parts: ['one.md'] }] },
  ] } }))
  process.env.GITHUB_ACTIONS = 'true'
  for (const oldBuildVersion of [undefined, '20990101000000']) {
    if (oldBuildVersion) process.env.BUILD_VERSION = oldBuildVersion
    else delete process.env.BUILD_VERSION
    const book = buildBook({ root })
    assert.equal(book.buildVersion, '20261028180000')
    assert.equal(book.version, book.buildVersion)
    assert.match(book.copyrightPage.markdown, /版本: 20261028180000/)
    assert.match(book.pages.at(-1).markdown, /正文版本 20261028180000/)
  }
  const selected = buildBook({ root, version: '20261027180000' })
  assert.equal(selected.buildVersion, '20261027180000')
  assert.match(selected.copyrightPage.markdown, /版本: 20261027180000/)
})
