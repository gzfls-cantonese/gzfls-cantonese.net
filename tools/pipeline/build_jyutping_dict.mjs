#!/usr/bin/env node
/**
 * Build the char -> tone-less jyutping dictionary used for homophone-tolerant
 * scoring, derived from the dataset's own per-character jyutping (no pyjyutping
 * re-run, no parquet): every episode entry already carries a codepoint-aligned
 * `jyutping` array, so we just collect `transcription[i] -> jyutping[i]`.
 *
 * Tones are stripped because scoring matches homophones regardless of tone
 * (product decision: lenient, encouragement-first). pyjyutping is char-level, so
 * each Han character maps to exactly one syllable — the dict is deterministic.
 *
 * Regenerate whenever the dataset changes:
 *   node tools/pipeline/build_jyutping_dict.mjs
 * Output: server/recordings/jyutping-dict.json (committed; ~40 KB).
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const HAN_RE = /[\u3400-\u4DBF\u4E00-\u9FFF\u{20000}-\u{2A6DF}]/u

const EPISODES_DIR = process.argv[2] || 'dist-assets/episodes'
const OUT = process.argv[3] || 'server/recordings/jyutping-dict.json'

const stripTone = (p) => (typeof p === 'string' ? p.replace(/[0-9]/g, '') : '')

const files = readdirSync(EPISODES_DIR).filter((f) => /^ep_\d+\.json$/.test(f)).sort()
const dict = new Map()
let conflicts = 0

for (const f of files) {
  const index = JSON.parse(readFileSync(join(EPISODES_DIR, f), 'utf8'))
  for (const entry of index.entries || []) {
    const chars = [...(entry.transcription || '')]
    const jp = entry.jyutping || []
    for (let i = 0; i < chars.length; i++) {
      const c = chars[i]
      const syll = stripTone(jp[i])
      if (!HAN_RE.test(c) || !syll) continue
      const prev = dict.get(c)
      if (prev === undefined) dict.set(c, syll)
      else if (prev !== syll) conflicts++
    }
  }
}

const obj = Object.fromEntries([...dict].sort((a, b) => (a[0] < b[0] ? -1 : 1)))
writeFileSync(OUT, JSON.stringify(obj))
console.log(`wrote ${OUT}: ${dict.size} chars from ${files.length} episodes (${conflicts} tone-less conflicts)`)
