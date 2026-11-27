/**
 * 对抗性测试 · util.ts / fingerprint —— 断言依据：协议 D3 黄金向量、§2.2 两套基准、§3 公共约定、§5.5 scope 派生。
 * 浏览器侧经 util re-export 导入 fingerprint.mjs（唯一实现）；黄金向量与构建侧 node:test 断言同一张表。
 */
import { describe, expect, it, vi } from 'vitest'
import {
  decodeBase64Url,
  deepClone,
  deepEqual,
  encodeBase64Url,
  fnv1a32hex,
  fnv1a36,
  nfc,
  normalizeWs,
  sha256Hex,
  uuidv4,
  uuidv7,
} from '../../site/.vitepress/theme/composables/user-storage/util'

describe('★ D3 黄金向量（协议 §1 D3 表，两侧必须一致）', () => {
  const vectors: [string, string][] = [
    ['', 'ztntfp'],
    ['很久以来，我都是早早就躺下了', '1mkkj7'],
    ['  贡布雷。  ', 'zer7p0'],
    ['Marcel Proust', '1xyq7u2'],
    ['　', 'ztntfp'], // U+3000
    ['áb', 'etsjxr'], // 不做 NFC
    ['那是很久以前的事了，那时贡布雷的教堂', '1fe33xc'],
  ]
  it.each(vectors)('fnv1a36(%j) === %s', (input, expected) => {
    expect(fnv1a36(input)).toBe(expected)
  })
})

describe('两套基准不得混用（协议 §2.2）', () => {
  it('指纹基准：空白折叠 + trim', () => {
    expect(normalizeWs('  a   b  ')).toBe('a b')
    expect(fnv1a36('a  b')).toBe(fnv1a36('a b'))
    expect(fnv1a36('　')).toBe(fnv1a36('')) // 全空白 → 空串指纹
  })

  it('★ 指纹不做 NFC：áb（NFD）与 áb（NFC）指纹不同', () => {
    const nfd = 'áb'
    const nfcText = nfc(nfd)
    expect(nfd).not.toBe(nfcText)
    expect(fnv1a36(nfd)).not.toBe(fnv1a36(nfcText))
    expect(fnv1a36(nfd)).toBe('etsjxr') // D3 表：不做 NFC
  })

  it('偏移量基准：nfc 归一化改变长度', () => {
    expect(nfc('áb').length).toBe(2)
    expect('áb'.length).toBe(3)
    expect(nfc('很久以来')).toBe('很久以来') // CJK 恒等
  })

  it('fnv1a32hex：8 位 hex 补零', () => {
    const h = fnv1a32hex('')
    expect(h).toMatch(/^[0-9a-f]{8}$/)
    expect(fnv1a32hex('x')).toMatch(/^[0-9a-f]{8}$/)
  })
})

describe('base64url（协议 §5.8 / D27）', () => {
  it('★ UTF-8 roundtrip，无填充', () => {
    for (const s of ['hello', '很久以来，我都是早早就躺下了', '🔤📚🎭', 'áb', '']) {
      const enc = encodeBase64Url(s)
      expect(enc).not.toContain('=')
      expect(decodeBase64Url(enc)).toBe(s)
    }
  })

  it('产生 - / _ 而非 + / /', () => {
    // 选一个标准 base64 含 + 或 / 的输入
    const s = 'subjects?query=1&x=2'
    const enc = encodeBase64Url(s)
    expect(enc).not.toContain('+')
    expect(enc).not.toContain('/')
    expect(decodeBase64Url(enc)).toBe(s)
  })
})

describe('sha256Hex 与 scope 派生（协议 §5.5 / §3）', () => {
  it('★ 已知向量 sha256("abc")', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('★ scope = ms- + sha256hex(id).slice(0,16)', async () => {
    const id = 'user-object-id-123'
    const scope = `ms-${(await sha256Hex(id)).slice(0, 16)}`
    expect(scope).toMatch(/^ms-[0-9a-f]{16}$/)
    expect(scope).toBe(`ms-${(await sha256Hex(id)).slice(0, 16)}`)
    // 不同 id → 不同 scope
    expect(scope).not.toBe(`ms-${(await sha256Hex('other-id')).slice(0, 16)}`)
  })
})

describe('UUID（协议 §3 公共约定 / data-model §3）', () => {
  it('★ UUIDv7：版本位 7、变体 10、时间有序', () => {
    const spy = vi.spyOn(Date, 'now')
    spy.mockReturnValue(1000000000000)
    const a = uuidv7()
    spy.mockReturnValue(1000000000001)
    const b = uuidv7()
    spy.mockRestore()
    expect(a[14]).toBe('7')
    expect(b[14]).toBe('7')
    expect(['8', '9', 'a', 'b']).toContain(a[19])
    expect(a < b).toBe(true) // 时间有序
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('★ 10k 无碰撞', () => {
    const set = new Set<string>()
    for (let i = 0; i < 10000; i += 1) set.add(uuidv7())
    expect(set.size).toBe(10000)
  })

  it('UUIDv4：版本位 4', () => {
    const id = uuidv4()
    expect(id[14]).toBe('4')
    expect(['8', '9', 'a', 'b']).toContain(id[19])
  })

  it('★ getRandomValues 缺失 → uuidv7 降级 v4', () => {
    const orig = globalThis.crypto
    try {
      Object.defineProperty(globalThis, 'crypto', { value: {}, configurable: true })
      const id = uuidv7()
      expect(id[14]).toBe('4') // 降级 v4
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: orig, configurable: true })
    }
  })
})

describe('deepEqual / deepClone', () => {
  it('键序无关深比较', () => {
    expect(deepEqual({ a: 1, b: { c: [1, 2] } }, { b: { c: [1, 2] }, a: 1 })).toBe(true)
    expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false)
    expect(deepEqual(null, null)).toBe(true)
    expect(deepEqual(null, undefined)).toBe(false)
    expect(deepEqual([1, 2], [2, 1])).toBe(false)
  })

  it('deepClone 独立副本', () => {
    const src = { a: { b: [1, 2] } }
    const copy = deepClone(src)
    copy.a.b.push(3)
    expect(src.a.b).toEqual([1, 2])
  })
})
