import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import CoverImage from './CoverImage'
import { LocaleProvider, useLocale } from '../i18n/locale'

vi.mock('../data/api', () => ({
  episodeCoverUrl: (cover: string) => `https://cdn.example/${cover}`,
}))

function LocaleProbe() {
  const { setLocale } = useLocale()
  return <button onClick={() => setLocale('en')}>to-en</button>
}

function renderCover(episode = 7) {
  return render(
    <LocaleProvider>
      <CoverImage cover="covers/ep_007.jpg" episode={episode} />
      <LocaleProbe />
    </LocaleProvider>,
  )
}

function switchToEnglish() {
  fireEvent.click(screen.getByRole('button', { name: 'to-en' }))
}

function placeholder() {
  return screen.getByText(/^(第7集|EP 7)$/).closest('.cover--placeholder') as HTMLElement
}

beforeEach(() => window.localStorage.clear())

describe('CoverImage locale', () => {
  it('localizes the alt text without touching the src', () => {
    renderCover()
    const img = screen.getByRole('img')
    expect(img).toHaveAccessibleName('第 7 集《三國演義》封面')
    const src = img.getAttribute('src')

    switchToEnglish()

    expect(img).toHaveAccessibleName('Cover for episode 7 of Romance of the Three Kingdoms')
    expect(img.getAttribute('src')).toBe(src)
    expect(src).toBe('https://cdn.example/covers/ep_007.jpg')
  })

  it('localizes the placeholder badge and its accessible name when the cover 404s', () => {
    renderCover()
    fireEvent.error(screen.getByRole('img'))
    expect(screen.getByText('第7集')).toBeInTheDocument()
    expect(placeholder()).toHaveAttribute('aria-label', '第 7 集封面')

    switchToEnglish()

    expect(screen.getByText('EP 7')).toBeInTheDocument()
    expect(placeholder()).toHaveAttribute('aria-label', 'Cover for episode 7')
  })
})
