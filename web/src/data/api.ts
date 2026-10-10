import { assetUrl, indexUrl } from '../config'
import type { EpisodeIndex, Manifest } from './types'

/**
 * Machine-readable failure cause. Human text is resolved at render time from the
 * active locale, so a message already on screen re-translates when the locale
 * changes — a string captured here at throw time could not.
 */
export type DataErrorReason = 'network' | 'http' | 'parse' | 'invalidEpisode'

export class DataError extends Error {
  constructor(
    readonly reason: DataErrorReason,
    /** Locale-independent diagnostic for the console and tests; never rendered. */
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'DataError'
  }
}

async function getJson<T>(url: string): Promise<T> {
  let res: Response
  try {
    res = await fetch(url)
  } catch {
    throw new DataError('network', `fetch failed: ${url}`)
  }
  if (!res.ok) {
    throw new DataError('http', `fetch failed (${res.status}): ${url}`, res.status)
  }
  try {
    return (await res.json()) as T
  } catch {
    throw new DataError('parse', `response was not valid JSON: ${url}`)
  }
}

export function loadManifest(): Promise<Manifest> {
  return getJson<Manifest>(indexUrl('manifest.json'))
}

export function episodeIndexFile(episode: number): string {
  return `episodes/ep_${String(episode).padStart(3, '0')}.json`
}

export function loadEpisode(episode: number): Promise<EpisodeIndex> {
  return getJson<EpisodeIndex>(indexUrl(episodeIndexFile(episode)))
}

export function episodeAudioUrl(entry: { audio: string }): string {
  return assetUrl(entry.audio)
}

export function episodeCoverUrl(cover: string): string {
  return assetUrl(cover)
}
