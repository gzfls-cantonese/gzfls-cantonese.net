/**
 * Rate limiter unit tests (node --test) with an injectable clock so windows can
 * be advanced deterministically.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRateLimiter } from './ratelimit.mjs'

const HOUR = 3_600_000
const DAY = 86_400_000

function clock(start = 0) {
  let t = start
  return { now: () => t, advance: (ms) => { t += ms } }
}

function limiter({ rateHourly = 0, rateDaily = 0, rateGlobalHourly = 0, maxEntries } = {}, clk = clock()) {
  const assess = { rateHourly, rateDaily, rateGlobalHourly }
  const opts = { now: clk.now }
  if (maxEntries !== undefined) opts.maxEntries = maxEntries
  return { lim: createRateLimiter({ assess }, opts), clk }
}

test('no windows configured means everything passes', () => {
  const { lim } = limiter()
  assert.equal(lim.enabled, false)
  for (let i = 0; i < 50; i++) assert.equal(lim.consume({ anon: 'a', ip: '1.1.1.1' }).ok, true)
})

test('hourly window denies at the cap and resets on rollover', () => {
  const { lim, clk } = limiter({ rateHourly: 2 })
  assert.equal(lim.consume({ anon: 'a' }).ok, true)
  assert.equal(lim.consume({ anon: 'a' }).ok, true)
  const denied = lim.consume({ anon: 'a' })
  assert.equal(denied.ok, false)
  assert.ok(denied.retryAfterSec > 0 && denied.retryAfterSec <= 3600)
  clk.advance(HOUR + 1)
  assert.equal(lim.consume({ anon: 'a' }).ok, true, 'next hour window is fresh')
})

test('a denied request does not advance its own counters', () => {
  const { lim, clk } = limiter({ rateHourly: 1 })
  assert.equal(lim.consume({ anon: 'a' }).ok, true)
  assert.equal(lim.consume({ anon: 'a' }).ok, false)
  assert.equal(lim.consume({ anon: 'a' }).ok, false)
  clk.advance(HOUR + 1)
  assert.equal(lim.consume({ anon: 'a' }).ok, true, 'retries did not push the window out')
})

test('daily window is independent of the hourly one', () => {
  const { lim, clk } = limiter({ rateHourly: 100, rateDaily: 1 })
  assert.equal(lim.consume({ anon: 'a' }).ok, true)
  const denied = lim.consume({ anon: 'a' })
  assert.equal(denied.ok, false, 'daily cap binds even though hourly has room')
  assert.ok(denied.retryAfterSec > 3600, 'retry-after points at the daily rollover')
  clk.advance(HOUR + 1)
  assert.equal(lim.consume({ anon: 'a' }).ok, false, 'a new hour does not reset the day')
  clk.advance(DAY)
  assert.equal(lim.consume({ anon: 'a' }).ok, true)
})

test('retryAfterSec is the smaller of the two binding windows', () => {
  const { lim, clk } = limiter({ rateHourly: 1, rateDaily: 1 })
  clk.advance(DAY - 30 * 60 * 1000) // 30 min before the daily rollover
  assert.equal(lim.consume({ anon: 'a' }).ok, true)
  const denied = lim.consume({ anon: 'a' })
  assert.equal(denied.ok, false)
  // Both windows are exceeded; the daily rollover (30 min away) is sooner than
  // the hourly one, so it governs Retry-After.
  assert.ok(denied.retryAfterSec <= 30 * 60 && denied.retryAfterSec > 0)
})

test('separate anons and separate IPs get separate budgets', () => {
  const { lim } = limiter({ rateHourly: 1 })
  assert.equal(lim.consume({ anon: 'a' }).ok, true)
  assert.equal(lim.consume({ anon: 'b' }).ok, true, 'a different anon is unaffected')
  assert.equal(lim.consume({ ip: '1.1.1.1' }).ok, true)
  assert.equal(lim.consume({ ip: '2.2.2.2' }).ok, true, 'a different IP is unaffected')
})

test('anon and IP dimensions both count toward the same request', () => {
  const { lim } = limiter({ rateHourly: 2 })
  assert.equal(lim.consume({ anon: 'a', ip: '1.1.1.1' }).ok, true)
  assert.equal(lim.consume({ anon: 'a', ip: '1.1.1.1' }).ok, true)
  // anon 'a' is exhausted even from a fresh IP.
  assert.equal(lim.consume({ anon: 'a', ip: '9.9.9.9' }).ok, false)
  // IP 1.1.1.1 is exhausted even for a fresh anon.
  assert.equal(lim.consume({ anon: 'z', ip: '1.1.1.1' }).ok, false)
})

test('no identity means no limiting (local dev without an IP header)', () => {
  const { lim } = limiter({ rateHourly: 1 })
  for (let i = 0; i < 10; i++) assert.equal(lim.consume({}).ok, true)
})

test('the instance-wide cap holds across rotating anon ids and IPs', () => {
  const { lim } = limiter({ rateHourly: 100, rateGlobalHourly: 3 })
  // Both per-identity dimensions are client-controlled: anon ids are minted by
  // the caller and X-Forwarded-For is a request header, so neither can bound cost
  // on its own.
  for (let i = 0; i < 3; i++) {
    assert.equal(lim.consume({ anon: `anon-${i}`, ip: `10.0.0.${i}` }).ok, true, `request ${i}`)
  }
  const denied = lim.consume({ anon: 'anon-fresh', ip: '10.0.0.99' })
  assert.equal(denied.ok, false)
  assert.ok(denied.retryAfterSec > 0 && denied.retryAfterSec <= 3600)
})

test('the instance-wide cap resets on the hour and ignores the daily cap', () => {
  const { lim, clk } = limiter({ rateHourly: 0, rateDaily: 1, rateGlobalHourly: 2 })
  assert.equal(lim.consume({ anon: 'a' }).ok, true)
  assert.equal(lim.consume({ anon: 'b' }).ok, true)
  assert.equal(lim.consume({ anon: 'c' }).ok, false)
  // rateDaily is 1, so if the global dimension inherited it the second request
  // above would already have been denied on the daily window.
  clk.advance(HOUR + 1)
  assert.equal(lim.consume({ anon: 'd' }).ok, true, 'the global window rolled over')
})

test('the instance-wide cap applies with no client-supplied identity at all', () => {
  const { lim } = limiter({ rateHourly: 1, rateGlobalHourly: 2 })
  assert.equal(lim.consume({}).ok, true)
  assert.equal(lim.consume({}).ok, true)
  assert.equal(lim.consume({}).ok, false)
})

test('tracking is bounded when every identity is fresh and inside its window', () => {
  const { lim } = limiter({ rateHourly: 1000, rateGlobalHourly: 1000, maxEntries: 5 }, clock(0))
  // All requests land in the same hour and the same day, so the rollover sweep
  // frees nothing — this is the shape that used to grow the map without bound.
  for (let i = 0; i < 500; i++) lim.consume({ anon: `a-${i}`, ip: `10.0.${i >> 8}.${i & 255}` })
  assert.ok(lim.size <= 5, `tracked ${lim.size} identities, expected the cap to hold`)
})

test('eviction never resets the instance-wide counter', () => {
  const { lim } = limiter({ rateHourly: 1000, rateGlobalHourly: 4, maxEntries: 3 }, clock(0))
  // The global key is created first, so it is the oldest entry an eviction pass
  // would reach for; losing it would hand an attacker an unlimited budget.
  for (let i = 0; i < 50; i++) lim.consume({ anon: `a-${i}` })
  const denied = lim.consume({ anon: 'a-final' })
  assert.equal(denied.ok, false, 'the global cap survived 50 evictions')
  assert.ok(denied.retryAfterSec > 0 && denied.retryAfterSec <= 3600)
})

test('scope picks the budget, and two scopes do not share one', () => {
  const clk = clock()
  const cfg = {
    assess: { rateHourly: 1, rateDaily: 0, rateGlobalHourly: 0 },
    presign: { rateHourly: 3, rateDaily: 0, rateGlobalHourly: 0 },
  }
  const scoring = createRateLimiter(cfg, { now: clk.now })
  const objects = createRateLimiter(cfg, { scope: 'presign', now: clk.now })

  assert.equal(scoring.consume({ anon: 'a' }).ok, true)
  assert.equal(scoring.consume({ anon: 'a' }).ok, false, 'the scoring cap is 1')
  assert.equal(objects.consume({ anon: 'a' }).ok, true, 're-recording draws a different budget')
  assert.equal(objects.consume({ anon: 'a' }).ok, true)
  assert.equal(objects.consume({ anon: 'a' }).ok, true)
  assert.equal(objects.consume({ anon: 'a' }).ok, false, 'the object cap is 3')
})

test('each scope keeps its own instance-wide counter', () => {
  const clk = clock()
  const cfg = { assess: { rateGlobalHourly: 1 }, presign: { rateGlobalHourly: 1 } }
  const scoring = createRateLimiter(cfg, { now: clk.now })
  const objects = createRateLimiter(cfg, { scope: 'presign', now: clk.now })

  assert.equal(scoring.consume({ anon: 'x' }).ok, true)
  assert.equal(scoring.consume({ anon: 'y' }).ok, false, 'the scoring global cap is spent')
  assert.equal(objects.consume({ anon: 'y' }).ok, true, 'the object global cap is its own')
})

test('a scope with no configured limits lets everything through', () => {
  const missing = createRateLimiter({ assess: { rateHourly: 1 } }, { scope: 'presign' })
  assert.equal(missing.enabled, false)
  assert.equal(missing.consume({ anon: 'a' }).ok, true)
})
