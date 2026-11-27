import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ReaderConflictCard from '../../site/.vitepress/theme/components/ReaderConflictCard.vue'
import type { ConflictInfo } from '../../site/.vitepress/theme/composables/user-storage'
import { hl } from '../storage/fixtures'

vi.mock('vitepress', () => import('./vitepress-mock'))

function conflict(over: Partial<ConflictInfo> = {}): ConflictInfo {
  return {
    entity: 'highlight',
    id: 'h1',
    current: hl({ id: 'h1', note: '本机批注', color: 'yellow', updatedAt: '2026-01-01T14:20:00.000Z' }),
    copies: [
      {
        deviceId: 'devB',
        rev: 2,
        updatedAt: '2026-01-01T14:31:00.000Z',
        keptAt: '2026-01-01T14:31:00.000Z',
        snapshot: { note: '云端批注', types: [], color: 'green', selector: hl().selector, deletedAt: null },
      },
    ],
    ...over,
  } as ConflictInfo
}

describe('ReaderConflictCard（§7.4 冲突卡片矩阵）', () => {
  it('两版并排：原文 + 本机/云端批注 + 修改时间 + 1/N', () => {
    const wrapper = mount(ReaderConflictCard, { props: { conflict: conflict(), index: 0, total: 2 } })
    const text = wrapper.text()
    expect(text).toContain('摘录冲突 (1/2)')
    expect(text).toContain('原文：「很久以来」')
    expect(text).toContain('本机版本')
    expect(text).toContain('云端版本')
    expect(text).toContain('本机批注')
    expect(text).toContain('云端批注')
    expect(text).toContain('14:20')
    expect(text).toContain('14:31')
    expect(wrapper.findAll('.reader-conflict-card__version')).toHaveLength(2)
    wrapper.unmount()
  })

  it('三按钮 → emit resolve(local/remote/both)；稍后处理 → emit later', async () => {
    const wrapper = mount(ReaderConflictCard, { props: { conflict: conflict(), index: 0, total: 1 } })
    const buttons = wrapper.findAll('.reader-conflict-card__button')
    expect(buttons.map((b) => b.text())).toEqual(['保留本机版本', '保留云端版本', '两者都保留'])
    await buttons[0].trigger('click')
    await buttons[1].trigger('click')
    await buttons[2].trigger('click')
    expect(wrapper.emitted('resolve')).toEqual([['local'], ['remote'], ['both']])
    await wrapper.find('.reader-conflict-card__header button').trigger('click')
    expect(wrapper.emitted('later')).toHaveLength(1)
    wrapper.unmount()
  })

  it('删除 vs 修改：一版显示「已删除」', () => {
    const c = conflict()
    ;(c.copies[0].snapshot as { deletedAt: string | null }).deletedAt = '2026-01-01T14:31:00.000Z'
    const wrapper = mount(ReaderConflictCard, { props: { conflict: c, index: 0, total: 1 } })
    const versions = wrapper.findAll('.reader-conflict-card__version')
    expect(versions[0].text()).toContain('本机批注')
    expect(versions[1].text()).toContain('已删除')
    expect(versions[1].text()).not.toContain('云端批注')
    wrapper.unmount()
  })

  it('书签冲突：标签字段 + 标题「书签冲突」', () => {
    const c = {
      entity: 'bookmark',
      id: 'b1',
      current: { id: 'b1', schemaVersion: 1, chapterId: 'vol1-01', paragraphId: 'P000001', label: '本机标签', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T14:20:00.000Z', deletedAt: null, rev: 1, deviceId: 'devA' },
      copies: [{ deviceId: 'devB', rev: 2, updatedAt: '2026-01-01T14:31:00.000Z', keptAt: '2026-01-01T14:31:00.000Z', snapshot: { label: '云端标签', deletedAt: null } }],
    } as unknown as ConflictInfo
    const wrapper = mount(ReaderConflictCard, { props: { conflict: c, index: 1, total: 3 } })
    expect(wrapper.text()).toContain('书签冲突 (2/3)')
    expect(wrapper.text()).toContain('本机标签')
    expect(wrapper.text()).toContain('云端标签')
    wrapper.unmount()
  })

  it('色块标识两版颜色', () => {
    const wrapper = mount(ReaderConflictCard, { props: { conflict: conflict(), index: 0, total: 1 } })
    expect(wrapper.find('.reader-conflict-card__swatch--yellow').exists()).toBe(true)
    expect(wrapper.find('.reader-conflict-card__swatch--green').exists()).toBe(true)
    wrapper.unmount()
  })
})