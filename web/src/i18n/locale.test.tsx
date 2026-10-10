import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { LocaleProvider, useLocale } from './locale'

const STORAGE_KEY = 'sanguo.locale'

function Probe() {
  const { locale, setLocale, t } = useLocale()
  return (
    <div>
      <span data-testid="nav">{t('nav.episodes')}</span>
      <span data-testid="locale">{locale}</span>
      <button onClick={() => setLocale('en')}>to-en</button>
      <button onClick={() => setLocale('zh-Hant')}>to-zh</button>
    </div>
  )
}

describe('LocaleProvider', () => {
  beforeEach(() => window.localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  it('renders Traditional Chinese with no stored choice', () => {
    render(
      <LocaleProvider>
        <Probe />
      </LocaleProvider>,
    )
    expect(screen.getByTestId('nav')).toHaveTextContent('選集')
    expect(screen.getByTestId('locale')).toHaveTextContent('zh-Hant')
  })

  it('renders English when the stored choice is en', () => {
    window.localStorage.setItem(STORAGE_KEY, 'en')
    render(
      <LocaleProvider>
        <Probe />
      </LocaleProvider>,
    )
    expect(screen.getByTestId('nav')).toHaveTextContent('Episodes')
  })

  it('falls back to the default when the stored value is not a known locale', () => {
    window.localStorage.setItem(STORAGE_KEY, 'fr-CA')
    render(
      <LocaleProvider>
        <Probe />
      </LocaleProvider>,
    )
    expect(screen.getByTestId('nav')).toHaveTextContent('選集')
    expect(screen.getByTestId('locale')).toHaveTextContent('zh-Hant')
  })

  it('persists a switch so a later visit restores it', () => {
    render(
      <LocaleProvider>
        <Probe />
      </LocaleProvider>,
    )
    fireEvent.click(screen.getByText('to-en'))
    expect(screen.getByTestId('nav')).toHaveTextContent('Episodes')
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('en')

    render(
      <LocaleProvider>
        <Probe />
      </LocaleProvider>,
    )
    expect(screen.getAllByTestId('nav')[1]).toHaveTextContent('Episodes')
  })

  it('still switches for the session when storage access throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })

    render(
      <LocaleProvider>
        <Probe />
      </LocaleProvider>,
    )
    // Reads fall back to the default rather than throwing.
    expect(screen.getByTestId('nav')).toHaveTextContent('選集')
    // Writes are swallowed, but the switch still applies in-session.
    fireEvent.click(screen.getByText('to-en'))
    expect(screen.getByTestId('nav')).toHaveTextContent('Episodes')
    fireEvent.click(screen.getByText('to-zh'))
    expect(screen.getByTestId('nav')).toHaveTextContent('選集')
  })
})

describe('useLocale without a provider', () => {
  it('falls back to the Traditional Chinese dictionary', () => {
    render(<Probe />)
    expect(screen.getByTestId('nav')).toHaveTextContent('選集')
    expect(screen.getByTestId('locale')).toHaveTextContent('zh-Hant')
  })
})

describe('document metadata', () => {
  const initialLang = document.documentElement.lang
  const initialTitle = document.title

  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.lang = 'zh-Hant'
    document.title = '品三國 · 識粵語'
  })
  afterEach(() => {
    document.documentElement.lang = initialLang
    document.title = initialTitle
  })

  it('tracks the locale on switch', () => {
    render(
      <LocaleProvider>
        <Probe />
      </LocaleProvider>,
    )
    expect(document.documentElement.lang).toBe('zh-Hant')
    expect(document.title).toBe('品三國 · 識粵語')

    fireEvent.click(screen.getByText('to-en'))

    expect(document.documentElement.lang).toBe('en')
    expect(document.title).toBe('Savor the Three Kingdoms · Learn Cantonese')

    fireEvent.click(screen.getByText('to-zh'))

    expect(document.documentElement.lang).toBe('zh-Hant')
    expect(document.title).toBe('品三國 · 識粵語')
  })

  it('is already English on the first render for a returning en visitor', () => {
    window.localStorage.setItem(STORAGE_KEY, 'en')
    render(
      <LocaleProvider>
        <Probe />
      </LocaleProvider>,
    )
    expect(document.documentElement.lang).toBe('en')
    expect(document.title).toBe('Savor the Three Kingdoms · Learn Cantonese')
  })
})
