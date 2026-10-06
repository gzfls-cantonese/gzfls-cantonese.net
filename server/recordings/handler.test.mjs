/**
 * Route handler tests (node --test). Uses the local backend in a temp dir.
 */
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createAssessService } from './assess.mjs'
import { createTranscriber } from './asr.mjs'
import { createBackend } from './backend.mjs'
import { handle } from './handler.mjs'
import { createRateLimiter } from './ratelimit.mjs'

const ANON_A = '11111111-1111-4111-8111-111111111111'
const ANON_B = '22222222-2222-4222-8222-222222222222'

async function setup() {
  const dir = await mkdtemp(path.join(tmpdir(), 'recfn-'))
  const cfg = {
    backend: 'local',
    localDir: dir,
    bucket: '',
    endpoint: '',
    accessKeyId: '',
    accessKeySecret: '',
    prefix: 'recordings',
    maxDurationSec: 60,
    presignTtlSec: 300,
    port: 0,
  }
  return { cfg, backend: createBackend(cfg), dir }
}

function req(method, url, headers = {}, body = '') {
  return { method, url, headers, body }
}

test('OPTIONS returns 204 with CORS', async () => {
  const { cfg, backend } = await setup()
  const out = await handle(cfg, backend, req('OPTIONS', '/presign-upload', { origin: 'http://x' }))
  assert.equal(out.status, 204)
  assert.equal(out.headers['access-control-allow-origin'], 'http://x')
})

test('presign-upload rejects missing anon', async () => {
  const { cfg, backend } = await setup()
  const out = await handle(cfg, backend, req('POST', '/presign-upload', {}, JSON.stringify({ episode: 1, entryId: 'e', durationSec: 5 })))
  assert.equal(out.status, 403)
})

test('presign-upload rejects duration over limit', async () => {
  const { cfg, backend } = await setup()
  const out = await handle(cfg, backend, req('POST', '/presign-upload', { 'x-anon-id': ANON_A }, JSON.stringify({ episode: 1, entryId: 'e', durationSec: 999 })))
  assert.equal(out.status, 413)
})

test('presign-upload success returns recId + local uploadUrl', async () => {
  const { cfg, backend } = await setup()
  const out = await handle(cfg, backend, req('POST', '/presign-upload', { 'x-anon-id': ANON_A }, JSON.stringify({ episode: 1, entryId: 'e1', durationSec: 5, mime: 'audio/opus' })))
  assert.equal(out.status, 200)
  const body = JSON.parse(out.body)
  assert.ok(body.recId)
  assert.ok(body.uploadUrl.startsWith('/local-put/recordings/'))
  assert.ok(body.key.startsWith(`recordings/${ANON_A}/`))
})

test('local-put then dispose removes the object', async () => {
  const { cfg, backend, dir } = await setup()
  const presign = await handle(cfg, backend, req('POST', '/presign-upload', { 'x-anon-id': ANON_A }, JSON.stringify({ episode: 1, entryId: 'e1', durationSec: 5 })))
  const { key, recId } = JSON.parse(presign.body)
  const put = await handle(cfg, backend, req('PUT', `/local-put/${key}`, {}, 'blob'))
  assert.equal(put.status, 200)
  await readFile(path.join(dir, key))
  const ext = key.split('.').pop()
  const dispose = await handle(cfg, backend, req('POST', '/dispose', { 'x-anon-id': ANON_A }, JSON.stringify({
    items: [{ episode: 1, entryId: 'e1', recId, ext }],
  })))
  assert.equal(dispose.status, 200)
  assert.equal(JSON.parse(dispose.body).deleted, 1)
  await assert.rejects(readFile(path.join(dir, key)))
})

test('dispose cannot touch another anon objects', async () => {
  const { cfg, backend, dir } = await setup()
  const presignB = await handle(cfg, backend, req('POST', '/presign-upload', { 'x-anon-id': ANON_B }, JSON.stringify({ episode: 2, entryId: 'e2', durationSec: 5 })))
  const { key: keyB, recId: recIdB } = JSON.parse(presignB.body)
  await handle(cfg, backend, req('PUT', `/local-put/${keyB}`, {}, 'blob'))
  const ext = keyB.split('.').pop()
  const dispose = await handle(cfg, backend, req('POST', '/dispose', { 'x-anon-id': ANON_A }, JSON.stringify({
    items: [{ episode: 2, entryId: 'e2', recId: recIdB, ext }],
  })))
  assert.equal(JSON.parse(dispose.body).deleted, 0)
  await readFile(path.join(dir, keyB))
})

test('unknown route 404, wrong method 405', async () => {
  const { cfg, backend } = await setup()
  assert.equal((await handle(cfg, backend, req('GET', '/list'))).status, 404)
  assert.equal((await handle(cfg, backend, req('GET', '/presign-upload'))).status, 405)
})

test('local-put rejects keys that traverse out of the prefix', async () => {
  const { cfg, backend, dir } = await setup()
  const traversal = `recordings/../../${path.basename(dir)}-escape.opus`
  const out = await handle(cfg, backend, req('PUT', `/local-put/${encodeURIComponent(traversal)}`, {}, 'blob'))
  assert.equal(out.status, 403)
  await assert.rejects(readFile(path.resolve(dir, '..', `${path.basename(dir)}-escape.opus`)))

  const outside = await handle(cfg, backend, req('PUT', '/local-put/other/anon/1_e1_a.opus', {}, 'blob'))
  assert.equal(outside.status, 403)
})

test('presign-upload reports assessAvailable and keeps existing fields', async () => {
  const body = JSON.stringify({ episode: 1, entryId: 'e1', durationSec: 5, mime: 'audio/opus' })
  const call = async (assess) => {
    const { cfg, backend } = await setup()
    if (assess) cfg.assess = assess
    const out = await handle(cfg, backend, req('POST', '/presign-upload', { 'x-anon-id': ANON_A }, body))
    assert.equal(out.status, 200)
    return JSON.parse(out.body)
  }

  const creds = { apiKey: 'sk-test', asrBase: '', asrModel: 'qwen3-asr-flash', asrLang: 'yue', datasetBase: '' }

  const legacy = await call(undefined)
  assert.equal(legacy.assessAvailable, false, 'no assess config at all')
  assert.ok(legacy.recId && legacy.uploadUrl && legacy.key, 'existing fields unchanged')

  assert.equal((await call({ ...creds, mode: '' })).assessAvailable, false, 'local backend + real ASR')
  assert.equal((await call({ ...creds, mode: 'fake' })).assessAvailable, true, 'local backend + fake stub')
  assert.equal((await call({ ...creds, apiKey: '', mode: 'fake' })).assessAvailable, false, 'no credentials')
})

const ASSESS_CREDS = { apiKey: 'sk-test', asrBase: '', asrModel: 'qwen3-asr-flash', asrLang: 'yue', datasetBase: '' }

async function assessSetup(overrides = {}) {
  const { cfg, backend, dir } = await setup()
  cfg.assess = { ...ASSESS_CREDS, mode: 'fake', ...overrides.assess }
  const calls = { reference: [], score: [] }
  const references = {
    async transcription(episode, entryId) {
      calls.reference.push({ episode, entryId })
      return { ok: true, transcription: '我就係楷叔，快滴講尼段古仔啦' }
    },
  }
  const deps = { assess: createAssessService(cfg, backend, { transcriber: createTranscriber(cfg), references }) }
  return { cfg, backend, dir, deps, calls }
}

async function record(cfg, backend, anon, episode, entryId) {
  const presign = await handle(cfg, backend, req('POST', '/presign-upload', { 'x-anon-id': anon }, JSON.stringify({ episode, entryId, durationSec: 5 })))
  const { recId, key } = JSON.parse(presign.body)
  await handle(cfg, backend, req('PUT', `/local-put/${key}`, {}, 'blob'))
  return { recId, ext: key.split('.').pop() }
}

test('assess rejects missing or invalid anon id', async () => {
  const { cfg, backend, deps } = await assessSetup()
  const body = JSON.stringify({ episode: 1, entryId: 'e1', recId: 'abc-def', ext: 'opus' })
  assert.equal((await handle(cfg, backend, req('POST', '/assess', {}, body), deps)).status, 403)
  assert.equal((await handle(cfg, backend, req('POST', '/assess', { 'x-anon-id': 'not-a-uuid' }, body), deps)).status, 403)
})

test('assess rejects malformed recording references', async () => {
  const { cfg, backend, deps, calls } = await assessSetup()
  const call = (payload) => handle(cfg, backend, req('POST', '/assess', { 'x-anon-id': ANON_A }, JSON.stringify(payload)), deps)
  const good = { episode: 1, entryId: 'e1', recId: 'abc123-def456', ext: 'opus' }
  assert.equal((await call({ ...good, episode: 0 })).status, 400)
  assert.equal((await call({ ...good, entryId: '../x' })).status, 400)
  assert.equal((await call({ ...good, recId: 'bad id' })).status, 400)
  assert.equal((await call({ ...good, ext: 'exe' })).status, 400)
  assert.equal(calls.reference.length, 0)
})

test('assess is unavailable without credentials or with a real ASR on local', async () => {
  const noCreds = await assessSetup({ assess: { apiKey: '' } })
  const body = JSON.stringify({ episode: 1, entryId: 'e1', recId: 'abc123-def456', ext: 'opus' })
  const out = await handle(noCreds.cfg, noCreds.backend, req('POST', '/assess', { 'x-anon-id': ANON_A }, body), noCreds.deps)
  assert.equal(out.status, 503)
  assert.equal(JSON.parse(out.body).error, 'scoring unavailable')

  const realAsr = await assessSetup({ assess: { mode: '' } })
  assert.equal((await handle(realAsr.cfg, realAsr.backend, req('POST', '/assess', { 'x-anon-id': ANON_A }, body), realAsr.deps)).status, 503)
})

test('assess scores the caller own recording', async () => {
  const { cfg, backend, deps, calls } = await assessSetup()
  const { recId, ext } = await record(cfg, backend, ANON_A, 1, 'e1')
  const out = await handle(cfg, backend, req('POST', '/assess', { 'x-anon-id': ANON_A }, JSON.stringify({
    episode: 1, entryId: 'e1', recId, ext,
  })), deps)
  assert.equal(out.status, 200)
  const scored = JSON.parse(out.body)
  assert.ok(Number.isInteger(scored.score) && scored.score >= 0 && scored.score <= 100)
  assert.equal(scored.score, 100)
  assert.ok(typeof scored.transcript === 'string' && scored.transcript.length > 0)
  assert.deepEqual(calls.reference, [{ episode: 1, entryId: 'e1' }])
})

test('assess cannot address another anon recording', async () => {
  const { cfg, backend, deps, calls } = await assessSetup()
  const { recId, ext } = await record(cfg, backend, ANON_B, 2, 'e2')
  const out = await handle(cfg, backend, req('POST', '/assess', { 'x-anon-id': ANON_A }, JSON.stringify({
    episode: 2, entryId: 'e2', recId, ext,
  })), deps)
  assert.equal(out.status, 404)
  assert.equal(JSON.parse(out.body).error, 'recording not found')
  assert.equal(calls.reference.length, 0, 'no ASR or dataset work for an unaddressable key')
})

test('assess fails once the recording is disposed', async () => {
  const { cfg, backend, deps } = await assessSetup()
  const { recId, ext } = await record(cfg, backend, ANON_A, 3, 'e3')
  const payload = JSON.stringify({ episode: 3, entryId: 'e3', recId, ext })
  assert.equal((await handle(cfg, backend, req('POST', '/assess', { 'x-anon-id': ANON_A }, payload), deps)).status, 200)
  await handle(cfg, backend, req('POST', '/dispose', { 'x-anon-id': ANON_A }, JSON.stringify({
    items: [{ episode: 3, entryId: 'e3', recId, ext }],
  })))
  assert.equal((await handle(cfg, backend, req('POST', '/assess', { 'x-anon-id': ANON_A }, payload), deps)).status, 404)
})

test('assess rate-limits after the hourly cap and returns Retry-After', async () => {
  const { cfg, backend, deps, calls } = await assessSetup()
  cfg.assess.rateHourly = 2
  cfg.assess.rateDaily = 0
  deps.limiter = createRateLimiter(cfg)
  const { recId, ext } = await record(cfg, backend, ANON_A, 1, 'e1')
  const payload = JSON.stringify({ episode: 1, entryId: 'e1', recId, ext })
  const call = () => handle(cfg, backend, req('POST', '/assess', { 'x-anon-id': ANON_A }, payload), deps)

  assert.equal((await call()).status, 200)
  assert.equal((await call()).status, 200)
  const denied = await call()
  assert.equal(denied.status, 429)
  assert.equal(JSON.parse(denied.body).error, 'rate limited')
  assert.ok(Number(denied.headers['retry-after']) > 0, 'Retry-After is a positive number of seconds')
  assert.equal(calls.reference.length, 2, 'a denied request bills no ASR and touches no dataset')
})

test('assess rate-limits per IP independently of anon', async () => {
  const { cfg, backend, deps } = await assessSetup()
  cfg.assess.rateHourly = 1
  cfg.assess.rateDaily = 0
  deps.limiter = createRateLimiter(cfg)
  const a = await record(cfg, backend, ANON_A, 1, 'e1')
  const b = await record(cfg, backend, ANON_B, 1, 'e1')
  const sameIp = { 'x-forwarded-for': '9.9.9.9, 10.0.0.1' }

  assert.equal((await handle(cfg, backend, req('POST', '/assess', { 'x-anon-id': ANON_A, ...sameIp }, JSON.stringify({ episode: 1, entryId: 'e1', recId: a.recId, ext: a.ext })), deps)).status, 200)
  assert.equal((await handle(cfg, backend, req('POST', '/assess', { 'x-anon-id': ANON_B, ...sameIp }, JSON.stringify({ episode: 1, entryId: 'e1', recId: b.recId, ext: b.ext })), deps)).status, 429)
})

test('no list or download route exists', async () => {
  const { cfg, backend, deps } = await assessSetup()
  for (const p of ['/list', '/download', '/objects', '/recordings', '/assess/result']) {
    assert.equal((await handle(cfg, backend, req('GET', p), deps)).status, 404, p)
    assert.equal((await handle(cfg, backend, req('POST', p, { 'x-anon-id': ANON_A }, '{}'), deps)).status, 404, p)
  }
  assert.equal((await handle(cfg, backend, req('GET', '/assess'), deps)).status, 405)
})
