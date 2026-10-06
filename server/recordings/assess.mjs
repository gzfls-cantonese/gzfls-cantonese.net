/**
 * Scoring service: reference transcript + ASR transcript -> 0..100.
 *
 * Stateless and read-only: nothing is written back to storage. The reference is
 * resolved *before* the audio is fetched, because a missing reference means the
 * request must fail anyway (scoring against an empty reference silently yields
 * 0), and failing early avoids paying for an ASR call whose result is unusable.
 */
import { scoreReading, scoreReadingHomophone } from './similarity.mjs'

// Detected-language codes that count as Cantonese. qwen3-asr-flash reports 'yue'
// for Cantonese and 'zh' for Mandarin; accept 'yue' and its region variants so a
// Cantonese reading is never flagged, while a Mandarin reading still is.
export function isCantonese(code) {
  const c = String(code || '').trim().toLowerCase()
  return c === 'yue' || c.startsWith('yue-') || c.startsWith('yue_') || c === 'zh-yue'
}

export function createAssessService(cfg, backend, { transcriber, references, dict }) {
  const haveDict = !!(dict && Object.keys(dict).length)
  return {
    async score({ episode, entryId, key }) {
      const ref = await references.transcription(episode, entryId)
      if (!ref.ok) return ref

      let audioUrl = ''
      if (transcriber.kind !== 'fake') {
        audioUrl = backend.getPresign(key, cfg.presignTtlSec)
      }

      const asr = await transcriber.transcribe({ url: audioUrl, ext: key.split('.').pop() })
      if (!asr.ok) return asr

      // Prefer homophone-tolerant scoring; fall back to char-level when the
      // reference carries no jyutping or the dict failed to load.
      const { score, reason } = haveDict && ref.jyutping && ref.jyutping.length
        ? scoreReadingHomophone(ref.transcription, ref.jyutping, asr.transcript, dict)
        : scoreReading(ref.transcription, asr.transcript)
      if (score === null) {
        return { ok: false, status: 503, error: reason === 'empty-transcript' ? 'ASR returned no transcript' : reason }
      }
      // The ASR language option is only a hint, so a Mandarin reading still gets
      // transcribed (and can score high on character similarity). Flag it via the
      // detected language instead of suppressing the score; unknown/absent never
      // warns, so offline fake mode and any response without annotations are safe.
      const detected = String(asr.language || '').trim()
      const languageWarning = !!detected && !isCantonese(detected)
      return { ok: true, score, transcript: asr.transcript, languageWarning }
    },
  }
}
