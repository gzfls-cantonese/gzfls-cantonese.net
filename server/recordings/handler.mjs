/**
 * HTTP route handler (pure-ish, testable without a socket).
 *
 * Routes:
 *   OPTIONS *                      -> 204 + CORS headers
 *   POST /presign-upload           -> 200 {recId, uploadUrl, key, assessAvailable} / 429
 *   POST /dispose                  -> 200 {deleted} / 400 too many items / 429
 *   POST /assess                   -> 200 {score, transcript} / 429
 *   PUT  /local-put/<key>          -> local backend only (dev/e2e)
 *   anything else                  -> 404 / 405
 *
 * Security: the anon id arrives only in the X-Anon-Id header, is canonicalised to
 * lowercase once validated, and object keys are always built under that anon
 * prefix, so a client can never address another anon's objects. All three
 * mutating routes are rate limited before any billable work. Cross-origin reads
 * are limited to cfg.allowedOrigins.
 */
import { randomBytes } from 'node:crypto'
import { assertUnderPrefix } from './backend.mjs'
import { ANON_ID_RE, ENTRY_ID_RE, EXT_BY_MIME, MAX_DISPOSE_ITEMS, REC_ID_RE, assessAvailable } from './config.mjs'

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

/**
 * CORS headers for this request. Only an allow-listed origin is echoed back:
 * reflecting whatever arrived, combined with the Access-Control-Allow-Credentials
 * the FC trigger layer adds on its own, would let any site read responses
 * cross-origin. For a disallowed origin the header is omitted entirely, so the
 * browser blocks the response. Vary is required because the answer now depends on
 * a request header that a shared cache would otherwise key away.
 */
function corsHeaders(cfg, req) {
  const common = {
    'access-control-allow-headers': 'X-Anon-Id, Content-Type',
    'access-control-allow-methods': 'POST, PUT, OPTIONS',
    'access-control-max-age': '600',
  }
  const origin = req.headers['origin']
  if (typeof origin !== 'string' || !origin) return common
  const allowed = cfg.allowedOrigins || []
  if (!allowed.includes(origin)) {
    console.warn(`recordings fn: rejected cross-origin request from ${origin}`)
    return { ...common, vary: 'Origin' }
  }
  return { ...common, 'access-control-allow-origin': origin, vary: 'Origin' }
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
  const cors = corsHeaders(cfg, req)

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

  const rawAnon = req.headers['x-anon-id'] || ''
  if (!ANON_ID_RE.test(rawAnon)) {
    return json(403, { error: 'missing or invalid X-Anon-Id' }, cors)
  }
  // Canonicalise after validating, never instead of it. The pattern is
  // case-insensitive but the value feeds both the rate-limit key and the storage
  // prefix, so one identity re-spelled in different letter cases would count as
  // many and multiply every per-anon budget. Conformant clients mint lowercase
  // ids via crypto.randomUUID(), so nothing already stored moves.
  const anon = rawAnon.toLowerCase()

  /**
   * Consume one unit of a route's budget, or the 429 to answer with. Called
   * before any signature is issued, object deleted or ASR billed.
   */
  const capped = (limiter) => {
    if (!limiter) return null
    const verdict = limiter.consume({ anon, ip: clientIp(req) })
    if (verdict.ok) return null
    return json(429, { error: 'rate limited' }, { ...cors, 'retry-after': String(verdict.retryAfterSec) })
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
    // Every signature makes one more distinct object writable and costs a billed
    // storage request, so this route is capped too. It shares the object-mutation
    // budget with /dispose: neither bills ASR, and a separate budget for each
    // would just double what one anonymous caller gets.
    const denied = capped(deps.presignLimiter)
    if (denied) return denied
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
    const denied = capped(deps.limiter)
    if (denied) return denied
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
  // Every item becomes a sequential authenticated delete, so one anonymous
  // request must not be able to name an unbounded list and hold the instance.
  // Refuse the whole request rather than deleting a prefix of it.
  if (items.length > MAX_DISPOSE_ITEMS) {
    return json(400, { error: 'too many items' }, cors)
  }
  const deniedDispose = capped(deps.presignLimiter)
  if (deniedDispose) return deniedDispose
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
