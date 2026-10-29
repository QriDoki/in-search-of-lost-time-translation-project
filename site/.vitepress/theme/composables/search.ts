export interface SearchResult {
  id: string
  title: string
  parts: { text: string; match: boolean }[]
}

export interface SearchResponse {
  total: number
  results: SearchResult[]
  elapsed: number
}

let worker: Worker | undefined
let requestId = 0
const pending = new Map<number, { resolve: (value: SearchResponse) => void; reject: (error: Error) => void }>()

// 弹窗首次打开时加载，关闭弹窗后保留 Worker，后续查询不重复下载索引。
export function runSearch(query: string, limit: number): Promise<SearchResponse> {
  if (!worker) {
    worker = new Worker(new URL('../search.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = ({ data }) => {
      pending.get(data.requestId)?.resolve(data)
      pending.delete(data.requestId)
    }
    worker.onerror = () => {
      for (const task of pending.values()) task.reject(new Error('全文索引加载失败，请重试。'))
      pending.clear()
      worker?.terminate()
      worker = undefined
    }
  }
  return new Promise((resolve, reject) => {
    const id = ++requestId
    pending.set(id, { resolve, reject })
    worker!.postMessage({ query, limit, requestId: id })
  })
}
