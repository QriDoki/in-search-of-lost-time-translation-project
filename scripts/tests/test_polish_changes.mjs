import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const script = fileURLToPath(new URL('../check-polish-changes.mjs', import.meta.url))

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'polish-changes-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
  git('init', '-q')
  git('config', 'user.name', 'CI Test')
  git('config', 'user.email', 'ci@example.invalid')
  function commit(files) {
    for (const [name, content] of Object.entries(files)) {
      const file = path.join(root, name)
      if (content === null) fs.rmSync(file)
      else {
        fs.mkdirSync(path.dirname(file), { recursive: true })
        fs.writeFileSync(file, content)
      }
    }
    git('add', '.')
    git('commit', '-qm', 'fixture')
    return git('rev-parse', 'HEAD')
  }
  const before = commit({ 'site/index.md': '首页', 'polish/20261028234325/chapters/one.md': '正式稿' })
  function check(after, { eventName = 'push', base = before } = {}) {
    const eventPath = path.join(root, '.git/event.json')
    fs.writeFileSync(eventPath, JSON.stringify({ before: base, after }))
    return spawnSync(process.execPath, [script], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, GITHUB_EVENT_NAME: eventName, GITHUB_EVENT_PATH: eventPath },
    })
  }
  return { before, commit, check }
}

test('站点、构建配置和 dev 修改不触发 EPUB', (t) => {
  const f = fixture(t)
  const after = f.commit({ 'site/index.md': '新首页', 'polish/dev/chapters/one.md': '开发稿', 'scripts/build-epub.mjs': '// update' })
  const result = f.check(after)
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout.trim(), 'false')
})

test('检查整个 push 范围，包含非末次提交的正式稿改动', (t) => {
  const f = fixture(t)
  f.commit({ 'polish/20261028234325/chapters/one.md': '修订正式稿' })
  const after = f.commit({ 'site/index.md': '仅末次提交修改首页' })
  const result = f.check(after)
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout.trim(), 'true')
})

test('删除正式稿或将其移出 polish 也算内容变化', (t) => {
  const f = fixture(t)
  const after = f.commit({ 'polish/20261028234325/chapters/one.md': null, 'archive/one.md': '正式稿' })
  const result = f.check(after)
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout.trim(), 'true')
})

test('新分支从空树检测，手动运行始终跳过 EPUB', (t) => {
  const f = fixture(t)
  const created = f.check(f.before, { base: '0'.repeat(40) })
  assert.equal(created.status, 0, created.stderr)
  assert.equal(created.stdout.trim(), 'true')
  const manual = f.check(f.before, { eventName: 'workflow_dispatch' })
  assert.equal(manual.status, 0, manual.stderr)
  assert.equal(manual.stdout.trim(), 'false')
})

test('比较提交不可用时明确失败，不误判为无需发布', (t) => {
  const f = fixture(t)
  const result = f.check(f.before, { base: '1'.repeat(40) })
  assert.notEqual(result.status, 0)
  assert.equal(result.stdout, '')
})
