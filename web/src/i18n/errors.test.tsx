import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { DataError } from '../data/api'
import { describeDataError } from './errors'
import { LocaleProvider, useLocale } from './locale'

function Probe({ error }: { error: unknown }) {
  const { t, setLocale } = useLocale()
  return (
    <>
      <output>{describeDataError(error, t)}</output>
      <button onClick={() => setLocale('en')}>to-en</button>
    </>
  )
}

function renderError(error: unknown) {
  return render(
    <LocaleProvider>
      <Probe error={error} />
    </LocaleProvider>,
  )
}

function shown() {
  return screen.getByRole('status', { hidden: true }).textContent
}

beforeEach(() => {
  window.localStorage.clear()
})

describe('describeDataError', () => {
  it('renders each reason in Traditional Chinese by default', () => {
    const cases: [unknown, string][] = [
      [new DataError('network', 'fetch failed: x'), '網絡錯誤，無法連線伺服器'],
      [new DataError('http', 'fetch failed (503): x', 503), '請求失敗（503）'],
      [new DataError('parse', 'response was not valid JSON: x'), '返回內容不是有效的 JSON'],
      [new DataError('invalidEpisode', 'episode number out of range: 0'), '集號無效（應為 1–157）。'],
      [new Error('boom'), '載入時發生錯誤'],
      ['not an error at all', '載入時發生錯誤'],
    ]
    for (const [error, expected] of cases) {
      const view = renderError(error)
      expect(shown()).toBe(expected)
      view.unmount()
    }
  })

  it('renders each reason in English under the en locale', () => {
    const cases: [unknown, string][] = [
      [new DataError('network', 'fetch failed: x'), 'Network error — could not reach the server'],
      [new DataError('http', 'fetch failed (503): x', 503), 'Request failed (503)'],
      [new DataError('parse', 'response was not valid JSON: x'), 'The response was not valid JSON'],
      [new DataError('invalidEpisode', 'episode number out of range: 0'), 'Invalid episode number (must be 1–157).'],
      [new Error('boom'), 'Something went wrong while loading'],
    ]
    for (const [error, expected] of cases) {
      const view = renderError(error)
      fireEvent.click(screen.getByRole('button', { name: 'to-en' }))
      expect(shown()).toBe(expected)
      view.unmount()
    }
  })

  it('omits the status suffix when an http failure carries no status', () => {
    renderError(new DataError('http', 'fetch failed: x'))
    fireEvent.click(screen.getByRole('button', { name: 'to-en' }))
    expect(shown()).toBe('Request failed')
  })

  it('re-translates a reason already on screen when the locale changes', () => {
    renderError(new DataError('network', 'fetch failed: x'))
    expect(shown()).toBe('網絡錯誤，無法連線伺服器')
    fireEvent.click(screen.getByRole('button', { name: 'to-en' }))
    expect(shown()).toBe('Network error — could not reach the server')
  })
})
