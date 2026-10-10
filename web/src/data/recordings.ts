/**
 * Client for the recordings serverless function.
 *
 * The anon id lives only in localStorage and is sent as the X-Anon-Id header;
 * the server rebuilds every object key under that prefix, so a client can never
 * address another anon's recordings — not to upload, delete, or score it.
 * Uploads run through a small queue with bounded exponential-backoff retries and
 * are abortable (needed when a trial is disposed mid-upload).
 */
import { RECORDINGS_API } from '../config'

const ANON_KEY = 'sanguo.recordings.anonId'
const MAX_ATTEMPTS = 3

export interface PresignInput {
  episode: number
  entryId: string
  durationSec: number
  mime: string
}

export interface PresignResult {
  recId: string
  uploadUrl: string
  key: string
  /** Whether the server can score this recording; false hides the scoring entry. */
  assessAvailable: boolean
}

/** Descriptor the server needs to rebuild (and delete) an object key. */
export interface RecordingRef {
  episode: number
  entryId: string
  recId: string
  ext: string
}

export interface AssessResult {
  /** 0–100 character-level similarity against the span's reference text. */
  score: number
  transcript: string
  /**
   * True when the ASR detected a non-Cantonese reading (e.g. Mandarin). The
   * score is still returned; this only drives an advisory hint in the UI.
   */
  languageWarning?: boolean
}

const EXT_BY_MIME: Record<string, string> = {
  'audio/opus': 'opus',
  'audio/webm': 'webm',
  'audio/webm;codecs=opus': 'webm',
  'audio/mp4': 'm4a',
}

export function extForMime(mime: string): string | null {
  return EXT_BY_MIME[mime] ?? null
}

function uuidv4(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  // Fallback for environments without randomUUID (insecure but well-formed).
  const bytes = new Uint8Array(16)
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(bytes)
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256)
  bytes[6] = (bytes[6]! & 0x0f) | 0x40
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** Stable per-device anon id: generated once, then persisted in localStorage. */
export function getAnonId(): string {
  let id: string | null = null
  try {
    id = localStorage.getItem(ANON_KEY)
  } catch {
    id = null
  }
  if (!id) {
    id = uuidv4()
    try {
      localStorage.setItem(ANON_KEY, id)
    } catch {
      // Storage unavailable (private mode): keep the id in memory for this session.
    }
  }
  return id
}

function apiUrl(path: string): string {
  if (!RECORDINGS_API) throw new Error('recordings API not configured')
  return `${RECORDINGS_API}${path}`
}

/**
 * A presigned uploadUrl may be root-relative (local backend) or absolute (OSS).
 * The recording is personal data, so an absolute URL has to be https — the OSS
 * signer only ever emits https, and anything else means the response was tampered
 * with and must not be handed our audio. `//host` is refused too: with no
 * RECORDINGS_API it would resolve against the attacker's host, not ours.
 */
function resolveUploadUrl(uploadUrl: string): string {
  if (/^https:\/\//i.test(uploadUrl)) return uploadUrl
  if (/^[a-z][a-z0-9+.-]*:/i.test(uploadUrl) || uploadUrl.startsWith('//')) {
    throw new Error('refusing a non-https upload url')
  }
  return `${RECORDINGS_API ?? ''}${uploadUrl}`
}

/** A non-2xx response, carrying the status and the server's own reason. */
export class RecordingsError extends Error {
  constructor(message: string, readonly status: number, readonly reason: string) {
    super(message)
    this.name = 'RecordingsError'
  }
}

async function postJson<T>(path: string, body: unknown, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Anon-Id': getAnonId() },
    body: JSON.stringify(body),
    ...init,
  })
  if (!res.ok) throw await toError(path, res)
  return (await res.json()) as T
}

/** Surface the server's own reason when it sent one, so failures stay explainable. */
async function toError(path: string, res: Response): Promise<RecordingsError> {
  let reason = ''
  try {
    const parsed = (await res.json()) as { error?: unknown }
    if (typeof parsed?.error === 'string') reason = parsed.error
  } catch {
    // Non-JSON error body: the status code alone is the message.
  }
  return new RecordingsError(
    `recordings ${path} failed (${res.status})${reason ? `: ${reason}` : ''}`,
    res.status,
    reason,
  )
}

export function presignUpload(input: PresignInput, init?: RequestInit): Promise<PresignResult> {
  return postJson<PresignResult>('/presign-upload', input, init)
}

/**
 * Score one of the caller's own recordings. The server rebuilds the object key
 * from the anon header plus this reference, so only the descriptor is sent —
 * never a key. Rejects with the server's reason (unavailable, not found, ASR
 * failure); callers decide how to display it.
 */
export function assessRecording(
  ref: RecordingRef,
  opts: { signal?: AbortSignal } = {},
): Promise<AssessResult> {
  const { episode, entryId, recId, ext } = ref
  return postJson<AssessResult>('/assess', { episode, entryId, recId, ext }, { signal: opts.signal })
}

/**
 * Delete the given recordings. `keepalive` survives page unload (pagehide).
 * Returns the number the server reported as deleted.
 */
export async function disposeRecordings(
  items: RecordingRef[],
  opts: { keepalive?: boolean; signal?: AbortSignal } = {},
): Promise<number> {
  if (!items.length) return 0
  try {
    const out = await postJson<{ deleted: number }>(
      '/dispose',
      { items },
      { keepalive: opts.keepalive, signal: opts.signal },
    )
    return out.deleted
  } catch {
    // A failed dispose is non-fatal: the server-side lifecycle rule is the
    // backstop. Swallow so unload/route-change cleanup never throws.
    return 0
  }
}

/** What a finished upload leaves behind: the cloud descriptor plus whether the server can score it. */
export interface UploadedRecording {
  ref: RecordingRef
  assessAvailable: boolean
}

export interface UploadHandle {
  /** Resolves when the object is durably uploaded; rejects if all attempts fail. */
  promise: Promise<UploadedRecording>
  /** Abort in-flight work; the promise rejects with an AbortError. */
  abort: () => void
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Presign then PUT the blob, retrying the whole exchange up to MAX_ATTEMPTS
 * times with exponential backoff. Aborting cancels the current fetch and skips
 * further retries.
 */
export function enqueueUpload(
  input: PresignInput,
  blob: Blob,
): UploadHandle {
  const controller = new AbortController()
  const { signal } = controller

  const run = async (): Promise<UploadedRecording> => {
    let lastErr: unknown
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
      try {
        const presign = await presignUpload(input, { signal })
        const res = await fetch(resolveUploadUrl(presign.uploadUrl), {
          method: 'PUT',
          headers: { 'Content-Type': input.mime },
          body: blob,
          signal,
        })
        if (!res.ok) throw new Error(`upload failed (${res.status})`)
        const ext = extForMime(input.mime)
        if (!ext) throw new Error(`unsupported mime ${input.mime}`)
        return {
          ref: { episode: input.episode, entryId: input.entryId, recId: presign.recId, ext },
          assessAvailable: presign.assessAvailable === true,
        }
      } catch (err) {
        if (signal.aborted || (err as Error)?.name === 'AbortError') {
          throw new DOMException('Aborted', 'AbortError')
        }
        lastErr = err
        if (attempt < MAX_ATTEMPTS - 1) await delay(2 ** attempt * 200)
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('upload failed')
  }

  return { promise: run(), abort: () => controller.abort() }
}
