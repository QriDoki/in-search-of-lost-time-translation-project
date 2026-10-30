import { searchDocuments } from '../search.mjs'

let index: Promise<{ records: { id: string; title: string; text: string }[] }> | undefined

self.onmessage = async ({ data }) => {
  try {
    index ??= fetch(data.indexUrl).then((response) => {
      if (!response.ok) throw new Error('搜索索引加载失败')
      return response.json()
    })
    const loaded = await index
    const start = performance.now()
    const response = searchDocuments(loaded.records, data.query, data.limit)
    self.postMessage({ ...response, requestId: data.requestId, elapsed: performance.now() - start })
  } catch {
    index = undefined
    self.postMessage({ requestId: data.requestId, error: '全文索引加载失败，请重试。' })
  }
}
