import bookJson from '../../generated/book.json'

export type PageKind = 'copyright' | 'volume' | 'unit'

export interface PageMeta {
  id: string
  kind: PageKind
  level: number
  title: string
  titleFr: string
  label: string
  context: string
  volumeId: string
  volumeTitle: string
  volumeOrder: number
  path: string
  chars: number
  index: number
}

export interface TocEntry {
  title: string
  titleFr?: string
  level: number
  pageId: string
  path: string
  children?: TocEntry[]
}

export interface VolumeMeta {
  id: string
  title: string
  titleFr: string
  order: number
  chars: number
  entries: TocEntry[]
}

export interface BookMeta {
  bookId: string
  title: string
  subtitle: string
  author: string
  translator: string
  license: string
  licenseUrl: string
  repository: string
  language: string
  description: string
  contentVersion: string
  buildVersion: string
  totalChars: number
  totalPages: number
  pages: PageMeta[]
  volumes: VolumeMeta[]
}

export const book = bookJson as BookMeta

/** 阅读顺序里的全部页面，含版权页与卷首页。 */
export const pages: PageMeta[] = book.pages

export const pageById = new Map(pages.map((page) => [page.id, page]))

export const pageIndexById = new Map(pages.map((page, index) => [page.id, index]))

/** 阅读顺序里的第一页：版权页。 */
export const firstPage = pages[0]

export const totalChars =
  book.totalChars || pages.reduce((sum, page) => sum + Math.max(page.chars, 1), 0)

export function pageAt(id: string | null | undefined): PageMeta | undefined {
  return id ? pageById.get(id) : undefined
}

export function neighbourPages(id: string | null | undefined) {
  const index = id ? pageIndexById.get(id) : undefined
  if (index === undefined) return { previous: undefined, next: undefined }
  return {
    previous: pages[index - 1],
    next: pages[index + 1],
  }
}

export function pageWeight(page: PageMeta): number {
  return Math.max(page.chars, 1)
}
