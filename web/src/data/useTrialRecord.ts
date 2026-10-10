/**
 * Trial-recording state machine for one episode page.
 *
 *   idle → holding (capturing) → recorded (bubble + background upload)
 *
 * Re-recording disposes the previous trial first (same-span override). Disposal
 * revokes the object URL, aborts any in-flight upload or scoring request,
 * deletes the cloud object and clears the bubble; it runs on unmount (route
 * change / back to episodes) and on pagehide (with keepalive so the request
 * survives unload).
 *
 * Scoring is visitor-triggered and single-flight: one request per bubble at a
 * time, because every call bills a third-party ASR request.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  RecordSession,
  isRecordingSupported,
  pickMime,
  type RecordingResult,
} from './recorder'
import {
  assessRecording,
  disposeRecordings,
  enqueueUpload,
  RecordingsError,
  type RecordingRef,
  type UploadHandle,
} from './recordings'

export type TrialPhase = 'idle' | 'holding' | 'recorded'

export type AssessStatus = 'idle' | 'loading' | 'scored' | 'failed'

/**
 * Failure causes travel as codes and are resolved to visitor-facing text at
 * render time, so a message already on screen re-translates on a locale switch.
 */
export type AssessErrorReason =
  | 'scoringUnavailable'
  | 'rateLimited'
  | 'destroyed'
  | 'timeout'
  | 'noAudio'
  | 'serviceUnavailable'
  | 'unknown'

export type RecorderErrorReason = 'unsupportedFormat' | 'micDenied'

export type TrialErrorReason = AssessErrorReason | RecorderErrorReason

export interface TrialAssessment {
  status: AssessStatus
  score?: number
  transcript?: string
  reason?: AssessErrorReason
  /** Set on a scored result when the ASR detected a non-Cantonese reading. */
  languageWarning?: boolean
}

export interface TrialBubble {
  entryId: string
  url: string
  durationSec: number
  uploading: boolean
  /** Server-side flag: only when true may the bubble offer scoring. */
  assessAvailable: boolean
  assessment: TrialAssessment
}

export interface TrialRecordApi {
  supported: boolean
  phase: TrialPhase
  bubble: TrialBubble | null
  bubblePlaying: boolean
  error: TrialErrorReason | null
  /** Long-press start. */
  begin: () => void
  /** Release (also fired by the duration cap and pointercancel). */
  end: () => void
  /** Play/pause the bubble's local recording. */
  toggleBubble: () => void
  /** Score the uploaded recording. No-op while a request is in flight. */
  assess: () => void
  /** Destroy the current trial everywhere (local + cloud). */
  dispose: () => void
}

interface Options {
  episode: number
  /** Current span's entry id; captured at record time. */
  entryId: string | null
  /** False hides/disables the whole feature (no RECORDINGS_API). */
  enabled: boolean
  /** Called when capture or bubble playback should pause the dataset audio. */
  onNeedsDatasetPause: () => void
}

/**
 * Scoring is a paid third-party call, so a hung request must not leave the
 * bubble spinning forever; the server's own timeout is shorter.
 */
const ASSESS_TIMEOUT_MS = 30_000

const IDLE_ASSESSMENT: TrialAssessment = { status: 'idle' }

/**
 * The server's `{error}` string is the only thing that tells "scoring is off"
 * from "your clip carried no audio" from "the ASR provider refused us", so map it
 * here instead of letting every 5xx collapse into a generic retry prompt.
 */
function assessErrorReason(err: unknown): AssessErrorReason {
  if (err instanceof RecordingsError) {
    const { status, reason } = err
    if (status === 429) return 'rateLimited'
    if (status === 404) return reason === 'recording not found' ? 'destroyed' : 'serviceUnavailable'
    if (reason === 'scoring unavailable' || reason === 'ASR not configured') return 'scoringUnavailable'
    if (reason === 'ASR timed out') return 'timeout'
    if (reason === 'ASR returned no transcript') return 'noAudio'
    if (status === 502 || status === 503) return 'serviceUnavailable'
    return 'unknown'
  }
  if ((err as Error)?.name === 'TimeoutError') return 'timeout'
  return 'unknown'
}

export function useTrialRecord({
  episode,
  entryId,
  enabled,
  onNeedsDatasetPause,
}: Options): TrialRecordApi {
  const supported = enabled && isRecordingSupported() && pickMime() !== null

  const [phase, setPhase] = useState<TrialPhase>('idle')
  const [bubble, setBubble] = useState<TrialBubble | null>(null)
  const [bubblePlaying, setBubblePlaying] = useState(false)
  const [error, setError] = useState<TrialErrorReason | null>(null)

  const sessionRef = useRef<RecordSession | null>(null)
  const uploadRef = useRef<UploadHandle | null>(null)
  const cloudRef = useRef<RecordingRef | null>(null)
  const assessRef = useRef<AbortController | null>(null)
  // Mirrors of bubble.assessAvailable / assessment.status, so assess() can gate
  // itself without reading state (and without side effects inside an updater).
  const assessReadyRef = useRef(false)
  const assessDoneRef = useRef(false)
  const urlRef = useRef<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const entryIdRef = useRef<string | null>(entryId)
  const pauseRef = useRef(onNeedsDatasetPause)
  const endRef = useRef<() => Promise<void>>(async () => {})
  entryIdRef.current = entryId
  pauseRef.current = onNeedsDatasetPause

  const stopAudio = useCallback(() => {
    const a = audioRef.current
    if (a) {
      a.pause()
      a.onended = null
    }
    setBubblePlaying(false)
  }, [])

  // Tear down local + cloud state for the current trial.
  const dispose = useCallback(
    (keepalive = false) => {
      uploadRef.current?.abort()
      uploadRef.current = null
      assessRef.current?.abort()
      assessRef.current = null
      assessReadyRef.current = false
      assessDoneRef.current = false
      stopAudio()
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current)
        urlRef.current = null
      }
      if (audioRef.current) {
        audioRef.current.removeAttribute('src')
        audioRef.current = null
      }
      const cloud = cloudRef.current
      cloudRef.current = null
      if (cloud) void disposeRecordings([cloud], { keepalive })
      sessionRef.current = null
      setBubble(null)
      setPhase('idle')
      setError(null)
    },
    [stopAudio],
  )

  const begin = useCallback(() => {
    if (!supported) return
    // Same-span (or new-span) re-record overrides the previous trial.
    if (phase !== 'idle' || bubble) dispose()
    pauseRef.current()
    setError(null)
    const mime = pickMime()
    if (!mime) {
      setError('unsupportedFormat')
      return
    }
    const session = new RecordSession(mime, () => {
      void endRef.current()
    })
    sessionRef.current = session
    setPhase('holding')
    session.start().catch(() => {
      sessionRef.current = null
      setPhase('idle')
      setError('micDenied')
    })
  }, [supported, phase, bubble, dispose])

  const end = useCallback(async () => {
    const session = sessionRef.current
    if (!session) return
    const result: RecordingResult | null = await session.stop().catch(() => null)
    sessionRef.current = null
    if (!result) {
      setPhase('idle')
      return
    }
    const url = URL.createObjectURL(result.blob)
    urlRef.current = url
    const recEntryId = entryIdRef.current ?? ''
    assessReadyRef.current = false
    assessDoneRef.current = false
    setBubble({
      entryId: recEntryId,
      url,
      durationSec: result.durationSec,
      uploading: true,
      assessAvailable: false,
      assessment: IDLE_ASSESSMENT,
    })
    setPhase('recorded')

    const durationSec = Math.max(1, Math.min(Math.round(result.durationSec), 60))
    const handle = enqueueUpload(
      { episode, entryId: recEntryId, durationSec, mime: result.mime },
      result.blob,
    )
    uploadRef.current = handle
    handle.promise
      .then((uploaded) => {
        // Ignore if this upload was superseded/disposed while in flight.
        if (uploadRef.current !== handle) return
        cloudRef.current = uploaded.ref
        uploadRef.current = null
        assessReadyRef.current = uploaded.assessAvailable
        setBubble((b) => (b ? { ...b, uploading: false, assessAvailable: uploaded.assessAvailable } : b))
      })
      .catch(() => {
        if (uploadRef.current !== handle) return
        uploadRef.current = null
        // Local playback still works; the cloud copy failed after retries.
        setBubble((b) => (b ? { ...b, uploading: false } : b))
      })
  }, [episode])

  // begin()'s RecordSession auto-stop callback must reach the latest end().
  endRef.current = end

  const toggleBubble = useCallback(() => {
    if (!bubble) return
    if (bubblePlaying) {
      stopAudio()
      return
    }
    pauseRef.current()
    let a = audioRef.current
    if (!a) {
      a = new Audio()
      audioRef.current = a
    }
    a.src = bubble.url
    a.onended = () => setBubblePlaying(false)
    setBubblePlaying(true)
    const p = a.play()
    if (p && typeof p.catch === 'function') p.catch(() => setBubblePlaying(false))
  }, [bubble, bubblePlaying, stopAudio])

  // Visitor-triggered scoring: single-flight, and a success is terminal so a
  // stray second click cannot bill another ASR call for the same recording.
  const assess = useCallback(() => {
    const ref = cloudRef.current
    if (!ref || assessRef.current || !assessReadyRef.current || assessDoneRef.current) return
    const controller = new AbortController()
    assessRef.current = controller
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(ASSESS_TIMEOUT_MS)])
    setBubble((b) => (b ? { ...b, assessment: { status: 'loading' } } : b))
    assessRecording(ref, { signal })
      .then((out) => {
        if (assessRef.current !== controller) return
        assessRef.current = null
        assessDoneRef.current = true
        setBubble((b) => (b
          ? { ...b, assessment: { status: 'scored', score: out.score, transcript: out.transcript, languageWarning: out.languageWarning === true } }
          : b))
      })
      .catch((err) => {
        if (assessRef.current !== controller) return
        assessRef.current = null
        setBubble((b) => (b
          ? { ...b, assessment: { status: 'failed', reason: assessErrorReason(err) } }
          : b))
      })
  }, [])

  // Route change / back-to-episodes unmounts the page: destroy everything.
  useEffect(() => {
    return () => {
      uploadRef.current?.abort()
      assessRef.current?.abort()
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
      const cloud = cloudRef.current
      if (cloud) void disposeRecordings([cloud], { keepalive: true })
      audioRef.current?.pause()
    }
  }, [])

  // Close/refresh: fire an unload-safe delete.
  useEffect(() => {
    const onPageHide = () => {
      uploadRef.current?.abort()
      assessRef.current?.abort()
      const cloud = cloudRef.current
      if (cloud) void disposeRecordings([cloud], { keepalive: true })
    }
    window.addEventListener('pagehide', onPageHide)
    return () => window.removeEventListener('pagehide', onPageHide)
  }, [])

  return { supported, phase, bubble, bubblePlaying, error, begin, end, toggleBubble, assess, dispose: () => dispose() }
}
