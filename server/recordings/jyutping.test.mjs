import { test } from 'node:test'
import assert from 'node:assert/strict'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadJyutpingDict } from './jyutping.mjs'

test('loads the committed dictionary and maps a Han char to a tone-less syllable', () => {
  const dict = loadJyutpingDict()
  assert.ok(Object.keys(dict).length > 1000, 'the committed dict should cover the dataset vocabulary')
  // 話 -> waa6 in the dataset; the dict stores it tone-less.
  assert.equal(dict['話'], 'waa')
  for (const [char, syll] of Object.entries(dict)) {
    assert.ok(!/[0-9]/.test(syll), `${char} -> ${syll} must be tone-less`)
  }
})

test('a missing dict file degrades to an empty object', () => {
  const dir = mkdtempSync(join(tmpdir(), 'jyutping-'))
  assert.deepEqual(loadJyutpingDict(new URL(`file://${join(dir, 'nope.json')}`)), {})
})

test('a malformed dict file degrades to an empty object', () => {
  const dir = mkdtempSync(join(tmpdir(), 'jyutping-'))
  const file = join(dir, 'bad.json')
  writeFileSync(file, '{ not json')
  assert.deepEqual(loadJyutpingDict(new URL(`file://${file}`)), {})
})
