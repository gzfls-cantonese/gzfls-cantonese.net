# Tasks

## 1. deploy.sh — data to stable prefix, site to bucket root

- [x] 1.1 Add `DATA_DEST=oss://<BUCKET>/<PREFIX>/data` (default `OSS_PREFIX=sanguo`) and point the dataset upload at it (`ossutil cp -r -u "${ROOT}/dist-assets/" "${DATA_DEST}/"` with `META_DATA` + `REGION_ARGS`). Verify: `bash -n tools/deploy/deploy.sh` passes and no `<VERSION>/data/` target remains.
- [x] 1.2 Change the site upload target from `<PREFIX>/<VERSION>/site/` to the **bucket root** `oss://<BUCKET>/` (`SITE_DEST`), keeping `META_SITE`; retain the `CURRENT` marker and ossutil 1.x/2.x branching. Verify: stubbed run shows site → `oss://<BUCKET>/` and `CURRENT` → `<PREFIX>/CURRENT`.
- [x] 1.3 Inject the asset base before build: `export VITE_ASSET_BASE="${VITE_ASSET_BASE:-/${OSS_PREFIX}/data}"` so the bundle references `/sanguo/data`. Verify: `VITE_ASSET_BASE=/sanguo/data npm run build` succeeds and the built bundle contains `/sanguo/data`.

## 2. Documentation

- [x] 2.1 Rewrite `tools/deploy/DEPLOY.md` for plan A: layout (site at bucket root, data at stable `<PREFIX>/data/`), auto-injected `VITE_ASSET_BASE=/<PREFIX>/data`, deploy steps, **OSS static-website hosting config (default index AND 404 document = `index.html` for SPA deep links)**, verification paths (`/`, `/episode/1`, `/sanguo/data/manifest.json`, one audio), first-time data-population note, and legacy-copy cleanup note. No CDN origin/site-directory config.
- [x] 2.2 Rewrite `tools/deploy/ROLLBACK.md` for plan A: no retained version dirs, so rollback = `git checkout <good-commit>` → rebuild → redeploy to bucket root; dataset at stable prefix untouched (no dataset transfer); keep the drill requirement.
- [x] 2.3 Update `web/.env.example` to document the stable data-prefix base (`/sanguo/data`) and that `deploy.sh` injects it in production.

## 3. Integration verification

- [x] 3.1 Stubbed end-to-end parse check: run `deploy.sh` with stubbed `npm`/`ossutil` and dummy creds; confirm ordering (build → site to bucket root → `CURRENT`) and that a no-creds run stops only at the credentials guard. Verify: output shows `oss://<BUCKET>/` for site, `<PREFIX>/CURRENT` for the marker, and the only failure without creds is the `OSS_BUCKET`/key guard (not a flag/layout error).
