/**
 * Best-effort, in-memory fixed-window rate limiter for the scoring route.
 *
 * The scoring call bills a real ASR request, so abuse (a scripted client
 * hammering /assess) is a direct cost. We cap it along two dimensions — the
 * anon id and the client IP — each over an hourly and a daily window. A request
 * is allowed only if every applicable counter is still under its limit; then
 * all counters advance. A limit of 0 disables that window.
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

export function createRateLimiter(cfg, { now = Date.now } = {}) {
  const assess = (cfg && cfg.assess) || {}
  const hourly = assess.rateHourly > 0 ? assess.rateHourly : 0
  const daily = assess.rateDaily > 0 ? assess.rateDaily : 0
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
    if (counts.size <= MAX_ENTRIES) return
    const db = Math.floor(t / DAY_MS)
    for (const [key, e] of counts) {
      if (e.db < db) counts.delete(key)
    }
  }

  return {
    enabled: hourly > 0 || daily > 0,
    /**
     * @param {{anon?: string, ip?: string}} who
     * @returns {{ok: true} | {ok: false, retryAfterSec: number}}
     */
    consume({ anon, ip }) {
      if (!hourly && !daily) return { ok: true }
      const t = now()
      const keys = []
      if (anon) keys.push(`a:${anon}`)
      if (ip) keys.push(`i:${ip}`)
      if (!keys.length) return { ok: true }

      const entries = keys.map((k) => ({ key: k, e: entry(k, t) }))

      // Check before advancing: a denied request must not push the counters up,
      // otherwise a blocked client's retries would extend its own lockout.
      let denied = 0
      for (const { e } of entries) {
        if (hourly && e.hc >= hourly) denied = Math.min(denied || Infinity, retryAfter(t, HOUR_MS, e.hb))
        if (daily && e.dc >= daily) denied = Math.min(denied || Infinity, retryAfter(t, DAY_MS, e.db))
      }
      if (denied) return { ok: false, retryAfterSec: denied }

      for (const { e } of entries) { e.hc += 1; e.dc += 1 }
      sweep(t)
      return { ok: true }
    },
  }
}
