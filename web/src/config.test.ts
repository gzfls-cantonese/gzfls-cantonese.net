import { afterEach, describe, expect, it, vi } from 'vitest'
import { safeExternalUrl } from './config'

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

describe('safeExternalUrl', () => {
  it('passes https through unchanged', () => {
    const url = 'https://huggingface.co/datasets/CanCLID/zoengjyutgaai'
    expect(safeExternalUrl(url)).toBe(url)
  })

  it('refuses every scheme that could execute or leave the page', () => {
    for (const bad of [
      'javascript:alert(document.cookie)',
      'JaVaScRiPt:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      'http://insecure.example/license',
    ]) {
      expect(safeExternalUrl(bad)).toBe('#')
    }
  })

  it('refuses values that are not absolute URLs, and empty ones', () => {
    for (const bad of ['/relative/path', '//evil.example/x', 'not a url', '', null, undefined]) {
      expect(safeExternalUrl(bad)).toBe('#')
    }
  })
})
