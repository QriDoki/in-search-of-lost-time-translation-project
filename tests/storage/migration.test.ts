import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import {
  clearReadingProgress,
  hydratePrefs,
  hydrateProgress,
  prefs,
  progress,
  savePosition,
  setPersistAdapter,
  type PersistAdapter,
} from '../../site/.vitepress/theme/composables/reader'
import { initUserStorage, _resetUserStorage } from '../../site/.vitepress/theme/composables/user-storage/index'
import { useUserStorage } from '../../site/.vitepress/theme/composables/user-storage/vue'
import { openDatabase } from '../../site/.vitepress/theme/composables/user-storage/db'
import type { ProgressDoc, SettingsDoc } from '../../site/.vitepress/theme/composables/user-storage/types'

const pos = (pageId: string, over: Partial<ProgressDoc['pages'][string]> = {}) => ({
  pageId, paragraphId: 'P1', paragraphHash: 'h', offset: 0, pageProgress: 0.5, maxProgress: 0.5, updatedAt: '2026-01-01T00:00:00.000Z', ...over,
})

describe('reader.ts 持久化适配器', () => {
  let calls: { progress: unknown[]; prefs: unknown[]; clear: number }
  beforeEach(() => {
    calls = { progress: [], prefs: [], clear: 0 }
    const adapter: PersistAdapter = {
      saveProgress: (p) => calls.progress.push(p),
      savePrefs: (p) => calls.prefs.push(p),
      clearProgress: () => { calls.clear += 1 },
    }
    setPersistAdapter(adapter)
    progress.pages = {}
    progress.last = null
  })

  it('savePosition 末尾接适配器（fire-and-forget）', () => {
    savePosition(pos('vol1-01', { pageProgress: 0.7 }))
    expect(calls.progress).toHaveLength(1)
    expect((calls.progress[0] as { pageId: string }).pageId).toBe('vol1-01')
    expect(progress.pages['vol1-01'].maxProgress).toBe(0.7)
  })

  it('clearReadingProgress 接适配器 clearProgress', () => {
    savePosition(pos('vol1-01'))
    clearReadingProgress()
    expect(calls.clear).toBe(1)
    expect(progress.last).toBeNull()
  })

  it('prefs watch 双写适配器 savePrefs', async () => {
    prefs.fontSize = 26
    await nextTick()
    await nextTick()
    expect(calls.prefs.length).toBeGreaterThanOrEqual(1)
  })
})

describe('hydrateProgress / hydratePrefs', () => {
  beforeEach(() => {
    progress.pages = {}
    progress.last = null
  })
  const doc = (pages: ProgressDoc['pages'], last: ProgressDoc['last'] = null): ProgressDoc => ({ schemaVersion: 1, last, pages })

  it('★ replace 整体替换（账号间不串数据，不得并集）', () => {
    progress.pages = { 'vol1-01': pos('vol1-01') }
    hydrateProgress(doc({ 'vol2-01': pos('vol2-01') }), 'replace')
    expect(Object.keys(progress.pages)).toEqual(['vol2-01']) // vol1-01 不残留
  })

  it('merge 按页 updatedAt 较新胜、maxProgress max', () => {
    progress.pages = { 'vol1-01': pos('vol1-01', { maxProgress: 0.8, updatedAt: '2026-01-01T00:00:00.000Z' }) }
    hydrateProgress(doc({ 'vol1-01': pos('vol1-01', { pageProgress: 0.9, maxProgress: 0.6, updatedAt: '2026-01-02T00:00:00.000Z' }), 'vol1-02': pos('vol1-02') }), 'merge')
    expect(progress.pages['vol1-01'].pageProgress).toBe(0.9)
    expect(progress.pages['vol1-01'].maxProgress).toBe(0.8)
    expect(progress.pages['vol1-02']).toBeTruthy()
  })

  it('hydratePrefs replace 整体替换同步字段', () => {
    const settings: SettingsDoc = { schemaVersion: 1, prefs: { fontSize: 30, lineHeight: 2.0, fontFamily: 'kai', theme: 'dark', annotationTypes: [] }, stamps: {} }
    hydratePrefs(settings, 'replace')
    expect(prefs.fontSize).toBe(30)
    expect(prefs.theme).toBe('dark')
  })
})

describe('initUserStorage 编排', () => {
  beforeEach(() => {
    _resetUserStorage()
  })

  it('IDB 可用 → ready + mode idb', async () => {
    await initUserStorage()
    const { ready, mode } = useUserStorage()
    expect(ready.value).toBe(true)
    expect(mode.value).toBe('idb')
  })

  it('★ IDB 不可用 → 降级 localStorage，阅读不中断', async () => {
    const db = await import('../../site/.vitepress/theme/composables/user-storage/db')
    const spy = vi.spyOn(db, 'openDatabase').mockRejectedValueOnce(new Error('IDB unavailable'))
    try {
      await initUserStorage()
      const { ready, mode } = useUserStorage()
      expect(ready.value).toBe(true)
      expect(mode.value).toBe('localStorage')
    } finally {
      spy.mockRestore()
    }
  })

  it('幂等：重复调用不重复初始化', async () => {
    await initUserStorage()
    const spy = vi.spyOn(await import('../../site/.vitepress/theme/composables/user-storage/db'), 'openDatabase')
    await initUserStorage()
    expect(spy).not.toHaveBeenCalled()
  })
})