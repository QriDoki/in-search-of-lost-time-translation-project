import { describe, expect, it } from 'vitest'
import {
  decodeBase64Url,
  deepEqual,
  encodeBase64Url,
  fnv1a36,
  nfc,
  nowIso,
  sha256Hex,
  uuidv4,
  uuidv7,
} from '../../site/.vitepress/theme/composables/user-storage/util'
import { getUserStorageConfig, configureUserStorage, resetUserStorageConfig } from '../../site/.vitepress/theme/composables/user-storage/config'

describe('util', () => {
  it('fnv1a36 黄金向量与构建侧一致（D3）', () => {
    expect(fnv1a36('')).toBe('ztntfp')
    expect(fnv1a36('很久以来，我都是早早就躺下了')).toBe('1mkkj7')
    expect(fnv1a36('  贡布雷。  ')).toBe('zer7p0')
    expect(fnv1a36('Marcel Proust')).toBe('1xyq7u2')
    expect(fnv1a36('　')).toBe('ztntfp')
    expect(fnv1a36('áb')).toBe('etsjxr')
  })

  it('nfc 归一化', () => {
    expect(nfc('áb')).toBe('áb')
    expect(nfc('áb').length).toBe(2)
  })

  it('UUIDv7：时间有序、版本位 7、variant 10、10k 无碰撞', () => {
    const ids: string[] = []
    for (let i = 0; i < 10000; i += 1) ids.push(uuidv7())
    expect(new Set(ids).size).toBe(10000)
    for (const id of ids) {
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    }
    // 时间有序：48 位时间戳前缀单调不减（同毫秒内随机位不保证单调）
    const ts = (id: string) => Number.parseInt(id.replace(/-/g, '').slice(0, 12), 16)
    for (let i = 1; i < ids.length; i += 1) {
      expect(ts(ids[i])).toBeGreaterThanOrEqual(ts(ids[i - 1]))
    }
  })

  it('UUIDv4 格式与版本位', () => {
    const id = uuidv4()
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('getRandomValues 缺失降级 v4', () => {
    const saved = globalThis.crypto
    try {
      Object.defineProperty(globalThis, 'crypto', {
        value: { randomUUID: () => '12345678-1234-4234-8234-123456789abc' },
        configurable: true,
      })
      const id = uuidv7()
      expect(id).toBe('12345678-1234-4234-8234-123456789abc')
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: saved, configurable: true })
    }
  })

  it('base64url unicode roundtrip，无填充', () => {
    const text = '贡布雷 · Marcel Proust 🕰️「摘录」'
    const enc = encodeBase64Url(text)
    expect(enc).not.toContain('=')
    expect(enc).not.toContain('+')
    expect(enc).not.toContain('/')
    expect(decodeBase64Url(enc)).toBe(text)
  })

  it('sha256Hex 已知向量', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(await sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  })

  it('nowIso 为 ISO 8601 UTC ms', () => {
    expect(nowIso()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })

  it('deepEqual 结构比较', () => {
    expect(deepEqual({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 })).toBe(true)
    expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false)
    expect(deepEqual([1, 2], [1, 2, 3])).toBe(false)
    expect(deepEqual(null, null)).toBe(true)
    expect(deepEqual(null, undefined)).toBe(false)
  })
})

describe('config', () => {
  it('缺省 clientId 空（同步禁用）', () => {
    resetUserStorageConfig()
    expect(getUserStorageConfig().clientId).toBe('')
    expect(getUserStorageConfig().authority).toBe('https://login.microsoftonline.com/common')
    expect(getUserStorageConfig().appFolder).toBe('Proust Reader')
  })

  it('configureUserStorage 注入与复位', () => {
    configureUserStorage({ clientId: 'test-client' })
    expect(getUserStorageConfig().clientId).toBe('test-client')
    resetUserStorageConfig()
    expect(getUserStorageConfig().clientId).toBe('')
  })
})