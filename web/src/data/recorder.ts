/**
 * Microphone capture: capability detection, mime fallback, a bounded recording
 * session, and a long-press gesture wrapper. Kept framework-free so it can be
 * unit-tested with a mock MediaRecorder.
 */

export const MAX_RECORD_SEC = 60

/** Preferred first; each browser supports a different subset. */
export const MIME_CHAIN = [
  'audio/opus',
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
]

export function isRecordingSupported(): boolean {
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === 'function'
  )
}

/** First supported mime from the fallback chain, or null when none is. */
export function pickMime(): string | null {
  if (typeof MediaRecorder === 'undefined') return null
  if (typeof MediaRecorder.isTypeSupported !== 'function') return null
  for (const mime of MIME_CHAIN) {
    if (MediaRecorder.isTypeSupported(mime)) return mime
  }
  return null
}

export interface RecordingResult {
  blob: Blob
  mime: string
  durationSec: number
  /** True when the input level never left zero while the meter was running. */
  silent: boolean
}

/** Byte-domain excursion around the centre line that still counts as silence. */
const SILENT_PEAK = 1
const LEVEL_INTERVAL_MS = 100

interface LevelReader {
  peak(): number
  reads(): number
  dispose(): void
}

/**
 * Watches the live input level so a dead capture is caught before it costs
 * anything. macOS can hand a browser a microphone track that records normally
 * but carries no signal — the clip plays back silent and the ASR answers with an
 * empty transcript. Sampling the track answers "did the mic deliver anything"
 * without a paid round trip. Returns null where nothing can be measured (no
 * AudioContext, or a stream that cannot be attached), which never blocks a
 * recording: an unmeasured clip is simply judged by the old rules.
 */
function createLevelReader(stream: MediaStream): LevelReader | null {
  if (typeof AudioContext === 'undefined') return null
  let ctx: AudioContext | null = null
  try {
    ctx = new AudioContext()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 2048
    // Source into analyser only: monitoring must not reach the destination, or
    // the mic would feed back through the speaker.
    ctx.createMediaStreamSource(stream).connect(analyser)
    const buf = new Uint8Array(analyser.fftSize)
    let peak = 0
    let reads = 0
    // A suspended context yields flat frames, which would read as silence, so
    // only sample while it is actually running.
    void ctx.resume().catch(() => {})
    const timer = setInterval(() => {
      if (ctx?.state !== 'running') return
      analyser.getByteTimeDomainData(buf)
      reads += 1
      for (const value of buf) {
        const excursion = Math.abs(value - 128)
        if (excursion > peak) peak = excursion
      }
    }, LEVEL_INTERVAL_MS)
    const running = ctx
    return {
      peak: () => peak,
      reads: () => reads,
      dispose: () => {
        clearInterval(timer)
        void running.close().catch(() => {})
      },
    }
  } catch {
    ctx?.close().catch(() => {})
    return null
  }
}

/**
 * One press-and-hold recording. `start()` acquires the mic and begins capture;
 * `stop()` finalizes and returns the Blob (null if nothing was captured). When
 * the duration cap is reached, `onAutoStop` fires so the caller can stop the
 * session exactly as if the user had released.
 */
export class RecordSession {
  private rec: MediaRecorder | null = null
  private stream: MediaStream | null = null
  private level: LevelReader | null = null
  private systemMuted = false
  private chunks: BlobPart[] = []
  private startedAt = 0
  private timer: ReturnType<typeof setTimeout> | null = null
  private done = false

  constructor(
    private readonly mime: string,
    private readonly onAutoStop?: () => void,
    private readonly maxSec: number = MAX_RECORD_SEC,
  ) {}

  /** The system muted the microphone before any signal arrived. */
  get mutedBySystem(): boolean {
    return this.systemMuted
  }

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    this.chunks = []
    this.done = false
    this.systemMuted = false
    this.level = createLevelReader(this.stream)
    const [track] = this.stream.getAudioTracks?.() ?? []
    track?.addEventListener?.('mute', this.onTrackMute)
    const rec = new MediaRecorder(this.stream, { mimeType: this.mime })
    rec.ondataavailable = (e: BlobEvent) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data)
    }
    this.rec = rec
    this.startedAt = Date.now()
    rec.start()
    this.timer = setTimeout(() => this.onAutoStop?.(), this.maxSec * 1000)
  }

  /**
   * A mute while nothing has been captured yet means the clip can only come out
   * silent, so end the press immediately and let the caller say so. A mute after
   * real audio is a device switch — keep recording.
   */
  private onTrackMute = () => {
    if (!this.level || this.level.peak() > SILENT_PEAK) return
    this.systemMuted = true
    this.onAutoStop?.()
  }

  async stop(): Promise<RecordingResult | null> {
    if (this.done) return null
    this.done = true
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    const durationSec = Math.max(0.1, (Date.now() - this.startedAt) / 1000)
    const rec = this.rec
    const blob = await new Promise<Blob>((resolve) => {
      if (!rec || rec.state === 'inactive') {
        resolve(new Blob(this.chunks, { type: this.mime }))
        return
      }
      rec.onstop = () => resolve(new Blob(this.chunks, { type: this.mime }))
      rec.stop()
    })
    const silent = (this.level?.reads() ?? 0) > 0 && this.level!.peak() <= SILENT_PEAK
    this.release()
    if (!blob.size) return null
    return { blob, mime: this.mime, durationSec, silent }
  }

  private release(): void {
    this.level?.dispose()
    this.level = null
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    this.rec = null
  }
}

export interface LongPressHandlers {
  onStart: () => void
  onEnd: () => void
}

/**
 * Wire press-and-hold semantics onto an element: pointerdown starts; pointerup,
 * pointercancel and pointerleave all end (a cancelled or dragged-off gesture is
 * treated the same as a release). contextmenu is suppressed so mobile long-press
 * doesn't pop the system menu. Returns a detach function.
 */
export function attachLongPress(el: HTMLElement, handlers: LongPressHandlers): () => void {
  let pressed = false
  const down = (e: Event) => {
    if (pressed) return
    pressed = true
    e.preventDefault()
    handlers.onStart()
  }
  const up = () => {
    if (!pressed) return
    pressed = false
    handlers.onEnd()
  }
  const menu = (e: Event) => e.preventDefault()

  el.addEventListener('pointerdown', down)
  el.addEventListener('pointerup', up)
  el.addEventListener('pointercancel', up)
  el.addEventListener('pointerleave', up)
  el.addEventListener('contextmenu', menu)
  return () => {
    el.removeEventListener('pointerdown', down)
    el.removeEventListener('pointerup', up)
    el.removeEventListener('pointercancel', up)
    el.removeEventListener('pointerleave', up)
    el.removeEventListener('contextmenu', menu)
  }
}
