import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import RecordingPrivacyPage from './RecordingPrivacyPage'
import { LocaleProvider, useLocale } from '../i18n/locale'

/** Switcher stand-in so the test drives the locale the way a visitor does. */
function LocaleProbe() {
  const { setLocale } = useLocale()
  return <button onClick={() => setLocale('en')}>to-en</button>
}

function renderPage() {
  return render(
    <LocaleProvider>
      <MemoryRouter>
        <RecordingPrivacyPage />
        <LocaleProbe />
      </MemoryRouter>
    </LocaleProvider>,
  )
}

function switchToEnglish() {
  fireEvent.click(screen.getByRole('button', { name: 'to-en' }))
}

/** Every h2 in document order — the six section headings. */
function sectionHeadings() {
  return screen
    .getAllByRole('heading', { level: 2 })
    .map((h) => h.textContent)
}

describe('RecordingPrivacyPage', () => {
  beforeEach(() => window.localStorage.clear())

  it('shows the statement heading', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: '錄音和AI評分隱私處理聲明' })).toBeInTheDocument()
  })

  it('states that scoring sends audio to a third-party AI and is not persisted', () => {
    renderPage()
    expect(screen.getByText(/阿里雲百煉/)).toBeInTheDocument()
    expect(screen.getByText('不被持久化')).toBeInTheDocument()
  })

  it('states there is no list or download interface', () => {
    renderPage()
    expect(
      screen.getByText('只簽發「上傳」與「刪除」兩類操作，沒有任何列表或下載接口'),
    ).toBeInTheDocument()
  })

  it('links back to the about page for the dataset licence', () => {
    renderPage()
    expect(screen.getByRole('link', { name: '關於本站' })).toHaveAttribute('href', '/about')
  })

  it('renders all six sections in English on a locale switch', () => {
    renderPage()
    expect(sectionHeadings()).toEqual([
      '一、我們收集什麼',
      '二、錄音存放在哪裡、誰能存取',
      '三、什麼時候刪除',
      '四、AI 評分如何處理你的錄音',
      '五、比對用的參考文本',
      '六、聯繫方式',
    ])

    switchToEnglish()

    expect(screen.getByRole('heading', { name: 'Recording and AI Scoring Privacy Statement' })).toBeInTheDocument()
    expect(sectionHeadings()).toEqual([
      '1. What we collect',
      '2. Where the recording is kept, and who can reach it',
      '3. When it is deleted',
      '4. How AI scoring handles your recording',
      '5. The reference text used for comparison',
      '6. Contact',
    ])
    expect(screen.queryByText(/阿里雲百煉/)).not.toBeInTheDocument()
  })

  it('keeps every load-bearing claim in the English text', () => {
    renderPage()
    switchToEnglish()

    const text = document.body.textContent ?? ''
    for (const claim of [
      // storage: private prefix, isolated per anonymous ID
      'private prefix',
      'isolated by anonymous ID',
      // no list, no download
      'there is no list endpoint and no download endpoint',
      // paths rebuilt server-side
      'rebuilt server-side',
      'cannot supply a full path',
      'no one can enumerate, address, or download anyone else’s recording',
      // deletion: one attempt, no retry, 7-day lifecycle backstop
      'attempted once and is not retried',
      'lifecycle rule removes every object under that prefix after 7 days',
      // third-party ASR, named vendor and region
      'Alibaba Cloud Model Studio (Singapore region)',
      'third-party AI service',
      'short-lived, read-only',
      // score and transcript never persisted
      'not persisted',
      'nothing is written back to any storage',
      // reference text provenance
      'CC0 1.0, public domain',
    ]) {
      expect(text, claim).toContain(claim)
    }
  })

  it('describes the anonymous ID as persistent, not session-scoped, in both locales', () => {
    renderPage()
    // The id lives in localStorage and survives a reload; claiming it is
    // session-only would understate what a visitor keeps on their device.
    expect(screen.getByText(/保存在本機 localStorage/)).toBeInTheDocument()
    expect(screen.getByText(/跨會話穩定/)).toBeInTheDocument()

    switchToEnglish()

    expect(screen.getByText(/stored in this device’s localStorage/)).toBeInTheDocument()
    expect(screen.getByText(/stable across sessions/)).toBeInTheDocument()
  })

  it('keeps the contact address identical in both locales', () => {
    renderPage()
    const before = screen.getByRole('link', { name: 'gzfls-cantonese@outlook.com' })
    expect(before).toHaveAttribute('href', 'mailto:gzfls-cantonese@outlook.com')

    switchToEnglish()

    expect(screen.getByRole('link', { name: 'gzfls-cantonese@outlook.com' })).toHaveAttribute(
      'href',
      'mailto:gzfls-cantonese@outlook.com',
    )
  })
})
