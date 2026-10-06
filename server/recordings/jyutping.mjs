/**
 * Char -> tone-less jyutping dictionary used for homophone-tolerant scoring.
 *
 * Generated at build time by `tools/pipeline/build_jyutping_dict.mjs` from the
 * dataset's own per-character jyutping and committed as `jyutping-dict.json`, so
 * the function loads it from disk with no runtime dependency and no network. A
 * missing or unreadable dict degrades to `{}` — scoring then falls back to the
 * character-level ratio rather than failing.
 */
import { readFileSync } from 'node:fs'

export function loadJyutpingDict(file = new URL('./jyutping-dict.json', import.meta.url)) {
  try {
    const dict = JSON.parse(readFileSync(file, 'utf8'))
    return dict && typeof dict === 'object' ? dict : {}
  } catch {
    return {}
  }
}
