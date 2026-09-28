import { afterEach, describe, expect, it, vi } from 'vitest'
import { DataError, episodeIndexFile, loadEpisode, loadManifest } from './api'

afterEach(() => {
  vi.restoreAllMocks()
})

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

describe('loadManifest', () => {
  it('parses a successful manifest response', async () => {
    const manifest = { episodeCount: 157, episodes: [] }
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse(manifest))
    await expect(loadManifest()).resolves.toMatchObject({ episodeCount: 157 })
  })

  it('throws DataError with status on a non-ok response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('nope', { status: 404 }),
    )
    let err: DataError | undefined
    try {
      await loadManifest()
    } catch (e) {
      err = e as DataError
    }
    expect(err).toBeInstanceOf(DataError)
    expect(err?.status).toBe(404)
  })

  it('throws DataError on a network failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('failed to fetch'))
    await expect(loadManifest()).rejects.toThrow(/网络错误/)
  })

  it('throws DataError on invalid JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('<html>', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )
    await expect(loadManifest()).rejects.toThrow(/JSON/)
  })
})

describe('loadEpisode', () => {
  it('builds the zero-padded index path and parses entries', async () => {
    expect(episodeIndexFile(1)).toBe('episodes/ep_001.json')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse({ episode: 1, count: 1, entries: [{ id: 'sg_001_001' }] }),
    )
    const ep = await loadEpisode(1)
    expect(ep.entries[0].id).toBe('sg_001_001')
    expect(fetchMock.mock.calls[0][0]).toMatch(/episodes\/ep_001\.json$/)
  })
})
