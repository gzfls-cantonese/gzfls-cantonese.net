/**
 * Scoring service: reference transcript + ASR transcript -> 0..100.
 *
 * Stateless and read-only: nothing is written back to storage. The reference is
 * resolved *before* the audio is fetched, because a missing reference means the
 * request must fail anyway (scoring against an empty reference silently yields
 * 0), and failing early avoids paying for an ASR call whose result is unusable.
 */
import { scoreReading, scoreReadingHomophone } from './similarity.mjs'

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
      return { ok: true, score, transcript: asr.transcript }
    },
  }
}
