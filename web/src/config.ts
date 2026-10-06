const raw = import.meta.env.VITE_ASSET_BASE ?? '/data'

// Strip trailing slash so `${ASSET_BASE}/path` never yields a double slash.
export const ASSET_BASE = raw.replace(/\/+$/, '')

// Deploy stamp baked at build time (deploy.sh exports VITE_DEPLOY_VERSION).
// Mutable index JSON (manifest, per-episode indexes) can be refreshed in place
// at the stable data prefix, where old copies may sit in long immutable caches;
// stamping the URL changes the cache key so clients pick up fresh data.
export const DEPLOY_VERSION = import.meta.env.VITE_DEPLOY_VERSION ?? 'dev'

export function assetUrl(relativePath: string): string {
  return `${ASSET_BASE}/${relativePath.replace(/^\/+/, '')}`
}

// Recordings function base URL. Unset => the whole trial-recording UI stays
// hidden (also the rollback switch). Trailing slash stripped so
// `${RECORDINGS_API}/presign-upload` never yields a double slash.
const recRaw = import.meta.env.VITE_RECORDINGS_API
export const RECORDINGS_API: string | null = recRaw ? recRaw.replace(/\/+$/, '') : null

/** URL for a mutable index JSON file, stamped with the deploy version. */
export function indexUrl(relativePath: string): string {
  return `${assetUrl(relativePath)}?v=${DEPLOY_VERSION}`
}
