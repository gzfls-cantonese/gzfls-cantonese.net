/**
 * node:http entry point: parses the body, applies CORS, delegates to handle().
 */
import { createServer } from 'node:http'
import { createAssessService } from './assess.mjs'
import { createTranscriber } from './asr.mjs'
import { createBackend } from './backend.mjs'
import { loadConfig } from './config.mjs'
import { handle } from './handler.mjs'
import { loadJyutpingDict } from './jyutping.mjs'
import { createRateLimiter } from './ratelimit.mjs'
import { createReferenceLoader } from './reference.mjs'

// Largest request body accepted. Every route takes a small JSON payload; the
// biggest legitimate one is a /dispose list covering a long session.
const MAX_BODY_BYTES = 1_048_576

const cfg = loadConfig()
const backend = createBackend(cfg)
// Built once so the reference-loader cache and the rate-limit counters survive
// across requests within this instance.
const deps = {
  assess: createAssessService(cfg, backend, {
    transcriber: createTranscriber(cfg),
    references: createReferenceLoader(cfg),
    dict: loadJyutpingDict(),
  }),
  limiter: createRateLimiter(cfg),
}

const server = createServer(async (req, res) => {
  const chunks = []
  let received = 0
  // Every route takes a small JSON body, so this is generous; without it one
  // client streaming bytes at the socket grows the buffer until the instance is
  // OOM-killed. Past the cap we stop accumulating but keep draining: breaking out
  // of the iterator destroys the request before the 413 is flushed and can take
  // the socket with it. The platform's request timeout bounds the drain.
  let tooLarge = false
  for await (const chunk of req) {
    received += chunk.length
    if (received > MAX_BODY_BYTES) tooLarge = true
    else chunks.push(chunk)
  }
  if (tooLarge) {
    res.writeHead(413, {
      'content-type': 'application/json',
      'x-content-type-options': 'nosniff',
      connection: 'close',
    })
    res.end(JSON.stringify({ error: 'request body too large' }))
    return
  }
  const body = Buffer.concat(chunks)
  const out = await handle(cfg, backend, {
    method: req.method,
    url: req.url,
    headers: req.headers,
    body: body.toString('utf8'),
  }, deps)
  res.writeHead(out.status, out.headers)
  res.end(out.body)
})

server.listen(cfg.port, () => {
  // Report the bound port, not the requested one, so PORT=0 is usable.
  console.log(`recordings fn listening on :${server.address().port} (backend=${backend.kind})`)
})
