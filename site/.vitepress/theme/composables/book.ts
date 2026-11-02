import booksJson from '../../generated/books.json'
import { computed } from 'vue'
import { useData } from 'vitepress'

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

export const books = booksJson as Record<string, BookMeta>
export const versions = Object.keys(books)
export const VERSION_KEY = 'lost-time:content-version:v1'

export function versionPrefix(version: string) {
  return version === 'dev' ? '' : `/versions/${version}`
}

function pathVersion() {
  if (typeof window === 'undefined') return 'dev'
  const version = window.location.pathname.match(/\/versions\/([^/]+)\//)?.[1]
  return version && books[version] ? version : 'dev'
}

// 切换版本使用整页导航，正文、搜索 Worker 与阅读元数据始终来自同一版本。
export const book = books[pathVersion()]

/** 通过页面数据选择元数据，服务端渲染也无需共享可变状态。 */
export function useBook() {
  const { frontmatter } = useData()
  const selected = computed(() => books[String(frontmatter.value.contentVersion ?? 'dev')] ?? books.dev)
  return { book: selected }
}

export const pages = book.pages
export const pageById = new Map(pages.map((page) => [page.id, page]))
export const totalChars = book.totalChars

export function pageAt(id: string | null | undefined): PageMeta | undefined {
  return id ? pageById.get(id) : undefined
}

export function neighbourPages(id: string | null | undefined, source: BookMeta = book) {
  const index = source.pages.findIndex((page) => page.id === id)
  if (index < 0) return { previous: undefined, next: undefined }
  return { previous: source.pages[index - 1], next: source.pages[index + 1] }
}

export function pageWeight(page: PageMeta): number {
  return Math.max(page.chars, 1)
}
