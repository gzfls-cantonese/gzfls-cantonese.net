/**
 * Backend / OSS signing / assess-availability tests (node --test).
 */
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createHmac } from 'node:crypto'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createBackend, assertUnderPrefix } from './backend.mjs'
import { assessAvailable, loadConfig } from './config.mjs'
import { presignGetUrl, presignPutUrl } from './oss.mjs'

const OSS_CFG = {
  backend: 'oss',
  localDir: '',
  bucket: 'gzfls-cantonese',
  endpoint: 'oss-cn-hongkong.aliyuncs.com',
  accessKeyId: 'test-key-id',
  accessKeySecret: 'test-key-secret',
  prefix: 'recordings',
  maxDurationSec: 60,
  presignTtlSec: 300,
  port: 0,
  assess: { mode: '', apiKey: '', asrBase: '', asrModel: 'qwen3-asr-flash', asrLang: 'yue', datasetBase: '' },
}

function sig(secret, stringToSign) {
  return createHmac('sha1', secret).update(stringToSign, 'utf8').digest('base64')
}

async function localSetup(cfgOverrides = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'recfn-be-'))
  const cfg = { ...OSS_CFG, backend: 'local', localDir: dir, ...cfgOverrides }
  return { cfg, backend: createBackend(cfg), dir }
}

test('presignGetUrl signs the GET verb with the configured TTL', () => {
  const ttl = 300
  const key = 'recordings/anon/1_e1_abc.opus'
  const before = Math.floor(Date.now() / 1000)
  const url = new URL(presignGetUrl(OSS_CFG, key, ttl))
  const after = Math.floor(Date.now() / 1000)

  const expires = Number(url.searchParams.get('Expires'))
  assert.ok(expires >= before + ttl && expires <= after + ttl, 'Expires must be now + ttl')
  assert.equal(url.searchParams.get('OSSAccessKeyId'), OSS_CFG.accessKeyId)

  const resource = `/${OSS_CFG.bucket}/${key}`
  const expected = sig(OSS_CFG.accessKeySecret, ['GET', '', '', String(expires), resource].join('\n'))
  assert.equal(url.searchParams.get('Signature'), expected)

  // The verb is bound into the signature: a PUT string-to-sign must not verify.
  const putExpected = sig(OSS_CFG.accessKeySecret, ['PUT', '', '', String(expires), resource].join('\n'))
  assert.notEqual(url.searchParams.get('Signature'), putExpected)
  assert.equal(url.pathname, `/${key}`)
})

test('presignGetUrl and presignPutUrl produce different signatures for the same key', () => {
  const key = 'recordings/anon/1_e1_abc.opus'
  const getUrl = new URL(presignGetUrl(OSS_CFG, key, 300))
  const putUrl = new URL(presignPutUrl(OSS_CFG, key, 300, 'audio/webm'))
  assert.notEqual(getUrl.searchParams.get('Signature'), putUrl.searchParams.get('Signature'))
})

test('oss backend getPresign returns a GET url under the prefix', () => {
  const backend = createBackend(OSS_CFG)
  const key = 'recordings/anon/7_e9_rec.webm'
  const url = new URL(backend.getPresign(key, OSS_CFG.presignTtlSec))
  assert.equal(url.host, `${OSS_CFG.bucket}.${OSS_CFG.endpoint}`)
  assert.ok(url.searchParams.get('Signature'))
})

test('keys outside the recordings prefix are rejected', async () => {
  const backend = createBackend(OSS_CFG)
  for (const bad of ['other/anon/1_e1_a.opus', 'recordings/../secret.opus', '', undefined]) {
    assert.throws(() => backend.getPresign(bad, 300), /forbidden key/)
    // delete is the one destructive call, so it must gate on the prefix too —
    // and it must do so before reaching the network.
    await assert.rejects(backend.delete(bad), /forbidden key/)
  }
  assert.throws(() => assertUnderPrefix(OSS_CFG, 'nope/x.opus'), /forbidden key/)
  assertUnderPrefix(OSS_CFG, 'recordings/anon/x.opus')
})

test('local backend reads back the bytes it wrote and rejects foreign keys', async () => {
  const { cfg, backend } = await localSetup()
  const key = 'recordings/anon/1_e1_rec.opus'
  await backend.localPut(key, 'hello-audio')
  const bytes = await backend.getObject(key)
  assert.equal(bytes.toString('utf8'), 'hello-audio')

  await assert.rejects(backend.getObject('elsewhere/1_e1_rec.opus'), /forbidden key/)
  await assert.rejects(backend.getObject(`recordings/../${'x'.repeat(3)}.opus`), /forbidden key/)
  assert.throws(() => backend.getPresign(key), /publicly reachable/)
  assert.equal(cfg.backend, 'local')
})

test('assessAvailable requires credentials AND a backend that can serve audio', () => {
  const withKey = { ...OSS_CFG, assess: { ...OSS_CFG.assess, apiKey: 'sk-test' } }
  const fakeKey = { ...OSS_CFG, assess: { ...OSS_CFG.assess, apiKey: 'sk-test', mode: 'fake' } }
  const noKeyFake = { ...OSS_CFG, assess: { ...OSS_CFG.assess, mode: 'fake' } }

  assert.equal(assessAvailable(withKey, 'oss'), true, 'oss + credentials')
  assert.equal(assessAvailable(OSS_CFG, 'oss'), false, 'oss without credentials')
  assert.equal(assessAvailable(withKey, 'local'), false, 'local + credentials, real ASR')
  assert.equal(assessAvailable(fakeKey, 'local'), true, 'local + credentials + fake stub')
  assert.equal(assessAvailable(noKeyFake, 'local'), false, 'fake stub still needs a key')
  assert.equal(assessAvailable({}, 'oss'), false, 'legacy cfg without an assess block')
})

test('loadConfig derives the dataset base from the OSS config', () => {
  const cfg = loadConfig({
    OSS_BUCKET: 'gzfls-cantonese',
    OSS_ENDPOINT: 'https://oss-cn-hongkong.aliyuncs.com',
    OSS_ACCESS_KEY_ID: 'id',
    OSS_ACCESS_KEY_SECRET: 'secret',
    OSS_PREFIX: 'sanguo',
  })
  assert.equal(cfg.assess.datasetBase, 'https://gzfls-cantonese.oss-cn-hongkong.aliyuncs.com/sanguo/data')
  assert.equal(cfg.assess.asrModel, 'qwen3-asr-flash')
  assert.equal(cfg.assess.asrLang, 'auto')
  assert.equal(cfg.assess.mode, '')

  const explicit = loadConfig({
    OSS_BUCKET: 'b', OSS_ENDPOINT: 'e', OSS_ACCESS_KEY_ID: 'i', OSS_ACCESS_KEY_SECRET: 's',
    ASSESS_DATASET_BASE: 'https://cdn.example.com/data/',
  })
  assert.equal(explicit.assess.datasetBase, 'https://cdn.example.com/data')

  const local = loadConfig({ RECORDINGS_LOCAL_DIR: '/tmp/x' })
  assert.equal(local.assess.datasetBase, '', 'no bucket/endpoint to derive from')
})

test('loadConfig defaults the CORS allow-list and honours an override', () => {
  const cfg = loadConfig({
    OSS_BUCKET: 'b', OSS_ENDPOINT: 'e', OSS_ACCESS_KEY_ID: 'i', OSS_ACCESS_KEY_SECRET: 's',
  })
  assert.ok(cfg.allowedOrigins.includes('https://gzfls-cantonese.net'), 'the deployed site origin')
  assert.ok(cfg.allowedOrigins.includes('http://localhost:5173'), 'the dev server origin')
  assert.ok(!cfg.allowedOrigins.includes('*'), 'never a wildcard')

  const overridden = loadConfig({
    OSS_BUCKET: 'b', OSS_ENDPOINT: 'e', OSS_ACCESS_KEY_ID: 'i', OSS_ACCESS_KEY_SECRET: 's',
    RECORDINGS_ALLOWED_ORIGINS: 'https://a.example, https://b.example/ ,',
  })
  assert.deepEqual(overridden.allowedOrigins, ['https://a.example', 'https://b.example'])
})
