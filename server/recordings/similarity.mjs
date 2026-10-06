/**
 * Character-level similarity between a reference transcript and an ASR result.
 *
 * Node has no difflib and the function stays zero-dependency, so Ratcliff/
 * Obershelp is implemented here: recursively take the longest common block and
 * sum block sizes, then `ratio = 2M / T`. This matches Python's
 * `difflib.SequenceMatcher.ratio()` for inputs shorter than difflib's autojunk
 * threshold (200 elements in `b`); autojunk is deliberately not reproduced,
 * since demoting frequent Han characters to "junk" would distort a pronunciation
 * score rather than improve it. Spans here are one sentence long, far under 200.
 */

/** CJK Unified Ideographs + Extension A + Extension B (astral, via the u flag). */
const HAN_RE = /[\u3400-\u4DBF\u4E00-\u9FFF\u{20000}-\u{2A6DF}]/gu
/** Same class without /g so it is safe for per-character `.test()` in a loop. */
const HAN_ONE = /[\u3400-\u4DBF\u4E00-\u9FFF\u{20000}-\u{2A6DF}]/u

/** Strip everything that is not a Han character; returns an array of code points. */
export function normalizeHan(text) {
  if (typeof text !== 'string') return []
  return text.match(HAN_RE) || []
}

/** Drop the trailing tone digit so homophones match regardless of tone. */
function stripTone(j) {
  return typeof j === 'string' ? j.replace(/[0-9]/g, '') : ''
}

function longestMatch(a, alo, ahi, b, blo, bhi) {
  let bestI = alo
  let bestJ = blo
  let bestSize = 0
  // j2len[j] = length of the common suffix ending at a[i-1] / b[j-1].
  let j2len = new Map()
  for (let i = alo; i < ahi; i++) {
    const next = new Map()
    for (let j = blo; j < bhi; j++) {
      if (a[i] !== b[j]) continue
      const k = (j2len.get(j - 1) || 0) + 1
      next.set(j, k)
      if (k > bestSize) {
        bestI = i - k + 1
        bestJ = j - k + 1
        bestSize = k
      }
    }
    j2len = next
  }
  return { i: bestI, j: bestJ, size: bestSize }
}

function matchedChars(a, alo, ahi, b, blo, bhi) {
  const { i, j, size } = longestMatch(a, alo, ahi, b, blo, bhi)
  if (size === 0) return 0
  return (
    size
    + matchedChars(a, alo, i, b, blo, j)
    + matchedChars(a, i + size, ahi, b, j + size, bhi)
  )
}

/** Ratio over pre-normalized code-point arrays; 1 when both sides are empty. */
export function ratio(a, b) {
  const total = a.length + b.length
  if (!total) return 1
  return (2 * matchedChars(a, 0, a.length, b, 0, b.length)) / total
}

/**
 * Score a reading against its reference. Returns `score: null` with a reason
 * when either side has no Han characters at all — the caller must surface that
 * as a failure rather than reporting a bogus 0 (or 100).
 */
export function scoreReading(reference, transcript) {
  const ref = normalizeHan(reference)
  const hyp = normalizeHan(transcript)
  if (!ref.length) return { score: null, reason: 'empty-reference' }
  if (!hyp.length) return { score: null, reason: 'empty-transcript' }
  return { score: Math.round(100 * ratio(ref, hyp)), reason: null }
}

/**
 * Homophone-tolerant score: compare the two readings as *tone-less jyutping
 * syllable* sequences instead of raw characters, so a character the ASR emitted
 * that sounds the same as the reference still counts as a match (product
 * decision: lenient, encouragement-first).
 *
 * The reference side uses the dataset's own codepoint-aligned `jyutping` array;
 * the transcript side maps each Han character through `dict` (char -> tone-less
 * syllable). A character missing from the dict falls back to the character
 * itself, so it can still match an identical reference character but never a
 * mere homophone — the accepted cost of deriving the dict from the dataset
 * vocabulary. Same empty-side handling and 0..100 mapping as `scoreReading`.
 */
export function scoreReadingHomophone(reference, refJyutping, transcript, dict) {
  const chars = typeof reference === 'string' ? [...reference] : []
  const jp = Array.isArray(refJyutping) ? refJyutping : []
  const ref = []
  for (let i = 0; i < chars.length; i++) {
    if (!HAN_ONE.test(chars[i])) continue
    ref.push(stripTone(jp[i]) || chars[i])
  }
  const hyp = normalizeHan(transcript).map((c) => (dict && dict[c]) || c)
  if (!ref.length) return { score: null, reason: 'empty-reference' }
  if (!hyp.length) return { score: null, reason: 'empty-transcript' }
  return { score: Math.round(100 * ratio(ref, hyp)), reason: null }
}
