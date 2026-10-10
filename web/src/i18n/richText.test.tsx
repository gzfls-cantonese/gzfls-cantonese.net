import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { richText } from './richText'

describe('richText', () => {
  it('wraps each **span** in a <strong> and keeps the surrounding text', () => {
    const { container } = render(<p>{richText('前**重點**後**再加**尾')}</p>)
    expect([...container.querySelectorAll('strong')].map((s) => s.textContent)).toEqual([
      '重點',
      '再加',
    ])
    expect(container.querySelector('p')?.textContent).toBe('前重點後再加尾')
  })

  it('returns plain text untouched when there is no marker', () => {
    render(<p>{richText('沒有強調')}</p>)
    expect(document.querySelectorAll('strong')).toHaveLength(0)
    expect(screen.getByText('沒有強調')).toBeInTheDocument()
  })

  it('renders an unclosed marker literally instead of swallowing the sentence', () => {
    render(<p>{richText('漏了結尾**這裡')}</p>)
    expect(screen.getByText('漏了結尾**這裡')).toBeInTheDocument()
  })
})
