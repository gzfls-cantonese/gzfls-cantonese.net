import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { Manifest } from './data/types'

const loadManifest = vi.fn()
const loadEpisode = vi.fn()
vi.mock('./data/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./data/api')>()
  return {
    ...actual,
    loadManifest: () => loadManifest(),
    loadEpisode: (episode: number) => loadEpisode(episode),
    episodeCoverUrl: (c: string) => c,
  }
})

/**
 * The tree `main.tsx` actually renders, captured by stubbing `createRoot`.
 *
 * Testing this rather than a hand-built `<LocaleProvider><App/></LocaleProvider>`
 * is the point: `LocaleContext` defaults to the Chinese dictionary, so a missing
 * provider fails silently as an all-Chinese UI instead of throwing. Capturing the
 * real element means removing `LocaleProvider` from `main.tsx` breaks these tests.
 * `@testing-library/react` already resolved the real `react-dom/client` when this
 * file was collected, so `doMock` here redirects only `main.tsx`'s own import.
 */
let entryTree: ReactElement | null = null

beforeAll(async () => {
  // @tanstack/react-virtual measures rows via ResizeObserver and
  // getBoundingClientRect, which jsdom reports as zero, so the transcript would
  // render no rows at all and the "dataset content is never translated"
  // assertion would have nothing to look at.
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  Element.prototype.getBoundingClientRect = () =>
    ({ width: 400, height: 600, top: 0, left: 0, right: 400, bottom: 600, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
  Element.prototype.scrollTo = () => {}
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 600 })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 600 })

  document.body.innerHTML = '<div id="root"></div>'
  // main.tsx default-imports the module, so the stub needs both shapes.
  const client = {
    createRoot: () => ({ render: (element: ReactElement) => void (entryTree = element) }),
  }
  vi.doMock('react-dom/client', () => ({ ...client, default: client }))
  await import('./main')
  vi.doUnmock('react-dom/client')
})

const manifest: Manifest = {
  dataset: 'zoengjyutgaai',
  source: 'https://huggingface.co/datasets/CanCLID/zoengjyutgaai',
  license: 'CC0 1.0 Universal',
  licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  episodeCount: 157,
  recordCount: 39173,
  totalDuration: 60,
  episodes: [
    { episode: 1, title: '宴桃園豪傑三結義 斬黃巾英雄首立功', arc: 1, count: 5, totalDuration: 240, cover: 'c1', index: 'i1' },
  ],
}

/** Mounts the captured entry tree at `path`, the way a fresh page load would. */
function renderRoute(path: string) {
  window.history.pushState({}, '', path)
  if (!entryTree) throw new Error('main.tsx did not render an element')
  return render(entryTree)
}

/** Drives the real switcher in the header rather than setting the locale directly. */
function switchToEnglish(root: HTMLElement) {
  fireEvent.click(within(root).getByRole('button', { name: /界面語言|Interface language/ }))
  fireEvent.click(within(root).getByRole('button', { name: 'English' }))
}

beforeEach(() => {
  loadManifest.mockReset()
  loadEpisode.mockReset()
  loadManifest.mockResolvedValue(manifest)
  window.localStorage.clear()
  HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve()) as never
  HTMLMediaElement.prototype.pause = vi.fn() as never
})

describe('App integration across routes', () => {
  it('mounts the provider from main.tsx', () => {
    expect(entryTree).not.toBeNull()
  })

  it('translates the home route', async () => {
    const view = renderRoute('/')
    expect(await screen.findByText('三國演義 · 張悅楷先生經典評書')).toBeInTheDocument()
    expect(screen.getByText('聽楷叔講古，品中華史詩，學標準粵語')).toBeInTheDocument()
    expect(screen.getByText('共 157 集，39,173 段')).toBeInTheDocument()
    expect(screen.getByText('5 段 · 4 分鐘')).toBeInTheDocument()

    switchToEnglish(view.container)

    expect(screen.getByText('Romance of the Three Kingdoms: Classic Cantonese Storytelling by Zhang Yuekai')).toBeInTheDocument()
    expect(screen.getByText('Learn Authentic Cantonese Through a Chinese Epic')).toBeInTheDocument()
    expect(screen.getByText('157 episodes, 39,173 segments')).toBeInTheDocument()
    expect(screen.getByText('5 segments, 4 min')).toBeInTheDocument()
    expect(screen.queryByText('共 157 集，39,173 段')).not.toBeInTheDocument()
    expect(screen.queryByText('聽楷叔講古，品中華史詩，學標準粵語')).not.toBeInTheDocument()
    view.unmount()
  })

  it('translates the episode route chrome while leaving the transcript alone', async () => {
    loadEpisode.mockResolvedValue({
      episode: 1,
      count: 1,
      totalDuration: 60,
      entries: [
        // 8 syllables for 8 Han characters: `EntryText` only renders per-character cells when they align.
        { id: 'e001', duration: 1, transcription: '宴桃園豪傑三結義', jyutping: ['jin3', 'tou4', 'jyun4', 'hou4', 'git3', 'saam1', 'git3', 'ji6'], audio: 'a.opus' },
      ],
    })
    const view = renderRoute('/episode/1')
    expect(await screen.findByText('可滾屏和點擊跳轉')).toBeInTheDocument()
    expect(screen.getByText('顯示粵拼Jyutping')).toBeInTheDocument()

    switchToEnglish(view.container)

    expect(screen.getByText('Scroll, or tap a line to jump to it')).toBeInTheDocument()
    expect(screen.getByText('Show Jyutping')).toBeInTheDocument()
    // Both the header nav link and the page's own back link are translated.
    expect(screen.getByRole('link', { name: 'Episodes' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /‹ Episodes/ })).toBeInTheDocument()
    // The transcript is dataset content and is never translated.
    expect(screen.getByText('宴')).toBeInTheDocument()
    expect(screen.getByText('jin3')).toBeInTheDocument()
    view.unmount()
  })

  it('translates the about route', async () => {
    const view = renderRoute('/about')
    expect(await screen.findByRole('heading', { name: '關於本站' })).toBeInTheDocument()

    switchToEnglish(view.container)

    expect(screen.getByRole('heading', { name: 'About this site' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Dataset homepage' })).toBeInTheDocument()
    view.unmount()
  })

  it('translates the recording-privacy route', async () => {
    const view = renderRoute('/recording-privacy')
    expect(
      await screen.findByRole('heading', { name: '錄音和AI評分隱私處理聲明' }),
    ).toBeInTheDocument()

    switchToEnglish(view.container)

    expect(
      screen.getByRole('heading', { name: 'Recording and AI Scoring Privacy Statement' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '3. When it is deleted' })).toBeInTheDocument()
    view.unmount()
  })

  it('translates the 404 route and keeps the switcher usable there', async () => {
    const view = renderRoute('/no-such-page')
    expect(await screen.findByRole('heading', { name: '頁面不存在' })).toBeInTheDocument()

    switchToEnglish(view.container)

    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
    view.unmount()
  })

  it('syncs lang and title with the active locale', async () => {
    const view = renderRoute('/')
    await screen.findByText('三國演義 · 張悅楷先生經典評書')
    expect(document.documentElement.lang).toBe('zh-Hant')
    expect(document.title).toBe('品三國 · 識粵語')

    switchToEnglish(view.container)

    expect(document.documentElement.lang).toBe('en')
    expect(document.title).toBe('Savor the Three Kingdoms · Learn Cantonese')
    view.unmount()
  })
})
