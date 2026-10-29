import type { TocEntry, VolumeMeta } from './book'

/** 摊平后的目录行：卷 → 部/章 → 章/节，层级直接对应 arrange.json。 */
export interface FlatTocEntry {
  key: string
  title: string
  level: number
  pageId: string
  id: string
  path: string
  parentKey?: string
}

function splitPath(path: string): { pagePath: string; id: string } {
  const [pagePath, id = ''] = path.split('#')
  return { pagePath, id }
}

function pushEntry(rows: FlatTocEntry[], entry: TocEntry, parentKey?: string) {
  const { pagePath, id } = splitPath(entry.path)
  const key = id ? `${entry.pageId}#${id}` : entry.pageId
  rows.push({
    key,
    title: entry.title,
    level: entry.level,
    pageId: entry.pageId,
    id,
    path: entry.path || pagePath,
    parentKey,
  })
  for (const child of entry.children ?? []) pushEntry(rows, child, key)
}

export function flattenEntries(volumes: VolumeMeta[]): FlatTocEntry[] {
  const rows: FlatTocEntry[] = []
  for (const volume of volumes) {
    for (const entry of volume.entries) {
      const { pagePath } = splitPath(entry.path)
      rows.push({
        key: entry.pageId,
        title: entry.title,
        level: 1,
        pageId: entry.pageId,
        id: '',
        path: pagePath,
      })
      for (const child of entry.children ?? []) pushEntry(rows, child, entry.pageId)
    }
  }
  return rows
}

/**
 * 当前阅读位置所在目录行及其所有祖先的 key 集合。
 * hash 为空时落在页面自身（2 级条目）上。
 */
export function currentEntryPath(
  rows: FlatTocEntry[],
  pageId: string,
  hash: string,
): Set<string> {
  const active = new Set<string>()
  if (!pageId) return active

  const index = hash
    ? rows.findIndex((row) => row.pageId === pageId && row.id === hash)
    : rows.findIndex((row) => row.pageId === pageId && row.level <= 2)

  const start = index >= 0 ? index : rows.findIndex((row) => row.pageId === pageId)
  if (start < 0) return active

  let row: FlatTocEntry | undefined = rows[start]
  while (row) {
    active.add(row.key)
    row = row.parentKey ? rows.find((item) => item.key === row?.parentKey) : undefined
  }
  return active
}
