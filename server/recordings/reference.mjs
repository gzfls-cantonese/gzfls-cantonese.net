/**
 * Reference transcripts for scoring, loaded from the public dataset prefix.
 *
 * The client never supplies reference text (it could be tampered with, and would
 * drift from the dataset), so the function fetches `<datasetBase>/episodes/
 * ep_<NNN>.json` itself and picks the span's `transcription`. Episode indexes
 * are immutable per build, so results are cached in memory with a long TTL.
 *
 * Every failure is returned as `{ok:false, status, error}` rather than thrown, so
 * the handler can answer with an understandable message instead of scoring
 * against a missing reference — an empty reference would silently yield 0.
 */

const CACHE_TTL_MS = 10 * 60 * 1000
const FETCH_TIMEOUT_MS = 5000

export function episodeIndexFile(episode) {
  return `episodes/ep_${String(episode).padStart(3, '0')}.json`
}

export function createReferenceLoader(cfg, { fetchImpl = fetch, now = Date.now } = {}) {
  const cache = new Map()

  async function loadEpisode(episode) {
    const hit = cache.get(episode)
    if (hit && now() - hit.at < CACHE_TTL_MS) return { ok: true, index: hit.index, cached: true }

    const base = cfg.assess.datasetBase
    if (!base) {
      return { ok: false, status: 503, error: 'dataset base not configured' }
    }
    const url = `${base}/${episodeIndexFile(episode)}`
    let res
    try {
      res = await fetchImpl(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    } catch {
      return { ok: false, status: 503, error: 'dataset unreachable' }
    }
    if (!res.ok) {
      return { ok: false, status: 404, error: `episode ${episode} index not found (${res.status})` }
    }
    let index
    try {
      index = await res.json()
    } catch {
      return { ok: false, status: 503, error: 'episode index is not valid JSON' }
    }
    if (!index || !Array.isArray(index.entries)) {
      return { ok: false, status: 503, error: 'episode index has no entries' }
    }
    cache.set(episode, { at: now(), index })
    return { ok: true, index }
  }

  return {
    async transcription(episode, entryId) {
      const loaded = await loadEpisode(episode)
      if (!loaded.ok) return loaded
      const entry = loaded.index.entries.find((e) => e && e.id === entryId)
      if (!entry) {
        return { ok: false, status: 404, error: `entry ${entryId} not found in episode ${episode}` }
      }
      if (typeof entry.transcription !== 'string' || !entry.transcription.trim()) {
        return { ok: false, status: 503, error: `entry ${entryId} has no reference text` }
      }
      // The codepoint-aligned jyutping array drives homophone-tolerant scoring;
      // it is optional here so a reference without it degrades to char-level.
      const jyutping = Array.isArray(entry.jyutping) ? entry.jyutping : []
      return { ok: true, transcription: entry.transcription, jyutping }
    },
  }
}
