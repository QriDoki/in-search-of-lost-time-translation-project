#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolveContentVersion } from './lib/content-version.mjs'

const cwd = fileURLToPath(new URL('..', import.meta.url))
// 两个子进程固定使用同一个 polish 文件夹及其版本名。
const env = { ...process.env, POLISH_VERSION: resolveContentVersion(cwd).version }
for (const script of ['build:site', 'build:epub']) {
  execFileSync('npm', ['run', script], { cwd, env, stdio: 'inherit' })
}
