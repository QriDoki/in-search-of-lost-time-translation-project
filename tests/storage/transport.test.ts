import { describe, expect, it, vi } from 'vitest'
import { createGraphTransport } from '../../site/.vitepress/theme/composables/user-storage/transport'
import { GraphError } from '../../site/.vitepress/theme/composables/user-storage/types'

interface Call {
  url: string
  method: string
  headers: Record<string, string>
  body?: unknown
}

function mockFetch(handler: (call: Call) => { status: number; body?: unknown; headers?: Record<string, string> }) {
  const calls: Call[] = []
  const fn = vi.fn(async (url: string, init: RequestInit = {}) => {
    const call: Call = { url, method: init.method ?? 'GET', headers: (init.headers ?? {}) as Record<string, string>, body: init.body }
    calls.push(call)
    const r = handler(call)
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      headers: { get: (k: string) => r.headers?.[k] ?? r.headers?.[k.toLowerCase()] ?? null },
      json: async () => r.body,
      text: async () => (typeof r.body === 'string' ? r.body : JSON.stringify(r.body)),
      clone: () => ({ json: async () => r.body }),
    } as unknown as Response
  })
  return { fn: fn as unknown as typeof fetch, calls }
}

const token = async () => 'test-token'

describe('transport 错误语义与头', () => {
  it('每请求携带 Authorization Bearer', async () => {
    const { fn, calls } = mockFetch(() => ({ status: 200, body: { value: [] } }))
    const t = createGraphTransport(token, fn)
    await t.list('highlights')
    expect(calls[0].headers.Authorization).toBe('Bearer test-token')
    expect(calls[0].url).toContain('approot:/highlights:/children')
    expect(calls[0].url).toContain('$select=name,eTag,id')
  })

  it('401 → GraphError(401,false)', async () => {
    const { fn } = mockFetch(() => ({ status: 401 }))
    const t = createGraphTransport(token, fn)
    await expect(t.read('x.json')).rejects.toMatchObject({ status: 401, retryable: false })
  })

  it('404 read → null；remove 幂等成功', async () => {
    const { fn } = mockFetch(() => ({ status: 404 }))
    const t = createGraphTransport(token, fn)
    expect(await t.read('x.json')).toBeNull()
    await expect(t.remove('x.json')).resolves.toBeUndefined()
  })

  it('412 → GraphError(412,false)', async () => {
    const { fn } = mockFetch(() => ({ status: 412 }))
    const t = createGraphTransport(token, fn)
    await expect(t.write('x.json', '{}', { ifMatch: 'e' })).rejects.toMatchObject({ status: 412, retryable: false })
  })

  it('429/5xx → retryable=true；网络错误 → retryable', async () => {
    const { fn } = mockFetch(() => ({ status: 503 }))
    const t = createGraphTransport(token, fn)
    await expect(t.read('x.json')).rejects.toMatchObject({ status: 503, retryable: true })
    const throwFn = vi.fn(async () => {
      throw new Error('offline')
    }) as unknown as typeof fetch
    const t2 = createGraphTransport(token, throwFn)
    await expect(t2.read('x.json')).rejects.toMatchObject({ retryable: true })
  })

  it('★ If-Match / If-None-Match 头；write 返回 eTag', async () => {
    const { fn, calls } = mockFetch(() => ({ status: 200, body: { eTag: 'etag-new' }, headers: { ETag: 'etag-new' } }))
    const t = createGraphTransport(token, fn)
    await t.write('x.json', '{}', { ifMatch: 'etag-old' })
    expect(calls[0].headers['If-Match']).toBe('etag-old')
    expect(calls[0].method).toBe('PUT')
    expect(calls[0].url).toContain(':/x.json:/content')
    const res = await t.write('y.json', '{}', { ifNoneMatch: '*' })
    expect(calls[1].headers['If-None-Match']).toBe('*')
    expect(res.eTag).toBe('etag-new')
  })

  it('remove 用 item 路径（不带 :/content）', async () => {
    const { fn, calls } = mockFetch(() => ({ status: 204 }))
    const t = createGraphTransport(token, fn)
    await t.remove('highlights/x.json', { ifMatch: 'e' })
    expect(calls[0].url).toContain('approot/highlights/x.json')
    expect(calls[0].url).not.toContain(':/content')
    expect(calls[0].method).toBe('DELETE')
    expect(calls[0].headers['If-Match']).toBe('e')
  })

  it('★ 分页拼接 @odata.nextLink', async () => {
    const { fn, calls } = mockFetch((call) => {
      if (call.url.includes('next-page')) return { status: 200, body: { value: [{ name: 'b.json', eTag: 'e2', id: '2' }] } }
      return { status: 200, body: { value: [{ name: 'a.json', eTag: 'e1', id: '1' }], '@odata.nextLink': 'https://graph.microsoft.com/next-page' } }
    })
    const t = createGraphTransport(token, fn)
    const items = await t.list('highlights')
    expect(items.map((i) => i.name)).toEqual(['a.json', 'b.json'])
    expect(calls).toHaveLength(2)
  })

  it('root list 用 /children', async () => {
    const { fn, calls } = mockFetch(() => ({ status: 200, body: { value: [] } }))
    const t = createGraphTransport(token, fn)
    await t.list('root')
    expect(calls[0].url).toContain('approot/children')
  })
})