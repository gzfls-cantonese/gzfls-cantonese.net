import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import HomePage from './HomePage'
import type { Manifest } from '../data/types'

const loadManifest = vi.fn()
vi.mock('../data/api', () => ({
  loadManifest: () => loadManifest(),
  episodeCoverUrl: (c: string) => c,
}))

function makeManifest(overrides: Partial<Manifest> = {}): Manifest {
  return {
    dataset: 'd',
    source: 's',
    license: 'CC0',
    licenseUrl: 'u',
    episodeCount: 2,
    recordCount: 10,
    totalDuration: 120,
    episodes: [
      { episode: 1, title: '宴桃園豪傑三結義 斬黃巾英雄首立功', arc: 1, count: 5, totalDuration: 60, cover: 'c1', index: 'i1' },
      { episode: 2, title: null, arc: 1, count: 5, totalDuration: 60, cover: 'c2', index: 'i2' },
    ],
    ...overrides,
  }
}

function renderHome() {
  return render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  )
}

describe('HomePage titles and arc grouping', () => {
  beforeEach(() => loadManifest.mockReset())

  it('groups episodes by arc and shows the couplet title as two lines when arcs exist', async () => {
    loadManifest.mockResolvedValue(
      makeManifest({
        arcs: [
          { id: 1, name: '群雄逐鹿', subtitle: '漢室傾頹', title: '群雄逐鹿・漢室傾頹', fromEpisode: 1, toEpisode: 2 },
        ],
      }),
    )
    renderHome()
    expect(await screen.findByText('群雄逐鹿・漢室傾頹')).toBeInTheDocument()
    expect(screen.getByText('宴桃園豪傑三結義')).toBeInTheDocument()
    expect(screen.getByText('斬黃巾英雄首立功')).toBeInTheDocument()
  })

  it('falls back to「第 N 集」when an episode has no title', async () => {
    loadManifest.mockResolvedValue(
      makeManifest({
        arcs: [{ id: 1, name: '群雄逐鹿', subtitle: '漢室傾頹', title: '群雄逐鹿・漢室傾頹', fromEpisode: 1, toEpisode: 2 }],
      }),
    )
    renderHome()
    await screen.findByText('群雄逐鹿・漢室傾頹')
    // Episode 2 has title: null → card title falls back, distinct from the「第 2 集」label
    const fallbacks = screen.getAllByText('第 2 集')
    expect(fallbacks.length).toBeGreaterThanOrEqual(2)
  })

  it('renders a flat list without arc headings when the manifest has no arcs', async () => {
    loadManifest.mockResolvedValue(makeManifest({ arcs: undefined }))
    renderHome()
    expect(await screen.findByText('宴桃園豪傑三結義')).toBeInTheDocument()
    expect(screen.queryByText('群雄逐鹿・漢室傾頹')).not.toBeInTheDocument()
  })
})
