#!/usr/bin/env node
import { fileURLToPath } from 'node:url'
import { listContentVersions } from './lib/content-version.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const version = listContentVersions(root)[0]
if (!version) throw new Error('polish/*/chapters 下没有可打包的润色稿。')
console.log(version)
