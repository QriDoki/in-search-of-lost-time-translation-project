import index from '../generated/search.json'
import { searchDocuments } from '../search.mjs'

self.onmessage = ({ data }) => {
  const start = performance.now()
  const response = searchDocuments(index.records, data.query, data.limit)
  self.postMessage({ ...response, requestId: data.requestId, elapsed: performance.now() - start })
}
