import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fnv1a36, fnv1a32hex, fnv1a32raw, nfc, normalizeWs } from '../lib/fingerprint.mjs'

// D3 黄金向量：构建侧与浏览器侧必须逐位一致。
const GOLDEN = [
  ['', 'ztntfp'],
  ['很久以来，我都是早早就躺下了', '1mkkj7'],
  ['  贡布雷。  ', 'zer7p0'],
  ['Marcel Proust', '1xyq7u2'],
  ['　', 'ztntfp'],
  ['áb', 'etsjxr'],
  ['那是很久以前的事了，那时贡布雷的教堂', '1fe33xc'],
]

test('fnv1a36 黄金向量（D3）', () => {
  for (const [input, expected] of GOLDEN) {
    assert.equal(fnv1a36(input), expected, `input=${JSON.stringify(input)}`)
  }
})

test('空白折叠：内部多空白与首尾空白等价', () => {
  assert.equal(fnv1a36('a  b'), fnv1a36('a b'))
  assert.equal(fnv1a36('\t a\nb \t'), fnv1a36('a b'))
  assert.equal(normalizeWs('  贡布雷。  '), '贡布雷。')
  assert.equal(normalizeWs('a　　b'), 'a b')
})

test('指纹不做 NFC：组合字符与预组合字符指纹不同', () => {
  assert.notEqual(fnv1a36('áb'), fnv1a36('áb'))
  assert.equal(fnv1a36('áb'), 'etsjxr')
})

test('nfc 仅用于偏移量基准', () => {
  assert.equal(nfc('áb'), 'áb')
  assert.equal(nfc('áb').length, 2)
  assert.equal('áb'.length, 3)
})

test('fnv1a32hex 为 8 位 hex，原样哈希（不折叠空白）', () => {
  const hex = fnv1a32hex('abc')
  assert.match(hex, /^[0-9a-f]{8}$/)
  assert.equal(fnv1a32hex(''), fnv1a32raw('').toString(16).padStart(8, '0'))
  assert.notEqual(fnv1a32hex('a b'), fnv1a32hex('a  b'))
})

test('空串与全空白指纹均为 ztntfp', () => {
  assert.equal(fnv1a36(''), 'ztntfp')
  assert.equal(fnv1a36('   '), 'ztntfp')
  assert.equal(fnv1a36('　\t\n'), 'ztntfp')
})