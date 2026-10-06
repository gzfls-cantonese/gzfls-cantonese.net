# Design

## Context

See `proposal.md` — Why. Current state that shapes the approach:

- The prior `deploy.sh` computed `DEST=oss://<BUCKET>/<PREFIX>/<VERSION>` and uploaded `web/dist/` → `<VERSION>/site/` **and** the full `dist-assets/` → `<VERSION>/data/` on every run, then wrote `<PREFIX>/CURRENT`. The dataset is ~2.5 GB / ~39k objects, content-addressed (episode + sequence), so it is effectively immutable across releases.
- OSS static-website hosting serves its index document from the **bucket root** (`/index.html`); it cannot make a subdirectory (`<PREFIX>/<VERSION>/site/`) the web root. Serving the domain root from a versioned subdir would require a CDN origin remap — which we are **not** using.
- The app uses `BrowserRouter` (`/episode/:episode`, `/about`), so deep links need the static-hosting 404 document set to `index.html`.
- `web/src/config.ts` reads `VITE_ASSET_BASE` (dev default `/data`) and strips the trailing slash; the Vite dev middleware serves `dist-assets` at `/data`.
- ossutil 1.x vs 2.x flag differences (`--meta` vs `--cache-control`, 2.x v4 signing needs `--region`) are already handled and must be preserved.

## Goals / Non-Goals

**Goals:**
- Upload the dataset **once** to a stable prefix `<PREFIX>/data/` (default `sanguo/data/`); never duplicate it per version. Make it the unified dataset location for the current site and future web features.
- Serve the site from the **bucket root** via OSS static-website hosting (no CDN), so `/` and deep links resolve.
- Have the frontend reference data by its stable absolute path (`/<PREFIX>/data`), injected at build time.
- Preserve ossutil 1.x/2.x adaptation and the `CURRENT` marker (as a deploy stamp).

**Non-Goals:**
- No CDN origin remap or versioned site directory (explicitly rejected by the user).
- No frontend source-logic, pipeline, or dataset-content changes; no UI change (only build-time `VITE_ASSET_BASE`).
- No retained version directories for instant rollback — rollback is rebuild + redeploy (see Decision 4).
- **No namespaced multi-data-source refactor of `config.ts` / `api.ts` in this change.** The single `VITE_ASSET_BASE` stays; it only needs to resolve to the stable `sanguo/data/`. The multi-source architecture is *Future Direction* below, for a separate change.
- Not deleting legacy `sanguo/v<timestamp>/{site,data}/` copies (left in place; optional manual cleanup).

## Decisions

### Decision 1: Stable `<PREFIX>/data/` root, uploaded incrementally once

Dataset assets go to `oss://<BUCKET>/<PREFIX>/data/` (default `sanguo/data/`), uploaded with `ossutil cp -r -u` so unchanged objects are skipped. Rationale: the data is immutable and content-addressed, so one stable copy shared by all deploys (and future features) removes the per-version 2.5 GB duplication.

- Alternative considered: keep per-version `data/` but copy server-side between versions — rejected; OSS copy is client-driven and slow for 39k objects, and it still duplicates storage.

### Decision 2: Site → bucket root (OSS static-website hosting, no CDN)

`web/dist/` uploads to `oss://<BUCKET>/` so `index.html` and `assets/*` sit at the root and static hosting serves `/` directly. Rationale: honors the user's choice (plan A, no CDN) and is the only way the domain root resolves without an origin remap. Trade-off: the root is overwritten each deploy, so there are no retained version directories (see Decision 4).

- Alternative considered: versioned `site/` + CDN origin remap — rejected per user (no CDN).

### Decision 3: Build-time asset base = `/<PREFIX>/data`

Since the site is at the bucket root and data at `<PREFIX>/data/`, `deploy.sh` injects `export VITE_ASSET_BASE="${VITE_ASSET_BASE:-/${OSS_PREFIX}/data}"` before `npm run build`, so the bundle references `/sanguo/data/...` which resolves against the bucket-root origin to `oss://<BUCKET>/sanguo/data/...`. Overridable for a different data origin. `.env.production` is gitignored (`.env.*`), so injection lives in the script, not a committed env file.

### Decision 4: Rollback = rebuild + redeploy

With the root overwritten each deploy and no version dirs, rollback checks out the last known-good commit, rebuilds, and redeploys to the root. The dataset at `<PREFIX>/data/` is shared and untouched, so rollback moves only the small site build — no multi-GB transfer. `CURRENT` remains as a record of the last deployed build timestamp.

- Alternative considered: also archive each build under `<PREFIX>/releases/<VERSION>/` for instant repoint — dropped to keep plan A minimal (no extra site directories); can be revisited if instant rollback becomes a requirement.

### Decision 5: SPA deep links via static-hosting 404 document

OSS static-website hosting is configured with both the default index and the default 404 document set to `index.html`, so `BrowserRouter` deep links (`/episode/1`, `/about`) load the app and route client-side.

## Risks / Trade-offs

- [Bucket root is overwritten each deploy; a bad deploy is live until rebuilt] → Rollback is a documented rebuild+redeploy (Decision 4); `CURRENT` records the deployed stamp. If instant rollback is later required, add an archived `releases/` copy.
- [If `VITE_ASSET_BASE` is not the stable `/sanguo/data`, the site 404s on data] → `deploy.sh` injects it by default; verified the built bundle contains `/sanguo/data`.
- [Dataset must exist at `sanguo/data/` before the site works] → The data upload is incremental and idempotent; if the data step is disabled for fast site-only redeploys, the first deploy must have populated `sanguo/data/` (documented in `DEPLOY.md §4`).
- [Legacy `sanguo/v<timestamp>/{site,data}/` copies still occupy storage] → Left in place; optional manual cleanup noted in `DEPLOY.md`.

## Migration Plan

1. `deploy.sh`: data `cp` → `<PREFIX>/data/`; site `cp` → bucket root; inject `VITE_ASSET_BASE=/<PREFIX>/data` before build; keep `CURRENT` + ossutil adaptation.
2. Populate `sanguo/data/` once (enable the data step or run the standalone `ossutil cp`).
3. Configure OSS static-website hosting: default index **and** 404 document = `index.html`; bind the custom domain to the static-website endpoint.
4. Deploy: builds with `/sanguo/data`, uploads site to root, writes `CURRENT`.
5. Verify `/`, deep link `/episode/1`, `/sanguo/data/manifest.json`, one audio object.
6. Rollback: `git checkout <good-commit>` → redeploy to root; data untouched. Drill once before go-live.

## Future Direction: Multi-Source Data Architecture (not in this change)

Recorded so the stable-prefix decision stays compatible with future web features that need **their own** stable OSS data location — possibly a different prefix, bucket, or origin than the current `VITE_ASSET_BASE`. Direction only; implemented in a separate change.

**Today (single base):** `config.ts` exposes one `ASSET_BASE` (from `VITE_ASSET_BASE`) and `assetUrl(path)`; `data/api.ts` is the only caller and everything it loads belongs to the sanguo dataset. This assumes all data lives under one root.

**Direction (namespaced bases):** generalize the single base into a namespace → base registry so each feature points at its own stable data root without touching call sites:

```
env:
  VITE_DATA_BASE_SANGUO    = /sanguo/data          # current dataset
  VITE_DATA_BASE_<FEATURE> = /<feature>/data        # future feature's own stable root

config.ts:
  DATA_BASES: Record<namespace, base>        # collected from env; default ns 'sanguo' falls back to VITE_ASSET_BASE
  dataUrl(ns, path)                           # namespace-aware resolution
  assetUrl(path) = dataUrl(DEFAULT_NS, path)  # keep old signature for backward compatibility

api.ts:
  dataUrl('sanguo', 'manifest.json') / dataUrl('sanguo', entry.audio) ...
```

**Deploy-side counterpart:** each feature's dataset gets its own stable prefix (`sanguo/data/`, `<feature>/data/`), each uploaded once and shared across deploys. `deploy.sh` evolves from "one dataset → one prefix" to a "dataset → stable prefix" mapping (only the sanguo entry today).

**Why this change is already compatible:** by putting the dataset at a *stable, deploy-independent* prefix now, the sanguo data root becomes the first entry (`VITE_DATA_BASE_SANGUO`) of that future registry. Adding a feature later is "one env var + one namespace + one deploy mapping entry" — no change to the bucket-root site deploy flow.

**Migration sketch for the follow-up change (out of scope here):** introduce `dataUrl(ns, path)` with `assetUrl` delegating to the default namespace; migrate `api.ts` call sites to `ns='sanguo'`; add `VITE_DATA_BASE_*` env collection with fallback to the current `VITE_ASSET_BASE`; extend `deploy.sh` with the dataset→prefix mapping.
