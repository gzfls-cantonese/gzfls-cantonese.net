/**
 * ASR front-end for scoring.
 *
 * `ASSESS_ASR=fake` selects a deterministic offline stub so the whole chain
 * (button -> /assess -> echo) is exercisable on the local backend with no cloud
 * credentials and no network. Any other mode calls the real service: Alibaba
 * Cloud Model Studio (Singapore) `qwen3-asr-flash` over the OpenAI-compatible
 * chat/completions endpoint, one synchronous request, no polling.
 *
 * The audio is handed over as a URL (the presigned OSS GET the caller provides),
 * which qwen3-asr-flash accepts directly. Task 2.0 confirmed real browser
 * containers (.webm from Chrome/Edge, .m4a from Safari) are accepted and the
 * transcript comes back in traditional Chinese, matching the reference text.
 */

const FAKE_TRANSCRIPT = '我就係楷叔，快滴講尼段古仔啦'

const ASR_TIMEOUT_MS = 20_000
const CHAT_PATH = '/compatible-mode/v1/chat/completions'

// qwen3-asr-flash reports the *detected* language on the message annotations,
// e.g. choices[0].message.annotations[0] = {type:'audio_info', language:'yue'}.
// asr_options.language is only a hint and will not reject other languages, so
// this is the only signal available to tell Cantonese from a Mandarin reading.
function extractLanguage(json) {
  const anns = json?.choices?.[0]?.message?.annotations
  if (!Array.isArray(anns)) return ''
  for (const a of anns) {
    if (a && typeof a.language === 'string' && a.language) return a.language
  }
  return ''
}

export function createTranscriber(cfg, { fetchImpl = fetch, now = Date.now } = {}) {
  const assess = cfg.assess || {}

  if (assess.mode === 'fake') {
    return {
      kind: 'fake',
      async transcribe() {
        // No detected language offline; leaving it empty means callers never warn.
        return { ok: true, transcript: FAKE_TRANSCRIPT, language: '' }
      },
    }
  }

  const endpoint = assess.asrBase ? `${assess.asrBase}${CHAT_PATH}` : ''
  // A forced language hint makes qwen3-asr-flash echo that language back on the
  // annotations even for other-language audio, which defeats non-Cantonese
  // detection. Default 'auto' (or empty) omits the hint so the model truly
  // auto-detects: Cantonese still comes back 'yue' with a traditional transcript.
  const langHint = String(assess.asrLang || '').trim()
  const autoLang = langHint === '' || langHint.toLowerCase() === 'auto'

  return {
    kind: 'real',
    async transcribe({ url }) {
      if (!assess.apiKey || !endpoint) {
        return { ok: false, status: 503, error: 'ASR not configured' }
      }
      if (!url) {
        return { ok: false, status: 503, error: 'no audio url to transcribe' }
      }

      const body = {
        model: assess.asrModel,
        messages: [
          { role: 'user', content: [{ type: 'input_audio', input_audio: { data: url } }] },
        ],
        stream: false,
        asr_options: autoLang ? { enable_itn: false } : { language: langHint, enable_itn: false },
      }

      let res
      try {
        res = await fetchImpl(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${assess.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(ASR_TIMEOUT_MS),
        })
      } catch (e) {
        const reason = e && e.name === 'TimeoutError' ? 'ASR timed out' : 'ASR unreachable'
        return { ok: false, status: 503, error: reason }
      }

      let text
      try {
        text = await res.text()
      } catch {
        return { ok: false, status: 502, error: 'ASR response unreadable' }
      }
      if (!res.ok) {
        return { ok: false, status: 502, error: `ASR error ${res.status}` }
      }

      let json
      try {
        json = JSON.parse(text)
      } catch {
        return { ok: false, status: 502, error: 'ASR response is not JSON' }
      }

      const content = json?.choices?.[0]?.message?.content
      const transcript = typeof content === 'string'
        ? content
        : Array.isArray(content)
          ? content.map((c) => (typeof c?.text === 'string' ? c.text : '')).join('')
          : ''
      return { ok: true, transcript, language: extractLanguage(json) }
    },
  }
}
