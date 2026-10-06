/**
 * Reference-loader tests (node --test) — fetch is always mocked.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createReferenceLoader, episodeIndexFile } from './reference.mjs'

const BASE = 'https://gzfls-cantonese.oss-cn-hongkong.aliyuncs.com/sanguo/data'

function cfgWith(datasetBase = BASE) {
  return { assess: { datasetBase } }
}

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

function indexWith(entries) {
  return { episode: 7, count: entries.length, totalDuration: 10, entries }
}

function harness(cfg, responses, { clock } = {}) {
  const calls = []
  let t = clock ? clock.start : 0
  const fetchImpl = async (url, init) => {
    calls.push({ url, init })
    const next = responses.shift()
    if (next instanceof Error) throw next
    return next
  }
  const now = clock ? () => t : () => 0
  const loader = createReferenceLoader(cfg, { fetchImpl, now })
  return { loader, calls, advance: (ms) => { t += ms } }
}

test('loads the padded episode index url and returns the span transcription', async () => {
  const entries = [{ id: 'e1', transcription: '話說天下大勢' }, { id: 'e2', transcription: '分久必合', jyutping: ['fan1', 'gau2', 'bit1', 'hap6'] }]
  const { loader, calls } = harness(cfgWith(), [jsonResponse(indexWith(entries))])
  const out = await loader.transcription(7, 'e2')
  assert.deepEqual(out, { ok: true, transcription: '分久必合', jyutping: ['fan1', 'gau2', 'bit1', 'hap6'] })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, `${BASE}/episodes/ep_007.json`)
  assert.equal(calls[0].url, `${BASE}/${episodeIndexFile(7)}`)
  assert.ok(calls[0].init.signal, 'a timeout signal must be attached')
})

test('a reference without jyutping returns an empty array, not undefined', async () => {
  const { loader } = harness(cfgWith(), [jsonResponse(indexWith([{ id: 'e1', transcription: '孔明曰' }]))])
  assert.deepEqual(await loader.transcription(7, 'e1'), { ok: true, transcription: '孔明曰', jyutping: [] })
})

test('honours an explicitly configured base', async () => {
  const { loader, calls } = harness(cfgWith('https://cdn.example.com/data'), [
    jsonResponse(indexWith([{ id: 'e1', transcription: '孔明曰' }])),
  ])
  assert.equal((await loader.transcription(12, 'e1')).transcription, '孔明曰')
  assert.equal(calls[0].url, 'https://cdn.example.com/data/episodes/ep_012.json')
})

test('serves a cached episode without refetching, then refetches after the TTL', async () => {
  const entries = [{ id: 'e1', transcription: '話說天下大勢' }]
  const { loader, calls, advance } = harness(cfgWith(), [
    jsonResponse(indexWith(entries)),
    jsonResponse(indexWith([{ id: 'e1', transcription: '分久必合' }])),
  ], { clock: { start: 0 } })

  assert.equal((await loader.transcription(7, 'e1')).transcription, '話說天下大勢')
  assert.equal((await loader.transcription(7, 'e1')).transcription, '話說天下大勢')
  assert.equal(calls.length, 1, 'second call must hit the cache')

  advance(10 * 60 * 1000 + 1)
  assert.equal((await loader.transcription(7, 'e1')).transcription, '分久必合')
  assert.equal(calls.length, 2, 'expired entry must be refetched')
})

test('network failure, timeout and bad JSON never produce a reference', async () => {
  for (const [responses, expected] of [
    [[new Error('connect ECONNREFUSED')], { status: 503, error: 'dataset unreachable' }],
    [[jsonResponse(null, 404)], { status: 404 }],
    [[{ ok: true, status: 200, json: async () => { throw new Error('bad json') } }], { status: 503, error: 'episode index is not valid JSON' }],
    [[jsonResponse({ episode: 7 })], { status: 503, error: 'episode index has no entries' }],
  ]) {
    const { loader, calls } = harness(cfgWith(), [...responses])
    const out = await loader.transcription(7, 'e1')
    assert.equal(out.ok, false)
    assert.equal(out.status, expected.status)
    if (expected.error) assert.equal(out.error, expected.error)
    assert.equal(out.transcription, undefined)
    assert.equal(calls.length, 1)
  }
})

test('unknown entryId and blank reference text are refused', async () => {
  const entries = [{ id: 'e1', transcription: '話說天下大勢' }, { id: 'blank', transcription: '   ' }, { id: 'none' }]
  const { loader } = harness(cfgWith(), [jsonResponse(indexWith(entries))])

  const missing = await loader.transcription(7, 'nope')
  assert.deepEqual(missing, { ok: false, status: 404, error: 'entry nope not found in episode 7' })

  const blank = await loader.transcription(7, 'blank')
  assert.equal(blank.status, 503)
  assert.match(blank.error, /no reference text/)

  const absent = await loader.transcription(7, 'none')
  assert.equal(absent.status, 503)
})

test('an unconfigured dataset base is unavailable, not an empty score', async () => {
  const { loader, calls } = harness(cfgWith(''), [jsonResponse(indexWith([]))])
  const out = await loader.transcription(7, 'e1')
  assert.deepEqual(out, { ok: false, status: 503, error: 'dataset base not configured' })
  assert.equal(calls.length, 0, 'must not attempt a fetch without a base')
})

test('failures are not cached, so a later retry can succeed', async () => {
  const { loader, calls } = harness(cfgWith(), [
    new Error('boom'),
    jsonResponse(indexWith([{ id: 'e1', transcription: '話說天下大勢' }])),
  ])
  assert.equal((await loader.transcription(7, 'e1')).status, 503)
  assert.equal((await loader.transcription(7, 'e1')).transcription, '話說天下大勢')
  assert.equal(calls.length, 2)
})
