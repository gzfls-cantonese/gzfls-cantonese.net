import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'

vi.mock('./recorder', () => ({
  MAX_RECORD_SEC: 60,
  MIME_CHAIN: ['audio/opus'],
  isRecordingSupported: () => true,
  pickMime: () => 'audio/opus',
  attachLongPress: () => () => {},
  RecordSession: class {
    constructor(
      public mime: string,
      public onAutoStop?: () => void,
    ) {}
    async start() {}
    async stop() {
      return { blob: new Blob(['rec'], { type: 'audio/opus' }), mime: 'audio/opus', durationSec: 3 }
    }
  },
}))

vi.mock('./recordings', () => {
  class RecordingsError extends Error {
    constructor(message: string, readonly status: number, readonly reason: string) {
      super(message)
      this.name = 'RecordingsError'
    }
  }
  const uploaded = { ref: { episode: 1, entryId: 'e1', recId: 'r1', ext: 'opus' }, assessAvailable: true }
  return {
    RecordingsError,
    enqueueUpload: vi.fn((_input: unknown, _blob: Blob) => ({
      promise: Promise.resolve(uploaded),
      abort: vi.fn(),
    })),
    disposeRecordings: vi.fn(() => Promise.resolve(1)),
    assessRecording: vi.fn((_ref: unknown, _opts?: { signal?: AbortSignal }) => Promise.resolve({ score: 88, transcript: '我就係楷叔' })),
  }
})

import { assessRecording, disposeRecordings, enqueueUpload, RecordingsError } from './recordings'
import { useTrialRecord } from './useTrialRecord'

const baseProps = {
  episode: 1,
  entryId: 'e1',
  enabled: true,
  onNeedsDatasetPause: () => {},
}

beforeEach(() => {
  vi.clearAllMocks()
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock') as never
  globalThis.URL.revokeObjectURL = vi.fn() as never
  HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve()) as never
  HTMLMediaElement.prototype.pause = vi.fn() as never
})

afterEach(() => {
  vi.restoreAllMocks()
})

// Let the upload promise's .then run so cloudRef is populated.
const flush = () => act(async () => {})

describe('useTrialRecord', () => {
  it('begin → holding, end → recorded with a bubble, and uploads', async () => {
    const onNeedsDatasetPause = vi.fn()
    const { result } = renderHook(() => useTrialRecord({ ...baseProps, onNeedsDatasetPause }))
    expect(result.current.supported).toBe(true)
    expect(result.current.phase).toBe('idle')

    act(() => result.current.begin())
    expect(result.current.phase).toBe('holding')
    expect(onNeedsDatasetPause).toHaveBeenCalled() // dataset paused on capture

    await act(async () => {
      await result.current.end()
    })
    expect(result.current.phase).toBe('recorded')
    expect(result.current.bubble).toMatchObject({ entryId: 'e1', url: 'blob:mock' })
    expect(enqueueUpload).toHaveBeenCalledOnce()
  })

  it('re-recording overrides the previous trial (disposes the old cloud object)', async () => {
    const { result } = renderHook(() => useTrialRecord(baseProps))
    act(() => result.current.begin())
    await act(async () => {
      await result.current.end()
    })
    await flush()
    expect(result.current.bubble).not.toBeNull()

    // Second recording on the same span replaces the first.
    act(() => result.current.begin())
    expect(disposeRecordings).toHaveBeenCalled() // old cloud object deleted
    await act(async () => {
      await result.current.end()
    })
    // Still exactly one bubble.
    expect(result.current.bubble).not.toBeNull()
  })

  it('dispose clears the bubble, revokes the URL and deletes the cloud object', async () => {
    const { result } = renderHook(() => useTrialRecord(baseProps))
    act(() => result.current.begin())
    await act(async () => {
      await result.current.end()
    })
    await flush()

    act(() => result.current.dispose())
    expect(result.current.bubble).toBeNull()
    expect(result.current.phase).toBe('idle')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock')
    expect(disposeRecordings).toHaveBeenCalledWith(
      [{ episode: 1, entryId: 'e1', recId: 'r1', ext: 'opus' }],
      { keepalive: false },
    )
  })

  it('bubble playback pauses the dataset (mutual exclusion)', async () => {
    const onNeedsDatasetPause = vi.fn()
    const { result } = renderHook(() => useTrialRecord({ ...baseProps, onNeedsDatasetPause }))
    act(() => result.current.begin())
    await act(async () => {
      await result.current.end()
    })
    onNeedsDatasetPause.mockClear()

    act(() => result.current.toggleBubble())
    expect(result.current.bubblePlaying).toBe(true)
    expect(onNeedsDatasetPause).toHaveBeenCalled()
  })

  it('is inert when the feature is disabled (no RECORDINGS_API)', () => {
    const { result } = renderHook(() => useTrialRecord({ ...baseProps, enabled: false }))
    expect(result.current.supported).toBe(false)
    act(() => result.current.begin())
    expect(result.current.phase).toBe('idle')
  })
})

/** Reach the state a visitor scores from: recorded, uploaded, cloud ref set. */
async function recorded() {
  const hook = renderHook(() => useTrialRecord(baseProps))
  act(() => hook.result.current.begin())
  await act(async () => {
    await hook.result.current.end()
  })
  await flush()
  return hook
}

/** Make the next scoring request hang, so the in-flight behaviour is observable. */
function hangNextAssess() {
  vi.mocked(assessRecording).mockImplementationOnce(
    () => new Promise<never>(() => {}) as never,
  )
}

const assessSignal = () => (vi.mocked(assessRecording).mock.calls[0]![1] as { signal?: AbortSignal }).signal

describe('useTrialRecord scoring', () => {
  it('offers scoring only when the server reports it available', async () => {
    const { result } = await recorded()
    expect(result.current.bubble).toMatchObject({ assessAvailable: true, assessment: { status: 'idle' } })
  })

  it('does not request scoring when the server hid the entry point', async () => {
    vi.mocked(enqueueUpload).mockReturnValueOnce({
      promise: Promise.resolve({
        ref: { episode: 1, entryId: 'e1', recId: 'r1', ext: 'opus' },
        assessAvailable: false,
      }),
      abort: vi.fn(),
    } as never)
    const { result } = await recorded()
    expect(result.current.bubble?.assessAvailable).toBe(false)
    act(() => result.current.assess())
    await flush()
    expect(assessRecording).not.toHaveBeenCalled()
    expect(result.current.bubble?.assessment).toEqual({ status: 'idle' })
  })

  it('does not request scoring before the upload finished', async () => {
    vi.mocked(enqueueUpload).mockReturnValueOnce({
      promise: new Promise<never>(() => {}) as never,
      abort: vi.fn(),
    } as never)
    const { result } = renderHook(() => useTrialRecord(baseProps))
    act(() => result.current.begin())
    await act(async () => {
      await result.current.end()
    })
    expect(result.current.bubble).toMatchObject({ uploading: true, assessAvailable: false })
    act(() => result.current.assess())
    expect(assessRecording).not.toHaveBeenCalled()
  })

  it('is single-flight: a second trigger while loading starts no second request', async () => {
    hangNextAssess()
    const { result } = await recorded()
    act(() => result.current.assess())
    expect(result.current.bubble?.assessment.status).toBe('loading')
    act(() => result.current.assess())
    act(() => result.current.assess())
    expect(assessRecording).toHaveBeenCalledTimes(1)
    expect(assessRecording).toHaveBeenCalledWith(
      { episode: 1, entryId: 'e1', recId: 'r1', ext: 'opus' },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it('arms a client-side timeout and echoes score + transcript on success', async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout')
    const { result } = await recorded()
    await act(async () => {
      result.current.assess()
    })
    await flush()
    expect(timeoutSpy).toHaveBeenCalledWith(30_000)
    expect(result.current.bubble?.assessment).toEqual({
      status: 'scored',
      score: 88,
      transcript: '我就係楷叔',
      languageWarning: false,
    })
    // A success is terminal: no second paid call for the same recording.
    act(() => result.current.assess())
    expect(assessRecording).toHaveBeenCalledTimes(1)
  })

  it('carries a non-Cantonese language warning through to the scored bubble', async () => {
    vi.mocked(assessRecording).mockResolvedValueOnce({ score: 100, transcript: '我就係楷叔', languageWarning: true })
    const { result } = await recorded()
    await act(async () => {
      result.current.assess()
    })
    await flush()
    expect(result.current.bubble?.assessment).toEqual({
      status: 'scored',
      score: 100,
      transcript: '我就係楷叔',
      languageWarning: true,
    })
  })

  it('classifies server failures, a disposed recording and a timeout into reason codes', async () => {
    const cases: Array<[unknown, string]> = [
      [new RecordingsError('/assess (503): scoring unavailable', 503, 'scoring unavailable'), 'scoringUnavailable'],
      // Same cause, reached from the other direction: a key present but no ASR host.
      [new RecordingsError('/assess (503): ASR not configured', 503, 'ASR not configured'), 'scoringUnavailable'],
      [new RecordingsError('/assess (429): rate limited', 429, 'rate limited'), 'rateLimited'],
      [new RecordingsError('/assess (404): recording not found', 404, 'recording not found'), 'destroyed'],
      // A 404 from the reference loader is a server data problem, not a destroyed clip.
      [new RecordingsError('/assess (404)', 404, 'episode 12 index not found (404)'), 'serviceUnavailable'],
      [new RecordingsError('/assess (503): ASR returned no transcript', 503, 'ASR returned no transcript'), 'noAudio'],
      [new RecordingsError('/assess (503): ASR timed out', 503, 'ASR timed out'), 'timeout'],
      [new RecordingsError('/assess (503): ASR unreachable', 503, 'ASR unreachable'), 'serviceUnavailable'],
      [new RecordingsError('/assess (503): storage unavailable', 503, 'storage unavailable'), 'serviceUnavailable'],
      [new RecordingsError('/assess (502): ASR error 401', 502, 'ASR error 401'), 'serviceUnavailable'],
      [Object.assign(new Error('Timed out'), { name: 'TimeoutError' }), 'timeout'],
      [new TypeError('network'), 'unknown'],
      [new RecordingsError('/assess (400): invalid episode', 400, 'invalid episode'), 'unknown'],
    ]
    for (const [err, reason] of cases) {
      vi.mocked(assessRecording).mockRejectedValueOnce(err as never)
      const { result, unmount } = await recorded()
      await act(async () => {
        result.current.assess()
      })
      await flush()
      expect(result.current.bubble?.assessment).toEqual({ status: 'failed', reason })
      // Failure must not break local playback.
      act(() => result.current.toggleBubble())
      expect(result.current.bubblePlaying).toBe(true)
      unmount()
    }
  })

  it('dispose aborts an in-flight scoring request and a late result is ignored', async () => {
    hangNextAssess()
    const { result } = await recorded()
    act(() => result.current.assess())
    const signal = assessSignal()
    expect(signal?.aborted).toBe(false)
    act(() => result.current.dispose())
    expect(signal?.aborted).toBe(true)
    expect(result.current.bubble).toBeNull()
    await flush()
    expect(result.current.bubble).toBeNull()
  })
})
