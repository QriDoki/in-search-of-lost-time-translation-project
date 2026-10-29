#!/usr/bin/env node
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'

// 手动运行没有 push 的前后提交，不因站点重建而重复发布 EPUB。
if (process.env.GITHUB_EVENT_NAME !== 'push') {
  console.log('false')
} else {
  const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'))
  if (!/^[a-f0-9]{40}$/.test(event.before) || !/^[a-f0-9]{40}$/.test(event.after)) {
    throw new Error('Push event must contain valid before and after commit SHAs')
  }
  const git = (args, options = {}) => execFileSync('git', args, { encoding: 'utf8', ...options }).trim()
  // 创建 release 分支时没有 before 提交，与空树比较。
  const before = /^0+$/.test(event.before)
    ? git(['hash-object', '-t', 'tree', '--stdin'], { input: '' })
    : event.before
  const changed = git([
    'diff', '--name-only', '--no-renames', before, event.after, '--',
    'polish/', ':(exclude)polish/dev/**',
  ])
  console.log(changed.length > 0 ? 'true' : 'false')
}
