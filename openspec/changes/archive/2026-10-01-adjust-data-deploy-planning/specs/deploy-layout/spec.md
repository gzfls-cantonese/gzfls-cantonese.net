# Spec Delta

## Purpose

Defines the OSS data-deployment layout contract: a single stable dataset prefix uploaded once and shared across deploys and future web features, with the frontend served from the bucket root by OSS static-website hosting and rollback by rebuild-and-redeploy.

## ADDED Requirements

### Requirement: Stable shared dataset prefix

The deploy process SHALL publish the generated dataset assets (`dist-assets/`: `manifest.json`, `episodes/`, `audio/`) to a single stable OSS prefix `<PREFIX>/data/` (default prefix `sanguo`, i.e. `sanguo/data/`), using an incremental upload that skips objects already present and unchanged. The dataset SHALL NOT be duplicated into per-version prefixes on subsequent deploys. The site will add features other than the current `sanguo`; each such feature will add its own stable OSS prefix if needed, and this stable-prefix pattern is the unified data-deployment location they reuse.

#### Scenario: First deploy uploads the full dataset

- **WHEN** deploy runs against a bucket where `<PREFIX>/data/` does not yet exist
- **THEN** all dataset objects are uploaded under `<PREFIX>/data/` (e.g. `sanguo/data/manifest.json`, `sanguo/data/audio/<NNN>/<file>.opus`)

#### Scenario: Repeat deploy does not re-copy unchanged data

- **WHEN** deploy runs again with an unchanged local `dist-assets/`
- **THEN** the incremental upload transfers no dataset objects (already-present objects are skipped) and no second full copy of the dataset is created under any version prefix

#### Scenario: Dataset served at a stable path

- **WHEN** a client requests `/sanguo/data/manifest.json` at the site origin
- **THEN** the object resolves from the stable `<PREFIX>/data/` prefix regardless of which site build is currently deployed

### Requirement: Site served from the bucket root

The deploy process SHALL upload the built frontend (`web/dist/`) to the bucket root `oss://<BUCKET>/` so that OSS static-website hosting serves `/index.html` and `/assets/*` at the domain root. The deploy SHALL NOT rely on a CDN origin remap or a versioned site directory to make the root resolve. A `CURRENT` marker at `<PREFIX>/CURRENT` records the deployed build's timestamp identifier.

#### Scenario: Domain root serves the app

- **WHEN** a user requests `/` at the site origin (bucket static-website endpoint or bound custom domain)
- **THEN** the response is the deployed `index.html` from the bucket root

#### Scenario: SPA deep links resolve

- **WHEN** a user requests a client-side route directly (e.g. `/episode/1`, `/about`)
- **THEN** static hosting serves `index.html` (via the configured index/404 document) so the single-page app can route the path

### Requirement: Frontend resolves data from the stable prefix

Because the site is served from the bucket root while the dataset lives at `<PREFIX>/data/`, the deployed frontend SHALL reference dataset assets through an asset base that resolves to that stable prefix (default `/sanguo/data`), injected at build time. No version identifier SHALL appear in the data path.

#### Scenario: Asset base points at the stable data prefix

- **WHEN** the production frontend loads `manifest.json`, an episode index, or an audio object
- **THEN** each request resolves against `<PREFIX>/data/` (e.g. `/sanguo/data/manifest.json`) and succeeds

#### Scenario: Deploy injects the asset base

- **WHEN** `deploy.sh` builds the frontend without an explicit `VITE_ASSET_BASE` override
- **THEN** it injects `/<PREFIX>/data` (default `/sanguo/data`) so the built bundle references the stable data prefix

### Requirement: Rollback by rebuild and redeploy

Since the bucket root is overwritten each deploy and no version directories are retained, rolling back SHALL consist of rebuilding the last known-good code revision and redeploying it to the bucket root. Rollback SHALL NOT require re-uploading or copying the dataset.

#### Scenario: Roll back to a previous good revision

- **WHEN** an operator checks out a prior known-good commit and runs the deploy
- **THEN** the bucket root serves that revision's site and the dataset at `<PREFIX>/data/` is untouched (no dataset transfer)
