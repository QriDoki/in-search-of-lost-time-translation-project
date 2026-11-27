/**
 * 对抗性测试 · merge.ts —— 断言依据是协议，不是实现。
 * 协议 §5.4 判定表 #1–#11、补充规则；§3.1 全局不变量；D23；data-model §8。
 * 每用例注释引用协议条文。败者副本永不静默丢（不变量 9）是贯穿主线。
 */
import { describe, expect, it } from 'vitest'
import {
  isGraveyarded,
  mergeBookmark,
  mergeGraveyard,
  mergeHighlight,
  mergeProgress,
  mergeSettings,
  type MergeInput,
} from '../../site/.vitepress/theme/composables/user-storage/merge'
import type {
  ConflictCopy,
  GraveyardDoc,
  Highlight,
  HighlightSnapshot,
  ProgressDoc,
  ReadingPosition,
  SettingsDoc,
} from '../../site/.vitepress/theme/composables/user-storage/types'
import { deepEqual } from '../../site/.vitepress/theme/composables/user-storage/util'
import { hl, bm, NOW } from './fixtures'

const T0 = '2026-01-01T00:00:00.000Z'
const T1 = '2026-01-02T00:00:00.000Z'
const T2 = '2026-01-03T00:00:00.000Z'
const SELF = 'self-device'

function input(over: Partial<MergeInput<Highlight>>): MergeInput<Highlight> {
  return { base: hl(), local: hl(), remote: hl(), selfDeviceId: SELF, now: NOW, ...over }
}

/** 判定表 #1–#5 的逐字段驱动：base 值 b，本地改 l，远端改 r。 */
function fieldCase(field: 'note' | 'color', b: string, l: string, r: string) {
  const base = hl({ [field]: b } as Partial<Highlight>)
  const local = hl({ [field]: l, updatedAt: T1, deviceId: 'devL' } as Partial<Highlight>)
  const remote = hl({ [field]: r, updatedAt: T2, deviceId: 'devR' } as Partial<Highlight>)
  return mergeHighlight(input({ base, local, remote }))
}

describe('判定表 #1–#4（协议 §5.4）', () => {
  it('#1 两侧均未改（相对 base）→ 取 base 值', () => {
    const base = hl({ note: 'base-note', color: 'green' })
    // 两侧 updatedAt/deviceId 不同但内容字段与 base 全等 → 字段取 base
    const local = hl({ note: 'base-note', color: 'green', updatedAt: T1, deviceId: 'devL' })
    const remote = hl({ note: 'base-note', color: 'green', updatedAt: T2, deviceId: 'devR' })
    const out = mergeHighlight(input({ base, local, remote }))
    expect(out.record.note).toBe('base-note')
    expect(out.record.color).toBe('green')
    expect(out.appended).toHaveLength(0)
  })

  it('#2 仅本地改 → 取本地（远端 updatedAt 更新也不影响单侧修改）', () => {
    const out = fieldCase('note', 'b', 'local-only', 'b')
    // local.updatedAt=T1 < remote.updatedAt=T2，但远端未改该字段 → #2 取本地
    expect(out.record.note).toBe('local-only')
    expect(out.appended).toHaveLength(0)
  })

  it('#3 仅远端改 → 取远端', () => {
    const out = fieldCase('note', 'b', 'b', 'remote-only')
    expect(out.record.note).toBe('remote-only')
    expect(out.appended).toHaveLength(0)
  })

  it('#4 两侧改且值相同 → 取该值，无冲突副本', () => {
    const out = fieldCase('note', 'b', 'same', 'same')
    expect(out.record.note).toBe('same')
    expect(out.appended).toHaveLength(0)
  })

  it('#1–#4 对 color 字段同样成立', () => {
    expect(fieldCase('color', 'yellow', 'blue', 'yellow').record.color).toBe('blue') // #2
    expect(fieldCase('color', 'yellow', 'yellow', 'blue').record.color).toBe('blue') // #3
    expect(fieldCase('color', 'yellow', 'blue', 'blue').record.color).toBe('blue') // #4
    expect(fieldCase('color', 'yellow', 'yellow', 'yellow').appended).toHaveLength(0) // #1
  })

  it('空字符串是合法值：#2 note="" 覆盖 base 非空', () => {
    const out = fieldCase('note', '有批注', '', '有批注')
    expect(out.record.note).toBe('')
    expect(out.appended).toHaveLength(0)
  })
})

describe('判定表 #5：两侧改且异值（协议 §5.4，不变量 9/10）', () => {
  it('updatedAt 较新者胜（远端新）', () => {
    const out = fieldCase('note', 'b', '旧设备改的', '新设备改的')
    expect(out.record.note).toBe('新设备改的')
  })

  it('updatedAt 较新者胜（本地新，即便远端 deviceId 字典序更大）', () => {
    const base = hl({ note: 'b' })
    const local = hl({ note: '本地新', updatedAt: T2, deviceId: 'aaa' })
    const remote = hl({ note: '远端旧', updatedAt: T1, deviceId: 'zzz' })
    const out = mergeHighlight(input({ base, local, remote }))
    expect(out.record.note).toBe('本地新')
  })

  it('★ 同毫秒时间戳 → deviceId 字典序大者胜（远端 devZ > 本地 devA）', () => {
    const base = hl({ note: 'b' })
    const local = hl({ note: '本地', updatedAt: T1, deviceId: 'devA' })
    const remote = hl({ note: '远端', updatedAt: T1, deviceId: 'devZ' })
    const out = mergeHighlight(input({ base, local, remote }))
    expect(out.record.note).toBe('远端')
  })

  it('★ 同刻 deviceId 字典序（本地 devZ > 远端 devA）', () => {
    const base = hl({ note: 'b' })
    const local = hl({ note: '本地', updatedAt: T1, deviceId: 'devZ' })
    const remote = hl({ note: '远端', updatedAt: T1, deviceId: 'devA' })
    const out = mergeHighlight(input({ base, local, remote }))
    expect(out.record.note).toBe('本地')
  })

  it('deviceId 字典序按 code unit（小写 a > 大写 Z，不是忽略大小写）', () => {
    const base = hl({ note: 'b' })
    const local = hl({ note: '本地', updatedAt: T1, deviceId: 'a' })
    const remote = hl({ note: '远端', updatedAt: T1, deviceId: 'Z' })
    const out = mergeHighlight(input({ base, local, remote }))
    expect(out.record.note).toBe('本地') // 'a'(97) > 'Z'(90)
  })

  it('★ 败者内容字段 → ConflictCopy，含败者 deviceId/rev/updatedAt 与 keptAt=now', () => {
    const base = hl({ note: 'b' })
    const local = hl({ note: '败者本地', updatedAt: T1, deviceId: 'devLoser', rev: 4 })
    const remote = hl({ note: '胜者远端', updatedAt: T2, deviceId: 'devWinner', rev: 9 })
    const out = mergeHighlight(input({ base, local, remote }))
    expect(out.record.note).toBe('胜者远端')
    expect(out.appended).toHaveLength(1)
    const copy = out.appended[0]
    expect(copy.deviceId).toBe('devLoser')
    expect(copy.rev).toBe(4)
    expect(copy.updatedAt).toBe(T1)
    expect(copy.keptAt).toBe(NOW)
    expect(copy.snapshot.note).toBe('败者本地')
    // snapshot 字段集 = Pick<Highlight,'note'|'types'|'color'|'selector'|'deletedAt'>（§3）
    expect(Object.keys(copy.snapshot).sort()).toEqual(['color', 'deletedAt', 'note', 'selector', 'types'])
    expect(out.record.conflicts).toHaveLength(1)
  })

  it('★ 时钟不可信（不变量 10）：快钟设备 updatedAt 更大仍按判定表裁决，败者不丢', () => {
    const base = hl({ note: 'b' })
    const local = hl({ note: '慢钟真值', updatedAt: '2020-01-01T00:00:00.000Z', deviceId: 'devSlow' })
    const remote = hl({ note: '快钟篡改', updatedAt: '2099-01-01T00:00:00.000Z', deviceId: 'devFast' })
    const out = mergeHighlight(input({ base, local, remote }))
    expect(out.record.note).toBe('快钟篡改') // updatedAt 比较是合并规则一部分
    expect(out.appended).toHaveLength(1) // 但败者永不静默丢
    expect(out.appended[0].snapshot.note).toBe('慢钟真值')
  })

  it('types 数组整体参与 #5（元素级不拆）', () => {
    const base = hl({ types: [] })
    const local = hl({ types: ['🔤'], updatedAt: T1, deviceId: 'devL' })
    const remote = hl({ types: ['📚'], updatedAt: T2, deviceId: 'devR' })
    const out = mergeHighlight(input({ base, local, remote }))
    expect(out.record.types).toEqual(['📚'])
    expect(out.appended[0].snapshot.types).toEqual(['🔤'])
  })
})

describe('anchorBundle 整体字段（D23 / data-model §8.1）', () => {
  const bundle = (exact: string, hash: string, rev: string) => ({
    selector: { ...hl().selector, exact, end: { paragraphId: 'P000001', offset: exact.length } },
    textHash: hash,
    revision: rev,
  })

  it('★ selector/textHash/revision 整体参与合并，不拆字段：local 改 selector、remote 改 revision → 冲突，胜者整包', () => {
    const b0 = bundle('很久以来', 'h0', 'v0')
    const bl = bundle('很久以', 'h0', 'v0') // 本地只改 selector
    const br = bundle('很久以来', 'h0', 'v9') // 远端只改 revision
    const base = hl({ selector: b0.selector, textHash: b0.textHash, revision: b0.revision })
    const local = hl({ selector: bl.selector, textHash: bl.textHash, revision: bl.revision, updatedAt: T2, deviceId: 'devL' })
    const remote = hl({ selector: br.selector, textHash: br.textHash, revision: br.revision, updatedAt: T1, deviceId: 'devR' })
    const out = mergeHighlight(input({ base, local, remote }))
    // 两侧都改了 anchorBundle 且异值 → #5，本地 updatedAt 新胜
    expect(out.record.selector.exact).toBe('很久以')
    expect(out.record.revision).toBe('v0') // 不得把远端 revision 拆进来
    expect(out.record.textHash).toBe('h0')
    expect(out.appended).toHaveLength(1)
    expect(out.appended[0].snapshot.selector.exact).toBe('很久以来')
  })

  it('单侧改 anchorBundle → 整包取修改侧（#2/#3）', () => {
    const b0 = bundle('很久以来', 'h0', 'v0')
    const br = bundle('变了', 'h1', 'v1')
    const base = hl({ selector: b0.selector, textHash: b0.textHash, revision: b0.revision })
    const local = hl({ selector: b0.selector, textHash: b0.textHash, revision: b0.revision, updatedAt: T1 })
    const remote = hl({ selector: br.selector, textHash: br.textHash, revision: br.revision, updatedAt: T2 })
    const out = mergeHighlight(input({ base, local, remote }))
    expect(out.record.selector.exact).toBe('变了')
    expect(out.record.textHash).toBe('h1')
    expect(out.record.revision).toBe('v1')
    expect(out.appended).toHaveLength(0)
  })
})

describe('判定表 #6–#8：删除态优先于 #5（协议 §5.4 补充规则）', () => {
  it('#6 一侧删除、另一侧未改内容 → 墓碑生效，无冲突副本', () => {
    const base = hl({ note: 'n' })
    const local = hl({ note: 'n', deletedAt: T1, updatedAt: T1, deviceId: 'devDel' })
    const remote = hl({ note: 'n', updatedAt: T2, deviceId: 'devLive' })
    const out = mergeHighlight(input({ base, local, remote }))
    expect(out.record.deletedAt).toBe(T1)
    expect(out.appended).toHaveLength(0)
  })

  it('#6 删除侧删前改过内容、另一侧未改 → 内容取删除侧（#2），仍无副本', () => {
    const base = hl({ note: 'n' })
    const local = hl({ note: '删前改的', deletedAt: T1, updatedAt: T1 })
    const remote = hl({ note: 'n', updatedAt: T2 })
    const out = mergeHighlight(input({ base, local, remote }))
    expect(out.record.deletedAt).toBe(T1)
    expect(out.record.note).toBe('删前改的')
    expect(out.appended).toHaveLength(0)
  })

  it('★ #7 一侧删除、另一侧改了内容 → 存活记录=删除侧整条（含墓碑），编辑侧入副本且 snapshot.deletedAt=null', () => {
    const base = hl({ note: 'n', color: 'yellow' })
    const local = hl({ note: 'n', color: 'yellow', deletedAt: T1, updatedAt: T1, deviceId: 'devDel', rev: 2 })
    const remote = hl({ note: '编辑侧新批注', color: 'blue', updatedAt: T2, deviceId: 'devEdit', rev: 5 })
    const out = mergeHighlight(input({ base, local, remote }))
    // 删除侧整条存活——即便编辑侧 updatedAt 更新
    expect(out.record.deletedAt).toBe(T1)
    expect(out.record.note).toBe('n')
    expect(out.record.color).toBe('yellow')
    expect(out.appended).toHaveLength(1)
    expect(out.appended[0].snapshot.note).toBe('编辑侧新批注')
    expect(out.appended[0].snapshot.color).toBe('blue')
    expect(out.appended[0].snapshot.deletedAt).toBeNull()
    expect(out.appended[0].deviceId).toBe('devEdit')
    expect(out.appended[0].rev).toBe(5)
  })

  it('#7 反向：远端删除、本地编辑 → 远端墓碑存活，本地编辑入副本', () => {
    const base = hl({ note: 'n' })
    const local = hl({ note: '本地编辑', updatedAt: T2, deviceId: 'devEdit' })
    const remote = hl({ note: 'n', deletedAt: T1, updatedAt: T1, deviceId: 'devDel' })
    const out = mergeHighlight(input({ base, local, remote }))
    expect(out.record.deletedAt).toBe(T1)
    expect(out.record.note).toBe('n')
    expect(out.appended[0].snapshot.note).toBe('本地编辑')
    expect(out.appended[0].snapshot.deletedAt).toBeNull()
  })

  it('★ #8 两侧都删除 → deletedAt 取较早者（与 updatedAt 胜负无关）', () => {
    const base = hl()
    const local = hl({ deletedAt: T2, updatedAt: T2, deviceId: 'devLate' }) // 删得晚
    const remote = hl({ deletedAt: T0, updatedAt: T1, deviceId: 'devEarly' }) // 删得早
    const out = mergeHighlight(input({ base, local, remote }))
    expect(out.record.deletedAt).toBe(T0)
  })

  it('#8 双删且内容异值 → 内容仍按 #5 合并，败者入副本（snapshot.deletedAt 保留败者墓碑）', () => {
    const base = hl({ note: 'n' })
    const local = hl({ note: '甲', deletedAt: T1, updatedAt: T1, deviceId: 'devA' })
    const remote = hl({ note: '乙', deletedAt: T0, updatedAt: T2, deviceId: 'devB' })
    const out = mergeHighlight(input({ base, local, remote }))
    expect(out.record.deletedAt).toBe(T0)
    expect(out.record.note).toBe('乙') // updatedAt T2 新
    expect(out.appended).toHaveLength(1)
    expect(out.appended[0].snapshot.note).toBe('甲')
    expect(out.appended[0].snapshot.deletedAt).toBe(T1)
  })

  it('#7 优先于 #5：编辑侧 updatedAt 再新也不能复活墓碑', () => {
    const base = hl({ note: 'n' })
    const local = hl({ note: 'n', deletedAt: T0, updatedAt: T0 })
    const remote = hl({ note: '很新的编辑', updatedAt: '2099-12-31T00:00:00.000Z' })
    const out = mergeHighlight(input({ base, local, remote }))
    expect(out.record.deletedAt).toBe(T0)
    expect(out.record.note).toBe('n')
  })
})

describe('判定表 #9：base 缺失（导入路径，协议 §5.4 / data-model §9）', () => {
  it('★ 值相同 → 保留，无副本', () => {
    const local = hl({ note: 'same', updatedAt: T1, deviceId: 'devL' })
    const remote = hl({ note: 'same', updatedAt: T2, deviceId: 'devR' })
    const out = mergeHighlight(input({ base: null, local, remote }))
    expect(out.record.note).toBe('same')
    expect(out.appended).toHaveLength(0)
  })

  it('★ 值不同 → 按 #5（两侧视为修改即冲突副本），updatedAt 新者胜', () => {
    const local = hl({ note: '本地', updatedAt: T1, deviceId: 'devL' })
    const remote = hl({ note: '导入', updatedAt: T2, deviceId: 'devR' })
    const out = mergeHighlight(input({ base: null, local, remote }))
    expect(out.record.note).toBe('导入')
    expect(out.appended).toHaveLength(1)
    expect(out.appended[0].snapshot.note).toBe('本地')
  })

  it('base 缺失同刻 → deviceId 字典序裁决，败者不丢', () => {
    const local = hl({ note: '本地', updatedAt: T1, deviceId: 'devA' })
    const remote = hl({ note: '导入', updatedAt: T1, deviceId: 'devZ' })
    const out = mergeHighlight(input({ base: null, local, remote }))
    expect(out.record.note).toBe('导入')
    expect(out.appended[0].snapshot.note).toBe('本地')
  })

  it('base 缺失 + 一侧删除一侧编辑 → 仍走 #7（删除态优先）', () => {
    const local = hl({ deletedAt: T1, updatedAt: T1 })
    const remote = hl({ note: '导入编辑', updatedAt: T2 })
    const out = mergeHighlight(input({ base: null, local, remote }))
    expect(out.record.deletedAt).toBe(T1)
    expect(out.appended).toHaveLength(1)
    expect(out.appended[0].snapshot.deletedAt).toBeNull()
  })
})

describe('判定表 #10/#11：schemaVersion（协议 §5.4，不变量 8）', () => {
  it('★ #10 远端更高 → readOnly:higher-schema，不合并、record=local 原样（rev 不变）', () => {
    const local = hl({ note: '本地', rev: 3, updatedAt: T1 })
    const remote = hl({ note: '远端新格式', schemaVersion: 2 as 1, rev: 9, updatedAt: T2 })
    const out = mergeHighlight(input({ base: hl(), local, remote }))
    expect(out.readOnly).toBe('higher-schema')
    expect(out.record.note).toBe('本地')
    expect(out.record.rev).toBe(3)
    expect(out.appended).toHaveLength(0)
    expect(out.overflow).toHaveLength(0)
  })

  it('#10 优先于内容冲突：即便本地改了字段也不合并', () => {
    const local = hl({ note: '本地改', updatedAt: T2 })
    const remote = hl({ note: '远端改', schemaVersion: 2 as 1, updatedAt: T1 })
    const out = mergeHighlight(input({ base: hl(), local, remote }))
    expect(out.readOnly).toBe('higher-schema')
    expect(out.record.note).toBe('本地改')
  })

  it('#11 本地更高 → 非只读，本地数据保留，远端内容不静默丢（D23 身份字段路径）', () => {
    const local = hl({ note: '本地新端', schemaVersion: 2 as 1, updatedAt: T1 })
    const remote = hl({ note: '远端旧端', schemaVersion: 1, updatedAt: T2 })
    const out = mergeHighlight(input({ base: null, local, remote }))
    expect(out.readOnly).toBeUndefined()
    expect(out.record.note).toBe('本地新端')
    // 远端内容必须以副本形式保留（D23：整条冲突副本；#11：败者仍存副本）
    const allCopies = [...(out.record.conflicts ?? []), ...out.overflow, ...out.appended]
    expect(allCopies.some((c) => c.snapshot.note === '远端旧端')).toBe(true)
  })
})

describe('D23 身份字段不一致 → 整条冲突副本，不做字段级合并', () => {
  it.each([
    ['chapterId', { chapterId: 'vol2-09' }],
    ['paragraphId', { paragraphId: 'P000999' }],
    ['kind', { kind: 'note' as const }],
  ])('身份字段 %s 不一致 → 保留本机整条，远端内容入副本', (_name, over) => {
    const local = hl({ note: '本机', updatedAt: T1, rev: 2 })
    const remote = hl({ note: '对抗远端', updatedAt: T2, rev: 8, ...over })
    const out = mergeHighlight(input({ base: hl(), local, remote }))
    expect(out.record.note).toBe('本机')
    expect(out.record.chapterId).toBe(local.chapterId)
    expect(out.record.paragraphId).toBe(local.paragraphId)
    expect(out.record.kind).toBe(local.kind)
    expect(out.record.rev).toBe(2) // 整条保留，不做字段级合并
    expect(out.appended).toHaveLength(1)
    expect(out.appended[0].snapshot.note).toBe('对抗远端')
    expect(out.appended[0].rev).toBe(8)
  })

  it('身份不一致时远端 updatedAt 再新也不覆盖本机', () => {
    const local = hl({ note: '本机', updatedAt: T0 })
    const remote = hl({ note: '远端', chapterId: 'vol9-99', updatedAt: '2099-01-01T00:00:00.000Z' })
    const out = mergeHighlight(input({ base: null, local, remote }))
    expect(out.record.note).toBe('本机')
  })
})

describe('rev / deviceId / updatedAt / 未知字段（协议 §5.4 补充规则）', () => {
  it('合并实际发生 → rev=max(local,remote)+1，deviceId=本机，updatedAt=now', () => {
    const local = hl({ note: '甲', rev: 3, updatedAt: T1, deviceId: 'devL' })
    const remote = hl({ note: '乙', rev: 7, updatedAt: T2, deviceId: 'devR' })
    const out = mergeHighlight(input({ base: hl(), local, remote }))
    expect(out.record.rev).toBe(8)
    expect(out.record.deviceId).toBe(SELF)
    expect(out.record.updatedAt).toBe(NOW)
  })

  it('★ 远端与本地全等 → 不合并、rev 不变、无副本', () => {
    const local = hl({ rev: 5, updatedAt: T1 })
    const remote = hl({ rev: 5, updatedAt: T1 })
    const out = mergeHighlight(input({ base: hl(), local, remote }))
    expect(out.record.rev).toBe(5)
    expect(out.record.updatedAt).toBe(T1)
    expect(out.appended).toHaveLength(0)
  })

  it('未知字段载体=整体胜者侧，深拷贝保留（不变量 4）', () => {
    const base = hl()
    const local = hl({ note: '甲', updatedAt: T1, futureField: { nested: [1, 2] } } as Partial<Highlight>)
    const remote = hl({ note: '乙', updatedAt: T2, otherFuture: 'x' } as Partial<Highlight>)
    const out = mergeHighlight(input({ base, local, remote }))
    // 远端 updatedAt 新 → 整体胜者=远端 → 未知字段取远端侧
    expect((out.record as Record<string, unknown>).otherFuture).toBe('x')
    expect(out.record.note).toBe('乙')
  })

  it('未知字段不被合并过程丢弃（单侧携带、该侧为胜者）', () => {
    const local = hl({ updatedAt: T1, x: 1 } as Partial<Highlight>)
    const remote = hl({ updatedAt: T2, x: 1, y: { deep: true } } as Partial<Highlight>)
    const out = mergeHighlight(input({ base: null, local, remote }))
    expect((out.record as Record<string, unknown>).y).toEqual({ deep: true })
    // 深拷贝：改动结果不影响输入
    ;(out.record as Record<string, unknown>).y = { deep: false }
    expect((remote as Record<string, unknown>).y).toEqual({ deep: true })
  })
})

describe('conflicts cap 3 与溢出（D16 / data-model §4.3）', () => {
  const copy = (keptAt: string, note: string): ConflictCopy<HighlightSnapshot> => ({
    deviceId: 'd', rev: 1, updatedAt: T0, keptAt,
    snapshot: { note, types: [], color: 'yellow', selector: hl().selector, deletedAt: null },
  })

  it('既有 2 份 + 新增 1 份 = 恰好 3 → 全保留，无溢出', () => {
    const local = hl({ note: '甲', updatedAt: T1, conflicts: [copy(T0, 'c1'), copy(T1, 'c2')] })
    const remote = hl({ note: '乙', updatedAt: T2 })
    const out = mergeHighlight(input({ base: hl(), local, remote }))
    expect(out.record.conflicts).toHaveLength(3)
    expect(out.overflow).toHaveLength(0)
  })

  it('★ 恰好 3 份再溢出 → 最旧（keptAt 最早）挤出到 overflow，新副本保留', () => {
    const local = hl({ note: '甲', updatedAt: T1, conflicts: [copy(T0, '最旧'), copy(T1, '中'), copy(T2, '新')] })
    const remote = hl({ note: '乙', updatedAt: '2026-01-04T00:00:00.000Z' })
    const out = mergeHighlight(input({ base: hl(), local, remote }))
    expect(out.record.note).toBe('乙') // 胜者内容进 record
    expect(out.record.conflicts).toHaveLength(3)
    expect(out.overflow).toHaveLength(1)
    expect(out.overflow[0].snapshot.note).toBe('最旧')
    // 本次败者（本地 '甲'）作为新副本保留在 conflicts 内
    expect(out.record.conflicts!.some((c) => c.snapshot.note === '甲')).toBe(true)
  })

  it('★ 不变量 9：远端携带的既有冲突副本不得被合并静默丢弃', () => {
    // 场景：设备 A 合并出副本并上传；设备 B 本地无副本，下载合并。
    // 协议 §3.1 不变量 9「合并败者进 conflicts，系统永不自动丢弃」+ data-model §4.4。
    const remoteCopy = copy(T1, '远端带来的败者')
    const local = hl({ note: '本地', updatedAt: T1 })
    const remote = hl({ note: '远端', updatedAt: T2, conflicts: [remoteCopy] })
    const out = mergeHighlight(input({ base: hl(), local, remote }))
    const survivors = [...(out.record.conflicts ?? []), ...out.overflow]
    expect(survivors.some((c) => c.snapshot.note === '远端带来的败者')).toBe(true)
  })

  it('两侧各带不同副本 → 并集保留（cap 3 + overflow），不丢任何一份', () => {
    const local = hl({ note: '甲', updatedAt: T1, conflicts: [copy(T0, 'L1'), copy(T1, 'L2')] })
    const remote = hl({ note: '乙', updatedAt: T2, conflicts: [copy(T2, 'R1')] })
    const out = mergeHighlight(input({ base: hl(), local, remote }))
    const all = [...(out.record.conflicts ?? []), ...out.overflow].map((c) => c.snapshot.note)
    for (const n of ['L1', 'L2', 'R1', '甲']) expect(all).toContain(n)
  })
})

describe('Bookmark 合并（字段集只有 label + deletedAt，data-model §5）', () => {
  it('#5 label 异值 → updatedAt 胜，败者入副本（BookmarkSnapshot={label,deletedAt}）', () => {
    const base = bm({ label: '旧' })
    const local = bm({ label: '本地名', updatedAt: T1, deviceId: 'devL', rev: 2 })
    const remote = bm({ label: '远端名', updatedAt: T2, deviceId: 'devR', rev: 6 })
    const out = mergeBookmark({ base, local, remote, selfDeviceId: SELF, now: NOW })
    expect(out.record.label).toBe('远端名')
    expect(out.record.rev).toBe(7)
    expect(out.appended).toHaveLength(1)
    expect(out.appended[0].snapshot).toEqual({ label: '本地名', deletedAt: null })
  })

  it('#7 删除 vs 改名 → 墓碑存活，改名侧入副本 deletedAt=null', () => {
    const base = bm({ label: '旧' })
    const local = bm({ label: '旧', deletedAt: T1, updatedAt: T1 })
    const remote = bm({ label: '新名', updatedAt: T2 })
    const out = mergeBookmark({ base, local, remote, selfDeviceId: SELF, now: NOW })
    expect(out.record.deletedAt).toBe(T1)
    expect(out.record.label).toBe('旧')
    expect(out.appended[0].snapshot.label).toBe('新名')
    expect(out.appended[0].snapshot.deletedAt).toBeNull()
  })

  it('label 空串合法：#2 空串覆盖非空', () => {
    const base = bm({ label: '有名字' })
    const local = bm({ label: '', updatedAt: T1 })
    const remote = bm({ label: '有名字', updatedAt: T2 })
    const out = mergeBookmark({ base, local, remote, selfDeviceId: SELF, now: NOW })
    expect(out.record.label).toBe('')
    expect(out.appended).toHaveLength(0)
  })

  it('全等 → rev 不变', () => {
    const b = bm({ rev: 4 })
    const out = mergeBookmark({ base: b, local: b, remote: bm({ rev: 4 }), selfDeviceId: SELF, now: NOW })
    expect(out.record.rev).toBe(4)
  })
})

describe('mergeProgress（协议 §5.4 / data-model §8.3）', () => {
  const pos = (pageId: string, over: Partial<ReadingPosition> = {}): ReadingPosition => ({
    pageId, paragraphId: 'P000001', paragraphHash: 'h', offset: 0.1, pageProgress: 0.2,
    maxProgress: 0.3, updatedAt: T0, ...over,
  })
  const doc = (pages: Record<string, ReadingPosition>, last: ReadingPosition | null = null): ProgressDoc =>
    ({ schemaVersion: 1, last, pages })

  it('★ 页集合取并集，任何一侧的页不丢', () => {
    const local = doc({ a: pos('a') })
    const remote = doc({ b: pos('b') })
    const out = mergeProgress(local, remote, SELF)
    expect(Object.keys(out.pages).sort()).toEqual(['a', 'b'])
  })

  it('★ maxProgress=max(两侧)，与 updatedAt 胜负无关（单调语义）', () => {
    const local = doc({ a: pos('a', { maxProgress: 0.9, updatedAt: T2, paragraphId: 'Pnew' }) })
    const remote = doc({ a: pos('a', { maxProgress: 0.95, updatedAt: T1, paragraphId: 'Pold' }) })
    const out = mergeProgress(local, remote, SELF)
    expect(out.pages.a.maxProgress).toBe(0.95)
    expect(out.pages.a.paragraphId).toBe('Pnew') // 其余字段取 updatedAt 较新
  })

  it('同刻比 deviceId；缺失视为 ""（D12）', () => {
    const local = doc({ a: pos('a', { updatedAt: T1, deviceId: 'devA', paragraphId: 'PL' }) })
    const remote = doc({ a: pos('a', { updatedAt: T1, deviceId: 'devZ', paragraphId: 'PR' }) })
    expect(mergeProgress(local, remote, SELF).pages.a.paragraphId).toBe('PR')
    const noDev = doc({ a: pos('a', { updatedAt: T1, paragraphId: 'PN' }) })
    const withDev = doc({ a: pos('a', { updatedAt: T1, deviceId: 'devA', paragraphId: 'PD' }) })
    expect(mergeProgress(noDev, withDev, SELF).pages.a.paragraphId).toBe('PD')
    expect(mergeProgress(withDev, noDev, SELF).pages.a.paragraphId).toBe('PD')
  })

  it('last 取两侧 updatedAt 较新者；一侧 null 取另一侧', () => {
    const l = pos('a', { updatedAt: T1 })
    const r = pos('b', { updatedAt: T2 })
    expect(mergeProgress(doc({}, l), doc({}, r), SELF).last!.pageId).toBe('b')
    expect(mergeProgress(doc({}, l), doc({}, null), SELF).last!.pageId).toBe('a')
    expect(mergeProgress(doc({}, null), doc({}, null), SELF).last).toBeNull()
  })

  it('边界：maxProgress 0 与 1 不被吞掉', () => {
    const local = doc({ a: pos('a', { maxProgress: 0, updatedAt: T2 }) })
    const remote = doc({ a: pos('a', { maxProgress: 0, updatedAt: T1 }) })
    expect(mergeProgress(local, remote, SELF).pages.a.maxProgress).toBe(0)
  })
})

describe('mergeSettings（协议 §5.4 / data-model §6.2）', () => {
  const prefs = (over: Partial<SettingsDoc['prefs']> = {}): SettingsDoc['prefs'] => ({
    fontSize: 20, lineHeight: 1.9, fontFamily: 'sans', theme: 'paper', annotationTypes: [], ...over,
  })
  const sdoc = (p: SettingsDoc['prefs'], stamps: SettingsDoc['stamps']): SettingsDoc =>
    ({ schemaVersion: 1, prefs: p, stamps })

  it('逐字段比 stamps：fontSize 本地新取本地，theme 远端新取远端', () => {
    const local = sdoc(prefs({ fontSize: 22, theme: 'paper' }), {
      fontSize: { t: T2, d: 'devL' }, theme: { t: T0, d: 'devL' },
    })
    const remote = sdoc(prefs({ fontSize: 18, theme: 'dark' }), {
      fontSize: { t: T1, d: 'devR' }, theme: { t: T1, d: 'devR' },
    })
    const out = mergeSettings(local, remote)
    expect(out.prefs.fontSize).toBe(22)
    expect(out.prefs.theme).toBe('dark')
    // 结果 stamps 取胜者
    expect(out.stamps.fontSize).toEqual({ t: T2, d: 'devL' })
    expect(out.stamps.theme).toEqual({ t: T1, d: 'devR' })
  })

  it('同刻比 d 字典序', () => {
    const local = sdoc(prefs({ fontSize: 22 }), { fontSize: { t: T1, d: 'devA' } })
    const remote = sdoc(prefs({ fontSize: 18 }), { fontSize: { t: T1, d: 'devZ' } })
    expect(mergeSettings(local, remote).prefs.fontSize).toBe(18)
  })

  it('缺 stamp 视为 {t:epoch, d:""} → 有 stamp 侧胜', () => {
    const local = sdoc(prefs({ fontSize: 22 }), {})
    const remote = sdoc(prefs({ fontSize: 18 }), { fontSize: { t: T0, d: '' } })
    expect(mergeSettings(local, remote).prefs.fontSize).toBe(18)
    expect(mergeSettings(remote, local).prefs.fontSize).toBe(18)
  })

  it('★ annotationTypes 整体比较，不做元素级合并', () => {
    const local = sdoc(prefs({ annotationTypes: ['🔤'] }), { annotationTypes: { t: T2, d: 'devL' } })
    const remote = sdoc(prefs({ annotationTypes: ['🔤', '📚', '🎭'] }), { annotationTypes: { t: T1, d: 'devR' } })
    const out = mergeSettings(local, remote)
    expect(out.prefs.annotationTypes).toEqual(['🔤']) // 整体取本地，不并集
  })
})

describe('mergeGraveyard / isGraveyarded（协议 §5.4 / data-model §8.4）', () => {
  it('按 id 并集，同 id 取较早 purgedAt，只增不减', () => {
    const local: GraveyardDoc = { schemaVersion: 1, entries: { a: { purgedAt: T1 }, b: { purgedAt: T0 } } }
    const remote: GraveyardDoc = { schemaVersion: 1, entries: { a: { purgedAt: T0 }, c: { purgedAt: T2 } } }
    const out = mergeGraveyard(local, remote)
    expect(out.entries.a.purgedAt).toBe(T0) // 较早
    expect(out.entries.b.purgedAt).toBe(T0) // 本地独有保留
    expect(out.entries.c.purgedAt).toBe(T2) // 远端独有并入
    expect(Object.keys(out.entries).sort()).toEqual(['a', 'b', 'c'])
  })

  it('合并不得删除本地条目（只增不减）', () => {
    const local: GraveyardDoc = { schemaVersion: 1, entries: { x: { purgedAt: T0 } } }
    const out = mergeGraveyard(local, { schemaVersion: 1, entries: {} })
    expect(out.entries.x).toBeDefined()
  })

  it('isGraveyarded：命中 true / 未命中 false / 原型链键不误报', () => {
    const g: GraveyardDoc = { schemaVersion: 1, entries: { dead: { purgedAt: T0 } } }
    expect(isGraveyarded('dead', g)).toBe(true)
    expect(isGraveyarded('alive', g)).toBe(false)
    expect(isGraveyarded('constructor', g)).toBe(false)
    expect(isGraveyarded('__proto__', g)).toBe(false)
    expect(isGraveyarded('toString', { schemaVersion: 1, entries: {} })).toBe(false)
  })
})

describe('合并结果结构完整性', () => {
  it('mergeHighlight 输出 record 仍是合法 Highlight 形状（身份字段不变）', () => {
    const local = hl({ note: '甲', updatedAt: T1 })
    const remote = hl({ note: '乙', updatedAt: T2 })
    const out = mergeHighlight(input({ base: hl(), local, remote }))
    expect(out.record.id).toBe(local.id)
    expect(out.record.schemaVersion).toBe(1)
    expect(out.record.kind).toBe('highlight')
    expect(out.record.chapterId).toBe(local.chapterId)
    expect(out.record.paragraphId).toBe(local.paragraphId)
    expect(deepEqual(out.record.selector, remote.selector)).toBe(true)
  })
})
