# Proposal

## Why

`deploy.sh` uploaded the ~2.5 GB / ~39k-object dataset (`dist-assets/`) into **every** versioned prefix `sanguo/<VERSION>/data/`, duplicating immutable, content-addressed files per release. Separately, the site was written to `sanguo/<VERSION>/site/`, which OSS static-website hosting cannot serve at the domain root (its index document is `/index.html` at the **bucket root**); making the root work previously implied a CDN origin remap, which we are not using. We need a layout where the dataset is uploaded once to a stable prefix and the site is served straight from the bucket root by OSS static hosting.

## What Changes

- **Dataset → stable prefix**: `dist-assets/` deploys to `<PREFIX>/data/` (default `sanguo/data/`), uploaded incrementally once and shared across deploys and future web features — never duplicated per version.
- **Site → bucket root** (**BREAKING** deploy-layout change): the built frontend (`web/dist/`) uploads to `oss://<BUCKET>/` so OSS static-website hosting serves `/index.html` and `/assets/*` at the domain root. The versioned `<PREFIX>/<VERSION>/site/` path is dropped. No CDN origin/site-directory config is used.
- **Asset base auto-set**: because the site is at the bucket root and data at `<PREFIX>/data/`, `deploy.sh` injects `VITE_ASSET_BASE=/<PREFIX>/data` (default `/sanguo/data`) at build time so the bundle resolves data by its stable absolute path.
- **Rollback = rebuild + redeploy**: with no retained version directories, rollback checks out the last known-good commit, rebuilds, and redeploys to the bucket root; the dataset is untouched (no large transfer).
- Update `deploy.sh`, `DEPLOY.md`, `ROLLBACK.md`, and `web/.env.example` accordingly.

## Capabilities

### New Capabilities
- `deploy-layout`: The OSS object layout and deploy/rollback contract — dataset at a stable shared prefix, site served from the bucket root via OSS static-website hosting, stable absolute asset base, and rebuild-based rollback.

### Modified Capabilities
<!-- None: no existing synced specs cover deployment. -->

## Impact

- `tools/deploy/deploy.sh` — dataset target → `<PREFIX>/data/`; site target → bucket root; build-time `VITE_ASSET_BASE` injection; ossutil 1.x/2.x adaptation and `CURRENT` marker preserved.
- `tools/deploy/DEPLOY.md` — layout, asset base, deploy steps, OSS static-hosting config (index + 404 → `index.html` for SPA deep links), and verification updated to plan A.
- `tools/deploy/ROLLBACK.md` — rollback now = rebuild + redeploy to root; data untouched.
- `web/.env.example` — documents the stable data-prefix base and that `deploy.sh` injects it.
- No pipeline or dataset-content change; no UI change. Legacy `sanguo/v<timestamp>/{site,data}/` copies from past deploys remain but are no longer written to (optional manual cleanup).
- **Forward-looking (not implemented here):** the stable, version-independent data prefix is the first entry of a future namespaced multi-source data architecture (per-feature `VITE_DATA_BASE_*`), recorded in `design.md` → *Future Direction* for a separate change.
