import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MIME_CHAIN,
  RecordSession,
  attachLongPress,
  isRecordingSupported,
  pickMime,
} from './recorder'

class MockMediaRecorder {
  static supported: string[] = []
  static isTypeSupported(mime: string) {
    return MockMediaRecorder.supported.includes(mime)
  }
  state: 'inactive' | 'recording' = 'inactive'
  ondataavailable: ((e: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  constructor(
    public stream: unknown,
    public opts?: { mimeType?: string },
  ) {}
  start() {
    this.state = 'recording'
    this.ondataavailable?.({ data: new Blob(['audio-bytes'], { type: this.opts?.mimeType }) })
  }
  stop() {
    this.state = 'inactive'
    this.onstop?.()
  }
}

function stubMedia(supported: string[]) {
  MockMediaRecorder.supported = supported
  vi.stubGlobal('MediaRecorder', MockMediaRecorder)
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => {} }] }) },
  })
}

beforeEach(() => {
  vi.useRealTimers()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('capability detection', () => {
  it('isRecordingSupported reflects MediaRecorder + getUserMedia', () => {
    vi.stubGlobal('MediaRecorder', undefined)
    expect(isRecordingSupported()).toBe(false)
    stubMedia(['audio/opus'])
    expect(isRecordingSupported()).toBe(true)
  })

  it('pickMime returns the first supported mime from the fallback chain', () => {
    stubMedia(['audio/webm', 'audio/mp4'])
    expect(pickMime()).toBe('audio/webm')
  })

  it('pickMime prefers opus when available', () => {
    stubMedia(['audio/opus', 'audio/webm'])
    expect(pickMime()).toBe('audio/opus')
    expect(MIME_CHAIN[0]).toBe('audio/opus')
  })

  it('pickMime returns null when nothing is supported', () => {
    stubMedia([])
    expect(pickMime()).toBeNull()
  })
})

describe('RecordSession', () => {
  it('captures a blob and reports a positive duration', async () => {
    stubMedia(['audio/opus'])
    const s = new RecordSession('audio/opus')
    await s.start()
    const result = await s.stop()
    expect(result).not.toBeNull()
    expect(result!.blob.size).toBeGreaterThan(0)
    expect(result!.mime).toBe('audio/opus')
    expect(result!.durationSec).toBeGreaterThan(0)
  })

  it('fires onAutoStop when the duration cap is reached', async () => {
    stubMedia(['audio/opus'])
    vi.useFakeTimers()
    const onAutoStop = vi.fn()
    const s = new RecordSession('audio/opus', onAutoStop, 0.05)
    await s.start()
    expect(onAutoStop).not.toHaveBeenCalled()
    vi.advanceTimersByTime(60)
    expect(onAutoStop).toHaveBeenCalledOnce()
    await s.stop()
  })

  it('stop is idempotent (second call returns null)', async () => {
    stubMedia(['audio/opus'])
    const s = new RecordSession('audio/opus')
    await s.start()
    expect(await s.stop()).not.toBeNull()
    expect(await s.stop()).toBeNull()
  })
})

describe('RecordSession input level', () => {
  /**
   * Stand-in for a capture that carries one constant waveform value, plus a
   * track that can emit `mute`. `byte` of 128 is the centre line, i.e. no signal.
   */
  function stubCapture(byte: number, ctxState = 'running') {
    stubMedia(['audio/opus'])
    const listeners: Record<string, Array<() => void>> = {}
    const track = {
      stop: () => {},
      addEventListener: (type: string, fn: () => void) => {
        ;(listeners[type] ??= []).push(fn)
      },
    }
    const stream = { getTracks: () => [track], getAudioTracks: () => [track] }
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: async () => stream },
    })
    vi.stubGlobal('AudioContext', class {
      state = ctxState
      resume = () => Promise.resolve()
      close = () => Promise.resolve()
      createAnalyser = () => ({
        fftSize: 0,
        getByteTimeDomainData: (buf: Uint8Array) => buf.fill(byte),
      })
      createMediaStreamSource = () => ({ connect: () => {} })
    })
    return {
      emit: (type: string) => listeners[type]?.forEach((fn) => fn()),
    }
  }

  it('flags a clip whose level never left the centre line as silent', async () => {
    stubCapture(128)
    vi.useFakeTimers()
    const s = new RecordSession('audio/opus')
    await s.start()
    vi.advanceTimersByTime(250)
    expect((await s.stop())!.silent).toBe(true)
  })

  it('does not flag a clip that carried signal', async () => {
    stubCapture(128 + 40)
    vi.useFakeTimers()
    const s = new RecordSession('audio/opus')
    await s.start()
    vi.advanceTimersByTime(250)
    expect((await s.stop())!.silent).toBe(false)
  })

  it('withholds the verdict while the audio context is suspended', async () => {
    // A suspended context reports a flat waveform, which must not read as silence.
    stubCapture(128, 'suspended')
    vi.useFakeTimers()
    const s = new RecordSession('audio/opus')
    await s.start()
    vi.advanceTimersByTime(250)
    expect((await s.stop())!.silent).toBe(false)
  })

  it('ends the press when the system mutes a track that carried nothing', async () => {
    const mic = stubCapture(128)
    const onAutoStop = vi.fn()
    vi.useFakeTimers()
    const s = new RecordSession('audio/opus', onAutoStop)
    await s.start()
    vi.advanceTimersByTime(250)
    mic.emit('mute')
    expect(onAutoStop).toHaveBeenCalledOnce()
    expect(s.mutedBySystem).toBe(true)
  })

  it('keeps recording through a mute that arrives after real audio', async () => {
    const mic = stubCapture(128 + 40)
    const onAutoStop = vi.fn()
    vi.useFakeTimers()
    const s = new RecordSession('audio/opus', onAutoStop)
    await s.start()
    vi.advanceTimersByTime(250)
    mic.emit('mute')
    expect(onAutoStop).not.toHaveBeenCalled()
    expect(s.mutedBySystem).toBe(false)
  })
})

describe('attachLongPress', () => {
  function el() {
    const e = document.createElement('button')
    document.body.appendChild(e)
    return e
  }
  const fire = (e: HTMLElement, type: string) => e.dispatchEvent(new Event(type, { bubbles: true }))

  it('pointerdown starts, pointerup ends', () => {
    const onStart = vi.fn()
    const onEnd = vi.fn()
    const e = el()
    attachLongPress(e, { onStart, onEnd })
    fire(e, 'pointerdown')
    expect(onStart).toHaveBeenCalledOnce()
    fire(e, 'pointerup')
    expect(onEnd).toHaveBeenCalledOnce()
  })

  it('pointercancel ends the gesture just like a release', () => {
    const onStart = vi.fn()
    const onEnd = vi.fn()
    const e = el()
    attachLongPress(e, { onStart, onEnd })
    fire(e, 'pointerdown')
    fire(e, 'pointercancel')
    expect(onEnd).toHaveBeenCalledOnce()
  })

  it('ignores a duplicate pointerup without a press, and detaches cleanly', () => {
    const onStart = vi.fn()
    const onEnd = vi.fn()
    const e = el()
    const detach = attachLongPress(e, { onStart, onEnd })
    fire(e, 'pointerup')
    expect(onEnd).not.toHaveBeenCalled()
    detach()
    fire(e, 'pointerdown')
    expect(onStart).not.toHaveBeenCalled()
  })
})
