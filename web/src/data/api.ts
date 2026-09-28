import { assetUrl } from '../config'
import type { EpisodeIndex, Manifest } from './types'

export class DataError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
    this.name = 'DataError'
  }
}

async function getJson<T>(url: string): Promise<T> {
  let res: Response
  try {
    res = await fetch(url)
  } catch {
    throw new DataError(`网络错误，无法访问 ${url}`)
  }
  if (!res.ok) {
    throw new DataError(`请求失败 (${res.status})`, res.status)
  }
  try {
    return (await res.json()) as T
  } catch {
    throw new DataError('返回内容不是有效的 JSON')
  }
}

export function loadManifest(): Promise<Manifest> {
  return getJson<Manifest>(assetUrl('manifest.json'))
}

export function episodeIndexFile(episode: number): string {
  return `episodes/ep_${String(episode).padStart(3, '0')}.json`
}

export function loadEpisode(episode: number): Promise<EpisodeIndex> {
  return getJson<EpisodeIndex>(assetUrl(episodeIndexFile(episode)))
}

export function episodeAudioUrl(entry: { audio: string }): string {
  return assetUrl(entry.audio)
}

export function episodeCoverUrl(cover: string): string {
  return assetUrl(cover)
}
