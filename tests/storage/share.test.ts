import { describe, expect, it } from 'vitest'
import {
  buildShareUrl,
  decodeShare,
  encodeShare,
  parseShareUrl,
  type ShareInput,
} from '../../site/.vitepress/theme/composables/user-storage/share'
import type { SharePayload } from '../../site/.vitepress/theme/composables/user-storage/types'
import { encodeBase64Url } from '../../site/.vitepress/theme/composables/user-storage/util'

const input: ShareInput = {
  chapterId: 'vol1-01',
  start: { paragraphId: 'P000001', offset: 0 },
  end: { paragraphId: 'P000001', offset: 4 },
  exact: '很久以来',
  prefix: '贡布雷',
  suffix: '我都是',
}

describe('share 编解码', () => {
  it('unicode roundtrip', () => {
    const p: SharePayload = { v: 1, c: 'vol1-01', s: 'P000001', q: '贡布雷 🕰️「摘录」', b: '前', a: '后' }
    expect(decodeShare(encodeShare(p))).toEqual(p)
  })
  it('decode 非法 → null（不抛）', () => {
    expect(decodeShare('!!!not-base64!!!')).toBeNull()
    expect(decodeShare(encodeBase64Url('{"v":2}'))).toBeNull()
    expect(decodeShare(encodeBase64Url('not json'))).toBeNull()
  })
  it('payload 无 note/types/凭证字段', () => {
    const enc = encodeShare({ v: 1, c: 'c', s: 's', q: 'q' })
    const decoded = decodeShare(enc)!
    expect(decoded).not.toHaveProperty('note')
    expect(decoded).not.toHaveProperty('types')
  })
  it('parseShareUrl 识别 #share=', () => {
    const p: SharePayload = { v: 1, c: 'vol1-01', s: 'P000001', q: '很久以来' }
    const url = new URL(`https://x.test/chapters/vol1-01.html#share=${encodeShare(p)}`)
    expect(parseShareUrl(url)).toEqual(p)
    expect(parseShareUrl(new URL('https://x.test/chapters/vol1-01.html'))).toBeNull()
  })
})

describe('buildShareUrl 预算（D27）', () => {
  const opts = { base: 'https://x.test/', versionPrefix: '' }
  it('正常生成含 b/a；同段省略 e', () => {
    const url = buildShareUrl(input, opts)
    expect(url.length).toBeLessThanOrEqual(2000)
    const p = parseShareUrl(new URL(url))!
    expect(p.b).toBe('贡布雷')
    expect(p.a).toBe('我都是')
    expect(p.e).toBeUndefined()
  })
  it('跨段含 e', () => {
    const url = buildShareUrl({ ...input, end: { paragraphId: 'P000002', offset: 3 } }, opts)
    expect(parseShareUrl(new URL(url))!.e).toBe('P000002')
  })
  it('q 超 200 截断', () => {
    const url = buildShareUrl({ ...input, exact: 'x'.repeat(500) }, opts)
    expect(parseShareUrl(new URL(url))!.q.length).toBe(200)
  })
  it('★ 超 2000 先省 b/a，再截 q（下限 50），仍超限报错', () => {
    // 长 prefix/suffix 使带上下文超限
    const long = 'y'.repeat(2000)
    const trimmed = buildShareUrl({ ...input, exact: 'x'.repeat(200), prefix: long, suffix: long }, opts)
    const p = parseShareUrl(new URL(trimmed))!
    expect(p.b).toBeUndefined()
    expect(p.a).toBeUndefined()
    expect(trimmed.length).toBeLessThanOrEqual(2000)
    // 极长 base 使即便 q=50 仍超限 → 报错
    expect(() => buildShareUrl({ ...input, exact: 'x'.repeat(200) }, { base: `https://x.test/${'z'.repeat(2100)}/`, versionPrefix: '' })).toThrow(/2000/)
  })
})

