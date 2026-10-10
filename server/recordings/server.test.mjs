/**
 * Integration tests for the node:http entry point — the process the cloud
 * function actually runs. handle() is covered elsewhere; this exercises the
 * socket-level behaviour around it, so the server is spawned for real on an
 * ephemeral port and driven over HTTP.
 */
import { spawn } from 'node:child_process'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const ENTRY = fileURLToPath(new URL('./server.mjs', import.meta.url))

async function startServer(t, env = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'recfn-http-'))
  const child = spawn(process.execPath, [ENTRY], {
    env: { ...process.env, PORT: '0', RECORDINGS_LOCAL_DIR: dir, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  t.after(() => child.kill('SIGKILL'))

  const port = await new Promise((resolve, reject) => {
    const fail = (err) => reject(err)
    child.on('error', fail)
    child.stderr.on('data', (d) => {
      const text = d.toString()
      if (text.trim()) process.stderr.write(`[server] ${text}`)
    })
    child.stdout.on('data', (d) => {
      const m = d.toString().match(/listening on :(\d+)/)
      if (m) {
        child.off('error', fail)
        resolve(Number(m[1]))
      }
    })
    setTimeout(() => reject(new Error('server did not report a port in time')), 10_000).unref()
  })
  return `http://127.0.0.1:${port}`
}

test('an oversized body is refused with 413 and the socket still answers', async (t) => {
  const base = await startServer(t)
  const res = await fetch(`${base}/presign-upload`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: `{"episode":1,"pad":"${'x'.repeat(2 * 1024 * 1024)}"}`,
  })
  assert.equal(res.status, 413)
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff')
  assert.equal((await res.json()).error, 'request body too large')

  // The instance must still serve the next request rather than having wedged on
  // the aborted one.
  const after = await fetch(`${base}/presign-upload`, { method: 'POST', body: '{}' })
  assert.equal(after.status, 403, 'a normal-sized body reaches the router')
  assert.equal((await after.json()).error, 'missing or invalid X-Anon-Id')
})

test('a normal-sized body is routed through to handle()', async (t) => {
  const base = await startServer(t)
  const anon = '11111111-1111-4111-8111-111111111111'
  const res = await fetch(`${base}/presign-upload`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-anon-id': anon },
    body: JSON.stringify({ episode: 1, entryId: 'e1', durationSec: 5 }),
  })
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.match(body.uploadUrl, /^\/local-put\/recordings\//)
  assert.equal(body.assessAvailable, false, 'no credentials in this env')
})

test('only allow-listed origins are echoed back over a real socket', async (t) => {
  const base = await startServer(t, { RECORDINGS_ALLOWED_ORIGINS: 'https://allowed.example' })
  const allowed = await fetch(`${base}/nope`, { headers: { origin: 'https://allowed.example' } })
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://allowed.example')

  const denied = await fetch(`${base}/nope`, { headers: { origin: 'https://evil.example' } })
  assert.equal(denied.headers.get('access-control-allow-origin'), null)
})
