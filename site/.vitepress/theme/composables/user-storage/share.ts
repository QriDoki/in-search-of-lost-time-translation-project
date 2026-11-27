/**
 * 永久链接 SharePayload 编解码与 URL 构建/解析（protocol §5.8 / D27）。
 * 自包含、无批注/类型/凭证。base64url(UTF-8 JSON)，无填充。
 */
import type { SharePayload } from './types'
import { decodeBase64Url, encodeBase64Url } from './util'

export interface ShareInput {
  chapterId: string
  start: { paragraphId: string; offset: number }
  end: { paragraphId: string; offset: number }
  exact: string
  prefix: string
  suffix: string
}

const MAX_URL = 2000
const MAX_Q = 200
const MIN_Q = 50

export function encodeShare(p: SharePayload): string {
  return encodeBase64Url(JSON.stringify(p))
}

export function decodeShare(s: string): SharePayload | null {
  try {
    const obj = JSON.parse(decodeBase64Url(s)) as Record<string, unknown>
    if (obj.v !== 1 || typeof obj.c !== 'string' || typeof obj.s !== 'string' || typeof obj.q !== 'string') return null
    const p: SharePayload = { v: 1, c: obj.c, s: obj.s, q: obj.q }
    if (typeof obj.e === 'string') p.e = obj.e
    if (typeof obj.b === 'string') p.b = obj.b
    if (typeof obj.a === 'string') p.a = obj.a
    return p
  } catch {
    return null
  }
}

function payloadFrom(input: ShareInput, q: string, withContext: boolean): SharePayload {
  const p: SharePayload = { v: 1, c: input.chapterId, s: input.start.paragraphId, q }
  if (input.end.paragraphId !== input.start.paragraphId) p.e = input.end.paragraphId
  if (withContext) {
    if (input.prefix) p.b = input.prefix
    if (input.suffix) p.a = input.suffix
  }
  return p
}

function buildUrl(base: string, versionPrefix: string, p: SharePayload): string {
  return `${base.replace(/\/$/, '')}${versionPrefix}/chapters/${p.c}.html#share=${encodeShare(p)}`
}

/** D27 预算裁剪：先省 b/a，再截 q（下限 50），仍超限报错不生成。 */
export function buildShareUrl(input: ShareInput, opts: { base: string; versionPrefix: string }): string {
  const q0 = input.exact.slice(0, MAX_Q)
  let url = buildUrl(opts.base, opts.versionPrefix, payloadFrom(input, q0, true))
  if (url.length <= MAX_URL) return url
  // 省 b/a
  url = buildUrl(opts.base, opts.versionPrefix, payloadFrom(input, q0, false))
  if (url.length <= MAX_URL) return url
  // 截 q（下限 50）
  for (let len = q0.length - 1; len >= MIN_Q; len -= 1) {
    url = buildUrl(opts.base, opts.versionPrefix, payloadFrom(input, q0.slice(0, len), false))
    if (url.length <= MAX_URL) return url
  }
  throw new Error('分享 URL 超过 2000 字符预算，无法生成')
}

export function parseShareUrl(url: URL): SharePayload | null {
  const match = url.hash.match(/^#share=(.+)$/)
  if (!match) return null
  return decodeShare(match[1])
}