#!/usr/bin/env node
/**
 * Task 2.0 spike: verify qwen3-asr-flash against a REAL browser recording
 * before we wire the real client into server/recordings/asr.mjs.
 *
 * Official docs only list WAV/MP3; browsers emit .webm (Chrome/Edge) and .m4a
 * (Safari). This script answers the three gate questions:
 *   (a) is the container/codec accepted?
 *   (b) is the Cantonese transcript usable?
 *   (c) is the output traditional or simplified? (reference text is traditional)
 *
 * It sends the audio as a base64 data URL, so it needs NO OSS and no public URL
 * — run it locally with just the Singapore Model Studio credentials.
 *
 * Usage:
 *   export DASHSCOPE_API_KEY='sk-...'
 *   export ASSESS_ASR_BASE='https://dashscope-intl.aliyuncs.com'   # or the workspace maas host
 *   node tools/spike-asr.mjs path/to/recording.webm [more-files...]
 *
 * Optional: ASSESS_ASR_MODEL (default qwen3-asr-flash), ASSESS_ASR_LANG (default yue).
 * Secrets are read from env only and never printed.
 */

import { readFile } from 'node:fs/promises'
import { basename, extname } from 'node:path'

const MIME_BY_EXT = {
  '.webm': 'audio/webm',
  '.opus': 'audio/opus',
  '.m4a': 'audio/mp4',
  '.mp4': 'audio/mp4',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
}

const apiKey = process.env.DASHSCOPE_API_KEY || ''
const asrBase = (process.env.ASSESS_ASR_BASE || '').replace(/\/+$/, '')
const model = process.env.ASSESS_ASR_MODEL || 'qwen3-asr-flash'
const lang = process.env.ASSESS_ASR_LANG || 'yue'
const files = process.argv.slice(2)

if (!apiKey) {
  console.error('missing DASHSCOPE_API_KEY')
  process.exit(2)
}
if (!asrBase) {
  console.error('missing ASSESS_ASR_BASE (the Singapore Model Studio host, no path)')
  process.exit(2)
}
if (!files.length) {
  console.error('usage: node tools/spike-asr.mjs <audio-file> [more...]')
  process.exit(2)
}

const url = `${asrBase}/compatible-mode/v1/chat/completions`

for (const file of files) {
  await probe(file)
}

async function probe(file) {
  const ext = extname(file).toLowerCase()
  const mime = MIME_BY_EXT[ext] || 'application/octet-stream'
  const buf = await readFile(file)
  const dataUrl = `data:${mime};base64,${buf.toString('base64')}`

  console.log(`\n=== ${basename(file)} (${mime}, ${(buf.length / 1024).toFixed(1)} KB) ===`)

  const body = {
    model,
    messages: [
      {
        role: 'user',
        content: [{ type: 'input_audio', input_audio: { data: dataUrl } }],
      },
    ],
    stream: false,
    asr_options: { language: lang, enable_itn: false },
  }

  const t0 = Date.now()
  let res
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    })
  } catch (e) {
    console.log(`NETWORK/TIMEOUT: ${e.name} ${e.message}`)
    return
  }
  const ms = Date.now() - t0
  const text = await res.text()

  if (!res.ok) {
    console.log(`HTTP ${res.status} in ${ms}ms — container likely REJECTED`)
    console.log(text.slice(0, 1000))
    return
  }

  let json
  try {
    json = JSON.parse(text)
  } catch {
    console.log(`HTTP 200 but non-JSON body:\n${text.slice(0, 1000)}`)
    return
  }

  const transcript = json?.choices?.[0]?.message?.content
  const anns = json?.choices?.[0]?.message?.annotations
  const language = Array.isArray(anns)
    ? (anns.find((a) => a && typeof a.language === 'string')?.language ?? '(none)')
    : '(none)'
  console.log(`HTTP 200 in ${ms}ms — container ACCEPTED`)
  console.log(`detected language: ${language}   (expect 'yue' for Cantonese, 'zh' for Mandarin)`)
  console.log(`transcript: ${typeof transcript === 'string' ? transcript : JSON.stringify(transcript)}`)
  console.log('(check above: Cantonese quality? traditional or simplified characters?)')
}
