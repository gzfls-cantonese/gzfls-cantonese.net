/**
 * Similarity tests (node --test).
 *
 * The expected scores below were produced by Python's
 * `difflib.SequenceMatcher(None, a, b).ratio()` on the same inputs, so the
 * hand-rolled Ratcliff/Obershelp is pinned to the reference implementation.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeHan, ratio, scoreReading, scoreReadingHomophone } from './similarity.mjs'

const PY_CASES = [
  ['話說天下大勢分久必合合久必分', '話說天下大勢分久必合合久必分', 100],
  ['話說天下大勢分久必合合久必分', '話說天下大勢分久必合', 83],
  ['話說天下大勢分久必合合久必分', '完全無關的一段文字啊', 0],
  ['劉備關羽張飛三兄弟結義', '劉備關羽張飛', 71],
  ['曹操引兵五十萬南下', '曹操引兵五十萬北上', 78],
  ['孔明曰', '孔明曰', 100],
]

test('matches Python SequenceMatcher on known samples', () => {
  for (const [ref, hyp, expected] of PY_CASES) {
    assert.equal(scoreReading(ref, hyp).score, expected, `${ref} vs ${hyp}`)
  }
})

test('identical text scores 100, unrelated text scores 0', () => {
  assert.equal(scoreReading('諸葛亮六出祁山', '諸葛亮六出祁山').score, 100)
  assert.equal(scoreReading('諸葛亮六出祁山', '東吳水軍都督周瑜').score, 0)
})

test('partial matches land in the middle of the scale', () => {
  const { score } = scoreReading('話說天下大勢分久必合合久必分', '話說天下大勢')
  assert.ok(score > 0 && score < 100, `expected a middling score, got ${score}`)
})

test('punctuation, whitespace and latin are stripped before scoring', () => {
  assert.deepEqual(normalizeHan('話說，天下 大勢！'), ['話', '說', '天', '下', '大', '勢'])
  assert.deepEqual(normalizeHan('zoeng1 syut3 gaau3'), [])
  assert.equal(scoreReading('話說，天下大勢！', '話說天下大勢').score, 100)
  assert.equal(scoreReading('話說 天下大勢', '話說天下大勢').score, 100)
})

test('non-string and empty inputs are reported, never scored', () => {
  assert.deepEqual(scoreReading('', '話說天下'), { score: null, reason: 'empty-reference' })
  assert.deepEqual(scoreReading('！！！', '話說天下'), { score: null, reason: 'empty-reference' })
  assert.deepEqual(scoreReading(undefined, '話說天下'), { score: null, reason: 'empty-reference' })
  assert.deepEqual(scoreReading('話說天下', ''), { score: null, reason: 'empty-transcript' })
  assert.deepEqual(scoreReading('話說天下', '...'), { score: null, reason: 'empty-transcript' })
  assert.deepEqual(normalizeHan(null), [])
  assert.equal(ratio([], []), 1, 'difflib parity: two empty sequences')
})

test('astral Han characters are compared per code point', () => {
  // U+20000 (CJK Ext B) is a surrogate pair in UTF-16; per-code-point handling
  // keeps it a single comparable element.
  assert.deepEqual(normalizeHan('\u{20000}\u{20001}話'), ['\u{20000}', '\u{20001}', '話'])
  assert.equal(scoreReading('\u{20000}話説', '\u{20000}話説').score, 100)
})

test('score is always an integer in 0..100', () => {
  for (const [ref, hyp] of PY_CASES) {
    const { score } = scoreReading(ref, hyp)
    assert.ok(Number.isInteger(score) && score >= 0 && score <= 100)
  }
})

// Homophone-tolerant scoring: dict values are already tone-less (see
// build_jyutping_dict.mjs); reference jyutping carries tones and is stripped.
const DICT = { 話: 'waa', 說: 'syut', 天: 'tin', 下: 'haa', 詩: 'si', 史: 'si', 三: 'saam', 散: 'saan', 甲: 'gaap' }

test('homophone: a different character with the same syllable scores 100', () => {
  // 詩 si1 (reference) vs 史 si (transcript) — same tone-less syllable.
  assert.equal(scoreReadingHomophone('詩', ['si1'], '史', DICT).score, 100)
})

test('homophone ignores tone: si6 reference matches si transcript', () => {
  assert.equal(scoreReadingHomophone('事', ['si6'], '詩', DICT).score, 100)
})

test('different syllables do not match even if the characters look alike', () => {
  // 三 saam vs 散 saan — distinct syllables.
  assert.equal(scoreReadingHomophone('三', ['saam1'], '散', DICT).score, 0)
})

test('a full sentence with one homophone substitution still scores 100', () => {
  const ref = '話說天下'
  const jp = ['waa6', 'syut3', 'tin1', 'haa6']
  assert.equal(scoreReadingHomophone(ref, jp, '話說天下', DICT).score, 100)
})

test('a transcript char missing from the dict falls back to the char itself', () => {
  const noDict = {}
  // ref token = 'gaap' (from jyutping), hyp token = '甲' (fallback) -> no match.
  assert.equal(scoreReadingHomophone('甲', ['gaap3'], '甲', noDict).score, 0)
  // With the char in the dict both sides become 'gaap' -> match.
  assert.equal(scoreReadingHomophone('甲', ['gaap3'], '甲', DICT).score, 100)
})

test('a reference char with empty jyutping falls back to the char on both sides', () => {
  // ref jyutping empty -> token '甲'; transcript '甲' not in dict -> token '甲'.
  assert.equal(scoreReadingHomophone('甲', [''], '甲', {}).score, 100)
})

test('homophone scoring reports empty sides like the char-level score', () => {
  assert.deepEqual(scoreReadingHomophone('', [], '話說', DICT), { score: null, reason: 'empty-reference' })
  assert.deepEqual(scoreReadingHomophone('話說', ['waa6', 'syut3'], '', DICT), { score: null, reason: 'empty-transcript' })
  assert.deepEqual(scoreReadingHomophone('話說', ['waa6', 'syut3'], '...', DICT), { score: null, reason: 'empty-transcript' })
})
