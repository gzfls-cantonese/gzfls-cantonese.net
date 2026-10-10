import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import Layout from './Layout'
import { LocaleProvider } from '../i18n/locale'

/** Stands in for the routed page so the tests can assert the path is untouched. */
function LocationProbe() {
  return <span data-testid="path">{useLocation().pathname}</span>
}

function renderAt(path: string) {
  return render(
    <LocaleProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<LocationProbe />} />
            <Route path="episode/:episode" element={<LocationProbe />} />
            <Route path="*" element={<LocationProbe />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </LocaleProvider>,
  )
}

function trigger() {
  return screen.getByRole('button', { name: /界面語言|Interface language/ })
}

function abbr() {
  return document.querySelector('.locale-switch__abbr')!
}

/** Opens the panel and picks a locale by its native name. */
function switchTo(nativeName: string) {
  fireEvent.click(trigger())
  fireEvent.click(screen.getByRole('button', { name: nativeName }))
}

describe('Layout locale switcher', () => {
  beforeEach(() => window.localStorage.clear())

  it('stays closed until opened, and names the active locale on the trigger', () => {
    renderAt('/')
    expect(trigger()).toHaveAccessibleName('界面語言: 繁體中文')
    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name: 'English' })).not.toBeInTheDocument()

    fireEvent.click(trigger())

    expect(trigger()).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: '繁體中文' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'English' })).toBeInTheDocument()
  })

  it('carries the active locale abbreviation on the trigger, never both', () => {
    renderAt('/')
    expect(abbr()).toHaveTextContent('中')
    expect(abbr()).not.toHaveTextContent('Eng')

    switchTo('English')

    expect(abbr()).toHaveTextContent('Eng')
    expect(abbr()).not.toHaveTextContent('中')
    // The abbreviation is visual; the accessible name still spells the locale out.
    expect(trigger()).toHaveAccessibleName('Interface language: English')
  })

  it('marks the active locale in the open panel', () => {
    renderAt('/')
    fireEvent.click(trigger())
    expect(screen.getByRole('button', { name: '繁體中文' })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('button', { name: 'English' })).not.toHaveAttribute('aria-current')

    // The panel is already open, so pick directly instead of toggling the trigger.
    fireEvent.click(screen.getByRole('button', { name: 'English' }))

    fireEvent.click(trigger())
    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('button', { name: '繁體中文' })).not.toHaveAttribute('aria-current')
  })

  it('translates the nav in place, without navigating', () => {
    renderAt('/')
    expect(screen.getByRole('link', { name: '選集' })).toBeInTheDocument()

    switchTo('English')

    expect(screen.getByRole('link', { name: 'Episodes' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'About' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '選集' })).not.toBeInTheDocument()
    expect(screen.getByTestId('path')).toHaveTextContent('/')
    expect(trigger()).toHaveAccessibleName('Interface language: English')
  })

  it('closes the panel after a selection', () => {
    renderAt('/')
    switchTo('English')
    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name: '繁體中文' })).not.toBeInTheDocument()
  })

  it('keeps a deep route and its view when switching', () => {
    renderAt('/episode/1')
    expect(screen.getByTestId('path')).toHaveTextContent('/episode/1')

    switchTo('English')

    expect(screen.getByTestId('path')).toHaveTextContent('/episode/1')
    expect(screen.getByRole('link', { name: 'Episodes' })).toBeInTheDocument()
  })

  it('is present and working on an unmatched route', () => {
    renderAt('/no-such-page')
    switchTo('English')
    expect(screen.getByRole('link', { name: 'Episodes' })).toBeInTheDocument()
    expect(screen.getByTestId('path')).toHaveTextContent('/no-such-page')
  })

  it('restores Traditional Chinese when switched back', () => {
    renderAt('/')
    switchTo('English')
    switchTo('繁體中文')
    expect(screen.getByRole('link', { name: '選集' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '關於' })).toBeInTheDocument()
    expect(trigger()).toHaveAccessibleName('界面語言: 繁體中文')
  })

  it('closes on Escape', () => {
    renderAt('/')
    fireEvent.click(trigger())
    expect(screen.getByRole('button', { name: 'English' })).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name: 'English' })).not.toBeInTheDocument()
  })

  it('closes on a pointer down outside the switcher', () => {
    renderAt('/')
    fireEvent.click(trigger())
    expect(screen.getByRole('button', { name: 'English' })).toBeInTheDocument()

    fireEvent.mouseDown(screen.getByRole('link', { name: '選集' }))

    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
  })
})

describe('Layout brand and source footer', () => {
  beforeEach(() => window.localStorage.clear())

  it('renders the wordmark and the source footer in the active locale', () => {
    renderAt('/about')
    expect(screen.getByText('粵語評書')).toBeInTheDocument()
    expect(screen.getByText(/語料來源：Hugging Face/)).toBeInTheDocument()
    expect(screen.getByText('數據許可協議：')).toBeInTheDocument()

    switchTo('English')

    expect(screen.getByText('Cantonese Tales')).toBeInTheDocument()
    expect(screen.getByText(/Source: Hugging Face/)).toBeInTheDocument()
    expect(screen.getByText(/License:/)).toBeInTheDocument()
    expect(screen.queryByText('粵語評書')).not.toBeInTheDocument()
  })

  it('omits the footer on the home route, where HomePage renders its own copy', () => {
    renderAt('/')
    expect(screen.queryByText(/語料來源：Hugging Face/)).not.toBeInTheDocument()
  })

  it('translates the logo alt text while leaving the baked vector asset alone', () => {
    renderAt('/about')
    const logo = screen.getByRole('img')
    expect(logo).toHaveAccessibleName('品三國 · 識粵語')
    const srcBefore = logo.getAttribute('src')

    switchTo('English')

    expect(logo).toHaveAccessibleName('Savor the Three Kingdoms · Learn Cantonese')
    expect(logo.getAttribute('src')).toBe(srcBefore)
  })
})
