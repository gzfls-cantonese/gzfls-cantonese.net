import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createTranscriber } from './asr.mjs'

function countingFetch() {
  const calls = []
  return { calls, impl: async (...args) => { calls.push(args); throw new Error('must not be called') } }
}

const REAL_CFG = {
  assess: {
    mode: '',
    apiKey: 'sk-test',
    asrBase: 'https://dashscope-intl.aliyuncs.com',
    asrModel: 'qwen3-asr-flash',
    asrLang: 'yue',
  },
}

function okResponse(content) {
  return { ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message: { content } }] }) }
}

// Real qwen3-asr-flash reports the detected language on message annotations.
function okResponseWithLang(content, language) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify({
      choices: [{ message: { content, annotations: [{ type: 'audio_info', language }] } }],
    }),
  }
}

test('fake mode returns a stable transcript without touching the network', async () => {
  const { calls, impl } = countingFetch()
  const cfg = { assess: { mode: 'fake', apiKey: 'sk-test' }, presignTtlSec: 300 }
  const t = createTranscriber(cfg, { fetchImpl: impl })
  assert.equal(t.kind, 'fake')
  const a = await t.transcribe({ url: 'http://unused', ext: 'webm' })
  const b = await t.transcribe({ url: 'http://unused', ext: 'm4a' })
  assert.equal(a.ok, true)
  assert.equal(a.transcript, b.transcript)
  assert.ok(a.transcript.length > 0)
  assert.equal(a.language, '', 'offline stub reports no detected language')
  assert.equal(calls.length, 0)
})

test('real mode posts the audio url to the compatible-mode endpoint', async () => {
  const seen = []
  const impl = async (url, init) => {
    seen.push({ url, init })
    return okResponse('我就係楷叔')
  }
  const t = createTranscriber(REAL_CFG, { fetchImpl: impl })
  assert.equal(t.kind, 'real')
  const out = await t.transcribe({ url: 'https://oss/presigned.webm', ext: 'webm' })

  assert.deepEqual(out, { ok: true, transcript: '我就係楷叔', language: '' })
  assert.equal(seen.length, 1)
  assert.equal(seen[0].url, 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions')
  assert.equal(seen[0].init.method, 'POST')
  assert.equal(seen[0].init.headers.Authorization, 'Bearer sk-test')
  assert.equal(seen[0].init.headers['Content-Type'], 'application/json')

  const body = JSON.parse(seen[0].init.body)
  assert.equal(body.model, 'qwen3-asr-flash')
  assert.equal(body.stream, false)
  assert.deepEqual(body.asr_options, { language: 'yue', enable_itn: false })
  assert.equal(body.messages[0].content[0].type, 'input_audio')
  assert.equal(body.messages[0].content[0].input_audio.data, 'https://oss/presigned.webm')
})

test('real mode surfaces the detected language from annotations', async () => {
  const yue = createTranscriber(REAL_CFG, { fetchImpl: async () => okResponseWithLang('我就係楷叔', 'yue') })
  assert.deepEqual(await yue.transcribe({ url: 'u', ext: 'webm' }), { ok: true, transcript: '我就係楷叔', language: 'yue' })
  const zh = createTranscriber(REAL_CFG, { fetchImpl: async () => okResponseWithLang('我就系楷叔', 'zh') })
  assert.deepEqual(await zh.transcribe({ url: 'u', ext: 'webm' }), { ok: true, transcript: '我就系楷叔', language: 'zh' })
})

test('real mode joins array-shaped content into one transcript', async () => {
  const impl = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ choices: [{ message: { content: [{ text: '甲' }, { text: '乙' }] } }] }),
  })
  const out = await createTranscriber(REAL_CFG, { fetchImpl: impl }).transcribe({ url: 'u', ext: 'webm' })
  assert.deepEqual(out, { ok: true, transcript: '甲乙', language: '' })
})

test('real mode is unavailable without credentials or base url', async () => {
  const { calls, impl } = countingFetch()
  const noKey = createTranscriber({ assess: { mode: '', apiKey: '', asrBase: 'https://x' } }, { fetchImpl: impl })
  assert.deepEqual(await noKey.transcribe({ url: 'u', ext: 'webm' }), { ok: false, status: 503, error: 'ASR not configured' })
  const noBase = createTranscriber({ assess: { mode: '', apiKey: 'sk', asrBase: '' } }, { fetchImpl: impl })
  assert.deepEqual(await noBase.transcribe({ url: 'u', ext: 'webm' }), { ok: false, status: 503, error: 'ASR not configured' })
  assert.equal(calls.length, 0)
})

test('real mode refuses when there is no audio url', async () => {
  const { calls, impl } = countingFetch()
  const t = createTranscriber(REAL_CFG, { fetchImpl: impl })
  assert.deepEqual(await t.transcribe({ url: '', ext: 'webm' }), { ok: false, status: 503, error: 'no audio url to transcribe' })
  assert.equal(calls.length, 0)
})

test('real mode maps non-2xx to a 502 with the upstream status', async () => {
  const impl = async () => ({ ok: false, status: 400, text: async () => 'bad container' })
  const out = await createTranscriber(REAL_CFG, { fetchImpl: impl }).transcribe({ url: 'u', ext: 'webm' })
  assert.deepEqual(out, { ok: false, status: 502, error: 'ASR error 400' })
})

test('real mode maps a timeout to a 503', async () => {
  const impl = async () => { const e = new Error('x'); e.name = 'TimeoutError'; throw e }
  const out = await createTranscriber(REAL_CFG, { fetchImpl: impl }).transcribe({ url: 'u', ext: 'webm' })
  assert.deepEqual(out, { ok: false, status: 503, error: 'ASR timed out' })
})

test('real mode maps a network failure to a 503', async () => {
  const impl = async () => { throw new Error('ECONNRESET') }
  const out = await createTranscriber(REAL_CFG, { fetchImpl: impl }).transcribe({ url: 'u', ext: 'webm' })
  assert.deepEqual(out, { ok: false, status: 503, error: 'ASR unreachable' })
})

test('real mode maps invalid JSON to a 502', async () => {
  const impl = async () => ({ ok: true, status: 200, text: async () => '<html>' })
  const out = await createTranscriber(REAL_CFG, { fetchImpl: impl }).transcribe({ url: 'u', ext: 'webm' })
  assert.deepEqual(out, { ok: false, status: 502, error: 'ASR response is not JSON' })
})
