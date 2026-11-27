/**
 * 对抗性测试 · share.ts —— 断言依据：协议 §5.8 / D27 / data-model §10。
 * base64url 无填充；URL ≤2000 预算裁剪顺序（先 b/a 再 q 下限 50）；载荷无批注/类型/凭证。
 */
import { describe, expect, it } from 'vitest'
import {
  buildShareUrl,
  decodeShare,
  encodeShare,
  parseShareUrl,
  type ShareInput,
} from '../../site/.vitepress/theme/composables/user-storage/share'
import type { SharePayload } from '../../site/.vitepress/theme/composables/user-storage/types'

const input = (over: Partial<ShareInput> = {}): ShareInput => ({
  chapterId: 'vol1-01',
  start: { paragraphId: 'P000001', offset: 0 },
  end: { paragraphId: 'P000001', offset: 4 },
  exact: '很久以来',
  prefix: '',
  suffix: '',
  ...over,
})

describe('base64url 编解码（D27 / data-model §10）', () => {
  it('★ unicode roundtrip（CJK + emoji + 组合字符）', () => {
    const p: SharePayload = { v: 1, c: 'vol1-01', s: 'P000001', q: '很久以来🔤á', b: '前', a: '后' }
    const enc = encodeShare(p)
    expect(decodeShare(enc)).toEqual(p)
  })

  it('★ 无填充 =，且 URL-safe（无 + /）', () => {
    const enc = encodeShare({ v: 1, c: 'c', s: 's', q: '任意长度文本'.repeat(7) })
    expect(enc).not.toContain('=')
    expect(enc).not.toContain('+')
    expect(enc).not.toContain('/')
  })

  it('★ 非法输入 → null，不抛', () => {
    expect(decodeShare('!!!不是base64!!!')).toBeNull()
    expect(decodeShare('')).toBeNull()
    // 合法 base64 但 JSON 缺字段 / v 不对
    expect(decodeShare(encodeShare({ v: 2 as 1, c: 'c', s: 's', q: 'q' }))).toBeNull()
    expect(decodeShare(btoa(JSON.stringify({ v: 1, c: 'c' })))).toBeNull()
  })

  it('同段省略 e，跨段携带 e', () => {
    const same = buildShareUrl(input(), { base: 'https://x.com', versionPrefix: '' })
    const pSame = parseShareUrl(new URL(same))!
    expect(pSame.e).toBeUndefined()
    const cross = buildShareUrl(input({ end: { paragraphId: 'P000002', offset: 3 } }), { base: 'https://x.com', versionPrefix: '' })
    expect(parseShareUrl(new URL(cross))!.e).toBe('P000002')
  })
})

describe('q 截断与 URL 预算（D27）', () => {
  it('★ q 创建时超 200 字符即截断', () => {
    const url = buildShareUrl(input({ exact: '字'.repeat(300), end: { paragraphId: 'P000001', offset: 300 } }), { base: 'https://x.com', versionPrefix: '' })
    const p = parseShareUrl(new URL(url))!
    expect(p.q).toHaveLength(200)
  })

  it('★ 超限先省 b/a（q 保持 200）', () => {
    // 长 prefix/suffix 把 URL 推过 2000；省 b/a 后回落
    const url = buildShareUrl(input({
      exact: '字'.repeat(200), end: { paragraphId: 'P000001', offset: 200 },
      prefix: 'p'.repeat(500), suffix: 's'.repeat(500),
    }), { base: 'https://x.com', versionPrefix: '' })
    expect(url.length).toBeLessThanOrEqual(2000)
    const p = parseShareUrl(new URL(url))!
    expect(p.q).toHaveLength(200)
    expect(p.b).toBeUndefined()
    expect(p.a).toBeUndefined()
  })

  it('★ 省 b/a 仍超限 → 截 q（下限 50），URL ≤2000', () => {
    const longBase = 'https://x.com/' + 'a'.repeat(1500)
    const url = buildShareUrl(input({ exact: '字'.repeat(200), end: { paragraphId: 'P000001', offset: 200 } }), { base: longBase, versionPrefix: '' })
    expect(url.length).toBeLessThanOrEqual(2000)
    const p = parseShareUrl(new URL(url))!
    expect(p.q.length).toBeLessThan(200)
    expect(p.q.length).toBeGreaterThanOrEqual(50)
  })

  it('★ 仍超限（base 巨大）→ 报错不生成', () => {
    const hugeBase = 'https://x.com/' + 'a'.repeat(3000)
    expect(() => buildShareUrl(input(), { base: hugeBase, versionPrefix: '' })).toThrow()
  })

  it('versionPrefix 进入 URL；base 尾斜杠不重复', () => {
    const url = buildShareUrl(input(), { base: 'https://x.com/', versionPrefix: '/versions/20260101' })
    expect(url).toContain('/versions/20260101/chapters/vol1-01.html#share=')
    expect(url).not.toContain('.com//')
  })
})

describe('载荷自包含、无批注/类型/凭证（data-model §10 / 不变量）', () => {
  it('★ 解码结果键集 ⊆ {v,c,s,e,q,b,a}，不含 note/types/token', () => {
    const url = buildShareUrl(input({ prefix: '前', suffix: '后' }), { base: 'https://x.com', versionPrefix: '' })
    const p = parseShareUrl(new URL(url))!
    const allowed = new Set(['v', 'c', 's', 'e', 'q', 'b', 'a'])
    for (const k of Object.keys(p)) expect(allowed.has(k)).toBe(true)
    const text = JSON.stringify(p)
    expect(text).not.toContain('note')
    expect(text).not.toContain('types')
    expect(text).not.toContain('token')
  })

  it('parseShareUrl 无 #share → null', () => {
    expect(parseShareUrl(new URL('https://x.com/chapters/vol1-01.html'))).toBeNull()
    expect(parseShareUrl(new URL('https://x.com/chapters/vol1-01.html#别的'))).toBeNull()
  })
})
