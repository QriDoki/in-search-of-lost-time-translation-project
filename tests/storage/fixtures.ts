import type { Bookmark, Highlight } from '../../site/.vitepress/theme/composables/user-storage/types'

export function hl(over: Partial<Highlight> = {}): Highlight {
  return {
    id: 'h1',
    schemaVersion: 1,
    kind: 'highlight',
    chapterId: 'vol1-01',
    paragraphId: 'P000001',
    revision: 'v1',
    textHash: 'hash1',
    selector: {
      exact: '很久以来',
      prefix: '',
      suffix: '',
      start: { paragraphId: 'P000001', offset: 0 },
      end: { paragraphId: 'P000001', offset: 4 },
    },
    note: '',
    types: [],
    color: 'yellow',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    rev: 1,
    deviceId: 'devA',
    ...over,
  }
}

export function bm(over: Partial<Bookmark> = {}): Bookmark {
  return {
    id: 'b1',
    schemaVersion: 1,
    chapterId: 'vol1-01',
    paragraphId: 'P000001',
    label: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    rev: 1,
    deviceId: 'devA',
    ...over,
  }
}

export const NOW = '2026-02-01T00:00:00.000Z'