import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import RecordingPrivacyPage from './RecordingPrivacyPage'

function renderPage() {
  return render(
    <MemoryRouter>
      <RecordingPrivacyPage />
    </MemoryRouter>,
  )
}

describe('RecordingPrivacyPage', () => {
  it('shows the statement heading', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: '錄音和AI評分隱私處理聲明' })).toBeInTheDocument()
  })

  it('states that scoring sends audio to a third-party AI and is not persisted', () => {
    renderPage()
    expect(screen.getByText(/阿里雲百煉/)).toBeInTheDocument()
    expect(screen.getByText(/不被持久化/)).toBeInTheDocument()
  })

  it('states there is no list or download interface', () => {
    renderPage()
    expect(screen.getByText(/沒有任何列表或下載接口/)).toBeInTheDocument()
  })

  it('links back to the about page for the dataset licence', () => {
    renderPage()
    expect(screen.getByRole('link', { name: '關於本站' })).toHaveAttribute('href', '/about')
  })
})
