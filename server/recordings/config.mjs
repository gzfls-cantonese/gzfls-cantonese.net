/**
 * Configuration for the recordings function.
 *
 * Backend selection:
 *  - OSS (production): OSS_BUCKET / OSS_ENDPOINT / OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET
 *  - local dir (dev/e2e): RECORDINGS_LOCAL_DIR — files are stored on disk and the
 *    function itself accepts the presigned "upload" PUT, so the whole flow runs
 *    without cloud credentials.
 *
 * Scoring (optional, off unless DASHSCOPE_API_KEY is set): DASHSCOPE_API_KEY,
 * ASSESS_ASR_BASE, ASSESS_ASR_MODEL, ASSESS_ASR_LANG, ASSESS_DATASET_BASE,
 * ASSESS_ASR=fake.
 */
export function loadConfig(env = process.env) {
  const localDir = env.RECORDINGS_LOCAL_DIR || ''
  const bucket = env.OSS_BUCKET || ''
  const endpoint = (env.OSS_ENDPOINT || '').replace(/^https?:\/\//, '')
  const cfg = {
    backend: localDir ? 'local' : 'oss',
    localDir,
    bucket,
    endpoint,
    accessKeyId: env.OSS_ACCESS_KEY_ID || '',
    accessKeySecret: env.OSS_ACCESS_KEY_SECRET || '',
    prefix: env.RECORDINGS_PREFIX || 'recordings',
    maxDurationSec: Number(env.RECORDINGS_MAX_DURATION || 60),
    presignTtlSec: Number(env.RECORDINGS_PRESIGN_TTL || 300),
    port: Number(env.PORT || 8788),
    assess: {
      // 'fake' = deterministic offline stub; '' = call the real ASR service.
      mode: env.ASSESS_ASR || '',
      apiKey: env.DASHSCOPE_API_KEY || '',
      asrBase: stripSlash(env.ASSESS_ASR_BASE || ''),
      asrModel: env.ASSESS_ASR_MODEL || 'qwen3-asr-flash',
      // 'auto' (default) omits the language hint so the ASR truly auto-detects the
      // spoken language, which the non-Cantonese warning relies on. Set 'yue' to
      // force a Cantonese hint — but that masks detection (see asr.mjs).
      asrLang: env.ASSESS_ASR_LANG || 'auto',
      // Reference transcripts come from the public dataset prefix, which shares
      // the recordings bucket — so the base is derivable and stays optional.
      datasetBase: stripSlash(
        env.ASSESS_DATASET_BASE
        || (bucket && endpoint ? `https://${bucket}.${endpoint}/${env.OSS_PREFIX || 'sanguo'}/data` : ''),
      ),
      // Fixed-window scoring caps to blunt abuse that would inflate ASR cost.
      // 0 disables that window. Limits apply per-anon and per-IP.
      rateHourly: Number(env.ASSESS_RATE_HOURLY ?? 10),
      rateDaily: Number(env.ASSESS_RATE_DAILY ?? 100),
    },
  }
  if (cfg.backend === 'oss') {
    const missing = ['bucket', 'endpoint', 'accessKeyId', 'accessKeySecret'].filter((k) => !cfg[k])
    if (missing.length) {
      throw new Error(`recordings fn: missing OSS config: ${missing.map((k) => `OSS_${k.toUpperCase()}`).join(', ')}`)
    }
  }
  if (!(cfg.maxDurationSec > 0)) throw new Error('recordings fn: RECORDINGS_MAX_DURATION must be > 0')
  return cfg
}

function stripSlash(s) {
  return s.replace(/\/+$/, '')
}

/**
 * Whether the frontend may show the scoring entry point: credentials present AND
 * a backend that can hand the ASR service a publicly reachable audio URL. The
 * local backend presigns a root-relative path, so only the fake stub can score
 * there — without this second condition a local run with credentials would show
 * a button that can never succeed.
 */
export function assessAvailable(cfg, backendKind) {
  const a = cfg.assess
  if (!a || !a.apiKey) return false
  return backendKind === 'oss' || a.mode === 'fake'
}

export const ANON_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export const ENTRY_ID_RE = /^[A-Za-z0-9_-]{1,64}$/
export const REC_ID_RE = /^[A-Za-z0-9-]{4,64}$/
export const EXT_BY_MIME = {
  'audio/opus': 'opus',
  'audio/webm': 'webm',
  'audio/webm;codecs=opus': 'webm',
  'audio/mp4': 'm4a',
}
