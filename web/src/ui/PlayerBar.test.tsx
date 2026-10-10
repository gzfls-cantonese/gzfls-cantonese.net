import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import PlayerBar from './PlayerBar'
import { LocaleProvider, useLocale } from '../i18n/locale'
import type { PlayerState } from '../player/usePlayer'

function player(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    currentIndex: 4,
    status: 'idle',
    errorEntryId: null,
    play: vi.fn(),
    pause: vi.fn(),
    toggle: vi.fn(),
    next: vi.fn(),
    prev: vi.fn(),
    seekTo: vi.fn(),
    ...overrides,
  }
}

function LocaleProbe() {
  const { setLocale } = useLocale()
  return <button onClick={() => setLocale('en')}>to-en</button>
}

function renderBar(p: PlayerState, total = 12) {
  return render(
    <LocaleProvider>
      <PlayerBar player={p} total={total} />
      <LocaleProbe />
    </LocaleProvider>,
  )
}

function switchToEnglish() {
  fireEvent.click(screen.getByRole('button', { name: 'to-en' }))
}

beforeEach(() => window.localStorage.clear())

describe('PlayerBar locale', () => {
  it('names the main control Play when idle and Pause when playing', () => {
    const view = renderBar(player({ status: 'idle' }))
    expect(screen.getByRole('button', { name: '播放' })).toBeInTheDocument()

    view.rerender(
      <LocaleProvider>
        <PlayerBar player={player({ status: 'playing' })} total={12} />
        <LocaleProbe />
      </LocaleProvider>,
    )
    expect(screen.getByRole('button', { name: '暫停' })).toBeInTheDocument()

    switchToEnglish()
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()
  })

  it('renders every status label in both locales', () => {
    const cases: [PlayerState['status'], string, string][] = [
      ['playing', '播放中', 'Playing'],
      ['paused', '已暫停', 'Paused'],
      ['ended', '本集已結束', 'Episode finished'],
      ['error', '片段錯誤', 'Segment error'],
      ['idle', '待播放', 'Ready'],
    ]
    for (const [status, zh, en] of cases) {
      // Each pass starts from the default locale rather than the one the previous
      // pass stored.
      window.localStorage.clear()
      const view = renderBar(player({ status }))
      expect(screen.getByText(zh)).toBeInTheDocument()
      switchToEnglish()
      expect(screen.getByText(en)).toBeInTheDocument()
      view.unmount()
    }
  })

  it('shows identical position numbers in both locales', () => {
    renderBar(player({ status: 'playing', currentIndex: 4 }), 12)
    expect(screen.getByText('5 / 12')).toBeInTheDocument()

    switchToEnglish()
    expect(screen.getByText('5 / 12')).toBeInTheDocument()
  })

  it('keeps the dataset entry id verbatim inside the skipped-segment message', () => {
    renderBar(player({ status: 'error', errorEntryId: 'sg_001_007' }))
    expect(screen.getByText(/暫時無法播放/)).toBeInTheDocument()
    expect(screen.getByText('sg_001_007')).toBeInTheDocument()

    switchToEnglish()
    const message = screen.getByText(/cannot play right now/)
    expect(message).toHaveTextContent('Segment sg_001_007 cannot play right now and was skipped')
    expect(screen.getByText('sg_001_007').tagName).toBe('CODE')
  })
})
