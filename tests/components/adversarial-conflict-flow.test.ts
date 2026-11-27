/**
 * 对抗性测试 · 冲突处理端到端（interaction §7，protocol §5.4/§6.1/§7.4）。
 * 真实 sync 引擎 + fake-indexeddb（不 mock 数据层），验证组件裁决后的库内结果：
 * - 删除 vs 修改冲突必须出卡片（一版「已删除」），不静默吞掉
 * - 三裁决 DB 结果：local 丢副本 / remote rev+1 进 outbox / both 新 UUID selector 同原记录
 * - 全部解决 → toast + 自动同步触发
 * - 稍后处理期间正文按本机版本渲染
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import ReaderSyncPanel from '../../site/.vitepress/theme/components/ReaderSyncPanel.vue'
import ReaderHighlightPopover from '../../site/.vitepress/theme/components/ReaderHighlightPopover.vue'
import {
  _resetUserStorage,
  createSyncEngine,
  currentDb,
  getHighlight,
  initUserStorage,
  listHighlights,
  mergeHighlight,
  putHighlight,
  fnv1a36,
  type AuthProvider,
  type ConflictInfo,
  type GraphTransport,
  type SyncEngine,
} from '../../site/.vitepress/theme/composables/user-storage'
import { _setAccount, _setEngine } from '../../site/.vitepress/theme/composables/user-storage/vue'
import { useToasts } from '../../site/.vitepress/theme/composables/useToasts'
import { resetVitepressMock } from './vitepress-mock'
import { P1, flush, mountChapter, stubClipboard, stubMatchMedia } from './helpers'
import { hl } from '../storage/fixtures'

vi.mock('vitepress', () => import('./vitepress-mock'))

const { clear: clearToasts, toasts } = useToasts()

const SEL = { exact: '很久以来', prefix: '', suffix: '，我都是', start: { paragraphId: 'P000001', offset: 0 }, end: { paragraphId: 'P000001', offset: 4 } }
const ACCOUNT = { scope: 'ms-test', displayName: '用户', email: 'u@example.com' }

function mockAuth(): AuthProvider {
  return {
    init: async () => {},
    current: () => ACCOUNT,
    login: async () => ACCOUNT,
    logout: async () => {},
    getToken: async () => 'test-token',
    onChange: () => () => {},
  }
}

function mockTransport(): GraphTransport {
  return {
    list: async () => [],
    read: async () => null,
    write: async () => ({ eTag: 'e' }),
    remove: async () => {},
  }
}

function copy(note: string, over: Record<string, unknown> = {}) {
  return {
    deviceId: 'devB',
    rev: 2,
    updatedAt: '2026-01-02T00:00:00.000Z',
    keptAt: '2026-01-02T00:00:00.000Z',
    snapshot: { note, types: [], color: 'green' as const, selector: SEL, deletedAt: null },
    ...over,
  }
}

describe('对抗 · 冲突处理端到端（真实引擎）', () => {
  let wrappers: VueWrapper[] = []
  let engine: SyncEngine

  beforeEach(async () => {
    resetVitepressMock()
    clearToasts()
    mountChapter()
    stubMatchMedia((q) => q.includes('any-hover'))
    stubClipboard()
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })))
    _resetUserStorage()
    await initUserStorage()
    engine = createSyncEngine({ db: currentDb(), transport: mockTransport(), auth: mockAuth() })
    _setAccount(ACCOUNT)
    _setEngine(engine)
    wrappers = []
  })

  afterEach(() => {
    for (const w of wrappers) w.unmount()
    wrappers = []
    engine.dispose()
    clearToasts()
    _setAccount(null)
    _setEngine(null)
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  function mountComponent(component: unknown): VueWrapper {
    const w = mount(component as never, { attachTo: document.body })
    wrappers.push(w)
    return w
  }

  function buttonByText(text: string, root: ParentNode = document): HTMLButtonElement {
    const btn = [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.trim().includes(text))
    if (!btn) throw new Error(`button "${text}" not found`)
    return btn
  }

  async function seedLiveConflict(): Promise<void> {
    await putHighlight(hl({ id: 'h1', chapterId: 'vol1-01', paragraphId: 'P000001', textHash: fnv1a36(P1), selector: SEL, note: '本机批注', color: 'yellow', conflicts: [copy('云端批注')] }))
    await flush()
  }

  it('★ 删除 vs 修改冲突必须可见：卡片一版显示「已删除」（interaction §7；判定表 #7）', async () => {
    // 按判定表 #7 构造：本机删除（墓碑）vs 远端编辑 → 存活记录=墓碑，编辑侧入副本
    const base = hl({ id: 'h-del', chapterId: 'vol1-01', paragraphId: 'P000001', textHash: fnv1a36(P1), selector: SEL, note: '原始' })
    const localDeleted = { ...base, deletedAt: '2026-01-05T00:00:00.000Z', updatedAt: '2026-01-05T00:00:00.000Z' }
    const remoteEdited = { ...base, note: '远端编辑', updatedAt: '2026-01-06T00:00:00.000Z', deviceId: 'devB' }
    const out = mergeHighlight({ base, local: localDeleted, remote: remoteEdited, selfDeviceId: 'devA', now: '2026-01-06T01:00:00.000Z' })
    expect(out.record.deletedAt).toBeTruthy() // 前提：#7 存活记录是墓碑
    expect(out.appended).toHaveLength(1)
    await putHighlight(out.record)
    await flush()
    // 合同：冲突必须可见（状态诚实 §0.5），引擎应列出供卡片裁决
    const list = await engine.listConflicts()
    expect(list).toHaveLength(1)
    expect(list[0].current.deletedAt).toBeTruthy()
    expect(list[0].copies[0].snapshot.deletedAt).toBeNull()
    // 面板应出现冲突入口并渲染「已删除」卡片
    mountComponent(ReaderSyncPanel)
    await flush()
    expect(document.querySelector('.reader-sync-panel__conflicts')).toBeTruthy()
    buttonByText('查看').click()
    await vi.waitFor(() => expect(document.querySelector('.reader-conflict-card')).toBeTruthy(), { timeout: 2000 })
    const versions = document.querySelectorAll('.reader-conflict-card__version')
    expect(versions[0].textContent).toContain('已删除')
    expect(versions[1].textContent).toContain('远端编辑')
  })

  it('保留本机：副本丢弃，记录内容与 rev 不变（用户显式丢弃，protocol §5.4）', async () => {
    await seedLiveConflict()
    mountComponent(ReaderSyncPanel)
    await flush()
    buttonByText('查看').click()
    await vi.waitFor(() => expect(document.querySelector('.reader-conflict-card')).toBeTruthy())
    const before = await getHighlight('h1')
    buttonByText('保留本机版本').click()
    await vi.waitFor(async () => expect((await getHighlight('h1'))!.conflicts ?? []).toHaveLength(0), { timeout: 3000 })
    const after = await getHighlight('h1')
    expect(after!.note).toBe('本机批注')
    expect(after!.rev).toBe(before!.rev)
    expect(toasts.value.some((t) => t.message === '冲突已处理，正在同步')).toBe(true)
  })

  it('保留云端：副本内容作为正常编辑（rev+1，进 outbox）（protocol §5.4）', async () => {
    await seedLiveConflict()
    mountComponent(ReaderSyncPanel)
    await flush()
    buttonByText('查看').click()
    await vi.waitFor(() => expect(document.querySelector('.reader-conflict-card')).toBeTruthy())
    const before = await getHighlight('h1')
    buttonByText('保留云端版本').click()
    await vi.waitFor(async () => {
      const h = await getHighlight('h1')
      expect(h!.note).toBe('云端批注')
      expect(h!.color).toBe('green')
      expect(h!.rev).toBe(before!.rev + 1)
      expect(h!.conflicts ?? []).toHaveLength(0)
    }, { timeout: 3000 })
    const op = await currentDb().outbox.where('[entity+id]').equals(['highlight', 'h1']).first()
    expect(op!.type).toBe('put')
  })

  it('★ 两者都保留：新 UUID 记录，selector/锚点同原记录，内容取副本（protocol §5.4/F8）', async () => {
    await seedLiveConflict()
    mountComponent(ReaderSyncPanel)
    await flush()
    buttonByText('查看').click()
    await vi.waitFor(() => expect(document.querySelector('.reader-conflict-card')).toBeTruthy())
    buttonByText('两者都保留').click()
    await vi.waitFor(async () => expect(await listHighlights()).toHaveLength(2), { timeout: 3000 })
    const rows = await listHighlights()
    const original = rows.find((r) => r.id === 'h1')!
    const created = rows.find((r) => r.id !== 'h1')!
    expect(created.id).not.toBe('h1')
    expect(created.note).toBe('云端批注')
    expect(created.color).toBe('green')
    expect(created.deletedAt).toBeNull()
    expect(created.selector).toEqual(original.selector)
    expect(created.paragraphId).toBe(original.paragraphId)
    expect(created.textHash).toBe(original.textHash)
    expect(created.chapterId).toBe(original.chapterId)
    expect(original.conflicts ?? []).toHaveLength(0)
    expect(original.note).toBe('本机批注')
    // 两条都进 outbox
    const op = await currentDb().outbox.where('[entity+id]').equals(['highlight', created.id]).first()
    expect(op!.type).toBe('put')
  })

  it('1/N 迭代：两条冲突逐条处理，全部解决 → toast + 冲突态消除（interaction §7）', async () => {
    await putHighlight(hl({ id: 'h1', chapterId: 'vol1-01', paragraphId: 'P000001', textHash: fnv1a36(P1), selector: SEL, note: '甲', conflicts: [copy('云甲')] }))
    await putHighlight(hl({ id: 'h2', chapterId: 'vol1-01', paragraphId: 'P000001', textHash: fnv1a36(P1), selector: SEL, note: '乙', conflicts: [copy('云乙')] }))
    await flush()
    mountComponent(ReaderSyncPanel)
    await flush()
    expect(document.querySelector('.reader-sync-panel__conflicts')!.textContent).toContain('2 条冲突待处理')
    buttonByText('查看').click()
    await vi.waitFor(() => expect(document.querySelector('.reader-conflict-card__header')!.textContent).toContain('(1/2)'))
    buttonByText('保留本机版本').click()
    await vi.waitFor(() => expect(document.querySelector('.reader-conflict-card__header')!.textContent).toContain('(2/2)'), { timeout: 3000 })
    buttonByText('保留云端版本').click()
    await vi.waitFor(() => expect(toasts.value.some((t) => t.message === '冲突已处理，正在同步')).toBe(true), { timeout: 3000 })
    expect(document.querySelector('.reader-conflict-card')).toBeNull()
    expect((await engine.listConflicts())).toHaveLength(0)
  })

  it('稍后处理：卡片关闭，正文仍按本机版本渲染 + 弹层「冲突待处理」（interaction §7）', async () => {
    await seedLiveConflict()
    mountComponent(ReaderSyncPanel)
    const popover = mountComponent(ReaderHighlightPopover)
    void popover
    await flush()
    buttonByText('查看').click()
    await vi.waitFor(() => expect(document.querySelector('.reader-conflict-card')).toBeTruthy())
    buttonByText('稍后处理').click()
    await vi.waitFor(() => expect(document.querySelector('.reader-conflict-card')).toBeNull())
    // 冲突仍在库中，正文按本机版本（黄色）渲染
    expect((await engine.listConflicts())).toHaveLength(1)
    await vi.waitFor(() => expect(document.querySelector('mark.reader-highlight--yellow')).toBeTruthy(), { timeout: 3000 })
    expect(document.querySelector('mark.reader-highlight--green')).toBeNull()
    window.dispatchEvent(new CustomEvent('reader-highlight:open', { detail: { id: 'h1' } }))
    await vi.waitFor(() => expect(document.getElementById('reader-highlight-popover')).toBeTruthy())
    expect(document.getElementById('reader-highlight-popover')!.textContent).toContain('冲突待处理')
  })
})
