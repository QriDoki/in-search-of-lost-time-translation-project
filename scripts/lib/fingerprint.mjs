/**
 * 全系统统一的文本指纹与归一化（构建侧 + 浏览器侧共同导入）。
 *
 * 两套基准（protocol §2.2，不得混用）：
 *  - 指纹基准：fnv1a36(rawText)，内部先 normalizeWs（空白折叠 + trim），
 *    与现有 ReaderDock.hashText 逐位一致（D3 黄金向量）。
 *  - 偏移量基准：nfc(rawText) 后的 UTF-16 code unit 下标。
 *
 * 唯一实现，禁止在别处复制算法（先例：annotation-types.mjs 被 theme 导入）。
 */

/** 空白折叠：与 ReaderDock.hashText 的 replace(/\s+/g,' ').trim() 一致。 */
export function normalizeWs(text) {
  return String(text).replace(/\s+/g, ' ').trim()
}

/** NFC 归一化，仅用于偏移量基准与 head/tail/len，不用于指纹。 */
export function nfc(text) {
  return String(text).normalize('NFC')
}

/** FNV-1a 32 位（对传入字符串逐 UTF-16 code unit，不做任何归一化），返回无符号整数。 */
export function fnv1a32raw(text) {
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

/** 指纹：先空白折叠再 FNV-1a，base36。与现有 hashText 逐位一致。 */
export function fnv1a36(text) {
  return fnv1a32raw(normalizeWs(text)).toString(36)
}

/** 8 位 hex 的 FNV-1a 32 位（对传入字符串原样哈希，用于临时 T ID）。 */
export function fnv1a32hex(text) {
  return fnv1a32raw(text).toString(16).padStart(8, '0')
}