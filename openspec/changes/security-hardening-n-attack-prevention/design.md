# Design

## Context

See `proposal.md` — Why. What shapes the approach:

- The recordings function is a **zero-dependency** `node:http` server on Aliyun FC. Nothing
  here may add a runtime package or an external store without changing that property.
- Callers are **anonymous by design**. There is no account, no session, no signed token. The
  `X-Anon-Id` header is a client-minted UUID stored in `localStorage` — it identifies a
  browser, it does not authenticate one.
- Audio goes **browser → OSS directly** on a signature the function issues. The function
  never sees audio bytes, which is why it cannot meter them.
- Scoring bills a **real ASR call**, so any control that runs after that call is not a cost
  control.
- The static site is served by **OSS static-website hosting** from the bucket root; the only
  repo-controlled lever over its response headers is object metadata set at upload time by
  `tools/deploy/deploy.sh`.
- Operator constraint for this change: **repo code and scripts only**. Console-side
  configuration is out of scope and is recorded as a non-goal rather than silently assumed.
- Nine of these controls are already implemented and tested. This document records the
  reasoning that only existed in commit messages, then covers the decisions the remaining
  work needs.

## Goals / Non-Goals

**Goals:**

- Make every anonymous route cost-bounded, not just the one that bills ASR.
- Keep the function zero-dependency: all limiting and validation stays in-process.
- Deliver the site's security headers from a versioned script so they are reviewable and
  locally verifiable, not console state nobody can diff.
- Fail closed. Where a control cannot be enforced, refuse the operation rather than degrade
  to an unenforced one.

**Non-Goals:**

- **No distributed quota.** No Redis, Tablestore or any shared counter. Per-instance
  limiting is explicitly a speed bump; serverless scale-out multiplies every cap by the
  warm-instance count. The hard ceiling stays a cloud billing alert.
- **No authentication.** Adding accounts or signed anon ids would close identity rotation
  properly, but it is a product change far beyond hardening.
- **No console-side configuration.** Forcing HTTPS at the CDN and narrowing the FC
  trigger's own CORS both live outside the repo. They are documented in code comments and in
  `server/recordings/README.md` as unclosed, with the reason.
- **No change to what is stored.** Recording retention stays the existing client-delete plus
  7-day OSS lifecycle backstop.

## Decisions

### Already implemented — rationale recorded here because it was only in commit messages

**D1 — In-process fixed-window limiting, three dimensions, and only one of them is real.**
Per-anon and per-IP windows are both built from caller-controlled values (a self-minted
UUID; a request header). They exist to catch honest clients and lazy scripts. The
instance-wide hourly cap ignores identity entirely and is the only dimension an attacker
cannot rotate around.
*Alternative considered:* trusting the per-IP window as the primary control — rejected, it
is one spoofed header away from unlimited budget.

**D2 — Check limits before touching storage or ASR.**
The `429` path returns ahead of the existence `HEAD`, so a denied request bills nothing at
all. *Alternative:* check after resolving the key — rejected, it spends a storage request
per denied call and turns a limiter into an amplification target.

**D3 — Denied requests do not advance their own counters.**
Otherwise a capped client's retries extend its own lockout indefinitely and `Retry-After`
stops meaning anything.

**D4 — Bound the limiter's memory, and never evict the global key.**
The counter map is keyed by attacker-chosen identities, so an unbounded map is an OOM
vector: a client minting fresh anon ids keeps every entry inside today's window, which
makes the daily-rollover sweep free nothing. Eviction is oldest-inserted past 20 000 keys,
sparing `g:all` — evicting the global key would let an attacker reset the one cap they
cannot dodge.

**D5 — Oversized bodies are drained, not aborted.**
Past 1 MB the server stops accumulating but keeps consuming the stream. Breaking out of the
async iterator destroys the request before the `413` is flushed and can take the socket with
it, so the client sees a network error instead of a status. The platform request timeout
bounds the drain.

**D6 — CORS omits the header rather than sending a sentinel.**
A rejected origin gets no `access-control-allow-origin` at all. This matters because the FC
trigger layer appends `access-control-allow-credentials: true` on its own: reflected-origin
plus allow-credentials is the combination that lets any website read our responses. Omitting
the header neutralises it while leaving non-browser callers, which send no `Origin`,
completely unaffected. `vary: Origin` goes out on both branches, since a shared cache must
not key away an answer that depends on a request header.

**D7 — Object keys are rebuilt server-side; the client never supplies one.**
Every key is `<prefix>/<anon>/<episode>_<entryId>_<recId>.<ext>` derived from validated
parts, so cross-anon access is structurally impossible rather than checked. The delete path
additionally re-asserts prefix containment even though the route layer already validated the
key — it is the one destructive call, so it gets defence in depth. There is no list or
download route, which means an orphaned object cannot be enumerated through the API at all.

**D8 — `HEAD` before scoring.**
A foreign or already-deleted `recId` resolves to a nonexistent key under the caller's own
prefix, and answering `404` there keeps the ASR call from being billed for audio that can
never be scored.

**D9 — Null-prototype lookup table.**
`EXT_BY_MIME` is keyed by an attacker-supplied string. On a plain object literal,
`EXT_BY_MIME['constructor']` is truthy, so validation passes and a function object becomes
the file extension. A null-prototype table makes inherited keys simply absent.

**D10 — `nosniff` on every JSON body.**
Error bodies echo client-supplied identifiers back; without the header an old browser can be
talked into rendering one as HTML.

**D11 — Client refuses any non-https upload destination, including `//host`.**
The OSS signer only ever emits `https`, so a non-https absolute URL means the response was
tampered with. The protocol-relative case is the subtle one: with no configured API base,
`//host` resolves against the attacker's host, not ours. Refusing fails the upload rather
than falling back to plaintext — audio is personal data, so there is no degraded mode.

**D12 — Manifest links degrade to dead anchors.**
`licenseUrl` and `source` come from a JSON file on the bucket and land in `href`. Only
`https:` is kept; `javascript:`, `data:` and relative values all become `#`. A CSP would
also block this, but the filter does not depend on one being deployed.

**D13 — Dataset paths are allow-listed, then re-contained, then counted.**
`audio.path` and the record id come out of a public parquet, and `os.path.join` with an
absolute second argument discards the destination directory entirely — verified against the
pre-fix script, which wrote `/tmp/pwned.opus`. Three layers: a flat-`.opus`-name regex, an
episode integer in 1..157, and a `realpath` containment check for a symlinked output tree.
Skipped rows are **collected and fail the run** rather than aborting on the first one, so a
maintainer sees the whole shape of a bad dataset in one pass — but a partial extraction is
still never publishable as complete.

**D14 — CI audit runs last, workflow token is read-only.**
`npm audit` fifth meant a red advisory skipped typecheck, tests and build, so the check
whose job is to protect the pipeline was the one that hid its state.

### New work

**D15 — Extend the existing limiter to `/presign-upload` and `/dispose`; do not build a
second mechanism.**
Both routes are anonymously reachable and both cause billed storage operations, but only
`/assess` was capped. Reuse the same three-dimension limiter so there is one set of knobs
and one eviction bound. New env defaults, following the existing naming pattern:
`PRESIGN_RATE_HOURLY=60`, `PRESIGN_RATE_DAILY=600`, `PRESIGN_RATE_GLOBAL_HOURLY=2000`.
Presign gets a far higher budget than scoring because re-recording a sentence is normal use
and costs storage requests rather than ASR seconds; the global cap is what stops a flood.
*Alternative considered:* one shared budget across all three routes — rejected, it would let
a client exhaust its scoring allowance by re-recording, which is the legitimate path.

**D16 — Cap items per `/dispose` at 100.**
One body currently names as many items as fit in 1 MB, each becoming a sequential
authenticated DELETE. 100 covers a real session; the client splits longer cleanups into
sequential chunks. The `pagehide` keepalive path sends one chunk best-effort and the rest
falls to the existing 7-day lifecycle rule — dispose failures are already non-fatal for
exactly this reason, so the backstop is not new.
*Alternative considered:* bounding total deletes per hour instead of per request — kept as
well via D15, but it does not stop a single request from holding the instance.

**D17 — Bound upload size with a policy signature instead of a presigned PUT.**
This is the largest unclosed cost surface: `durationSec` is self-declared and OSS V1
presigned PUT cannot constrain `Content-Length`, so a caller declares 3 s and writes
gigabytes straight to the bucket, never touching the function. Switch the PUT signature to
a `PostObject` policy carrying `content-length-range`.
The ceiling is **derived, not hardcoded**: `maxDurationSec × 32 KiB/s + 64 KiB` ≈ 2 MB at
the default 60 s. 32 KiB/s (~256 kbps) is above every codec the mime allow-list admits, so
the bound follows `RECORDINGS_MAX_DURATION` instead of drifting from it.
*Alternatives considered:* proxying audio through the function — rejected, it gives up the
property that the function never sees audio bytes and adds egress; relying on the lifecycle
rule alone — rejected, it bounds how long an object lives, not how large it gets, so the
bill arrives before the cleanup does.

**D18 — Trust the platform's forwarded hop, not the caller's first one.**
Taking `X-Forwarded-For`'s first hop verbatim lets a client rotate its apparent IP and
dodge the per-IP window. Take the hop the gateway appended instead, and prefer
`X-Real-IP` where the platform sets it. This hardens a speed bump; it is not a
justification for relaxing D1, since header handling on FC is not something the repo can
verify. *Alternative considered:* dropping the per-IP dimension entirely — rejected, it
still catches the honest-multi-user-behind-one-NAT case and lazy scripts at no cost.

**D19 — CSP as an object-metadata header set by `deploy.sh`, never as a `<meta>` tag.**
`frame-ancestors` is **ignored** in a `<meta>`-delivered CSP, and framing the microphone
prompt is the specific attack we care about here, so a meta tag would be security theatre.
`ossutil` already sets `Cache-Control` on upload; the policy travels the same way, which
keeps it versioned, reviewable and testable without a console visit.
Baseline: `default-src 'self'`; script from `'self'` with no `unsafe-inline` (Vite emits
hashed external modules, so this is achievable); `connect-src` and `media-src` widened to
the dataset origin and the recordings function origin the build was configured with;
`img-src 'self' data:`; `style-src 'self' 'unsafe-inline'` only if the existing CSS requires
it — verify rather than assume; `frame-ancestors 'none'`; `object-src 'none'`;
`base-uri 'self'`.
*Rollout:* ship in `Content-Security-Policy-Report-Only` for one deploy, read the console
violations against the real site, then flip to enforcing. Audio playback and the recording
flow are the parts most likely to need a source added.

**D20 — Fail closed when there is no secure random source.**
The current `Math.random` UUID fallback produces guessable anon ids, and the anon id is the
only thing standing between one visitor's recordings and another's — a derived id is an
IDOR into their transcripts and their delete route. Rather than keep a weak fallback, the
recording feature disables itself where `crypto.getRandomValues` is unavailable and says why.
Every browser the site supports has it; the fallback was dead code that only ever fired for
an attacker's benefit.
*Alternative considered:* a stronger software PRNG seeded from timing — rejected, it is
guessable in principle and adds code for a case that should not exist.

**D21 — The live function endpoint comes out of tracked tooling.**
`tools/testing-scripts.sh` carries the production FC invocation URL. The repo is public, so
that hands an attacker the exact anonymous endpoint the D15/D17 controls defend, with no
need to observe the site. Read it from the environment with a placeholder default. This is
not secret rotation — the URL is not a credential, and any visitor can read it from the
deployed bundle — it is removing a shortcut.

*Sweep result.* With the trigger URL gone, `git grep` finds no other live infrastructure
value worth placeholdering, and each remaining hit is deliberate:

- `gzfls-cantonese` (bucket) — public by construction: OSS static-website hosting serves the
  site from it, so every deployed dataset URL contains it. It survives only as an `e.g.` in
  the deploy docs and as a fixture in `backend.test.mjs` / `reference.test.mjs`, where
  replacing it with a fake name would make the tests describe a bucket that does not exist.
- `cn-hongkong` (region) — derivable from any request to the site, documented as an example,
  and read from `OSS_ENDPOINT` at runtime by both deploy scripts rather than hardcoded.
- `dashscope-intl.aliyuncs.com` — the vendor's published endpoint, in docs and in test
  fixtures where `fetch` is always mocked, so no call leaves the test process.
- `https://gzfls-cantonese.net` — the product domain, and the CORS allow-list default in
  `config.mjs` must name the real origin to work at all.

Both deploy scripts take bucket and endpoint from the environment behind `: "${VAR:?...}"`
guards, and a credential-shaped sweep (`LTAI…`, `sk-…`, inline secret assignments) over all
tracked files finds nothing.

**D22 — Audit every dependency set, not just the frontend's.**
CI runs `npm audit` on `web/` only. `server/recordings` has zero dependencies, so there is
nothing to audit there, but `tools/pipeline` installs `pyarrow`, `pyjyutping`, `fontTools`
and `pytest` from a pinned requirements file with no advisory check at all — and that is the
code that unpacks a 2.5 GB parquet from a public mirror, which D13 already treats as hostile
input. Add `pip-audit` against the same requirements file, positioned after the existing
checks per D14.

*First run found a real one.* `fontTools==4.46.0` carries CVE-2025-66034 (arbitrary file
write and content injection from a malicious `.designspace`, fixed in 4.60.2). It is **not
reachable here** — `gen_logo_svg.py` touches only `pens`, `misc.transform` and
`ttLib.TTCollection`, never `varLib.main()` — but a known-vulnerable pin turns the new check
red on day one, which is exactly the D14 failure mode of an audit hiding whether anything
else passed. Bump to 4.60.2 rather than ignore it: verified drop-in by exercising every
fontTools API the script uses (lazy `TTCollection`, face selection by name, `getBestCmap`,
`getGlyphSet`, `hmtx`, `head.unitsPerEm`, `SVGPathPen` under `TransformPen`, `build_svg`)
against a real `.ttc`, and the 28 pipeline tests pass on the bumped set.

**D23 — Refuse to start when both storage backends are configured.**
The local backend exists so the whole flow runs without cloud credentials, and to do that it
has to serve `PUT /local-put/<key>` — an unauthenticated write. Today nothing stops that
route from existing in production: setting `RECORDINGS_LOCAL_DIR` alongside the OSS
credentials silently switches the backend, because selection is just
`localDir ? 'local' : 'oss'`. Fail at startup instead and name both settings.
*Alternative considered:* keeping the route but requiring a dev-only secret — rejected, it
adds a credential to a path whose entire purpose is running without one, and a startup
refusal is both simpler and impossible to misconfigure past.

**D24 — Canonicalise the anon id after validating it.**
`ANON_ID_RE` is case-insensitive but the matched string is used verbatim in both the
rate-limit key and the storage prefix, and nothing in the function lowercases it. A UUID
carries roughly twenty hex letters, so case variation hands a caller ~2^20 distinct
identities: the per-anon scoring cap, and the presign cap D15 adds, are both defeatable by
re-spelling one id. Normalise to lowercase once, immediately after validation, so there is
a single spelling for both the limiter and the key.
This is safe without a migration: conforming clients generate ids with `crypto.randomUUID()`,
which returns lowercase, so every object already stored sits under a lowercase prefix.
*Alternative considered:* making the regex case-sensitive and rejecting uppercase — rejected,
it turns a limiter bypass into a `403` for any client that happens to normalise differently,
and gains nothing over canonicalising.
Note this does **not** restore the per-anon cap as a spend guarantee; D1 still holds that the
instance-wide cap is the only dimension an attacker cannot rotate. It stops case variation
from being a free multiplier on top of every other rotation.

## Risks / Trade-offs

- **A signature can be replayed inside its 300 s TTL.** → Accepted. The key is always under
  the signer's own anon prefix, so replaying one only overwrites that caller's own
  recording, and after D17 the overwrite is bounded by the policy's size condition. Turning
  it into someone *else's* recording needs an intercepted signature, which needs the
  plaintext-HTTP MITM that is a console-side non-goal. Single-use signatures would need
  server-side state and give up the zero-dependency property.
- **A slow client can hold a socket open past the body cap.** → Accepted. The server keeps
  draining after it stops accumulating, so the memory is bounded but the connection is not;
  the platform request timeout is what closes it. Aborting early was tried and is worse — it
  destroys the request before the `413` is flushed and the client sees a network error
  instead of a status (D5).
- **Caps are per-instance, so serverless scale-out multiplies them.** → Accepted by design
  (D1). The instance-wide cap plus a cloud billing alert is the real ceiling; the spec says
  "bounds spend", not "enforces a quota".
- **D17 is a breaking change to the browser upload path.** → A client holding a cached
  bundle receives a response shape it cannot parse and fails the upload; nothing is
  corrupted and no partial object is written. Rollback lever already exists: unset
  `VITE_RECORDINGS_API` and redeploy the frontend, which hides the entire recording UI.
- **D19 can break the live site.** → Report-Only first (D19 rollout), and verify against the
  deployed site rather than a local build — the dataset origin and the function origin only
  appear in the production configuration.
- **D16 changes cleanup semantics for very long sessions.** → The `pagehide` path becomes
  best-effort for the tail; the 7-day lifecycle rule already covers dispose failure, so no
  recording outlives its window.
- **Tightening presign limits could lock out a legitimate heavy user.** → 60/hour and
  600/day are generous against real use (one presign per recording attempt), and both are
  env-tunable without a code change.
- **D18 depends on FC's header behaviour, which the repo cannot assert.** → The
  instance-wide cap does not depend on it, so the guarantee degrades to today's rather than
  to nothing.
- **Documenting console-side gaps risks them being forgotten.** → They stay as explicit
  non-goals here and as caveats in `server/recordings/README.md`, which is where an operator
  looks before deploying.

## Migration Plan

1. Land the additive controls first — D15, D16, D18, D20, D21, D22. None changes a response
   shape a deployed client depends on, so each is independently deployable and revertable.
2. Ship D19 in `Content-Security-Policy-Report-Only` via `deploy.sh`, load the live site in
   a real browser, and collect violations. Flip to enforcing only once audio playback,
   dataset fetch and the recording flow are clean.
3. Land D17 last, as its own deploy, because it is the breaking one: function and frontend
   must move together. Deploy the function, then immediately rebuild and redeploy the
   frontend against it. Confirm with a real recording on a phone over the LAN URL before
   considering it done.
4. **Rollback**: unset `VITE_RECORDINGS_API` and redeploy the frontend to hide the recording
   UI entirely; revert the `deploy.sh` header block to drop the CSP. Neither touches stored
   data or the dataset prefix.

## Open Questions

- Should `PRESIGN_RATE_GLOBAL_HOURLY` be sized from observed traffic once the function has
  been live a while, rather than from the 2000 placeholder? Tunable by env, so it does not
  block any of the above.
- Does the existing CSS actually need `style-src 'unsafe-inline'`? Answered by the
  Report-Only pass in step 2, not before it.
