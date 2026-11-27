/**
 * 导入导出（protocol §5.8）。JSON 信封全量导出/逐条合并导入（永不整库覆盖）。
 * Markdown / DOCX 摘录集见 B2-2（懒加载）。
 */
import type {
  Bookmark,
  ExportEnvelope,
  Highlight,
  ImportPreview,
  ImportResult,
  ImportStrategy,
  ProgressDoc,
  SettingsDoc,
} from './types'
import {
  currentDb,
  currentScope,
  deviceId,
  getProgressDoc,
  getSettingsDoc,
  listBookmarks,
  listHighlights,
  queueOutbox,
  sanitizeBookmark,
  sanitizeHighlight,
  toCloud,
} from './db'
import { mergeBookmark, mergeHighlight, mergeProgress, mergeSettings, isGraveyarded } from './merge'
import { getGraveyard } from './db'
import { deepClone, deepEqual, nowIso, uuidv7 } from './util'

/** 色 token → 导出 hex（数据不携带色值）。 */
export const COLOR_HEX: Record<Highlight['color'], string> = {
  yellow: '#f5d76e',
  green: '#a9d18e',
  blue: '#9dc3e6',
  pink: '#f4b6c2',
  purple: '#c9b1e0',
}

export interface ExcerptItem {
  highlight: Highlight
  chapterLabel: string
  permalink: string
}
export interface ExcerptOptions {
  includeNotes: boolean
  includeLinks: boolean
  groupByVolume: boolean
}

/* ------------------------------------------------------------------ */
/* JSON 导出                                                           */
/* ------------------------------------------------------------------ */

export async function buildExportEnvelope(): Promise<ExportEnvelope> {
  const { book } = await import('../book')
  const highlights = (await listHighlights()).map((h) => toCloud(h) as Highlight)
  const bookmarks = (await listBookmarks()).map((b) => toCloud(b) as Bookmark)
  return {
    format: 'proust-reader-export',
    formatVersion: 1,
    app: { name: 'proust-reader', buildVersion: book.buildVersion },
    exportedAt: nowIso(),
    scope: currentScope(),
    data: {
      highlights,
      bookmarks,
      progress: await getProgressDoc(),
      settings: await getSettingsDoc(),
    },
  }
}

export function downloadJson(env: ExportEnvelope): void {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const filename = `proust-reader-backup-${date}.json`
  const blob = new Blob([JSON.stringify(env, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.append(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
  void currentDb().meta.put({ key: 'lastExportAt', value: nowIso() })
}

/* ------------------------------------------------------------------ */
/* 导入校验                                                            */
/* ------------------------------------------------------------------ */

export function parseImportFile(text: string): { ok: true; envelope: ExportEnvelope } | { ok: false; error: string } {
  let obj: Record<string, unknown>
  try {
    obj = JSON.parse(text)
  } catch {
    return { ok: false, error: '非法 JSON' }
  }
  if (obj.format !== 'proust-reader-export') return { ok: false, error: '格式标识不符' }
  if (typeof obj.formatVersion !== 'number' || obj.formatVersion > 1) return { ok: false, error: 'formatVersion 高于本机支持，拒绝导入' }
  const data = obj.data as Record<string, unknown> | undefined
  if (!data || !Array.isArray(data.highlights) || !Array.isArray(data.bookmarks)) return { ok: false, error: '缺少 data.highlights/bookmarks' }
  try {
    const highlights = data.highlights.map((h) => sanitizeHighlight(h))
    const bookmarks = data.bookmarks.map((b) => sanitizeBookmark(b))
    const progress = (data.progress ?? { schemaVersion: 1, last: null, pages: {} }) as ProgressDoc
    const settings = (data.settings ?? { schemaVersion: 1, prefs: {}, stamps: {} }) as SettingsDoc
    const envelope: ExportEnvelope = {
      format: 'proust-reader-export',
      formatVersion: 1,
      app: (obj.app as ExportEnvelope['app']) ?? { name: 'proust-reader', buildVersion: '' },
      exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : nowIso(),
      scope: typeof obj.scope === 'string' ? obj.scope : 'anon',
      data: { highlights, bookmarks, progress, settings },
    }
    return { ok: true, envelope }
  } catch (e) {
    return { ok: false, error: `记录校验失败：${(e as Error).message}` }
  }
}

/* ------------------------------------------------------------------ */
/* 预览 / 应用                                                         */
/* ------------------------------------------------------------------ */

async function previewRecord(
  entity: 'highlight' | 'bookmark',
  record: Highlight | Bookmark,
  graveyard: Awaited<ReturnType<typeof getGraveyard>>,
): Promise<'added' | 'updated' | 'skipped' | 'conflict'> {
  if (isGraveyarded(record.id, graveyard)) return 'skipped'
  const row = entity === 'highlight' ? await currentDb().highlights.get(record.id) : await currentDb().bookmarks.get(record.id)
  if (!row) return 'added'
  const localCloud = toCloud(row)
  // 仅当内容完全相同才跳过；同 updatedAt 异值仍须按 #5 裁决（F2）
  if (deepEqual(localCloud, record)) return 'skipped'
  const base = row.local.baseSnapshot as never
  const out =
    entity === 'highlight'
      ? mergeHighlight({ base, local: localCloud as Highlight, remote: record as Highlight, selfDeviceId: deviceId(), now: nowIso() })
      : mergeBookmark({ base, local: localCloud as Bookmark, remote: record as Bookmark, selfDeviceId: deviceId(), now: nowIso() })
  return out.appended.length ? 'conflict' : 'updated'
}

export async function previewImport(env: ExportEnvelope): Promise<ImportPreview> {
  const graveyard = await getGraveyard()
  const preview: ImportPreview = { added: 0, updated: 0, skipped: 0, conflicts: [] }
  const scan = async (entity: 'highlight' | 'bookmark', records: (Highlight | Bookmark)[]) => {
    for (const record of records) {
      const verdict = await previewRecord(entity, record, graveyard)
      if (verdict === 'added') preview.added += 1
      else if (verdict === 'skipped') preview.skipped += 1
      else {
        preview.updated += 1
        if (verdict === 'conflict') {
          const row = entity === 'highlight' ? await currentDb().highlights.get(record.id) : await currentDb().bookmarks.get(record.id)
          preview.conflicts.push({ id: record.id, entity, localUpdatedAt: row!.updatedAt, importUpdatedAt: record.updatedAt })
        }
      }
    }
  }
  await scan('highlight', env.data.highlights)
  await scan('bookmark', env.data.bookmarks)
  return preview
}

export async function applyImport(env: ExportEnvelope, strategy: ImportStrategy): Promise<ImportResult> {
  const graveyard = await getGraveyard()
  const result: ImportResult = { added: 0, updated: 0, skipped: 0, conflictsKept: 0 }
  const now = nowIso()
  const self = deviceId()
  const d = currentDb()

  const importRecord = async (entity: 'highlight' | 'bookmark', record: Highlight | Bookmark): Promise<void> => {
    if (isGraveyarded(record.id, graveyard)) {
      result.skipped += 1
      return
    }
    const table = entity === 'highlight' ? d.highlights : d.bookmarks
    const row = await table.get(record.id)
    if (!row) {
      if (entity === 'highlight') await d.highlights.put({ ...(record as Highlight), local: { dirty: 1, baseEtag: null, baseSnapshot: null }, dirty: 1 })
      else await d.bookmarks.put({ ...(record as Bookmark), local: { dirty: 1, baseEtag: null, baseSnapshot: null }, dirty: 1 })
      await queueOutbox(entity, record.id, record.deletedAt ? 'delete' : 'put')
      result.added += 1
      return
    }
    const localCloud = toCloud(row)
    // 仅内容完全相同才跳过；同 updatedAt 异值按 #5 同刻 deviceId 裁决（F2）
    if (deepEqual(localCloud, record)) {
      result.skipped += 1
      return
    }
    const base = row.local.baseSnapshot as never
    // 策略：local/both → 本机胜；import → 导入胜（强制 updatedAt 影响 #5 裁决）
    const forceLocal = strategy !== 'import'
    const out =
      entity === 'highlight'
        ? mergeHighlight({
            base,
            local: { ...(localCloud as Highlight), updatedAt: forceLocal ? now : (localCloud as Highlight).updatedAt },
            remote: { ...(record as Highlight), updatedAt: forceLocal ? (record as Highlight).updatedAt : now },
            selfDeviceId: self,
            now,
          })
        : mergeBookmark({
            base,
            local: { ...(localCloud as Bookmark), updatedAt: forceLocal ? now : (localCloud as Bookmark).updatedAt },
            remote: { ...(record as Bookmark), updatedAt: forceLocal ? (record as Bookmark).updatedAt : now },
            selfDeviceId: self,
            now,
          })
    if (entity === 'highlight') await d.highlights.put({ ...(out.record as Highlight), local: { ...row.local, dirty: 1 }, dirty: 1 })
    else await d.bookmarks.put({ ...(out.record as Bookmark), local: { ...row.local, dirty: 1 }, dirty: 1 })
    await queueOutbox(entity, record.id, out.record.deletedAt ? 'delete' : 'put')
    result.updated += 1
    result.conflictsKept += out.appended.length

    // both：导入侧另存新记录（新 UUIDv7，锚点同原记录，内容取导入）
    if (strategy === 'both' && out.appended.length) {
      const newId = uuidv7()
      if (entity === 'highlight') {
        const copy: Highlight = { ...(record as Highlight), id: newId, rev: 1, deviceId: self, createdAt: now, updatedAt: now, deletedAt: null, conflicts: undefined }
        await d.highlights.put({ ...copy, local: { dirty: 1, baseEtag: null, baseSnapshot: null }, dirty: 1 })
      } else {
        const copy: Bookmark = { ...(record as Bookmark), id: newId, rev: 1, deviceId: self, createdAt: now, updatedAt: now, deletedAt: null, conflicts: undefined }
        await d.bookmarks.put({ ...copy, local: { dirty: 1, baseEtag: null, baseSnapshot: null }, dirty: 1 })
      }
      await queueOutbox(entity, newId, 'put')
      result.added += 1
    }
  }

  for (const h of env.data.highlights) await importRecord('highlight', h)
  for (const b of env.data.bookmarks) await importRecord('bookmark', b)

  // progress / settings 文档合并（永不整库覆盖）
  const localProgress = await getProgressDoc()
  const mergedProgress = mergeProgress(localProgress, env.data.progress, self)
  await d.transaction('rw', d.progress, d.meta, d.outbox, async () => {
    for (const pos of Object.values(mergedProgress.pages)) await d.progress.put(pos)
    await d.meta.put({ key: 'last', value: mergedProgress.last })
    await queueOutbox('progress', 'doc', 'put')
  })
  const localSettings = await getSettingsDoc()
  const mergedSettings = mergeSettings(localSettings, env.data.settings)
  await d.settings.put({ key: 'synced', value: mergedSettings })
  await queueOutbox('settings', 'doc', 'put')

  return result
}

/* ------------------------------------------------------------------ */
/* 可读摘录集（B2-2）：Markdown 自研零依赖；DOCX 懒加载 docx            */
/* ------------------------------------------------------------------ */

const COLOR_LABEL: Record<Highlight['color'], string> = {
  yellow: '黄',
  green: '绿',
  blue: '蓝',
  pink: '粉',
  purple: '紫',
}

function volumeOf(item: ExcerptItem): string {
  return item.highlight.chapterId.split('-')[0]
}

function groupItems(items: ExcerptItem[], groupByVolume: boolean): { key: string; items: ExcerptItem[] }[] {
  if (!groupByVolume) return [{ key: '', items }]
  const map = new Map<string, ExcerptItem[]>()
  for (const item of items) {
    const key = volumeOf(item)
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(item)
  }
  return [...map.entries()].map(([key, items]) => ({ key, items }))
}

export function buildMarkdownExcerpt(items: ExcerptItem[], opts: ExcerptOptions): string {
  const lines: string[] = ['# 我的摘录', '']
  for (const group of groupItems(items, opts.groupByVolume)) {
    if (opts.groupByVolume && group.key) lines.push(`## ${group.key}`, '')
    for (const item of group.items) {
      const h = item.highlight
      lines.push(`### ${item.chapterLabel}`, '')
      for (const line of h.selector.exact.split('\n')) lines.push(`> ${line}`)
      lines.push('')
      lines.push(`*${COLOR_LABEL[h.color]}色摘录*`)
      if (opts.includeNotes && h.note) {
        lines.push('', `批注：${h.note}`)
      }
      if (opts.includeLinks && item.permalink) {
        lines.push('', `[永久链接](${item.permalink})`)
      }
      lines.push('')
    }
  }
  return lines.join('\n')
}

export async function buildDocxExcerpt(items: ExcerptItem[], opts: ExcerptOptions): Promise<Blob> {
  const docx = await import('docx')
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, ExternalHyperlink } = docx
  const children: InstanceType<typeof Paragraph>[] = []
  children.push(new Paragraph({ text: '我的摘录', heading: HeadingLevel.TITLE }))
  for (const group of groupItems(items, opts.groupByVolume)) {
    if (opts.groupByVolume && group.key) {
      children.push(new Paragraph({ text: group.key, heading: HeadingLevel.HEADING_1 }))
    }
    for (const item of group.items) {
      const h = item.highlight
      children.push(new Paragraph({ text: item.chapterLabel, heading: HeadingLevel.HEADING_2 }))
      children.push(
        new Paragraph({
          children: [new TextRun({ text: h.selector.exact, color: COLOR_HEX[h.color].replace('#', '') })],
        }),
      )
      if (opts.includeNotes && h.note) {
        children.push(new Paragraph({ children: [new TextRun({ text: `批注：${h.note}`, italics: true })] }))
      }
      if (opts.includeLinks && item.permalink) {
        children.push(
          new Paragraph({
            children: [
              new ExternalHyperlink({ link: item.permalink, children: [new TextRun({ text: '永久链接', style: 'Hyperlink' })] }),
            ],
          }),
        )
      }
    }
  }
  const doc = new Document({ sections: [{ children }] })
  return Packer.toBlob(doc)
}

export { deepClone, deepEqual }