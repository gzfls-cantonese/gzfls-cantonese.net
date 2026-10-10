import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import HomePage from './HomePage'
import Layout from './Layout'
import { DataError } from '../data/api'
import { LocaleProvider, useLocale } from '../i18n/locale'
import type { Manifest } from '../data/types'

const loadManifest = vi.fn()
vi.mock('../data/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/api')>()
  return {
    ...actual,
    loadManifest: () => loadManifest(),
    episodeCoverUrl: (c: string) => c,
  }
})

function makeManifest(overrides: Partial<Manifest> = {}): Manifest {
  return {
    dataset: 'd',
    source: 's',
    license: 'CC0',
    licenseUrl: 'u',
    episodeCount: 2,
    recordCount: 10,
    totalDuration: 120,
    episodes: [
      { episode: 1, title: '宴桃園豪傑三結義 斬黃巾英雄首立功', arc: 1, count: 5, totalDuration: 60, cover: 'c1', index: 'i1' },
      { episode: 2, title: null, arc: 1, count: 5, totalDuration: 60, cover: 'c2', index: 'i2' },
    ],
    ...overrides,
  }
}

function renderHome() {
  return render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  )
}

describe('HomePage titles and arc grouping', () => {
  beforeEach(() => loadManifest.mockReset())

  it('groups episodes by arc and shows the couplet title as two lines when arcs exist', async () => {
    loadManifest.mockResolvedValue(
      makeManifest({
        arcs: [
          { id: 1, name: '群雄逐鹿', subtitle: '漢室傾頹', title: '群雄逐鹿・漢室傾頹', fromEpisode: 1, toEpisode: 2 },
        ],
      }),
    )
    renderHome()
    expect(await screen.findByText('群雄逐鹿・漢室傾頹')).toBeInTheDocument()
    expect(screen.getByText('宴桃園豪傑三結義')).toBeInTheDocument()
    expect(screen.getByText('斬黃巾英雄首立功')).toBeInTheDocument()
  })

  it('falls back to「第 N 集」when an episode has no title', async () => {
    loadManifest.mockResolvedValue(
      makeManifest({
        arcs: [{ id: 1, name: '群雄逐鹿', subtitle: '漢室傾頹', title: '群雄逐鹿・漢室傾頹', fromEpisode: 1, toEpisode: 2 }],
      }),
    )
    renderHome()
    await screen.findByText('群雄逐鹿・漢室傾頹')
    // Episode 2 has title: null → card title falls back, distinct from the「第 2 集」label
    const fallbacks = screen.getAllByText('第 2 集')
    expect(fallbacks.length).toBeGreaterThanOrEqual(2)
  })

  it('renders a flat list without arc headings when the manifest has no arcs', async () => {
    loadManifest.mockResolvedValue(makeManifest({ arcs: undefined }))
    renderHome()
    expect(await screen.findByText('宴桃園豪傑三結義')).toBeInTheDocument()
    expect(screen.queryByText('群雄逐鹿・漢室傾頹')).not.toBeInTheDocument()
  })
})

function LocaleProbe() {
  const { setLocale } = useLocale()
  return <button onClick={() => setLocale('en')}>to-en</button>
}

function renderHomeWithLocale() {
  return render(
    <LocaleProvider>
      <MemoryRouter>
        <HomePage />
        <LocaleProbe />
      </MemoryRouter>
    </LocaleProvider>,
  )
}

function switchToEnglish() {
  fireEvent.click(screen.getByRole('button', { name: 'to-en' }))
}

describe('HomePage load failure', () => {
  beforeEach(() => {
    loadManifest.mockReset()
    window.localStorage.clear()
  })

  it('shows the reason for a network failure and re-translates it on a locale switch', async () => {
    loadManifest.mockRejectedValue(new DataError('network', 'fetch failed: manifest.json'))
    renderHomeWithLocale()
    expect(await screen.findByText('載入失敗：網絡錯誤，無法連線伺服器')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'to-en' }))
    expect(screen.getByText('Failed to load: Network error — could not reach the server')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('includes the status for an http failure', async () => {
    loadManifest.mockRejectedValue(new DataError('http', 'fetch failed (503): manifest.json', 503))
    renderHomeWithLocale()
    expect(await screen.findByText('載入失敗：請求失敗（503）')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'to-en' }))
    expect(screen.getByText('Failed to load: Request failed (503)')).toBeInTheDocument()
  })

  it('falls back to a generic message for an unexpected rejection', async () => {
    loadManifest.mockRejectedValue(new TypeError('boom'))
    renderHomeWithLocale()
    expect(await screen.findByText('載入失敗：載入時發生錯誤')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'to-en' }))
    expect(screen.getByText('Failed to load: Something went wrong while loading')).toBeInTheDocument()
  })
})

describe('HomePage source footer', () => {
  beforeEach(() => {
    loadManifest.mockReset()
    window.localStorage.clear()
  })

  /** The span's own text nodes only, so the assertion compares labels rather than link text. */
  function sourceLabels(root: HTMLElement) {
    return Array.from(root.querySelectorAll('.home__source > span')).map((s) =>
      Array.from(s.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? '')
        .join(''),
    )
  }

  it('shares its labels with the site-wide footer, in both locales', async () => {
    loadManifest.mockResolvedValue(makeManifest())
    const home = render(
      <LocaleProvider>
        <MemoryRouter>
          <HomePage />
          <LocaleProbe />
        </MemoryRouter>
      </LocaleProvider>,
    )
    const shell = render(
      <LocaleProvider>
        <MemoryRouter initialEntries={['/about']}>
          <Routes>
            <Route element={<Layout />}>
              <Route path="*" element={null} />
            </Route>
          </Routes>
          <LocaleProbe />
        </MemoryRouter>
      </LocaleProvider>,
    )
    await within(home.container).findByText('宴桃園豪傑三結義')

    expect(sourceLabels(home.container)).toEqual(['語料來源：Hugging Face · ', '數據許可協議：'])
    expect(sourceLabels(shell.container)).toEqual(['語料來源：Hugging Face · ', '數據許可協議：'])

    fireEvent.click(within(home.container).getByRole('button', { name: 'to-en' }))
    fireEvent.click(within(shell.container).getByRole('button', { name: 'to-en' }))

    expect(sourceLabels(home.container)).toEqual(['Source: Hugging Face · ', 'License: '])
    expect(sourceLabels(shell.container)).toEqual(['Source: Hugging Face · ', 'License: '])
  })
})

describe('HomePage catalogue copy', () => {
  beforeEach(() => {
    loadManifest.mockReset()
    window.localStorage.clear()
  })

  it('localizes the loading state', async () => {
    loadManifest.mockReturnValue(new Promise(() => {}))
    renderHomeWithLocale()
    expect(await screen.findByText('載入評書目錄…')).toBeInTheDocument()

    switchToEnglish()
    expect(screen.getByText('Loading the catalogue…')).toBeInTheDocument()
  })

  it('shows the same counts in both locales, with English units pluralised', async () => {
    loadManifest.mockResolvedValue(
      makeManifest({
        episodeCount: 157,
        recordCount: 12345,
        episodes: [
          { episode: 1, title: '宴桃園豪傑三結義 斬黃巾英雄首立功', arc: 1, count: 1, totalDuration: 60, cover: 'c1', index: 'i1' },
          { episode: 2, title: null, arc: 1, count: 5, totalDuration: 180, cover: 'c2', index: 'i2' },
        ],
      }),
    )
    renderHomeWithLocale()
    expect(await screen.findByText('聽楷叔講古，品中華史詩，學標準粵語')).toBeInTheDocument()
    expect(screen.getByText('共 157 集，12,345 段')).toBeInTheDocument()
    expect(screen.getByText('1 段 · 1 分鐘')).toBeInTheDocument()
    expect(screen.getByText('5 段 · 3 分鐘')).toBeInTheDocument()
    // The tagline and the count line are deliberately the same style.
    expect(document.querySelectorAll('.hero .hero__sub')).toHaveLength(2)

    switchToEnglish()
    expect(screen.getByText('Romance of the Three Kingdoms: Classic Cantonese Storytelling by Zhang Yuekai')).toBeInTheDocument()
    expect(screen.getByText('Learn Authentic Cantonese Through a Chinese Epic')).toBeInTheDocument()
    expect(screen.getByText('157 episodes, 12,345 segments')).toBeInTheDocument()
    expect(screen.getByText('1 segment, 1 min')).toBeInTheDocument()
    expect(screen.getByText('5 segments, 3 min')).toBeInTheDocument()
    // The dataset-supplied chapter title is never translated.
    expect(screen.getByText('宴桃園豪傑三結義')).toBeInTheDocument()
  })

  it('pluralises a single episode in the hero count line', async () => {
    loadManifest.mockResolvedValue(makeManifest({ episodeCount: 1, recordCount: 1 }))
    renderHomeWithLocale()
    expect(await screen.findByText('共 1 集，1 段')).toBeInTheDocument()

    switchToEnglish()
    expect(screen.getByText('1 episode, 1 segment')).toBeInTheDocument()
  })

  it('prefixes arc headings with a Part ordinal only under English', async () => {
    loadManifest.mockResolvedValue(
      makeManifest({
        arcs: [
          { id: 1, name: '群雄逐鹿', subtitle: '漢室傾頹', title: '群雄逐鹿・漢室傾頹', fromEpisode: 1, toEpisode: 1 },
          { id: 2, name: '官渡鏖兵', subtitle: '臥龍出山', title: '官渡鏖兵・臥龍出山', fromEpisode: 2, toEpisode: 2 },
        ],
      }),
    )
    renderHomeWithLocale()
    expect(await screen.findByText('群雄逐鹿・漢室傾頹')).toBeInTheDocument()
    expect(screen.queryByText(/Part I/)).not.toBeInTheDocument()

    switchToEnglish()
    // The curated name stays Traditional Chinese; only the ordinal is added to it.
    expect(screen.getByText('Part I. 群雄逐鹿・漢室傾頹')).toBeInTheDocument()
    expect(screen.getByText('Part II. 官渡鏖兵・臥龍出山')).toBeInTheDocument()
  })
})
