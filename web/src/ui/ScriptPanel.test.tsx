import { beforeAll, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import ScriptPanel from './ScriptPanel'
import type { ScriptEntry } from '../data/types'

// @tanstack/react-virtual measures the scroll element and rows via
// ResizeObserver + getBoundingClientRect, which jsdom reports as zero. Give the
// virtualizer a non-zero viewport and a no-op scrollTo so rows actually render.
beforeAll(() => {
  class RO {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', RO)
  Element.prototype.getBoundingClientRect = () =>
    ({ width: 400, height: 600, top: 0, left: 0, right: 400, bottom: 600, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
  Element.prototype.scrollTo = () => {}
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 600 })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 600 })
})

const entries: ScriptEntry[] = [
  { id: 'a', duration: 1, transcription: '三國', jyutping: ['saam1', 'gwok3'], audio: 'a.opus' },
  { id: 'b', duration: 1, transcription: '演義', jyutping: ['jin2', 'ji6'], audio: 'b.opus' },
  { id: 'c', duration: 1, transcription: '你好', audio: 'c.opus' },
]

describe('ScriptPanel jyutping rendering', () => {
  it('renders per-character jyutping aligned under each Han character', () => {
    render(<ScriptPanel entries={entries} currentIndex={0} onSelect={() => {}} />)
    // Han characters and their jyutping are all present.
    expect(screen.getByText('saam1')).toBeInTheDocument()
    expect(screen.getByText('gwok3')).toBeInTheDocument()
    expect(screen.getByText('三')).toBeInTheDocument()
    // Each Han char and its jyutping live in the same cell.
    const cell = screen.getByText('三').closest('.script__cell')!
    expect(within(cell as HTMLElement).getByText('saam1')).toBeInTheDocument()
  })

  it('falls back to plain traditional text without throwing when jyutping is missing', () => {
    render(<ScriptPanel entries={[entries[2]]} currentIndex={0} onSelect={() => {}} />)
    // No jyutping field -> the whole transcription renders as one text span.
    expect(screen.getByText('你好')).toBeInTheDocument()
    expect(screen.queryByText('nei5')).not.toBeInTheDocument()
  })
})

describe('ScriptPanel jyutping toggle', () => {
  it('shows jyutping by default', () => {
    render(<ScriptPanel entries={entries} currentIndex={0} onSelect={() => {}} />)
    const toggle = screen.getByRole('checkbox') as HTMLInputElement
    expect(toggle.checked).toBe(true)
    expect(screen.getByText('saam1')).toBeInTheDocument()
  })

  it('hides jyutping but keeps traditional text when toggled off', () => {
    render(<ScriptPanel entries={entries} currentIndex={0} onSelect={() => {}} />)
    const toggle = screen.getByRole('checkbox')
    fireEvent.click(toggle)
    expect(screen.queryByText('saam1')).not.toBeInTheDocument()
    // traditional characters remain visible
    expect(screen.getByText('三國')).toBeInTheDocument()
  })

  it('still seeks on row click while jyutping is hidden', () => {
    const onSelect = vi.fn()
    render(<ScriptPanel entries={entries} currentIndex={0} onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('checkbox'))
    const rows = document.querySelectorAll('.script__row')
    expect(rows.length).toBeGreaterThan(1)
    fireEvent.click(rows[1])
    expect(onSelect).toHaveBeenCalledWith(1)
  })
})
