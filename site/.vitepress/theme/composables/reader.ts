import { computed, reactive, watch } from 'vue'
import {
  book,
  pageAt,
  pageById,
  pageWeight,
  pages,
  totalChars,
} from './book'

export const PREFS_KEY = 'lost-time:reader-prefs:v2'
export const PROGRESS_KEY = 'lost-time:progress:v2'

export type ReaderTheme = 'paper' | 'light' | 'sepia' | 'dark'
export type ReaderFont = 'serif' | 'sans' | 'kai'

export interface ReaderPrefs {
  fontSize: number
  lineHeight: number
  fontFamily: ReaderFont
  theme: ReaderTheme
  width: number
}

export interface ReadingPosition {
  pageId: string
  paragraphId: string
  paragraphHash: string
  /** 段落内部的大致位置，0–1 */
  offset: number
  /** 当前滚动到的页面进度，0–1 */
  pageProgress: number
  /** 该页读到的最大进度，用于总进度 */
  maxProgress: number
  updatedAt: string
}

interface StoredProgress {
  last: ReadingPosition | null
  pages: Record<string, ReadingPosition>
}

const DEFAULT_PREFS: ReaderPrefs = {
  fontSize: 20,
  lineHeight: 1.9,
  fontFamily: 'sans',
  theme: 'paper',
  width: 720,
}

const THEME_COLORS: Record<ReaderTheme, string> = {
  paper: '#f7f2e8',
  light: '#ffffff',
  sepia: '#e7ead9',
  dark: '#171513',
}

export const prefs = reactive<ReaderPrefs>({ ...DEFAULT_PREFS })

export const progress = reactive<StoredProgress>({ last: null, pages: {} })

/** 当前正在阅读的页面（由 ReaderDock 写入） */
export const reading = reactive({
  pageId: '',
  pageProgress: 0,
  ready: false,
})

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

function readJson(key: string): Record<string, unknown> | null {
  try {
    const value = localStorage.getItem(key)
    return value ? JSON.parse(value) : null
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // 隐私模式或存储已满时，阅读器仍应正常工作，只是无法记住状态。
  }
}

function sanitizePrefs(input: Partial<ReaderPrefs> | null): ReaderPrefs {
  const next = { ...DEFAULT_PREFS }
  if (!input) return next
  if (Number.isFinite(input.fontSize)) next.fontSize = clamp(Number(input.fontSize), 15, 32)
  if (Number.isFinite(input.lineHeight)) next.lineHeight = clamp(Number(input.lineHeight), 1.4, 2.8)
  if (input.fontFamily === 'serif' || input.fontFamily === 'sans' || input.fontFamily === 'kai') {
    next.fontFamily = input.fontFamily
  }
  if (['paper', 'light', 'sepia', 'dark'].includes(input.theme as string)) {
    next.theme = input.theme as ReaderTheme
  }
  if (Number.isFinite(input.width)) next.width = clamp(Number(input.width), 580, 960)
  return next
}

/** 兼容旧版进度（字段为 chapterId / chapters）。 */
function upgradePosition(input: Record<string, unknown>): Partial<ReadingPosition> {
  const pageId = (input.pageId ?? input.chapterId ?? '') as string
  return {
    pageId,
    paragraphId: typeof input.paragraphId === 'string' ? input.paragraphId : '',
    paragraphHash: typeof input.paragraphHash === 'string' ? input.paragraphHash : '',
    offset: input.offset as number,
    pageProgress: (input.pageProgress ?? input.chapterProgress) as number,
    maxProgress: input.maxProgress as number,
    updatedAt: input.updatedAt as string,
  }
}

function sanitizePosition(input: Partial<ReadingPosition> | null | undefined): ReadingPosition | null {
  if (!input || typeof input.pageId !== 'string' || !pageAt(input.pageId)) return null
  return {
    pageId: input.pageId,
    paragraphId: typeof input.paragraphId === 'string' ? input.paragraphId : '',
    paragraphHash: typeof input.paragraphHash === 'string' ? input.paragraphHash : '',
    offset: Number.isFinite(input.offset) ? clamp(Number(input.offset), 0, 1) : 0,
    pageProgress: Number.isFinite(input.pageProgress)
      ? clamp(Number(input.pageProgress), 0, 1)
      : 0,
    maxProgress: Number.isFinite(input.maxProgress)
      ? clamp(Number(input.maxProgress), 0, 1)
      : Number.isFinite(input.pageProgress)
        ? clamp(Number(input.pageProgress), 0, 1)
        : 0,
    updatedAt: typeof input.updatedAt === 'string' ? input.updatedAt : new Date().toISOString(),
  }
}

function loadProgress() {
  let stored = readJson(PROGRESS_KEY)
  if (!stored) {
    // 旧版本（v1，按章记录）读到就迁移一次。
    const legacy = readJson('lost-time:progress:v1')
    if (legacy) {
      const upgraded: StoredProgress = { last: null, pages: {} }
      const last = legacy.last ? sanitizePosition(upgradePosition(legacy.last as Record<string, unknown>)) : null
      upgraded.last = last
      const chapters = (legacy.chapters ?? {}) as Record<string, Record<string, unknown>>
      for (const value of Object.values(chapters)) {
        const position = sanitizePosition(upgradePosition(value))
        if (position) upgraded.pages[position.pageId] = position
      }
      stored = upgraded as unknown as Record<string, unknown>
      writeJson(PROGRESS_KEY, upgraded)
    }
  }
  if (!stored) return

  progress.last = sanitizePosition(stored.last as Partial<ReadingPosition>)

  const storedPages = (stored.pages ?? stored.chapters) as Record<string, unknown> | undefined
  if (storedPages && typeof storedPages === 'object') {
    for (const value of Object.values(storedPages)) {
      const position = sanitizePosition(upgradePosition(value as Record<string, unknown>))
      if (position) progress.pages[position.pageId] = position
    }
  }
}

function applyPreferences() {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.setAttribute('data-reader-theme', prefs.theme)
  root.setAttribute('data-reader-font', prefs.fontFamily)
  root.classList.toggle('dark', prefs.theme === 'dark')
  root.style.setProperty('--reader-font-size', `${prefs.fontSize}px`)
  root.style.setProperty('--reader-line-height', String(prefs.lineHeight))
  root.style.setProperty('--reader-width', `${prefs.width}px`)

  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', THEME_COLORS[prefs.theme])
}

let initialized = false

export function initReader() {
  if (initialized || typeof window === 'undefined') return
  initialized = true

  const stored = readJson(PREFS_KEY) as Partial<ReaderPrefs> | null
  Object.assign(prefs, sanitizePrefs(stored))
  if (!stored || !stored.theme) {
    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches
    prefs.theme = prefersDark ? 'dark' : 'paper'
  }

  loadProgress()
  applyPreferences()

  watch(
    prefs,
    () => {
      applyPreferences()
      writeJson(PREFS_KEY, { ...prefs })
    },
    { deep: true },
  )
}

export function savePosition(position: ReadingPosition) {
  const previous = progress.pages[position.pageId]
  const maxProgress = Math.max(previous?.maxProgress ?? 0, position.pageProgress)
  const next: ReadingPosition = {
    ...position,
    maxProgress,
    updatedAt: new Date().toISOString(),
  }

  progress.pages[position.pageId] = next
  progress.last = next
  reading.pageProgress = position.pageProgress
  writeJson(PROGRESS_KEY, {
    last: progress.last,
    pages: progress.pages,
  })
}

export function setActivePage(pageId: string) {
  reading.pageId = pageId
  reading.pageProgress = progress.pages[pageId]?.pageProgress ?? 0
  reading.ready = true
}

export function setActiveProgress(value: number) {
  reading.pageProgress = clamp(value, 0, 1)
}

export function resetPreferences() {
  Object.assign(prefs, { ...DEFAULT_PREFS })
}

export function clearReadingProgress() {
  progress.last = null
  progress.pages = {}
  reading.pageProgress = 0
  try {
    localStorage.removeItem(PROGRESS_KEY)
  } catch {
    // ignore
  }
}

export const overallProgress = computed(() => {
  let weighted = 0
  for (const page of pages) {
    const saved = progress.pages[page.id]
    weighted += pageWeight(page) * (saved?.maxProgress ?? 0)
  }
  return clamp(weighted / totalChars, 0, 1)
})

export const lastPage = computed(() => pageAt(progress.last?.pageId))

export const lastPosition = computed(() => progress.last)

export function pagePercent(pageId: string): number {
  return Math.round((progress.pages[pageId]?.maxProgress ?? 0) * 100)
}

export function percent(value: number): string {
  return `${Math.round(clamp(value, 0, 1) * 100)}%`
}

export { book, pageById, pages }

// 浏览器端模块加载时即初始化；head 中的内联脚本已经提前应用过主题，避免闪烁。
initReader()
