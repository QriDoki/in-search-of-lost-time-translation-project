import assert from 'node:assert/strict'
import { test } from 'node:test'
import { annotationIsVisible, defaultAnnotationTypes, sanitizeAnnotationTypes, splitAnnotationTypes } from '../lib/annotation-types.mjs'

test('消费多个类型前缀，兼容变体选择符，保留正文 emoji 和旧注解', () => {
  assert.deepEqual(splitAnnotationTypes('🏛️🔤🏛️正文 🧵'), { types: ['🏛️', '🔤'], note: '正文 🧵' })
  assert.deepEqual(splitAnnotationTypes('⚖🧵比较'), { types: ['⚖️', '🧵'], note: '比较' })
  assert.deepEqual(splitAnnotationTypes('旧注解'), { types: [], note: '旧注解' })
})

test('默认排除三类；任一选中即显示；空选择与旧偏好正确恢复', () => {
  for (const type of ['⚖️', '🧵', '🧩']) assert.equal(annotationIsVisible([type], defaultAnnotationTypes), false)
  assert.equal(annotationIsVisible(['🧵', '🔤'], defaultAnnotationTypes), true)
  assert.equal(annotationIsVisible(['🔤'], []), false)
  assert.equal(annotationIsVisible([], []), true)
  assert.deepEqual(sanitizeAnnotationTypes(undefined), defaultAnnotationTypes)
  assert.deepEqual(sanitizeAnnotationTypes(JSON.parse(JSON.stringify([]))), [])
  assert.deepEqual(sanitizeAnnotationTypes(['🧩', 'unknown', '🧩']), ['🧩'])
})
