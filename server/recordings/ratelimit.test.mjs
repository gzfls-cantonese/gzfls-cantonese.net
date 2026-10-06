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

function limiter({ rateHourly = 0, rateDaily = 0 } = {}, clk = clock()) {
  return { lim: createRateLimiter({ assess: { rateHourly, rateDaily } }, { now: clk.now }), clk }
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
