import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AboutPage from './AboutPage'
import { LocaleProvider, useLocale } from '../i18n/locale'
import type { Manifest } from '../data/types'

const loadManifest = vi.fn()
vi.mock('../data/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/api')>()
  return { ...actual, loadManifest: () => loadManifest() }
})

const manifest: Manifest = {
  dataset: 'zoengjyutgaai',
  source: 'https://huggingface.co/datasets/CanCLID/zoengjyutgaai',
  license: 'CC0 1.0 Universal',
  licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  episodeCount: 157,
  recordCount: 39173,
  totalDuration: 1,
  episodes: [],
}

/** Switcher stand-in so the test drives the locale the way a visitor does. */
function LocaleProbe() {
  const { setLocale } = useLocale()
  return <button onClick={() => setLocale('en')}>to-en</button>
}

function renderAbout() {
  return render(
    <LocaleProvider>
      <MemoryRouter>
        <AboutPage />
        <LocaleProbe />
      </MemoryRouter>
    </LocaleProvider>,
  )
}

function switchToEnglish() {
  fireEvent.click(screen.getByRole('button', { name: 'to-en' }))
}

describe('AboutPage', () => {
  beforeEach(() => {
    loadManifest.mockReset()
    loadManifest.mockResolvedValue(manifest)
    window.localStorage.clear()
  })

  it('renders every static paragraph in Traditional Chinese by default', async () => {
    renderAbout()
    expect(await screen.findByRole('heading', { name: '關於本站' })).toBeInTheDocument()
    expect(screen.getByText(/品三國，識粵語/)).toBeInTheDocument()
    expect(screen.getByText(/只用於中華文化推廣/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '語料數據集來源' })).toBeInTheDocument()
    expect(screen.getByText(/本站粵語評書音頻與繁體腳本/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '數據集主頁' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'CC0 1.0 Universal 許可證全文' })).toBeInTheDocument()
  })

  it('re-renders every static paragraph in English on a locale switch', async () => {
    renderAbout()
    await screen.findByRole('heading', { name: '關於本站' })

    switchToEnglish()

    expect(screen.getByRole('heading', { name: 'About this site' })).toBeInTheDocument()
    expect(screen.getByText(/Savor the Three Kingdoms, learn Cantonese/)).toBeInTheDocument()
    expect(screen.getByText(/only to promote Chinese culture/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Corpus sources' })).toBeInTheDocument()
    expect(screen.getByText(/come from the Hugging Face community dataset/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Dataset homepage' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Read the full CC0 1\.0 Universal license/ })).toBeInTheDocument()
    expect(screen.queryByText(/品三國，識粵語/)).not.toBeInTheDocument()
  })

  it('keeps the licence name, the dataset id, and both hrefs verbatim in either locale', async () => {
    renderAbout()
    await screen.findByRole('heading', { name: '關於本站' })
    const before = linksSnapshot()

    switchToEnglish()

    expect(screen.getByText('CC0 1.0 Universal')).toBeInTheDocument()
    expect(screen.getByText('CanCLID/zoengjyutgaai')).toBeInTheDocument()
    // Only the link wording is localized; the targets and the dataset name are data.
    expect(linksSnapshot().map((l) => l.href)).toEqual(before.map((l) => l.href))
    expect(screen.getByText(/張悅楷講古語音-三國演義子數據集/)).toBeInTheDocument()
  })

  it('still shows the contact address and falls back to the built-in licence when the manifest fails', async () => {
    loadManifest.mockRejectedValue(new Error('offline'))
    renderAbout()
    switchToEnglish()

    const mail = await screen.findByRole('link', { name: 'gzfls-cantonese@outlook.com' })
    expect(mail).toHaveAttribute('href', 'mailto:gzfls-cantonese@outlook.com')
    expect(screen.getByText('CC0 1.0 Universal')).toBeInTheDocument()
  })
})

function linksSnapshot() {
  return screen
    .getAllByRole('link')
    .filter((a) => (a as HTMLAnchorElement).href.startsWith('https://'))
    .map((a) => ({ href: (a as HTMLAnchorElement).href }))
}
