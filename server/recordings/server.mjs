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
  for await (const chunk of req) chunks.push(chunk)
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
  console.log(`recordings fn listening on :${cfg.port} (backend=${backend.kind})`)
})
