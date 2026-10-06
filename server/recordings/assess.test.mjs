import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createAssessService } from './assess.mjs'

const REF = '我就係楷叔，快滴講尼段古仔啦'

function make({ references, transcriber, backend, dict, presignTtlSec = 300 }) {
  const cfg = { presignTtlSec }
  return { cfg, svc: createAssessService(cfg, backend, { transcriber, references, dict }) }
}

const okReferences = (transcription = REF) => ({
  async transcription() { return { ok: true, transcription } },
})

test('scores against the reference transcript', async () => {
  const transcriber = { kind: 'real', async transcribe() { return { ok: true, transcript: REF } } }
  const presigned = []
  const backend = { getPresign(key, ttl) { presigned.push({ key, ttl }); return 'https://oss/signed' } }
  const { svc } = make({ references: okReferences(), transcriber, backend })
  const out = await svc.score({ episode: 1, entryId: 'e1', key: 'recordings/a/1_e1_r1.webm' })
  assert.deepEqual(out, { ok: true, score: 100, transcript: REF })
  assert.deepEqual(presigned, [{ key: 'recordings/a/1_e1_r1.webm', ttl: 300 }])
})

test('hands the presigned url and extension to the transcriber', async () => {
  const seen = []
  const transcriber = {
    kind: 'real',
    async transcribe(arg) { seen.push(arg); return { ok: true, transcript: REF } },
  }
  const backend = { getPresign: () => 'https://oss/signed' }
  const { svc } = make({ references: okReferences(), transcriber, backend })
  await svc.score({ episode: 1, entryId: 'e1', key: 'recordings/a/1_e1_r1.m4a' })
  assert.deepEqual(seen, [{ url: 'https://oss/signed', ext: 'm4a' }])
})

test('a missing reference fails before any audio work', async () => {
  const references = {
    async transcription() { return { ok: false, status: 503, error: 'dataset unreachable' } },
  }
  const transcriber = { kind: 'real', async transcribe() { throw new Error('must not be billed') } }
  const backend = { getPresign() { throw new Error('must not presign') } }
  const { svc } = make({ references, transcriber, backend })
  const out = await svc.score({ episode: 1, entryId: 'e1', key: 'recordings/a/1_e1_r1.webm' })
  assert.deepEqual(out, { ok: false, status: 503, error: 'dataset unreachable' })
})

test('an ASR failure is passed through unchanged', async () => {
  const transcriber = { kind: 'real', async transcribe() { return { ok: false, status: 503, error: 'ASR timeout' } } }
  const { svc } = make({ references: okReferences(), transcriber, backend: { getPresign: () => 'u' } })
  const out = await svc.score({ episode: 1, entryId: 'e1', key: 'recordings/a/1_e1_r1.webm' })
  assert.deepEqual(out, { ok: false, status: 503, error: 'ASR timeout' })
})

test('an empty transcript is reported, not scored as zero', async () => {
  const transcriber = { kind: 'real', async transcribe() { return { ok: true, transcript: '' } } }
  const { svc } = make({ references: okReferences(), transcriber, backend: { getPresign: () => 'u' } })
  const out = await svc.score({ episode: 1, entryId: 'e1', key: 'recordings/a/1_e1_r1.webm' })
  assert.equal(out.ok, false)
  assert.equal(out.status, 503)
  assert.equal(out.error, 'ASR returned no transcript')
})

test('fake mode never presigns, so the local backend can score', async () => {
  const transcriber = { kind: 'fake', async transcribe() { return { ok: true, transcript: REF } } }
  const backend = { getPresign() { throw new Error('local backend cannot presign') } }
  const { svc } = make({ references: okReferences(), transcriber, backend })
  const out = await svc.score({ episode: 1, entryId: 'e1', key: 'recordings/a/1_e1_r1.opus' })
  assert.equal(out.ok, true)
})

test('uses homophone scoring when a dict and reference jyutping are present', async () => {
  const references = { async transcription() { return { ok: true, transcription: '詩', jyutping: ['si1'] } } }
  const transcriber = { kind: 'fake', async transcribe() { return { ok: true, transcript: '史' } } }
  const backend = { getPresign() { throw new Error('must not presign in fake mode') } }
  const { svc } = make({ references, transcriber, backend, dict: { 詩: 'si', 史: 'si' } })
  const out = await svc.score({ episode: 1, entryId: 'e1', key: 'recordings/a/1_e1_r1.opus' })
  assert.deepEqual(out, { ok: true, score: 100, transcript: '史' })
})

test('falls back to char-level scoring when no dict is supplied', async () => {
  const references = { async transcription() { return { ok: true, transcription: '詩', jyutping: ['si1'] } } }
  const transcriber = { kind: 'fake', async transcribe() { return { ok: true, transcript: '史' } } }
  const backend = { getPresign() { throw new Error('must not presign in fake mode') } }
  const { svc } = make({ references, transcriber, backend })
  const out = await svc.score({ episode: 1, entryId: 'e1', key: 'recordings/a/1_e1_r1.opus' })
  assert.equal(out.ok, true)
  assert.equal(out.score, 0, '詩 and 史 share no character, so char-level scores 0')
})
