# Tasks

## 1. Landed controls — re-verify, do not reimplement

These nine commits are already merged and tested. Each box is checked off by re-running the
test that pins the behaviour, so a regression anywhere in the set is caught before new work
starts on top of it.

- [x] 1.1 Request-body cap and drain-safe `413` — verify `cd server/recordings && npm test`
  passes `server.test.mjs`'s oversized-body and socket-survival cases
- [x] 1.2 Input validation, null-prototype mime table and `nosniff` on JSON — verify
  `handler.test.mjs` covers the prototype-key `400`, the invalid-anon `403` and the header
  on error bodies
- [x] 1.3 Server-derived object keys and cross-anon isolation on `/assess` and `/dispose` —
  verify `handler.test.mjs`'s foreign-anon cases and its assertion that no list or download
  route exists
- [x] 1.4 Prefix re-assertion on the delete call — verify `backend.test.mjs` refuses a key
  outside the recordings prefix
- [x] 1.5 Three-dimension scoring caps, checked before storage and ASR, with a bounded
  counter map that spares the global key — verify `ratelimit.test.mjs` including the
  anon/IP-rotation case against the global cap, and `handler.test.mjs`'s `429` paths
- [x] 1.6 CORS allow-list with `vary: Origin` and no header for a rejected origin — verify
  `handler.test.mjs`'s origin cases and `server.test.mjs` over a real socket
- [x] 1.7 Client refuses a non-https or protocol-relative upload destination — verify
  `cd web && npm test` passes `recordings.test.ts`'s upload-URL cases
- [x] 1.8 Manifest links degrade to dead anchors unless https — verify `config.test.ts`
  covers `javascript:`, `data:`, relative and https inputs, and that `AboutPage.tsx` /
  `HomePage.tsx` route both manifest links through it
- [x] 1.9 Build and supply-chain controls: `.env*` / `.DS_Store` excluded from the function
  bundle, env manifest under `umask 077`, CI token pinned to `contents: read`, `npm audit`
  last, `fontTools` declared — verify by inspecting `tools/deploy/deploy-recordings.sh`,
  `.github/workflows/ci.yml` and `tools/pipeline/requirements.txt`, and by building a bundle
  with a `.env` present and confirming `unzip -l` shows no `.env*` entry
- [x] 1.10 Dataset path containment: flat `.opus` allow-list, episode integer in 1..157,
  `realpath` containment, skipped rows fail the run — verify
  `cd tools/pipeline && pytest test_extract.py` passes the absolute-path and
  parent-relative cases

## 2. Tighten the anonymous request path (D15, D16, D23, D24)

- [x] 2.1 Canonicalise the validated anon id to lowercase once, at the point where the header
  is accepted, so the limiter key and the storage prefix cannot be multiplied by re-spelling
  it (D24) — verify a handler test that the same id in upper and lower case draws on one
  rate-limit budget and resolves to one key, and that an existing lowercase-prefixed
  recording still scores after the change
- [x] 2.2 Add presign rate knobs to config alongside the existing scoring ones, defaulting to
  `PRESIGN_RATE_HOURLY=60`, `PRESIGN_RATE_DAILY=600`, `PRESIGN_RATE_GLOBAL_HOURLY=2000`,
  with `0` disabling a window — verify a config unit test asserts each default and the
  override
- [x] 2.3 Apply the limiter to `/presign-upload` and `/dispose` before any signature is
  issued or delete attempted, returning `429` with `Retry-After`, reusing the existing
  limiter rather than adding a second mechanism — verify handler tests show a presign flood
  and a dispose flood both reach `429` and that no object key is produced and no delete is
  called after the cap
- [x] 2.4 Keep the scoring budget separate from the presign budget so re-recording a
  sentence does not exhaust a caller's scoring allowance — verify a test consumes the
  presign cap and asserts `/assess` still succeeds
- [x] 2.5 Cap `/dispose` at 100 items per request and refuse the request rather than
  performing a partial delete — verify a handler test naming more than 100 items gets a
  refusal and zero deletes
- [x] 2.6 Refuse to start when a local storage directory and production OSS credentials are
  both configured, since that combination silently enables the unauthenticated
  `PUT /local-put/<key>` route in production — verify a config test asserts startup fails
  naming both settings and that a local-only configuration still starts and serves the route
- [x] 2.7 Split the client's dispose into sequential chunks of at most 100, leaving the
  `pagehide` keepalive path as a single best-effort chunk — verify a `recordings.test.ts`
  case asserting a 250-item cleanup issues three requests and that a failed chunk stays
  non-fatal
- [x] 2.8 Document the new knobs, the per-request dispose cap and the anon-id
  canonicalisation in `server/recordings/README.md`'s environment-variable, route and
  validation sections — verify the documented defaults match `config.mjs` and the documented
  cap matches the handler
- [x] 2.9 Record the startup guard in `server/recordings/README.md`'s backend-selection
  section — verify the documented precedence matches the new refusal rather than the old
  `localDir ? 'local' : 'oss'` behaviour

## 3. Bound upload size at the signature (D17)

- [ ] 3.1 Replace the presigned PUT with a `PostObject` policy carrying
  `content-length-range`, with the ceiling derived as
  `maxDurationSec × 32 KiB/s + 64 KiB` so it follows `RECORDINGS_MAX_DURATION` instead of
  drifting from it — verify a signing unit test asserts the policy's size condition tracks
  the configured duration
- [ ] 3.2 Change the presign response to carry the policy form and update the client's
  upload to POST the multipart body instead of PUTting the blob — verify an upload test
  drives the new shape end to end against the local backend
- [ ] 3.3 Keep the https-only client check from 1.7 in force for the new destination, since
  the policy target is still a URL the function supplied — verify the existing
  `recordings.test.ts` cases still pass against the new response shape
- [ ] 3.4 Replace the "未收口的成本面" paragraph in `server/recordings/README.md` with the
  enforced bound and its derivation, and record the breaking response-shape change plus the
  `VITE_RECORDINGS_API` rollback lever in `tools/deploy/DEPLOY.md` — verify no stale claim
  about unbounded uploads remains (`grep -n "未收口" server/recordings/README.md` returns
  nothing)
- [ ] 3.5 Verify against the real storage service, not a local stand-in: request a signature
  from the deployed function and confirm an upload above the derived ceiling is rejected by
  OSS while one below it succeeds — the local backend cannot prove a policy condition the
  cloud service enforces

## 4. Stop trusting the caller's forwarded hop (D18)

- [ ] 4.1 Take the client IP from the hop the gateway appended rather than the first hop the
  caller wrote, preferring the platform's real-IP header where present, and document in a
  comment that this hardens a speed bump rather than restoring a guarantee — verify a
  handler test that a fabricated first hop does not change the value used for the per-IP
  window
- [ ] 4.2 Confirm the instance-wide cap is untouched by this change and still returns `429`
  when every per-identity dimension has been rotated — verify the existing
  `ratelimit.test.mjs` rotation case still passes
- [ ] 4.3 Update the `ratelimit.mjs` caveat comment and the README limiting section to state
  what the per-IP dimension now does and does not defend — verify the README no longer
  describes the first XFF hop as authoritative

## 5. Unguessable anonymous identity (D20)

- [x] 5.1 Remove the `Math.random` UUID fallback and fail closed: where no cryptographically
  secure generator is available, disable the recording feature and surface the reason rather
  than minting a guessable id — verify a `recordings.test.ts` case that stubs the secure
  generator away and asserts no anon id is produced and no request is sent
- [x] 5.2 Keep the existing persistence behaviour so a returning visitor keeps their own
  recordings — verify the anon-id stability test still passes unchanged
- [x] 5.3 Note in `server/recordings/README.md` that the anon id is an identifier and not a
  credential, and that this change removes the only path to a predictable one — verify the
  wording matches the client's actual behaviour

## 6. Security response headers on the served site (D19)

- [ ] 6.1 Add a `Content-Security-Policy-Report-Only` header to the site objects uploaded by
  `tools/deploy/deploy.sh`, alongside the existing `Cache-Control`, with `default-src
  'self'`, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'` and
  `connect-src` / `media-src` widened to the dataset and recordings origins the build was
  configured with — verify the deploy script's `ossutil` metadata argument carries the
  policy and that `deploy.sh --dry-run` or equivalent prints it
- [ ] 6.2 Load the deployed site in a real browser and collect Report-Only violations across
  the homepage, an episode page, audio playback and a full recording flow — verify the
  browser console reports no violations for any of them, and record which sources had to be
  added
- [ ] 6.3 Resolve from that pass whether `style-src` needs `'unsafe-inline'`, then flip the
  header to enforcing `Content-Security-Policy` — verify a `curl -sI` against the deployed
  root shows the enforcing header and no Report-Only one
- [ ] 6.4 Confirm framing is actually refused, since `frame-ancestors` is the point of doing
  this as a header rather than a `<meta>` tag — verify by loading the deployed site inside an
  iframe on a different origin and observing the browser refuse to render it
- [ ] 6.5 Document the header block in `tools/deploy/DEPLOY.md` including how to roll it back
  by removing it, and note that the FC trigger's own CORS config and the CDN HTTPS redirect
  remain console-side and unclosed — verify the documented rollback is a single revertible
  block in `deploy.sh`

## 7. Repository hygiene (D21, D22)

- [x] 7.1 Remove the live function invocation URL from `tools/testing-scripts.sh`, reading it
  from the environment — verify `git grep -n "fcapp.run"` returns nothing and the shell
  fragment still parses. Taken as a mandatory-variable guard (`: "${RECORDINGS_FN_URL:?…}"`)
  rather than a placeholder default, so a missing endpoint fails loudly instead of curling a
  fake URL. Note the file is a scratch pad that also holds browser-console JS, so it was
  never a whole-file runnable script: `sed -n '1,11p' tools/testing-scripts.sh | bash -n` is
  the parse check, and the checked payload was also stale (missing `episode`/`durationSec`,
  which would have returned `400 invalid episode` rather than the documented
  `assessAvailable:true`).
- [x] 7.2 Add `pip-audit` over `tools/pipeline/requirements.txt` to the CI workflow,
  positioned after typecheck/test/build so an advisory cannot mask them — verify the
  workflow file orders it last in its job and that a local `pip-audit -r
  tools/pipeline/requirements.txt` runs clean. Landed as a new `pipeline` job (checkout →
  setup-python 3.11 → install requirements → `pytest -q` → audit last), which also gives the
  28 pipeline tests their first CI coverage. Audits the resolved transitive tree, matching
  what `npm audit` covers in the web job. **The first run found a real advisory**:
  `fontTools==4.46.0` carries CVE-2025-66034; bumped to 4.60.2 rather than ignored, see D22.
- [x] 7.3 State in the workflow comment why the audit is last, so the ordering is not
  "tidied" back — verify the comment names the failure mode it prevents. Both audit steps now
  carry it; the web job's names the historical incident, the pipeline job's cross-references
  it.
- [x] 7.4 Sweep the remaining tracked files for other live infrastructure values (bucket
  name, region, function name) and decide per finding whether it is a placeholder candidate
  or acceptable public configuration, recording the reasoning — verify
  `git grep -n "aliyuncs.com"` findings are each either documented as intentional or
  replaced. Every remaining hit classified in D21's sweep result; also swept for
  credential-shaped literals (`LTAI…`, `sk-…`, inline secret assignments) with no findings.

## 8. Integration verification

- [x] 8.1 Run the full local suite: `cd server/recordings && npm test`, `cd web && npm run
  typecheck && npm test`, `cd tools/pipeline && pytest` — verify all three are green. Green at
  103 server / 172 web (typecheck clean) / 28 pipeline, plus `npm audit --audit-level=high`
  and `pip-audit -r tools/pipeline/requirements.txt` both clean. All three suites now run in
  CI as well (7.2 gave the pipeline its first job).
- [ ] 8.2 Deploy to the function and exercise the whole flow on a real phone over the LAN
  URL: record, upload, score, dispose — verify each step succeeds under the new presign
  limits, the size-bounded policy signature and the enforcing CSP, and that a second
  recording in the same session is not rate limited. *Blocked on groups 3 and 6: the policy
  signature and the enforcing CSP do not exist yet. The presign-limit half can be verified
  against Batch A alone if the deploy happens first.*
- [ ] 8.3 Confirm the abuse paths are actually closed on the deployed function: flood
  `/presign-upload` and `/dispose` past their caps, attempt an over-ceiling upload, and
  attempt a dispose naming 500 items — verify each is refused with the documented status and
  that no ASR call is billed for any of them. *Blocked on group 3 for the over-ceiling upload
  leg only; the two flood legs and the 500-item dispose are verifiable against Batch A.*
- [ ] 8.4 Re-read `server/recordings/README.md` and `tools/deploy/DEPLOY.md` end to end
  against the shipped behaviour — verify every stated limitation is either closed by this
  change or still listed as an open one with its reason
