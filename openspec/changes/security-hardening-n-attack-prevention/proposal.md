# Proposal

## Why

The site takes anonymous voice recordings, stores them in OSS and spends real money on
ASR calls to score them, yet none of the controls that make that safe were written down
anywhere: they landed as nine separate `fix:` commits (`7ef6cb7`..`e1bc2fa`) with the
reasoning only in commit messages. A fresh read of the request path, the build and the
dataset pipeline shows those nine fixes are real but incomplete — the two routes that
create and destroy objects are still unrate-limited, upload size is still unbounded, and
the static site still ships no CSP. This change turns both halves into spec: it records
what the nine commits now guarantee, and it adds the requirements that close what they
left open.

## What Changes

Documented as requirements (already implemented, verified by existing tests):

- **Anonymous request path** — 1 MB request-body cap answered with a drain-safe `413`;
  strict validation of `X-Anon-Id`, `episode`, `entryId`, `recId`, `mime` and `ext`;
  null-prototype mime lookup table so `constructor` is a `400` and not a truthy hit;
  object keys always rebuilt server-side under the caller's own anon prefix, never taken
  from the client; `assertUnderPrefix` on the one destructive call (`delete`);
  `x-content-type-options: nosniff` on every JSON body because error bodies echo
  client-supplied identifiers.
- **ASR spend** — fixed-window caps on `/assess` along three dimensions (anon, IP,
  instance-wide hourly), checked before any storage read or billable call; denied requests
  do not advance their own counters; the counter map is hard-bounded at 20 000 identities
  with oldest-inserted eviction that spares the global key.
- **Cross-origin reads** — `access-control-allow-origin` echoed only for an allow-listed
  origin, omitted entirely otherwise, with `vary: Origin`; required because the FC trigger
  layer adds `access-control-allow-credentials: true` on its own.
- **Browser-side trust** — the client refuses to upload audio to any URL that is not
  `https:` (including protocol-relative `//host`); manifest `licenseUrl` / `source` render
  as dead anchors unless they are `https:`, so a rewritten manifest cannot hand readers a
  `javascript:` URL.
- **Build and supply chain** — `.env*` and `.DS_Store` excluded from the deployed function
  bundle; generated env manifest written under `umask 077`; CI workflow token pinned to
  `contents: read`; `npm audit` moved last so an advisory can no longer hide whether
  typecheck, tests and build passed; `fontTools` declared for the logo generator.
- **Dataset pipeline** — `audio.path` and the episode id come out of the parquet, so
  extraction requires a flat `.opus` filename and an episode in 1..157, re-checks the
  resolved path is still under the audio root, and fails the run reporting skipped rows.

New requirements to implement:

- Rate-limit `/presign-upload` and `/dispose`, not just `/assess` — both are anonymous,
  and each presign creates a distinct billed object while one `/dispose` body can request
  thousands of sequential authenticated DELETEs.
- Bound what an upload can actually cost: `durationSec` is self-declared and OSS V1
  presigned PUT cannot constrain `Content-Length`, so a caller declares 3 s and uploads
  gigabytes. Move the PUT signature to a policy that carries `content-length-range`.
- Stop trusting the first `X-Forwarded-For` hop verbatim for the per-IP window.
- Ship security response headers on the static site from the deploy script, including a
  CSP with `frame-ancestors` so the microphone-permission UI cannot be clickjacked.
- Make the anon id unguessable on every browser, replacing the `Math.random` fallback —
  a predictable id is an IDOR into another user's recordings and transcripts.
- Canonicalise the anonymous id after validating it — the pattern is case-insensitive but
  the value is used verbatim for both the rate-limit key and the storage prefix, so one
  identity re-spelled in different letter cases counts as many.
- Refuse to start when a local storage directory and production OSS credentials are both
  configured, since that combination silently enables the unauthenticated local write route
  in production.
- Remove the live function endpoint from tracked tooling.

**Non-goals** (outside the "repo code and scripts only" constraint, recorded so they are
not silently dropped): forcing HTTPS at the CDN and narrowing the FC trigger's own CORS
configuration are both console-side. `http://gzfls-cantonese.net` therefore stays in
`DEFAULT_ALLOWED_ORIGINS` until the CDN redirects, and the trigger's
`allow-credentials: true` stays out of this repo's control.

## Capabilities

### New Capabilities
- `recordings-request-hardening`: what an anonymous caller may ask the recordings function
  to do, how much of it, and how the function refuses everything else — request size,
  input validation, object-key authority, the destructive-call prefix assertion, response
  sniffing, and the rate/spend caps on all three mutating routes.
- `cross-origin-and-link-safety`: which origins may read responses cross-origin, and which
  URLs the browser is allowed to act on — the CORS allow-list, the https-only upload
  destination, https-only manifest links, and an unguessable anon id.
- `build-and-deploy-integrity`: guarantees about the artifact that ships — no local env
  file in the bundle, a non-world-readable env manifest, least-privilege CI, an audit that
  cannot mask a broken build, declared pipeline dependencies, security response headers on
  the uploaded site, and no live infrastructure endpoint in tracked files.
- `dataset-extract-path-safety`: guarantees the parquet extraction step holds when its
  input is hostile — validated audio names and episode ids, a resolved-path containment
  check, and a failing run that reports what it skipped.

### Modified Capabilities
<!-- None. `deploy-layout` covers where artifacts live, not what headers they carry or how
     they are packaged, so the new header and bundle requirements sit in
     `build-and-deploy-integrity` rather than amending it. -->

## Impact

- **Code**: `server/recordings/{handler,server,ratelimit,config,backend,oss}.mjs`,
  `web/src/data/recordings.ts`, `web/src/config.ts`, `web/src/ui/{AboutPage,HomePage}.tsx`,
  `tools/pipeline/extract.py`, `tools/deploy/{deploy.sh,deploy-recordings.sh}`,
  `tools/testing-scripts.sh`, `.github/workflows/ci.yml`.
- **APIs**: `/presign-upload` gains a `429` outcome; `/dispose` gains a `429` outcome and a
  bound on how many items one body may carry. The upload signature shape changes from a
  presigned PUT URL to a policy-signed POST, which is a **BREAKING** change for the
  browser upload path and for any recording already mid-flight across a deploy.
- **Tests**: existing coverage already asserts the landed behaviour (`server.test.mjs`,
  `handler.test.mjs`, `ratelimit.test.mjs`, `backend.test.mjs`, `config.test.ts`,
  `recordings.test.ts`, `test_extract.py`). Nothing asserts presign/dispose limiting,
  upload size bounds, XFF handling, site security headers or the anon-id fallback, so those
  add tests rather than change them.
- **Infra**: the CSP and header work is delivered through `ossutil` metadata in
  `tools/deploy/deploy.sh`; no console change is required. The FC trigger CORS and the
  HTTPS redirect remain console-side and are listed as non-goals.
