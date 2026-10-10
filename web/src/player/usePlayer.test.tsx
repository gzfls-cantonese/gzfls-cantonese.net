import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { LocaleProvider, useLocale } from '../i18n/locale'
import { usePlayer } from './usePlayer'
import type { ScriptEntry } from '../data/types'

/**
 * jsdom ships neither `navigator.mediaSession` nor `MediaMetadata`, and the hook
 * degrades silently without them, so both are stubbed to make the lock-screen
 * integration observable.
 */
interface MetadataInit {
  title: string
  artist: string
  album: string
}

let handlers: Record<string, (() => void) | null> = {}
let lastMetadata: MetadataInit | null = null

beforeEach(() => {
  handlers = {}
  lastMetadata = null
  // jsdom logs "Not implemented" for these; the hook only needs them to not throw.
  HTMLMediaElement.prototype.pause = () => {}
  HTMLMediaElement.prototype.play = () => Promise.resolve()
  class MediaMetadataStub {
    title: string
    artist: string
    album: string
    constructor(init: MetadataInit) {
      this.title = init.title
      this.artist = init.artist
      this.album = init.album
      lastMetadata = init
    }
  }
  vi.stubGlobal('MediaMetadata', MediaMetadataStub)
  Object.defineProperty(navigator, 'mediaSession', {
    configurable: true,
    value: {
      metadata: null,
      playbackState: 'none',
      setActionHandler: (action: string, handler: (() => void) | null) => {
        handlers[action] = handler
      },
    },
  })
  window.localStorage.clear()
})

const entries: ScriptEntry[] = [
  { id: 'e001', duration: 1, transcription: '三國', audio: 'a.opus' },
  { id: 'e002', duration: 1, transcription: '演義', audio: 'b.opus' },
]

/** Switcher stand-in so the test drives the locale the way a visitor does. */
function SwitchToEnglish() {
  const { setLocale } = useLocale()
  return <button onClick={() => setLocale('en')}>to-en</button>
}

function Harness({ episodeTitle }: { episodeTitle?: string }) {
  usePlayer({ episode: 7, entries, episodeTitle })
  return <SwitchToEnglish />
}

function EmptyPlayer() {
  usePlayer({ episode: 7, entries: [] })
  return <SwitchToEnglish />
}

function renderPlayer(episodeTitle?: string) {
  return render(
    <LocaleProvider>
      <Harness episodeTitle={episodeTitle} />
    </LocaleProvider>,
  )
}

describe('usePlayer Media Session metadata', () => {
  it('publishes the localized album and episode fallback', () => {
    renderPlayer()
    expect(lastMetadata).toMatchObject({
      title: 'e001',
      artist: '第 7 集',
      album: '三國演義 · 粵語評書',
    })
  })

  it('rewrites the metadata in English on a locale switch', () => {
    renderPlayer()
    fireEvent.click(screen.getByRole('button', { name: 'to-en' }))
    expect(lastMetadata).toMatchObject({
      title: 'e001',
      artist: 'Episode 7',
      album: 'Three Kingdoms · Cantonese Storytelling',
    })
  })

  it('falls back to the localized show title when there is no entry yet', () => {
    render(
      <LocaleProvider>
        <EmptyPlayer />
      </LocaleProvider>,
    )
    expect(lastMetadata).toMatchObject({ title: '三國演義粵語評書' })
    fireEvent.click(screen.getByRole('button', { name: 'to-en' }))
    expect(lastMetadata).toMatchObject({ title: 'Cantonese Tales' })
  })

  it('keeps a dataset-supplied episode title verbatim in both locales', () => {
    renderPlayer('桃園結義')
    expect(lastMetadata).toMatchObject({ artist: '桃園結義' })
    fireEvent.click(screen.getByRole('button', { name: 'to-en' }))
    expect(lastMetadata).toMatchObject({ artist: '桃園結義' })
  })

  it('still has all four action handlers registered after a switch', () => {
    renderPlayer()
    fireEvent.click(screen.getByRole('button', { name: 'to-en' }))
    for (const action of ['play', 'pause', 'previoustrack', 'nexttrack']) {
      expect(typeof handlers[action], action).toBe('function')
    }
  })
})
