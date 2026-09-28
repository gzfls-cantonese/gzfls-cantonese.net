const raw = import.meta.env.VITE_ASSET_BASE ?? '/data'

// Strip trailing slash so `${ASSET_BASE}/path` never yields a double slash.
export const ASSET_BASE = raw.replace(/\/+$/, '')

export function assetUrl(relativePath: string): string {
  return `${ASSET_BASE}/${relativePath.replace(/^\/+/, '')}`
}
