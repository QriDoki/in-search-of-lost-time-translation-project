/**
 * GraphTransport 实现（protocol §5.6）。唯一外部 IO 面，fetch 可注入（测试）。
 * 仅 approot 目录；错误语义：401 不可重试、404 read null/remove 幂等、412 冲突、429/5xx/网络可重试。
 * D15：真实 Graph spike 上线前待实测（D30）；契约按 412/If-Match 实现。
 */
import type { GraphFolder, GraphItem, GraphTransport } from './types'
import { GraphError } from './types'

const BASE = 'https://graph.microsoft.com/v1.0/me/drive/special/approot'

export function createGraphTransport(getToken: () => Promise<string>, fetchImpl?: typeof fetch): GraphTransport {
  const doFetch = fetchImpl ?? fetch

  async function request(url: string, init: RequestInit = {}): Promise<Response> {
    const token = await getToken()
    let res: Response
    try {
      res = await doFetch(url, {
        ...init,
        headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
      })
    } catch (e) {
      throw new GraphError(`网络错误：${(e as Error).message}`, 0, true)
    }
    if (res.status === 401) throw new GraphError('未授权', 401, false)
    if (res.status === 412) throw new GraphError(' precondition failed', 412, false)
    if (res.status === 429 || res.status >= 500) throw new GraphError(`Graph ${res.status}`, res.status, true)
    return res
  }

  const eTagOf = async (res: Response): Promise<string> => {
    const header = res.headers.get('ETag')
    if (header) return header
    try {
      const json = (await res.clone().json()) as { eTag?: string }
      return json.eTag ?? ''
    } catch {
      return ''
    }
  }

  return {
    async list(folder: GraphFolder): Promise<GraphItem[]> {
      const path = folder === 'root' ? '/children' : `:/${folder}:/children`
      let url = `${BASE}${path}?$select=name,eTag,id&$top=200`
      const items: GraphItem[] = []
      for (;;) {
        const res = await request(url)
        if (!res.ok) throw new GraphError(`list ${res.status}`, res.status, res.status >= 500)
        const json = (await res.json()) as { value?: { name: string; eTag: string; id: string }[]; '@odata.nextLink'?: string }
        for (const v of json.value ?? []) items.push({ name: v.name, eTag: v.eTag, id: v.id })
        const next = json['@odata.nextLink']
        if (!next) break
        url = next
      }
      return items
    },

    async read(path: string): Promise<{ body: string; eTag: string } | null> {
      const res = await request(`${BASE}:/${path}:/content`)
      if (res.status === 404) return null
      if (!res.ok) throw new GraphError(`read ${res.status}`, res.status, res.status >= 500)
      return { body: await res.text(), eTag: await eTagOf(res) }
    },

    async write(path: string, body: string | ArrayBuffer, cond?: { ifMatch?: string; ifNoneMatch?: '*' }): Promise<{ eTag: string }> {
      const headers: Record<string, string> = {
        'Content-Type': typeof body === 'string' ? 'application/json' : 'application/octet-stream',
      }
      if (cond?.ifMatch) headers['If-Match'] = cond.ifMatch
      if (cond?.ifNoneMatch === '*') headers['If-None-Match'] = '*'
      const res = await request(`${BASE}:/${path}:/content`, { method: 'PUT', body, headers })
      if (!res.ok) throw new GraphError(`write ${res.status}`, res.status, res.status >= 500)
      return { eTag: await eTagOf(res) }
    },

    async remove(path: string, cond?: { ifMatch?: string }): Promise<void> {
      const headers: Record<string, string> = {}
      if (cond?.ifMatch) headers['If-Match'] = cond.ifMatch
      const res = await request(`${BASE}/${path}`, { method: 'DELETE', headers })
      if (res.status === 404) return // 幂等
      if (!res.ok) throw new GraphError(`remove ${res.status}`, res.status, res.status >= 500)
    },
  }
}