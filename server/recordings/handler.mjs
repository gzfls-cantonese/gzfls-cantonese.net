/**
 * HTTP route handler (pure-ish, testable without a socket).
 *
 * Routes:
 *   OPTIONS *                      -> 204 + CORS headers
 *   POST /presign-upload           -> 200 {recId, uploadUrl, key, assessAvailable}
 *   POST /dispose                  -> 200 {deleted}
 *   POST /assess                   -> 200 {score, transcript}
 *   PUT  /local-put/<key>          -> local backend only (dev/e2e)
 *   anything else                  -> 404 / 405
 *
 * Security: the anon id arrives only in the X-Anon-Id header; object keys are
 * always built under that anon prefix, so a client can never address another
 * anon's objects.
 */
import { randomBytes } from 'node:crypto'
import { assertUnderPrefix } from './backend.mjs'
import { ANON_ID_RE, ENTRY_ID_RE, EXT_BY_MIME, REC_ID_RE, assessAvailable } from './config.mjs'

const KNOWN_ROUTES = ['/presign-upload', '/dispose', '/assess']
const KNOWN_EXTS = Object.values(EXT_BY_MIME)

function json(status, body, extraHeaders = {}) {
  return {
    status,
    headers: {
      'content-type': 'application/json',
      // Error bodies echo client-supplied identifiers; nosniff keeps an old
      // browser from rendering one as HTML.
      'x-content-type-options': 'nosniff',
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  }
}

function corsHeaders(req) {
  const origin = req.headers['origin'] || '*'
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-headers': 'X-Anon-Id, Content-Type',
    'access-control-allow-methods': 'POST, PUT, OPTIONS',
    'access-control-max-age': '600',
  }
}

function buildKey(cfg, anon, episode, entryId, recId, ext) {
  return `${cfg.prefix}/${anon}/${episode}_${entryId}_${recId}.${ext}`
}

/**
 * Client IP for rate limiting: first hop of X-Forwarded-For (set by the gateway
 * in front of the function), else X-Real-IP, else '' (local dev — IP limiting
 * is then skipped and only the anon dimension applies).
 */
function clientIp(req) {
  const xff = req.headers['x-forwarded-for']
  if (typeof xff === 'string' && xff.trim()) return xff.split(',')[0].trim()
  const real = req.headers['x-real-ip']
  if (typeof real === 'string' && real.trim()) return real.trim()
  return ''
}

export async function handle(cfg, backend, req, deps = {}) {
  const url = new URL(req.url, 'http://local')
  const path = url.pathname
  const cors = corsHeaders(req)

  if (req.method === 'OPTIONS') {
    return { status: 204, headers: cors, body: '' }
  }

  if (req.method === 'PUT' && backend.kind === 'local' && path.startsWith('/local-put/')) {
    const key = decodeURIComponent(path.slice('/local-put/'.length))
    try {
      assertUnderPrefix(cfg, key)
    } catch {
      return json(403, { error: 'forbidden key' }, cors)
    }
    await backend.localPut(key, req.body || '')
    return json(200, { ok: true }, cors)
  }

  if (!KNOWN_ROUTES.includes(path)) {
    return json(404, { error: 'not found' }, cors)
  }
  if (req.method !== 'POST') {
    return json(405, { error: 'method not allowed' }, cors)
  }

  const anon = req.headers['x-anon-id'] || ''
  if (!ANON_ID_RE.test(anon)) {
    return json(403, { error: 'missing or invalid X-Anon-Id' }, cors)
  }

  let payload
  try {
    payload = JSON.parse(req.body || '{}')
  } catch {
    return json(400, { error: 'invalid JSON body' }, cors)
  }

  if (path === '/presign-upload') {
    const episode = Number(payload.episode)
    const entryId = String(payload.entryId || '')
    const durationSec = Number(payload.durationSec)
    const mime = String(payload.mime || 'audio/opus')
    if (!(episode >= 1 && episode <= 999)) return json(400, { error: 'invalid episode' }, cors)
    if (!ENTRY_ID_RE.test(entryId)) return json(400, { error: 'invalid entryId' }, cors)
    if (!(durationSec > 0) || durationSec > cfg.maxDurationSec) {
      return json(413, { error: 'duration exceeds limit' }, cors)
    }
    const ext = EXT_BY_MIME[mime]
    if (!ext) return json(400, { error: 'unsupported mime' }, cors)
    const recId = `${Date.now().toString(36)}-${randomBytes(6).toString('hex')}`
    const key = buildKey(cfg, anon, episode, entryId, recId, ext)
    const uploadUrl = backend.putPresign(key, cfg.presignTtlSec, mime)
    return json(200, { recId, uploadUrl, key, assessAvailable: assessAvailable(cfg, backend.kind) }, cors)
  }

  if (path === '/assess') {
    const episode = Number(payload.episode)
    const entryId = String(payload.entryId || '')
    const recId = String(payload.recId || '')
    const ext = String(payload.ext || '')
    if (!(episode >= 1 && episode <= 999)) return json(400, { error: 'invalid episode' }, cors)
    if (!ENTRY_ID_RE.test(entryId) || !REC_ID_RE.test(recId)) {
      return json(400, { error: 'invalid recording reference' }, cors)
    }
    if (!KNOWN_EXTS.includes(ext)) return json(400, { error: 'unsupported ext' }, cors)
    if (!assessAvailable(cfg, backend.kind) || !deps.assess) {
      return json(503, { error: 'scoring unavailable' }, cors)
    }
    // Cap scoring frequency before touching storage or billing an ASR call.
    if (deps.limiter) {
      const verdict = deps.limiter.consume({ anon, ip: clientIp(req) })
      if (!verdict.ok) {
        return json(429, { error: 'rate limited' }, { ...cors, 'retry-after': String(verdict.retryAfterSec) })
      }
    }
    const key = buildKey(cfg, anon, episode, entryId, recId, ext)
    let found
    try {
      found = await backend.exists(key)
    } catch {
      return json(503, { error: 'storage unavailable' }, cors)
    }
    // A foreign or already-disposed recId resolves to a key that does not exist
    // under this anon's prefix; answering here keeps the ASR call from being
    // billed for a recording that can never be scored.
    if (!found) return json(404, { error: 'recording not found' }, cors)
    const out = await deps.assess.score({ episode, entryId, key })
    if (!out.ok) return json(out.status || 503, { error: out.error }, cors)
    return json(200, { score: out.score, transcript: out.transcript, languageWarning: out.languageWarning === true }, cors)
  }

  // /dispose
  const items = Array.isArray(payload.items) ? payload.items : []
  let deleted = 0
  for (const it of items) {
    const episode = Number(it.episode)
    const entryId = String(it.entryId || '')
    const recId = String(it.recId || '')
    const ext = String(it.ext || '')
    if (!(episode >= 1 && episode <= 999)) continue
    if (!ENTRY_ID_RE.test(entryId) || !REC_ID_RE.test(recId)) continue
    if (!KNOWN_EXTS.includes(ext)) continue
    const key = buildKey(cfg, anon, episode, entryId, recId, ext)
    if (await backend.delete(key)) deleted += 1
  }
  return json(200, { deleted }, cors)
}
