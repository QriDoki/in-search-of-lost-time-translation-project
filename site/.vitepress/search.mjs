const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function queryTerms(query) {
  if (!/[\p{L}\p{N}]/u.test(query)) return []
  return [...new Set(query.trim().split(/\s+/u).filter(Boolean))]
}

export function matchRanges(text, query) {
  const terms = queryTerms(query).sort((a, b) => b.length - a.length)
  if (!terms.length) return []
  return [...text.matchAll(new RegExp(terms.map(escapeRegex).join('|'), 'giu'))]
    .map((match) => ({ start: match.index, end: match.index + match[0].length }))
}

export function highlightParts(text, query) {
  const parts = []
  let cursor = 0
  for (const { start, end } of matchRanges(text, query)) {
    if (start > cursor) parts.push({ text: text.slice(cursor, start), match: false })
    parts.push({ text: text.slice(start, end), match: true })
    cursor = end
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), match: false })
  return parts
}

export function excerptParts(text, query, hits) {
  const windows = hits.map(({ index, length }) => ({
    start: Math.max(0, index - 40), end: Math.min(text.length, index + length + 65),
  })).sort((a, b) => a.start - b.start)
  const merged = []
  for (const window of windows) {
    const previous = merged.at(-1)
    if (previous && window.start <= previous.end) previous.end = Math.max(previous.end, window.end)
    else merged.push({ ...window })
  }
  const parts = []
  let cursor = 0
  for (const { start, end } of merged.slice(0, 3)) {
    if (start > cursor) parts.push({ text: '…', match: false })
    parts.push(...highlightParts(text.slice(start, end), query))
    cursor = end
  }
  if (cursor < text.length) parts.push({ text: '…', match: false })
  return parts
}

export function searchDocuments(documents, query, limit = 30) {
  const patterns = queryTerms(query).map((term) => new RegExp(escapeRegex(term), 'iu'))
  if (!patterns.length) return { total: 0, results: [] }
  const results = []
  let total = 0
  for (const document of documents) {
    const hits = patterns.map((pattern) => pattern.exec(document.text))
    if (hits.some((hit) => !hit)) continue
    total++
    if (results.length < limit) results.push({
      id: document.id,
      title: document.title,
      parts: excerptParts(document.text, query, hits.map((hit) => ({ index: hit.index, length: hit[0].length }))),
    })
  }
  return { total, results }
}
