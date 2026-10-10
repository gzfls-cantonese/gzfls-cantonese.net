import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import EpisodePage from './EpisodePage'
import { DataError } from '../data/api'
import { LocaleProvider, useLocale } from '../i18n/locale'

const loadManifest = vi.fn()
const loadEpisode = vi.fn()
vi.mock('../data/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/api')>()
  return {
    ...actual,
    loadManifest: () => loadManifest(),
    loadEpisode: (episode: number) => loadEpisode(episode),
    episodeCoverUrl: (c: string) => c,
  }
})

function LocaleProbe() {
  const { setLocale } = useLocale()
  return <button onClick={() => setLocale('en')}>to-en</button>
}

function renderAt(path: string) {
  return render(
    <LocaleProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/episode/:episode" element={<EpisodePage />} />
        </Routes>
        <LocaleProbe />
      </MemoryRouter>
    </LocaleProvider>,
  )
}

function switchToEnglish() {
  fireEvent.click(screen.getByRole('button', { name: 'to-en' }))
}

beforeEach(() => {
  loadManifest.mockReset()
  loadEpisode.mockReset()
  window.localStorage.clear()
  // jsdom logs "Not implemented" for media methods; the player only needs them to exist.
  HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve()) as never
  HTMLMediaElement.prototype.pause = vi.fn() as never
})

describe('EpisodePage invalid episode number', () => {
  it('renders the message and back link in the active locale', async () => {
    loadManifest.mockResolvedValue({ episodes: [] })
    renderAt('/episode/0')

    expect(await screen.findByText('集號無效（應為 1–157）。')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '返回選集' })).toHaveAttribute('href', '/')

    switchToEnglish()
    expect(screen.getByText('Invalid episode number (must be 1–157).')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to episodes' })).toBeInTheDocument()
  })

  it('rejects the same way when routed straight to an out-of-range episode', async () => {
    loadManifest.mockResolvedValue({ episodes: [] })
    renderAt('/episode/158')

    expect(await screen.findByText('集號無效（應為 1–157）。')).toBeInTheDocument()
    expect(loadEpisode).not.toHaveBeenCalled()
  })
})

describe('EpisodePage load failure', () => {
  it('shows the reason and re-translates it on a locale switch', async () => {
    loadManifest.mockResolvedValue({ episodes: [] })
    loadEpisode.mockRejectedValue(new DataError('network', 'fetch failed: episodes/ep_001.json'))
    renderAt('/episode/1')

    expect(await screen.findByText('載入失敗：網絡錯誤，無法連線伺服器')).toBeInTheDocument()

    switchToEnglish()
    expect(screen.getByText('Failed to load: Network error — could not reach the server')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back' })).toBeInTheDocument()
  })
})

const COUPLET = '宴桃園豪傑三結義 斬黃巾英雄首立功'

function loadValidEpisode() {
  loadManifest.mockResolvedValue({
    episodes: [{ episode: 1, title: COUPLET, count: 2, totalDuration: 240, cover: 'c1', index: 'i1' }],
  })
  loadEpisode.mockResolvedValue({
    episode: 1,
    count: 2,
    totalDuration: 240,
    entries: [
      { id: 'sg_001_001', duration: 3, transcription: '測試一句', jyutping: ['ci3', 'si5', 'jat1', 'geoi3'], audio: 'a.mp3' },
      { id: 'sg_001_002', duration: 3, transcription: '第二句', jyutping: ['dai6', 'ji6', 'geoi3'], audio: 'b.mp3' },
    ],
  })
}

describe('EpisodePage chrome', () => {
  it('renders English chrome around the unchanged Chinese episode title', async () => {
    loadValidEpisode()
    renderAt('/episode/1')

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('宴桃園豪傑三結義')
    expect(screen.getByRole('link', { name: /選集/ })).toBeInTheDocument()
    expect(screen.getByText('2 段 · 4 分鐘')).toBeInTheDocument()

    switchToEnglish()

    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).toHaveTextContent('宴桃園豪傑三結義')
    expect(heading).toHaveTextContent('斬黃巾英雄首立功')
    expect(screen.getByRole('link', { name: /Episodes/ })).toBeInTheDocument()
    expect(screen.getByText('2 segments, 4 min')).toBeInTheDocument()
    expect(screen.queryByText('2 段 · 4 分鐘')).not.toBeInTheDocument()
  })

  it('keeps the localized fallback title on one line when the episode has no title', async () => {
    loadValidEpisode()
    loadManifest.mockResolvedValue({ episodes: [{ episode: 1, title: null, count: 2, totalDuration: 240, cover: 'c1', index: 'i1' }] })
    renderAt('/episode/1')

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('第 1 集')
    expect(screen.getAllByRole('heading', { level: 1 })[0].children).toHaveLength(1)

    switchToEnglish()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Episode 1')
    expect(screen.getAllByRole('heading', { level: 1 })[0].children).toHaveLength(1)
  })
})
