import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// recordings.ts reads RECORDINGS_API from config at import time.
vi.mock('../config', () => ({ RECORDINGS_API: 'http://rec.test' }))

import {
  assessRecording,
  disposeRecordings,
  enqueueUpload,
  extForMime,
  getAnonId,
  presignUpload,
  RecordingsError,
} from './recordings'

const ANON_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function json(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('getAnonId', () => {
  it('generates a UUID v4 once and stays stable across calls', () => {
    const a = getAnonId()
    const b = getAnonId()
    expect(a).toMatch(ANON_RE)
    expect(b).toBe(a)
    expect(localStorage.getItem('sanguo.recordings.anonId')).toBe(a)
  })
})

describe('presignUpload', () => {
  it('posts to the API with the X-Anon-Id header', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      json({ recId: 'r1', uploadUrl: '/local-put/recordings/x.opus', key: 'recordings/x.opus' }),
    )
    const out = await presignUpload({ episode: 1, entryId: 'e1', durationSec: 5, mime: 'audio/opus' })
    expect(out.recId).toBe('r1')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://rec.test/presign-upload')
    const headers = (init as RequestInit).headers as Record<string, string>
    expect(headers['X-Anon-Id']).toMatch(ANON_RE)
    expect(headers['Content-Type']).toBe('application/json')
  })
})

describe('extForMime', () => {
  it('maps the supported mime types', () => {
    expect(extForMime('audio/opus')).toBe('opus')
    expect(extForMime('audio/webm;codecs=opus')).toBe('webm')
    expect(extForMime('audio/mp4')).toBe('m4a')
    expect(extForMime('audio/xyz')).toBeNull()
  })
})

describe('enqueueUpload', () => {
  it('presigns then PUTs to a relative uploadUrl resolved against the API base', async () => {
    const calls: string[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String((input as Request).url ?? input)
      calls.push(url)
      if (url.endsWith('/presign-upload')) {
        return json({ recId: 'r9', uploadUrl: '/local-put/recordings/a.opus', key: 'recordings/a.opus', assessAvailable: true })
      }
      return new Response(null, { status: 200 })
    })
    const handle = enqueueUpload(
      { episode: 2, entryId: 'e2', durationSec: 4, mime: 'audio/opus' },
      new Blob(['x'], { type: 'audio/opus' }),
    )
    const out = await handle.promise
    expect(out).toEqual({
      ref: { episode: 2, entryId: 'e2', recId: 'r9', ext: 'opus' },
      assessAvailable: true,
    })
    expect(calls[1]).toBe('http://rec.test/local-put/recordings/a.opus')
  })

  it('PUTs to an absolute https uploadUrl verbatim', async () => {
    const calls: string[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String((input as Request).url ?? input)
      calls.push(url)
      if (url.endsWith('/presign-upload')) {
        return json({
          recId: 'r2',
          uploadUrl: 'https://bucket.oss.example/recordings/a.opus?sig=1',
          key: 'recordings/a.opus',
        })
      }
      return new Response(null, { status: 200 })
    })
    const handle = enqueueUpload(
      { episode: 1, entryId: 'e1', durationSec: 3, mime: 'audio/opus' },
      new Blob(['x']),
    )
    await expect(handle.promise).resolves.toMatchObject({ ref: { recId: 'r2' } })
    expect(calls[1]).toBe('https://bucket.oss.example/recordings/a.opus?sig=1')
  })

  it('refuses to hand the recording to a non-https uploadUrl', async () => {
    vi.useFakeTimers()
    for (const bad of [
      'http://bucket.oss.example/recordings/a.opus',
      '//evil.example/recordings/a.opus',
      'javascript:alert(1)',
    ]) {
      const calls: string[] = []
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        const url = String((input as Request).url ?? input)
        calls.push(url)
        if (url.endsWith('/presign-upload')) return json({ recId: 'r3', uploadUrl: bad, key: 'k.opus' })
        return new Response(null, { status: 200 })
      })
      const handle = enqueueUpload(
        { episode: 1, entryId: 'e1', durationSec: 3, mime: 'audio/opus' },
        new Blob(['x']),
      )
      const settled = handle.promise.then(
        () => null,
        (err: Error) => err.message,
      )
      await vi.runAllTimersAsync()
      expect(await settled).toBe('refusing a non-https upload url')
      // Presign was retried; the PUT to the hostile URL never happened.
      expect(calls.length).toBeGreaterThan(0)
      expect(calls.every((u) => u === 'http://rec.test/presign-upload')).toBe(true)
    }
  })

  it('retries a failed upload then succeeds (bounded backoff)', async () => {
    vi.useFakeTimers()
    let puts = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String((input as Request).url ?? input)
      if (url.endsWith('/presign-upload')) {
        return json({ recId: 'r1', uploadUrl: '/local-put/k.opus', key: 'k.opus' })
      }
      puts += 1
      if (puts < 3) return new Response('boom', { status: 500 })
      return new Response(null, { status: 200 })
    })
    const handle = enqueueUpload(
      { episode: 1, entryId: 'e1', durationSec: 3, mime: 'audio/opus' },
      new Blob(['x']),
    )
    const settled = vi.waitFor(() => expect(puts).toBe(3))
    await vi.runAllTimersAsync()
    await settled
    // A presign response without the field means scoring is not offered.
    await expect(handle.promise).resolves.toMatchObject({ ref: { recId: 'r1' }, assessAvailable: false })
  })

  it('abort rejects the upload promise', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => {
      const signal = (init as RequestInit | undefined)?.signal
      return new Promise<Response>((resolve, reject) => {
        const t = setTimeout(() => resolve(json({ recId: 'r1', uploadUrl: '/local-put/k', key: 'k' })), 1000)
        signal?.addEventListener('abort', () => {
          clearTimeout(t)
          reject(new DOMException('Aborted', 'AbortError'))
        })
      })
    })
    const handle = enqueueUpload(
      { episode: 1, entryId: 'e1', durationSec: 3, mime: 'audio/opus' },
      new Blob(['x']),
    )
    handle.abort()
    await expect(handle.promise).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('assessRecording', () => {
  const REF = { episode: 3, entryId: 'e7', recId: 'abc123-def', ext: 'webm' }

  it('posts only the descriptor with the anon header and returns the score', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      json({ score: 82, transcript: '我就係楷叔' }),
    )
    const out = await assessRecording(REF)
    expect(out).toEqual({ score: 82, transcript: '我就係楷叔' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://rec.test/assess')
    const reqInit = init as RequestInit
    expect((reqInit.headers as Record<string, string>)['X-Anon-Id']).toMatch(ANON_RE)
    // The server rebuilds the key: the client must never send one.
    expect(JSON.parse(String(reqInit.body))).toEqual(REF)
  })

  it('rejects with the server reason when scoring is unavailable', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      json({ error: 'scoring unavailable' }, { status: 503 }),
    )
    const err = (await assessRecording(REF).catch((e) => e)) as RecordingsError
    expect(err).toBeInstanceOf(RecordingsError)
    expect(err.message).toBe('recordings /assess failed (503): scoring unavailable')
    expect(err.status).toBe(503)
    expect(err.reason).toBe('scoring unavailable')
  })

  it('rejects with the status alone when the error body is not JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('boom', { status: 502 }))
    const err = (await assessRecording(REF).catch((e) => e)) as RecordingsError
    expect(err.status).toBe(502)
    expect(err.reason).toBe('')
    expect(err.message).toBe('recordings /assess failed (502)')
  })

  it('forwards the abort signal so a hung request can be cancelled', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => {
      const signal = (init as RequestInit | undefined)?.signal
      return new Promise<Response>((resolve, reject) => {
        const t = setTimeout(() => resolve(json({ score: 1, transcript: 'x' })), 1000)
        signal?.addEventListener('abort', () => {
          clearTimeout(t)
          reject(new DOMException('Aborted', 'AbortError'))
        })
      })
    })
    const controller = new AbortController()
    const pending = assessRecording(REF, { signal: controller.signal })
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('disposeRecordings', () => {
  it('returns 0 for an empty list without calling fetch', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    expect(await disposeRecordings([])).toBe(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('swallows failures (server lifecycle is the backstop)', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('network'))
    expect(
      await disposeRecordings([{ episode: 1, entryId: 'e1', recId: 'r1', ext: 'opus' }]),
    ).toBe(0)
  })
})
