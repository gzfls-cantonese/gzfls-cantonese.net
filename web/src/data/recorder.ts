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
  private chunks: BlobPart[] = []
  private startedAt = 0
  private timer: ReturnType<typeof setTimeout> | null = null
  private done = false

  constructor(
    private readonly mime: string,
    private readonly onAutoStop?: () => void,
    private readonly maxSec: number = MAX_RECORD_SEC,
  ) {}

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    this.chunks = []
    this.done = false
    const rec = new MediaRecorder(this.stream, { mimeType: this.mime })
    rec.ondataavailable = (e: BlobEvent) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data)
    }
    this.rec = rec
    this.startedAt = Date.now()
    rec.start()
    this.timer = setTimeout(() => this.onAutoStop?.(), this.maxSec * 1000)
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
    this.release()
    if (!blob.size) return null
    return { blob, mime: this.mime, durationSec }
  }

  private release(): void {
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
