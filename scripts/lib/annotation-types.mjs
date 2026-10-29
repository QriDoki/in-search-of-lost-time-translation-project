export const annotationTypes = [
  { emoji: '🏛️', label: '人物与文化背景' },
  { emoji: '📚', label: '典故与互文' },
  { emoji: '🎭', label: '双关与文字游戏' },
  { emoji: '🔤', label: '词义与措辞' },
  { emoji: '🪶', label: '修辞与文体' },
  { emoji: '🧩', label: '句法与行文' },
  { emoji: '🧵', label: '叙事与主题关联' },
  { emoji: '⚖️', label: '版本与译法比较' },
]

export const defaultAnnotationTypes = ['🏛️', '📚', '🔤', '🎭', '🪶']

export function sanitizeAnnotationTypes(value) {
  return Array.isArray(value)
    ? annotationTypes.map(({ emoji }) => emoji).filter((emoji) => value.includes(emoji))
    : [...defaultAnnotationTypes]
}

/** 仅消费注解开头的类型标记，保留正文中的 emoji。兼容省略变体选择符的输入。 */
export function splitAnnotationTypes(value) {
  let note = value.trim()
  const types = []
  while (note) {
    const type = annotationTypes.find(({ emoji }) => note.startsWith(emoji.replace(/\uFE0F/g, '')))
    if (!type) break
    if (!types.includes(type.emoji)) types.push(type.emoji)
    note = note.slice(type.emoji.replace(/\uFE0F/g, '').length).replace(/^\uFE0F/, '')
  }
  return { types, note: note.trim() }
}

export function annotationIsVisible(types, selected) {
  return types.length === 0 || types.some((type) => selected.includes(type))
}
