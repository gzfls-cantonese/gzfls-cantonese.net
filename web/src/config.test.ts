import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('RECORDINGS_API', () => {
  it('is null when VITE_RECORDINGS_API is unset (feature hidden / rollback)', async () => {
    vi.stubEnv('VITE_RECORDINGS_API', '')
    vi.resetModules()
    const { RECORDINGS_API } = await import('./config')
    expect(RECORDINGS_API).toBeNull()
  })

  it('strips trailing slashes when set', async () => {
    vi.stubEnv('VITE_RECORDINGS_API', 'http://rec.test/api///')
    vi.resetModules()
    const { RECORDINGS_API } = await import('./config')
    expect(RECORDINGS_API).toBe('http://rec.test/api')
  })
})
