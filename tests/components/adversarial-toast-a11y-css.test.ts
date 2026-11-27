/**
 * 对抗性测试 · toast 计时体系 / 无障碍抽查 / 静态合同（interaction §12，protocol §6.2/§6.4/§7.1/§7.4）。
 * toast：多计时器独立、runAction 幂等、多 action 互不串。
 * 无障碍：listbox/option/activedescendant、dialog aria-labelledby、冲突卡片 role/aria、重锚横幅 role。
 * 静态：z-index 层序（D10）、5 色 token×4 主题、reduced-motion、触屏 44px+safe-area、
 *       底部抽屉、分享呼吸动效参数、package.json 无 Playwright。
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import ReaderToast from '../../site/.vitepress/theme/components/ReaderToast.vue'
import ReaderExcerpts from '../../site/.vitepress/theme/components/ReaderExcerpts.vue'
import ReaderConflictCard from '../../site/.vitepress/theme/components/ReaderConflictCard.vue'
import ReaderDataTools from '../../site/.vitepress/theme/components/ReaderDataTools.vue'
import ReaderHighlightPopover from '../../site/.vitepress/theme/components/ReaderHighlightPopover.vue'
import { useToasts } from '../../site/.vitepress/theme/composables/useToasts'
import {
  _resetUserStorage,
  initUserStorage,
  putHighlight,
  fnv1a36,
  type ConflictInfo,
} from '../../site/.vitepress/theme/composables/user-storage'
import { resetVitepressMock } from './vitepress-mock'
import { P1, flush, mountChapter, para, stubClipboard, stubMatchMedia } from './helpers'
import { hl } from '../storage/fixtures'

vi.mock('vitepress', () => import('./vitepress-mock'))

const { push, clear: clearToasts, toasts, runAction } = useToasts()

describe('对抗 · toast 计时体系', () => {
  let wrapper: VueWrapper | null = null

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    clearToasts()
    wrapper = mount(ReaderToast, { attachTo: document.body })
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    clearToasts()
    vi.useRealTimers()
  })

  it('多 toast 计时器独立：后 push 不重置先 push 的窗口（interaction §0.4）', async () => {
    push('甲', { action: { label: '撤销', run: () => {} } }) // 5s
    await vi.advanceTimersByTimeAsync(4000)
    push('乙') // 4s
    await vi.advanceTimersByTimeAsync(1000) // t=5000：甲到期，乙仍在
    expect(toasts.value.map((t) => t.message)).toEqual(['乙'])
    await vi.advanceTimersByTimeAsync(3000) // t=8000：乙到期
    expect(toasts.value).toHaveLength(0)
  })

  it('runAction 幂等：重复调用只执行一次（撤销不重复重建）', async () => {
    const run = vi.fn()
    const id = push('已删除摘录', { action: { label: '撤销', run } })
    runAction(id)
    runAction(id)
    expect(run).toHaveBeenCalledTimes(1)
    expect(toasts.value).toHaveLength(0)
  })

  it('两条 action toast：点甲的撤销不执行乙的回调', async () => {
    const runA = vi.fn()
    const runB = vi.fn()
    push('删除甲', { action: { label: '撤销', run: runA } })
    push('删除乙', { action: { label: '撤销', run: runB } })
    await nextTick()
    const actions = document.querySelectorAll<HTMLButtonElement>('.reader-toast__action')
    expect(actions).toHaveLength(2)
    actions[0].click()
    await nextTick()
    expect(runA).toHaveBeenCalledTimes(1)
    expect(runB).not.toHaveBeenCalled()
    expect(toasts.value.map((t) => t.message)).toEqual(['删除乙'])
  })
})

describe('对抗 · 无障碍抽查（interaction §12）', () => {
  let wrappers: VueWrapper[] = []

  beforeEach(async () => {
    resetVitepressMock()
    clearToasts()
    mountChapter()
    stubMatchMedia((q) => q.includes('any-hover'))
    stubClipboard()
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })))
    _resetUserStorage()
    await initUserStorage()
    wrappers = []
  })

  afterEach(() => {
    for (const w of wrappers) w.unmount()
    wrappers = []
    clearToasts()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  function mountComponent(component: unknown, props?: Record<string, unknown>): VueWrapper {
    const w = mount(component as never, { attachTo: document.body, props } as never)
    wrappers.push(w)
    return w
  }

  it('摘录列表：combobox/listbox/option + aria-activedescendant 联动', async () => {
    await putHighlight(hl({ id: 'h1', chapterId: 'vol1-01', paragraphId: 'P000001', textHash: fnv1a36(P1), selector: { exact: '很久以来', prefix: '', suffix: '，我都是', start: { paragraphId: 'P000001', offset: 0 }, end: { paragraphId: 'P000001', offset: 4 } } }))
    mountComponent(ReaderExcerpts)
    await flush()
    const input = document.querySelector<HTMLInputElement>('.reader-excerpts__search')!
    expect(input.getAttribute('role')).toBe('combobox')
    expect(input.getAttribute('aria-controls')).toBe('reader-excerpts-list')
    const list = document.getElementById('reader-excerpts-list')!
    expect(list.getAttribute('role')).toBe('listbox')
    const option = list.querySelector('[role="option"]')!
    expect(option.getAttribute('aria-selected')).toBe('true')
    expect(input.getAttribute('aria-activedescendant')).toBe(option.id)
  })

  it('批量删除对话框 aria-labelledby 指向标题（原生 dialog）', async () => {
    mountComponent(ReaderExcerpts)
    await flush()
    const dialog = document.getElementById('reader-batch-title')!.closest('dialog')!
    expect(dialog.getAttribute('aria-labelledby')).toBe('reader-batch-title')
    expect(document.getElementById('reader-batch-title')!.textContent).toBe('批量删除')
  })

  it('导入对话框 aria-labelledby 指向标题', async () => {
    mountComponent(ReaderDataTools)
    await flush()
    const dialog = document.getElementById('reader-import-title')!.closest('dialog')!
    expect(dialog.getAttribute('aria-labelledby')).toBe('reader-import-title')
    expect(document.getElementById('reader-import-title')!.textContent).toBe('导入 JSON 备份')
  })

  it('冲突卡片：role=group + aria-label 含 1/N；两版本标题区分（interaction §12）', () => {
    const conflict: ConflictInfo = {
      entity: 'highlight',
      id: 'h1',
      current: hl({ id: 'h1', note: '本机' }),
      copies: [{ deviceId: 'devB', rev: 2, updatedAt: '2026-01-02T00:00:00.000Z', keptAt: '2026-01-02T00:00:00.000Z', snapshot: { note: '云端', types: [], color: 'green', selector: hl().selector, deletedAt: null } }],
    }
    const w = mountComponent(ReaderConflictCard, { conflict, index: 0, total: 2 })
    const card = w.find('.reader-conflict-card')
    expect(card.attributes('role')).toBe('group')
    expect(card.attributes('aria-label')).toBe('摘录冲突 1/2')
    const versions = w.findAll('.reader-conflict-card__version')
    expect(versions[0].attributes('aria-label')).toBe('本机版本')
    expect(versions[1].attributes('aria-label')).toBe('云端版本')
    expect(w.findAll('.reader-conflict-card__button').map((b) => b.text())).toEqual(['保留本机版本', '保留云端版本', '两者都保留'])
  })

  it('重锚横幅 role=dialog + aria-label；对照卡可折叠（interaction §9.2/§12）', async () => {
    await putHighlight(hl({ id: 'dead', chapterId: 'vol1-01', paragraphId: 'P000001', textHash: 'stale', selector: { exact: '不相干文', prefix: '', suffix: '', start: { paragraphId: 'P000001', offset: 0 }, end: { paragraphId: 'P000001', offset: 4 } } }))
    mountComponent(ReaderHighlightPopover)
    await vi.waitFor(() => expect(para('P000001').classList.contains('reader-highlight-degraded')).toBe(true), { timeout: 3000 })
    window.dispatchEvent(new CustomEvent('reader-highlight:open', { detail: { id: 'dead' } }))
    await vi.waitFor(() => expect(document.getElementById('reader-highlight-popover')).toBeTruthy())
    ;[...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.includes('重新关联'))!.click()
    await vi.waitFor(() => expect(document.querySelector('.reader-reanchor-banner')).toBeTruthy())
    const banner = document.querySelector('.reader-reanchor-banner')!
    expect(banner.getAttribute('role')).toBe('dialog')
    expect(banner.getAttribute('aria-label')).toBe('重新关联摘录')
    expect(banner.querySelector('details.reader-reanchor-banner__compare')).toBeTruthy()
    expect(banner.querySelector('blockquote')!.textContent).toBe('不相干文')
  })
})

/* ------------------------------------------------------------------ */
/* 静态合同：CSS 层序 / token / 动效 / 触屏 / 依赖卫生                    */
/* ------------------------------------------------------------------ */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const css = readFileSync(resolve(ROOT, 'site/.vitepress/theme/custom.css'), 'utf8')

/** 提取选择器对应的所有规则块（含媒体查询内重复出现）。 */
function blocks(selector: string): string[] {
  const out: string[] = []
  const needle = `${selector} {`
  let from = 0
  for (;;) {
    const idx = css.indexOf(needle, from)
    if (idx < 0) break
    let depth = 1
    let i = idx + needle.length
    while (i < css.length && depth > 0) {
      if (css[i] === '{') depth += 1
      else if (css[i] === '}') depth -= 1
      i += 1
    }
    out.push(css.slice(idx + needle.length, i - 1))
    from = i
  }
  return out
}

describe('静态合同 · custom.css（protocol §6.2/§6.4，D10）', () => {
  it('z-index 层序：新组件对号入座，现有值不改', () => {
    expect(blocks('.reader-selection-toolbar').some((b) => /z-index:\s*62/.test(b))).toBe(true)
    expect(blocks('.reader-share-landing').some((b) => /z-index:\s*63/.test(b))).toBe(true)
    expect(blocks('.reader-toast-stack').some((b) => /z-index:\s*65/.test(b))).toBe(true)
    expect(blocks('.reader-highlight-popover').some((b) => /z-index:\s*61/.test(b))).toBe(true)
    // 现有层序（D10 修正表）
    expect(blocks('.reader-annotation-backdrop').some((b) => /z-index:\s*60/.test(b))).toBe(true)
    expect(blocks('.reader-annotation-popover').some((b) => /z-index:\s*61/.test(b))).toBe(true)
    expect(blocks('.reader-backdrop').some((b) => /z-index:\s*47/.test(b))).toBe(true)
    expect(blocks('.reader-panel').some((b) => /z-index:\s*48/.test(b))).toBe(true)
    expect(blocks('.reader-note-select__options').some((b) => /z-index:\s*100/.test(b))).toBe(true)
  })

  it('5 色高亮 token × 4 主题块各一份（protocol §6.4）', () => {
    for (const color of ['yellow', 'green', 'blue', 'pink', 'purple']) {
      const re = new RegExp(`--reader-highlight-${color}:`, 'g')
      expect((css.match(re) ?? []).length, color).toBe(4)
    }
  })

  it('现有 token 零删除：关键旧 token 仍在（grep 对照）', () => {
    for (const token of ['--reader-accent', '--reader-accent-soft', '--reader-panel-shadow', '--reader-serif', '--reader-sans']) {
      expect(css.includes(`${token}:`), token).toBe(true)
    }
  })

  it('跳转闪烁：脉冲 2 次约 1.2s；reduced-motion 改静态描边（interaction §8.3）', () => {
    expect(blocks('.reader-flash').some((b) => /animation:\s*reader-pulse\s+0\.6s\s+ease\s+2/.test(b))).toBe(true)
    const reduced = blocks('.reader-flash').find((b) => /animation:\s*none/.test(b))
    expect(reduced).toBeTruthy()
    expect(reduced).toMatch(/outline:\s*2px solid/)
  })

  it('分享临时高亮：2.5s 呼吸（1.25s×2）后常驻；reduced-motion 关闭动画（interaction §8.2）', () => {
    const share = blocks('.vp-doc mark[data-reader-share]')
    expect(share.some((b) => /animation:\s*reader-share-breathe\s+1\.25s\s+ease\s+2/.test(b))).toBe(true)
    expect(share.some((b) => /animation:\s*none/.test(b))).toBe(true)
  })

  it('触屏底部动作栏：固定底部 + safe-area + 目标 ≥44px（interaction §2.1/§12）', () => {
    const touch = blocks('.reader-selection-toolbar--touch')
    expect(touch.some((b) => /bottom:\s*0/.test(b) && /env\(safe-area-inset-bottom\)/.test(b))).toBe(true)
    expect(blocks('.reader-selection-toolbar--touch .reader-selection-toolbar__color').some((b) => /width:\s*44px/.test(b) && /height:\s*44px/.test(b))).toBe(true)
    expect(blocks('.reader-selection-toolbar--touch .reader-selection-toolbar__action').some((b) => /min-height:\s*44px/.test(b) && /min-width:\s*44px/.test(b))).toBe(true)
  })

  it('触屏不显示页边快捷添加（避免误触）；已 bookmark 常驻保留（interaction §4）', () => {
    const idx = css.indexOf('@media (any-hover: none)')
    expect(idx).toBeGreaterThan(-1)
    const region = css.slice(idx, idx + 400)
    expect(region).toContain('.reader-bookmark-toggle:not(.is-bookmarked)')
    expect(region).toMatch(/display:\s*none/)
  })

  it('移动端 <768px 新面板全宽底部抽屉 + 拖拽把手（interaction §1.2）', () => {
    const idx = css.indexOf('@media (max-width: 767px)')
    expect(idx).toBeGreaterThan(-1)
    const region = css.slice(idx)
    expect(region).toContain('.reader-panel--excerpts')
    expect(region).toContain('.reader-panel--sync')
    expect(region).toMatch(/width:\s*100%/)
    expect(region).toContain('.reader-panel__handle')
  })
})

describe('静态合同 · 依赖卫生（protocol §7.1/D7）', () => {
  it('package.json 无 Playwright；测试栈在 devDependencies', () => {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    const all = { ...pkg.dependencies, ...pkg.devDependencies }
    expect(Object.keys(all).filter((k) => /playwright/i.test(k))).toEqual([])
    for (const dep of ['vitest', 'happy-dom', '@vue/test-utils', 'fake-indexeddb', '@vitejs/plugin-vue']) {
      expect(pkg.devDependencies?.[dep], dep).toBeTruthy()
    }
  })
})
