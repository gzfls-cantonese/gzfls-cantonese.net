import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import TrialRecorder from './TrialRecorder'
import { LocaleProvider, useLocale } from '../i18n/locale'
import type {
  AssessErrorReason,
  RecorderErrorReason,
  TrialBubble,
  TrialRecordApi,
} from '../data/useTrialRecord'

function api(overrides: Partial<TrialRecordApi> = {}): TrialRecordApi {
  return {
    supported: true,
    phase: 'idle',
    bubble: null,
    bubblePlaying: false,
    error: null,
    begin: vi.fn(),
    end: vi.fn(),
    toggleBubble: vi.fn(),
    assess: vi.fn(),
    dispose: vi.fn(),
    ...overrides,
  }
}

function bubble(overrides: Partial<TrialBubble> = {}): TrialBubble {
  return {
    entryId: 'e1',
    url: 'blob:x',
    durationSec: 4.4,
    uploading: false,
    assessAvailable: true,
    assessment: { status: 'idle' },
    ...overrides,
  }
}

// TrialRecorder renders a router <Link>, so every render needs a Router ancestor.
const rec = (a: TrialRecordApi) => (
  <MemoryRouter>
    <TrialRecorder api={a} />
  </MemoryRouter>
)

describe('TrialRecorder', () => {
  it('renders nothing when unsupported', () => {
    const { container } = render(rec(api({ supported: false })))
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the round mic button with the caption', () => {
    render(rec(api()))
    expect(screen.getByLabelText('長按錄音')).toBeInTheDocument()
    expect(screen.getByText('長按-鬆開，朗讀錄製當前小節和AI評分')).toBeInTheDocument()
  })

  it('links to the privacy statement below the caption', () => {
    render(rec(api()))
    const link = screen.getByRole('link', { name: '隱私和AI評分說明' })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', '/recording-privacy')
  })

  it('long-press starts and release ends the recording', () => {
    const begin = vi.fn()
    const end = vi.fn()
    render(rec(api({ begin, end })))
    const btn = screen.getByLabelText('長按錄音')
    fireEvent.pointerDown(btn)
    expect(begin).toHaveBeenCalledOnce()
    fireEvent.pointerUp(btn)
    expect(end).toHaveBeenCalledOnce()
  })

  it('pointercancel ends the gesture like a release', () => {
    const end = vi.fn()
    render(rec(api({ end })))
    const btn = screen.getByLabelText('長按錄音')
    fireEvent.pointerDown(btn)
    fireEvent.pointerCancel(btn)
    expect(end).toHaveBeenCalledOnce()
  })

  it('still ends the gesture when begin/end identity changes mid-press (re-render)', () => {
    // Regression: phase flipping to 'holding' recreates begin/end; the long-press
    // listener must not be torn down mid-gesture or the release is dropped.
    const end1 = vi.fn()
    const end2 = vi.fn()
    const { rerender } = render(rec(api({ phase: 'idle', end: end1 })))
    const btn = screen.getByLabelText('長按錄音')
    fireEvent.pointerDown(btn)
    rerender(rec(api({ phase: 'holding', end: end2 })))
    fireEvent.pointerUp(screen.getByLabelText('長按錄音'))
    expect(end2).toHaveBeenCalledOnce()
    expect(end1).not.toHaveBeenCalled()
  })

  it('shows the prompt while holding', () => {
    render(rec(api({ phase: 'holding' })))
    expect(screen.getByText('你就係楷叔，快滴講尼段古仔吧')).toBeInTheDocument()
  })

  it('renders the voice bubble and toggles playback on click', () => {
    const toggleBubble = vi.fn()
    render(rec(api({ phase: 'recorded', toggleBubble, bubble: bubble() })))
    const play = screen.getByLabelText('回放錄音')
    expect(play).toBeInTheDocument()
    expect(screen.getByText('4″')).toBeInTheDocument()
    fireEvent.click(play)
    expect(toggleBubble).toHaveBeenCalledOnce()
  })

  it('surfaces an error message', () => {
    render(rec(api({ error: 'micDenied' })))
    expect(screen.getByRole('alert')).toHaveTextContent('無法存取麥克風')
  })
})

describe('TrialRecorder scoring', () => {
  it('hides the scoring entry when the server cannot score', () => {
    render(rec(api({ phase: 'recorded', bubble: bubble({ assessAvailable: false }) })))
    expect(screen.queryByRole('button', { name: '評分' })).not.toBeInTheDocument()
  })

  it('hides the scoring entry while the upload is still in flight only if unavailable', () => {
    // Uploading is orthogonal: the entry is gated by assessAvailable, which the
    // server only reports once the upload's presign resolves.
    render(rec(api({ phase: 'recorded', bubble: bubble({ uploading: true, assessAvailable: false }) })))
    expect(screen.getByText('上傳中…')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '評分' })).not.toBeInTheDocument()
  })

  it('triggers scoring on click', () => {
    const assess = vi.fn()
    render(rec(api({ phase: 'recorded', assess, bubble: bubble() })))
    fireEvent.click(screen.getByRole('button', { name: '評分' }))
    expect(assess).toHaveBeenCalledOnce()
  })

  it('shows a loading state and blocks a second click while scoring', () => {
    const assess = vi.fn()
    render(rec(api({ phase: 'recorded', assess, bubble: bubble({ assessment: { status: 'loading' } }) })))
    const btn = screen.getByRole('button', { name: '評分中…' })
    expect(btn).toBeDisabled()
    fireEvent.click(btn)
    expect(assess).not.toHaveBeenCalled()
  })

  it('echoes the score and transcript, replacing the scoring entry', () => {
    render(
      rec(
        api({
          phase: 'recorded',
          bubble: bubble({ assessment: { status: 'scored', score: 88, transcript: '我就係楷叔' } }),
        }),
      ),
    )
    expect(screen.getByText('88分')).toBeInTheDocument()
    expect(screen.getByText('我就係楷叔')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '評分' })).not.toBeInTheDocument()
    // Playback stays available after scoring.
    expect(screen.getByLabelText('回放錄音')).toBeInTheDocument()
    // No language warning unless the server flagged a non-Cantonese reading.
    expect(screen.queryByText('偵測到非粵語發音，建議用粵語朗讀')).not.toBeInTheDocument()
  })

  it('shows a non-Cantonese warning alongside the score when flagged', () => {
    render(
      rec(
        api({
          phase: 'recorded',
          bubble: bubble({ assessment: { status: 'scored', score: 100, transcript: '我就係楷叔', languageWarning: true } }),
        }),
      ),
    )
    expect(screen.getByText('100分')).toBeInTheDocument()
    expect(screen.getByText('偵測到非粵語發音，建議用粵語朗讀')).toBeInTheDocument()
  })

  it('shows an understandable failure and offers a retry', () => {
    const assess = vi.fn()
    render(
      rec(
        api({
          phase: 'recorded',
          assess,
          bubble: bubble({ assessment: { status: 'failed', reason: 'scoringUnavailable' } }),
        }),
      ),
    )
    expect(screen.getByRole('alert')).toHaveTextContent('評分服務未啟用')
    fireEvent.click(screen.getByRole('button', { name: '評分' }))
    expect(assess).toHaveBeenCalledOnce()
  })
})

function LocaleProbe() {
  const { setLocale } = useLocale()
  return <button onClick={() => setLocale('en')}>to-en</button>
}

const recL = (a: TrialRecordApi) => (
  <LocaleProvider>
    <MemoryRouter>
      <TrialRecorder api={a} />
      <LocaleProbe />
    </MemoryRouter>
  </LocaleProvider>
)

describe('TrialRecorder locale', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('renders every assessment reason in English under the en locale', () => {
    const cases: [AssessErrorReason, string][] = [
      ['scoringUnavailable', 'Scoring is not enabled'],
      ['rateLimited', 'Too many scoring requests — try again later'],
      ['destroyed', 'That recording was already destroyed'],
      ['timeout', 'Scoring timed out — try again later'],
      ['noAudio', "No audio was picked up — check this browser's microphone access in your system settings"],
      ['serviceUnavailable', 'Scoring is unavailable right now — try again later'],
      ['unknown', 'Scoring failed — try again later'],
    ]
    for (const [reason, expected] of cases) {
      const view = render(
        recL(api({ phase: 'recorded', bubble: bubble({ assessment: { status: 'failed', reason } }) })),
      )
      fireEvent.click(screen.getByRole('button', { name: 'to-en' }))
      expect(screen.getByRole('alert')).toHaveTextContent(expected)
      view.unmount()
    }
  })

  it('renders both recorder reasons in English under the en locale', () => {
    const cases: [RecorderErrorReason, string][] = [
      ['unsupportedFormat', 'This browser supports no recording format'],
      ['micDenied', 'Cannot access the microphone — check the permission'],
    ]
    for (const [reason, expected] of cases) {
      const view = render(recL(api({ error: reason })))
      fireEvent.click(screen.getByRole('button', { name: 'to-en' }))
      expect(screen.getByRole('alert')).toHaveTextContent(expected)
      view.unmount()
    }
  })

  it('re-translates a scoring failure already displayed in the bubble', () => {
    render(
      recL(
        api({
          phase: 'recorded',
          bubble: bubble({ assessment: { status: 'failed', reason: 'rateLimited' } }),
        }),
      ),
    )
    expect(screen.getByRole('alert')).toHaveTextContent('評分太頻繁，請稍後再試')
    fireEvent.click(screen.getByRole('button', { name: 'to-en' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Too many scoring requests — try again later')
  })

  it('renders the dock, prompt and privacy link in English', () => {
    render(recL(api({ phase: 'holding' })))
    fireEvent.click(screen.getByRole('button', { name: 'to-en' }))

    expect(screen.getByRole('button', { name: 'Hold to record' })).toBeInTheDocument()
    expect(
      screen.getByText('Hold to record, then score with AI'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Privacy and AI scoring' })).toHaveAttribute(
      'href',
      '/recording-privacy',
    )
    expect(screen.getByRole('status')).toHaveTextContent('You are the storyteller now — go on, tell this part')
  })

  it('renders the bubble controls, uploading indicator and replay names in English', () => {
    render(recL(api({ phase: 'recorded', bubble: bubble({ uploading: true }) })))
    fireEvent.click(screen.getByRole('button', { name: 'to-en' }))

    expect(screen.getByText('Uploading…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Score it' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Play back my recording' })).toBeInTheDocument()
  })

  it('renders the assessing label and the pause replay name in English', () => {
    render(
      recL(
        api({
          phase: 'recorded',
          bubblePlaying: true,
          bubble: bubble({ assessment: { status: 'loading' } }),
        }),
      ),
    )
    fireEvent.click(screen.getByRole('button', { name: 'to-en' }))

    expect(screen.getByRole('button', { name: 'Scoring…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Pause playback' })).toBeInTheDocument()
  })

  it('keeps the numeric score and labels its unit in English', () => {
    render(
      recL(
        api({
          phase: 'recorded',
          bubble: bubble({
            assessment: { status: 'scored', score: 88, transcript: '我就係楷叔', languageWarning: true },
          }),
        }),
      ),
    )
    expect(screen.getByText('88分')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'to-en' }))

    expect(screen.getByText('88 pts')).toBeInTheDocument()
    // The ASR transcript is dataset output, never translated.
    expect(screen.getByText('我就係楷叔')).toBeInTheDocument()
    expect(
      screen.getByText('That did not sound like Cantonese — try reading it in Cantonese'),
    ).toBeInTheDocument()
  })
})
