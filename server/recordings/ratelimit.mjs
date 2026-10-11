/**
 * Best-effort, in-memory fixed-window rate limiter.
 *
 * One instance per capped route, selected by `scope`: 'assess' (default) reads
 * cfg.assess, 'presign' reads cfg.presign. Separate instances means separate
 * budgets and separate counter maps, so re-recording a sentence cannot eat into
 * a caller's scoring allowance.
 *
 * A route is capped because abusing it costs money: scoring bills a real ASR
 * request, while presign and dispose each bill storage requests and create or
 * destroy an object. We cap along three dimensions — the anon id, the client IP,
 * and the whole instance — each over fixed windows. A request is allowed only if
 * every applicable counter is still under its limit; then all counters advance.
 * A limit of 0 disables that window.
 *
 * The per-identity dimensions are both attacker-controlled: anon ids are minted
 * by the client and carry no signature, and X-Forwarded-For is a request header.
 * They still catch honest clients and lazy scripts. The instance-wide hourly cap
 * is the one that actually bounds ASR spend.
 *
 * Caveat: state lives in one function instance. Serverless may scale out, so
 * this is a speed bump, not an exact quota. That is acceptable here — the goal
 * is to blunt cheap abuse, not to enforce a hard billing ceiling.
 */
const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000
// Bound memory: past this many tracked keys, drop anything whose daily window
// has already rolled over.
const MAX_ENTRIES = 20_000
// Fixed key for the instance-wide dimension. It must survive eviction below, or
// an attacker rotating identities could reset the only cap they cannot dodge.
const GLOBAL_KEY = 'g:all'

export function createRateLimiter(cfg, { now = Date.now, maxEntries = MAX_ENTRIES, scope = 'assess' } = {}) {
  const limits = (cfg && cfg[scope]) || {}
  const hourly = limits.rateHourly > 0 ? limits.rateHourly : 0
  const daily = limits.rateDaily > 0 ? limits.rateDaily : 0
  const globalHourly = limits.rateGlobalHourly > 0 ? limits.rateGlobalHourly : 0
  const counts = new Map()

  function entry(key, t) {
    const hb = Math.floor(t / HOUR_MS)
    const db = Math.floor(t / DAY_MS)
    let e = counts.get(key)
    if (!e) {
      e = { hb, hc: 0, db, dc: 0 }
      counts.set(key, e)
    }
    if (e.hb !== hb) { e.hb = hb; e.hc = 0 }
    if (e.db !== db) { e.db = db; e.dc = 0 }
    return e
  }

  function retryAfter(t, bucketMs, bucket) {
    const rollover = (bucket + 1) * bucketMs
    return Math.max(1, Math.ceil((rollover - t) / 1000))
  }

  function sweep(t) {
    if (counts.size <= maxEntries) return
    const db = Math.floor(t / DAY_MS)
    for (const [key, e] of counts) {
      if (e.db < db) counts.delete(key)
    }
    // Still over: a client rotating anon ids (or spoofing X-Forwarded-For) keeps
    // every tracked key inside today's window, so the rollover pass above frees
    // nothing and the map would grow until the instance is OOM-killed. Evict
    // oldest-inserted instead — that only resets the budget of whoever has been
    // hammering longest.
    for (const key of counts.keys()) {
      if (counts.size <= maxEntries) break
      if (key !== GLOBAL_KEY) counts.delete(key)
    }
  }

  return {
    enabled: hourly > 0 || daily > 0 || globalHourly > 0,
    /** Identities currently tracked. Exposed so the eviction bound is assertable. */
    get size() {
      return counts.size
    },
    /**
     * @param {{anon?: string, ip?: string}} who
     * @returns {{ok: true} | {ok: false, retryAfterSec: number}}
     */
    consume({ anon, ip }) {
      if (!hourly && !daily && !globalHourly) return { ok: true }
      const t = now()
      // Each dimension carries its own windows: the instance-wide one is
      // hourly-only, so it must not inherit the far lower per-identity daily cap.
      const dims = []
      if (globalHourly) dims.push({ key: GLOBAL_KEY, hourly: globalHourly, daily: 0 })
      if (anon) dims.push({ key: `a:${anon}`, hourly, daily })
      if (ip) dims.push({ key: `i:${ip}`, hourly, daily })
      const entries = dims
        .filter((d) => d.hourly || d.daily)
        .map((d) => ({ ...d, e: entry(d.key, t) }))
      if (!entries.length) return { ok: true }

      // Check before advancing: a denied request must not push the counters up,
      // otherwise a blocked client's retries would extend its own lockout.
      let denied = 0
      for (const { e, hourly: h, daily: d } of entries) {
        if (h && e.hc >= h) denied = Math.min(denied || Infinity, retryAfter(t, HOUR_MS, e.hb))
        if (d && e.dc >= d) denied = Math.min(denied || Infinity, retryAfter(t, DAY_MS, e.db))
      }
      if (denied) return { ok: false, retryAfterSec: denied }

      for (const { e } of entries) { e.hc += 1; e.dc += 1 }
      sweep(t)
      return { ok: true }
    },
  }
}
