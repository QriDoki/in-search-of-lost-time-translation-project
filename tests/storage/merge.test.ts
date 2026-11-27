import { describe, expect, it } from 'vitest'
import {
  isGraveyarded,
  mergeBookmark,
  mergeGraveyard,
  mergeHighlight,
  mergeProgress,
  mergeSettings,
} from '../../site/.vitepress/theme/composables/user-storage/merge'
import type { GraveyardDoc, Highlight, ProgressDoc, SettingsDoc } from '../../site/.vitepress/theme/composables/user-storage/types'
import { bm, hl, NOW } from './fixtures'

const merge = (base: Highlight | null, local: Highlight, remote: Highlight, self = 'devSelf') =>
  mergeHighlight({ base, local, remote, selfDeviceId: self, now: NOW })

describe('mergeHighlight 判定表（逐字段）', () => {
  // #1 两侧均未改 → base 值
  it('#1 两侧未改取 base（note/types/color/anchorBundle）', () => {
    const base = hl({ note: 'base', types: ['🔤'], color: 'green' })
    const out = merge(base, hl({ note: 'base', types: ['🔤'], color: 'green', updatedAt: '2026-01-02T00:00:00.000Z' }), hl({ note: 'base', types: ['🔤'], color: 'green', updatedAt: '2026-01-03T00:00:00.000Z', deviceId: 'devB' }))
    expect(out.record.note).toBe('base')
    expect(out.record.color).toBe('green')
    expect(out.appended).toHaveLength(0)
  })

  // #2 仅本地改
  it('#2 仅本地改取本地', () => {
    const base = hl()
    const out = merge(base, hl({ note: 'local', updatedAt: '2026-01-02T00:00:00.000Z' }), hl({ updatedAt: '2026-01-03T00:00:00.000Z', deviceId: 'devB' }))
    expect(out.record.note).toBe('local')
    expect(out.appended).toHaveLength(0)
  })

  // #3 仅远端改
  it('#3 仅远端改取远端', () => {
    const base = hl()
    const out = merge(base, hl({ updatedAt: '2026-01-02T00:00:00.000Z' }), hl({ note: 'remote', updatedAt: '2026-01-03T00:00:00.000Z', deviceId: 'devB' }))
    expect(out.record.note).toBe('remote')
    expect(out.appended).toHaveLength(0)
  })

  // #4 两侧改且相同
  it('#4 两侧改且值相同取该值，无副本', () => {
    const base = hl()
    const out = merge(base, hl({ note: 'same', updatedAt: '2026-01-02T00:00:00.000Z' }), hl({ note: 'same', updatedAt: '2026-01-03T00:00:00.000Z', deviceId: 'devB' }))
    expect(out.record.note).toBe('same')
    expect(out.appended).toHaveLength(0)
  })

  // #5 两侧改且不同
  it('★ #5 updatedAt 较新者胜，败者入 conflicts', () => {
    const base = hl()
    const local = hl({ note: 'local', updatedAt: '2026-01-02T00:00:00.000Z', deviceId: 'devA' })
    const remote = hl({ note: 'remote', updatedAt: '2026-01-03T00:00:00.000Z', deviceId: 'devB' })
    const out = merge(base, local, remote)
    expect(out.record.note).toBe('remote')
    expect(out.appended).toHaveLength(1)
    expect(out.appended[0].snapshot.note).toBe('local')
    expect(out.appended[0].deviceId).toBe('devA')
  })

  it('★ #5 同刻 deviceId 字典序大者胜', () => {
    const base = hl()
    const t = '2026-01-02T00:00:00.000Z'
    const out = merge(base, hl({ note: 'A', updatedAt: t, deviceId: 'devA' }), hl({ note: 'B', updatedAt: t, deviceId: 'devB' }))
    expect(out.record.note).toBe('B') // devB > devA
    expect(out.appended[0].snapshot.note).toBe('A')
  })

  it('★ #5 color 冲突败者副本含 color', () => {
    const base = hl()
    const out = merge(base, hl({ color: 'green', updatedAt: '2026-01-02T00:00:00.000Z' }), hl({ color: 'blue', updatedAt: '2026-01-03T00:00:00.000Z', deviceId: 'devB' }))
    expect(out.record.color).toBe('blue')
    expect(out.appended[0].snapshot.color).toBe('green')
  })

  it('★ #5 anchorBundle 整体冲突（selector/textHash/revision）', () => {
    const base = hl()
    const localSel = { ...base.selector, exact: '本地选区', end: { paragraphId: 'P000001', offset: 4 } }
    const remoteSel = { ...base.selector, exact: '远端选区', end: { paragraphId: 'P000001', offset: 4 } }
    const out = merge(
      base,
      hl({ selector: localSel, textHash: 'hL', revision: 'vL', updatedAt: '2026-01-02T00:00:00.000Z' }),
      hl({ selector: remoteSel, textHash: 'hR', revision: 'vR', updatedAt: '2026-01-03T00:00:00.000Z', deviceId: 'devB' }),
    )
    expect(out.record.textHash).toBe('hR')
    expect(out.record.selector.exact).toBe('远端选区')
    expect(out.appended[0].snapshot.selector.exact).toBe('本地选区')
  })

  // #6 删除 vs 未改内容
  it('★ #6 一侧删除另一侧未改 → 墓碑生效，无副本', () => {
    const base = hl()
    const out = merge(base, hl({ deletedAt: '2026-01-05T00:00:00.000Z', updatedAt: '2026-01-05T00:00:00.000Z' }), hl({ updatedAt: '2026-01-03T00:00:00.000Z', deviceId: 'devB' }))
    expect(out.record.deletedAt).toBe('2026-01-05T00:00:00.000Z')
    expect(out.appended).toHaveLength(0)
  })

  // #7 删除 vs 编辑
  it('★ #7 删除 vs 编辑 → 删除侧整条存活，编辑侧副本 deletedAt=null', () => {
    const base = hl()
    const out = merge(base, hl({ deletedAt: '2026-01-05T00:00:00.000Z', updatedAt: '2026-01-05T00:00:00.000Z' }), hl({ note: 'edited', updatedAt: '2026-01-06T00:00:00.000Z', deviceId: 'devB' }))
    expect(out.record.deletedAt).toBe('2026-01-05T00:00:00.000Z')
    expect(out.appended).toHaveLength(1)
    expect(out.appended[0].snapshot.note).toBe('edited')
    expect(out.appended[0].snapshot.deletedAt).toBeNull()
  })

  // #8 两侧删除
  it('★ #8 两侧删除取较早 deletedAt', () => {
    const base = hl()
    const out = merge(base, hl({ deletedAt: '2026-01-05T00:00:00.000Z', updatedAt: '2026-01-05T00:00:00.000Z' }), hl({ deletedAt: '2026-01-03T00:00:00.000Z', updatedAt: '2026-01-06T00:00:00.000Z', deviceId: 'devB' }))
    expect(out.record.deletedAt).toBe('2026-01-03T00:00:00.000Z')
  })

  // #9 base 缺失
  it('★ #9 base 缺失：值相同保留，不同即冲突副本', () => {
    const same = merge(null, hl({ note: 'x' }), hl({ note: 'x', deviceId: 'devB', updatedAt: '2026-01-03T00:00:00.000Z' }))
    expect(same.record.note).toBe('x')
    expect(same.appended).toHaveLength(0)
    const diff = merge(null, hl({ note: 'L', updatedAt: '2026-01-02T00:00:00.000Z' }), hl({ note: 'R', deviceId: 'devB', updatedAt: '2026-01-03T00:00:00.000Z' }))
    expect(diff.record.note).toBe('R')
    expect(diff.appended).toHaveLength(1)
    expect(diff.appended[0].snapshot.note).toBe('L')
  })

  // #10 远端高 schema
  it('★ #10 远端高 schemaVersion → 只读，本地原样', () => {
    const local = hl({ note: 'local' })
    const remote = hl({ note: 'remote', schemaVersion: 2 as unknown as 1, deviceId: 'devB' })
    const out = merge(hl(), local, remote)
    expect(out.readOnly).toBe('higher-schema')
    expect(out.record).toEqual(local)
    expect(out.appended).toHaveLength(0)
  })

  // #11 本地高 schema
  it('#11 本地高 schemaVersion → 正常合并', () => {
    const out = merge(hl(), hl({ note: 'L', schemaVersion: 2 as unknown as 1, updatedAt: '2026-01-03T00:00:00.000Z' }), hl({ note: 'R', updatedAt: '2026-01-02T00:00:00.000Z', deviceId: 'devB' }))
    expect(out.readOnly).toBeUndefined()
    expect(out.record.note).toBe('L')
  })

  it('★ 身份字段不一致（D23）→ 整条冲突副本，不做字段级合并', () => {
    const out = merge(hl(), hl({ note: 'L' }), hl({ note: 'R', chapterId: 'vol2-01', deviceId: 'devB', updatedAt: '2026-01-03T00:00:00.000Z' }))
    expect(out.record.chapterId).toBe('vol1-01') // 本机整条
    expect(out.record.note).toBe('L')
    expect(out.appended).toHaveLength(1)
    expect(out.appended[0].snapshot.note).toBe('R')
  })

  it('未知字段保留回写（整体胜者侧载体）', () => {
    const out = merge(hl(), hl({ updatedAt: '2026-01-02T00:00:00.000Z', custom: 'localX' }), hl({ updatedAt: '2026-01-03T00:00:00.000Z', deviceId: 'devB', custom: 'remoteX' }))
    expect((out.record as Record<string, unknown>).custom).toBe('remoteX')
  })

  it('rev=max+1；全等不合并 rev 不变', () => {
    const out = merge(hl(), hl({ rev: 3, note: 'L', updatedAt: '2026-01-02T00:00:00.000Z' }), hl({ rev: 5, note: 'R', updatedAt: '2026-01-03T00:00:00.000Z', deviceId: 'devB' }))
    expect(out.record.rev).toBe(6)
    expect(out.record.deviceId).toBe('devSelf')
    expect(out.record.updatedAt).toBe(NOW)
    const eq = merge(hl(), hl(), hl())
    expect(eq.record.rev).toBe(1)
  })

  it('★ conflicts cap 3 溢出最旧', () => {
    const existing = [1, 2, 3].map((n) => ({ deviceId: 'd', rev: n, updatedAt: NOW, keptAt: `2026-01-0${n}T00:00:00.000Z`, snapshot: { note: `old${n}`, types: [], color: 'yellow' as const, selector: hl().selector, deletedAt: null } }))
    const local = hl({ conflicts: existing, note: 'L', updatedAt: '2026-01-02T00:00:00.000Z' })
    const remote = hl({ note: 'R', updatedAt: '2026-01-03T00:00:00.000Z', deviceId: 'devB' })
    const out = merge(hl(), local, remote)
    expect(out.record.conflicts).toHaveLength(3)
    expect(out.overflow).toHaveLength(1)
    expect(out.overflow[0].snapshot.note).toBe('old1') // 最旧挤出
  })
})

describe('mergeBookmark', () => {
  it('label LWW + 冲突副本（#5）', () => {
    const out = mergeBookmark({ base: bm(), local: bm({ label: 'L', updatedAt: '2026-01-02T00:00:00.000Z' }), remote: bm({ label: 'R', updatedAt: '2026-01-03T00:00:00.000Z', deviceId: 'devB' }), selfDeviceId: 's', now: NOW })
    expect(out.record.label).toBe('R')
    expect(out.appended[0].snapshot.label).toBe('L')
  })
  it('删除 vs 未改 → 墓碑（#6）', () => {
    const out = mergeBookmark({ base: bm(), local: bm({ deletedAt: '2026-01-05T00:00:00.000Z', updatedAt: '2026-01-05T00:00:00.000Z' }), remote: bm({ deviceId: 'devB', updatedAt: '2026-01-03T00:00:00.000Z' }), selfDeviceId: 's', now: NOW })
    expect(out.record.deletedAt).toBe('2026-01-05T00:00:00.000Z')
    expect(out.appended).toHaveLength(0)
  })
})

describe('mergeProgress', () => {
  const pos = (pageId: string, over: Partial<ProgressDoc['pages'][string]> = {}) => ({
    pageId, paragraphId: 'P1', paragraphHash: 'h', offset: 0, pageProgress: 0.5, maxProgress: 0.5, updatedAt: '2026-01-01T00:00:00.000Z', ...over,
  })
  it('★ 页并集不丢页、maxProgress 单调、last 取新', () => {
    const local: ProgressDoc = { schemaVersion: 1, last: pos('vol1-01', { updatedAt: '2026-01-02T00:00:00.000Z' }), pages: { 'vol1-01': pos('vol1-01', { maxProgress: 0.8, updatedAt: '2026-01-02T00:00:00.000Z' }), 'vol1-02': pos('vol1-02') } }
    const remote: ProgressDoc = { schemaVersion: 1, last: pos('vol2-01', { updatedAt: '2026-01-03T00:00:00.000Z' }), pages: { 'vol1-01': pos('vol1-01', { maxProgress: 0.6, pageProgress: 0.9, updatedAt: '2026-01-03T00:00:00.000Z', deviceId: 'devB' }), 'vol2-01': pos('vol2-01') } }
    const out = mergeProgress(local, remote, 's')
    expect(Object.keys(out.pages).sort()).toEqual(['vol1-01', 'vol1-02', 'vol2-01'])
    expect(out.pages['vol1-01'].maxProgress).toBe(0.8)
    expect(out.pages['vol1-01'].pageProgress).toBe(0.9) // remote 较新
    expect(out.last?.pageId).toBe('vol2-01')
  })
  it('★ 同刻比 deviceId（含缺失视为 ""）', () => {
    const t = '2026-01-02T00:00:00.000Z'
    const local: ProgressDoc = { schemaVersion: 1, last: null, pages: { p: pos('p', { updatedAt: t, pageProgress: 0.1 }) } }
    const remote: ProgressDoc = { schemaVersion: 1, last: null, pages: { p: pos('p', { updatedAt: t, pageProgress: 0.9, deviceId: 'devB' }) } }
    expect(mergeProgress(local, remote, 's').pages.p.pageProgress).toBe(0.9)
  })
})

describe('mergeSettings', () => {
  const doc = (prefs: Partial<SettingsDoc['prefs']>, stamps: SettingsDoc['stamps']): SettingsDoc => ({
    schemaVersion: 1, prefs: { fontSize: 20, lineHeight: 1.9, fontFamily: 'sans', theme: 'paper', annotationTypes: [], ...prefs }, stamps,
  })
  it('逐字段 stamps 取胜者；annotationTypes 整体；缺 stamp 缺省', () => {
    const local = doc({ fontSize: 22 }, { fontSize: { t: '2026-01-02T00:00:00.000Z', d: 'devA' } })
    const remote = doc({ fontSize: 18, theme: 'dark' }, { fontSize: { t: '2026-01-03T00:00:00.000Z', d: 'devB' }, theme: { t: '2026-01-03T00:00:00.000Z', d: 'devB' } })
    const out = mergeSettings(local, remote)
    expect(out.prefs.fontSize).toBe(18) // remote 较新
    expect(out.prefs.theme).toBe('dark')
    expect(out.stamps.fontSize.d).toBe('devB')
  })
  it('同刻比 deviceId 字典序', () => {
    const t = '2026-01-02T00:00:00.000Z'
    const local = doc({ fontSize: 22 }, { fontSize: { t, d: 'devA' } })
    const remote = doc({ fontSize: 18 }, { fontSize: { t, d: 'devB' } })
    expect(mergeSettings(local, remote).prefs.fontSize).toBe(18)
  })
})

describe('mergeGraveyard', () => {
  it('★ 并集、较早 purgedAt、只增不减', () => {
    const local: GraveyardDoc = { schemaVersion: 1, entries: { a: { purgedAt: '2026-01-05T00:00:00.000Z' }, b: { purgedAt: '2026-01-01T00:00:00.000Z' } } }
    const remote: GraveyardDoc = { schemaVersion: 1, entries: { a: { purgedAt: '2026-01-03T00:00:00.000Z' }, c: { purgedAt: '2026-01-02T00:00:00.000Z' } } }
    const out = mergeGraveyard(local, remote)
    expect(Object.keys(out.entries).sort()).toEqual(['a', 'b', 'c'])
    expect(out.entries.a.purgedAt).toBe('2026-01-03T00:00:00.000Z')
    expect(isGraveyarded('a', out)).toBe(true)
    expect(isGraveyarded('z', out)).toBe(false)
  })
})