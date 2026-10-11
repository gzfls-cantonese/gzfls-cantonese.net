<div align="center">
  <img src="data/README-banner.png" alt="Savor the Three Kingdoms · Learn Cantonese" style="max-width: 70%; height: auto;" />

  # Savor the Three Kingdoms · Learn Cantonese

Produced by the Cantonese Club of [Guangzhou Foreign Language School](https://www.gzfls.edu.cn/)

Corpus provided by the [Cantonese Computational Linguistics Infrastructure Development Workgroup (CanCLID)](https://huggingface.co/CanCLID)
</div>

<div align="center">

[![CI](https://github.com/gzfls-cantonese/gzfls-cantonese.net/actions/workflows/ci.yml/badge.svg)](https://github.com/gzfls-cantonese/gzfls-cantonese.net/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)
[![tested with vitest](https://img.shields.io/badge/tested%20with-vitest-6e9f18.svg?style=flat-square&logo=vitest)](https://vitest.dev/)
[![npm](https://img.shields.io/badge/npm-%3E%3D10-CB3837.svg?style=flat-square&logo=npm)](https://www.npmjs.com/)
[![Node](https://img.shields.io/badge/node-%3E%3D18-3C873A.svg?style=flat-square&logo=nodedotjs)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB.svg?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF.svg?style=flat-square&logo=vite)](https://vitejs.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6.svg?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Python](https://img.shields.io/badge/Python-3.11-3776AB.svg?style=flat-square&logo=python&logoColor=white)](https://www.python.org/)

[English](README_en.md) | [简体中文](README.md)

</div>

---

## 1. Overview

[Savor the Three Kingdoms · Learn Cantonese](https://gzfls-cantonese.net/) (品三國 · 識粵語) is a Cantonese-learning website developed and maintained by the Cantonese Club of Guangzhou Foreign Language School. It draws on Mr. Zhang Yuekai's beloved classic Cantonese storytelling (pingshu) of *Romance of the Three Kingdoms* to promote the elegant yet vivid written Cantonese and standard Cantonese pronunciation. The site turns the [public dataset](https://huggingface.co/datasets/CanCLID/zoengjyutgaai) released by the Cantonese Computational Linguistics Infrastructure Development Workgroup (CanCLID) — 39,173 audio clips with traditional-Chinese transcripts in total — into a learning website you can keep enjoying while practising standard Cantonese pronunciation with AI.

The site delivers the full learning loop of *listen to the storytelling → read the transcript → repeat aloud → replay and compare → correct with AI scoring*: visitors can play episodes continuously, follow the traditional-Chinese transcript with live highlighting and per-character Jyutping, and — like sending a WeChat voice message — press-and-hold to record themselves, replay their own pronunciation, and trigger an on-demand AI Cantonese pronunciation score.

- **Static-first core** — the frontend and data artifacts are all static files served from Alibaba Cloud OSS, with no self-hosted backend.
- **Optional dynamic features** — anonymous trial recordings and AI scoring run on a zero-dependency Function Compute (FC) backend that can be toggled and rolled back independently.
- **Spec-Driven Development (SDD)** — the site's development iterations are completed through human–AI collaboration using the [OpenSpec](https://github.com/Fission-AI/OpenSpec) SDD tool and Alibaba Cloud's Qoder family of AI development tools.

## 2. Features

### 2.1 Browsing and playback

- **157-episode navigation** — episode list and detail pages show couplet-style chapter titles, clip counts and total duration; the home page groups episodes into 5 story arcs, with cover art as placeholders for now.
- **Continuous in-episode playback** — about 250 eight-second OPUS clips per episode play seamlessly in sequence, with play / pause / progress controls.
- **Background playback on lock screen** — via the Media Session API + `<audio>`, playback continues when the phone is locked or the screen is off, with system media controls.
- **Scrolling transcript sync** — the traditional-Chinese transcript scrolls in dataset order, the current line is highlighted as playback advances, and clicking a sentence jumps to it.
- **Per-character Jyutping** — a tone-marked Jyutping line is aligned under each Chinese sentence (generated at build time, zero runtime cost), with a show/hide toggle.

### 2.2 Trial recordings and AI scoring

- **WeChat-style press-and-hold recording** — hold to record the current sentence, release to stop; dataset playback pauses automatically. No login, no personal data collected.
- **Local cache + background upload** — the recording is cached in the browser for the session and uploaded in the background to storage isolated per anonymous ID, with automatic retries; multiple anonymous sessions can upload concurrently without interfering with or addressing each other.
- **Voice-bubble replay** — recordings appear as WeChat-style bubbles (play icon + duration); tapping replays the local cache, and re-recording a sentence overwrites the old one.
- **Destroyed on exit** — navigating away, returning home, or closing / refreshing the page deletes both local and cloud recordings (with retries and unload-safe requests); the server additionally self-cleans via a 7-day lifecycle backstop.
- **On-demand AI pronunciation score** — after upload, a "Score" button appears on the bubble; tapping it runs Cantonese ASR on the server and scores against the reference text with a **homophone-tolerant** similarity (0–100), returning the score and transcript. Non-Cantonese readings trigger a warning. Scoring is never automatic and is rate-limited server-side to control cost.

### 2.3 UI and branding

- **Bilingual UI** — typed `zh-Hant` and `en` message dictionaries translate only the UI shell (corpus, chapter titles and transcripts stay original); defaults to traditional Chinese, switches instantly and persists.
- **Branding** — an inlined SVG logo and favicon shipped with the bundle (seal / seal-script vector mark, no external assets, no copyright risk).
- **Compliance attribution** — the footer and About page show the dataset source and CC0 1.0 Universal license badge; recording and scoring privacy have a dedicated page.

## 3. Tech stack and deployment architecture

### 3.1 Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | React 18 + Vite + TypeScript | `react-router-dom` v7 routing, `zustand` state, `@tanstack/react-virtual` list virtualization |
| Frontend tests | Vitest + Testing Library + jsdom | Component and logic unit tests via `npm test` |
| Data pipeline | Python (`pyarrow` + `pyjyutping`) | Build-time parquet extraction into per-episode JSON index + standalone OPUS audio + per-character Jyutping |
| Dynamic backend | Zero-dependency Node ≥ 18 HTTP function | Presigned upload / delete / scoring; 80 cases under `node --test` |
| Cross-platform (later) | Capacitor | Playback and data-access layers stay platform-agnostic for app wrapping |

### 3.2 Deployment architecture

A "static-first, dynamic-optional" serverless architecture:

```
Browser
  │
  ├── Site + data (static) ──► Alibaba Cloud OSS static-website hosting (optional CDN)
  │                             ├── bucket root: index.html / assets/ (built frontend)
  │                             └── <PREFIX>/data/: audio + index + Jyutping (stable prefix, shared across deploys)
  │
  └── Recording / scoring (dynamic, optional) ──► Alibaba Cloud Function Compute (zero-dep Node HTTP trigger)
                                                    ├── upload / delete ──► OSS private prefix recordings/ (CORS + 7-day lifecycle)
                                                    └── scoring calls ──► Alibaba Cloud Model Studio (DashScope) Cantonese ASR (Singapore ap-southeast-1)
```

- The frontend is deployed to the **bucket root**, served by OSS static-website hosting via `index.html`; the 404 page falls back to `index.html` (response code `200`) so SPA deep links work.
- Data artifacts live at a **stable prefix** `<PREFIX>/data/` (default `sanguo/data/`), uploaded incrementally once and shared across deploys; the frontend reaches them through the build-time-injected `VITE_ASSET_BASE`, decoupled from site paths.
- The recording function is deployed separately and never goes into OSS; the frontend connects via `VITE_RECORDINGS_API` — if it is not injected, the entire recording UI does not render. That is both the feature toggle and the rollback switch.

## 4. Project directory structure

```
gzfls-cantonese.net/
├── web/                        # React + Vite + TypeScript frontend
│   ├── src/
│   │   ├── ui/                 # Pages & components (home / episodes / player bar / script panel / trial recorder / about / privacy)
│   │   ├── data/               # Data access, recording capture & upload, type definitions
│   │   ├── player/             # Playback state and Media Session integration
│   │   ├── i18n/               # Bilingual dictionaries, Locale Provider, language switcher
│   │   ├── styles/             # Global styles
│   │   └── assets/logo.svg     # Inlined SVG site logo
│   └── public/                 # Favicon and other static assets
├── server/recordings/          # Zero-dependency Node function: presigned upload / delete / scoring
├── tools/
│   ├── pipeline/               # parquet → static-artifact extraction, Jyutping dictionary, fetch & checksum scripts
│   └── deploy/                 # OSS deploy scripts, recording-function packaging, rollback docs (DEPLOY.md / ROLLBACK.md)
├── data/episode-titles.json    # 157 episode titles & story arcs (single source of truth)
├── dist-assets/                # Build artifacts: audio + index + Jyutping (gitignored, uploaded to OSS)
├── CanCLID/zoengjyutgaai/      # Raw parquet dataset (~2.5 GB, gitignored, fetched by the fetch script)
├── openspec/                   # OpenSpec specs & changes (changes / specs / archive)
├── .qoder/                     # Qoder commands & skills (opsx workflow)
├── .github/workflows/ci.yml    # GitHub Actions CI (web + server jobs)
├── LICENSE                     # MIT
└── README.md
```

## 5. Alibaba Cloud services (and the Qoder / OpenSpec tooling)

### 5.1 Alibaba Cloud services

| Service | Purpose | Key notes |
|---|---|---|
| **Object Storage Service (OSS)** | Static-website hosting (frontend + data) and private recording storage | Uses the **Hong Kong region** on the international site (no ICP filing); site is public-read, `recordings/` prefix is private |
| **CDN** (optional) | Accelerates audio and static assets | Enabled by setting `CDN_DOMAIN`, which triggers a refresh from the deploy script |
| **Function Compute (FC)** | Hosts the recording / scoring backend (zero-dep Node HTTP trigger) | The HTTP trigger's auth mode MUST be **anonymous (no auth)**, allowing `POST/GET/OPTIONS` |
| **Model Studio (DashScope)** | Cantonese ASR for pronunciation scoring | Default model `qwen3-asr-flash` (synchronous); served in **Singapore `ap-southeast-1`**, with region-scoped API keys billed independently from mainland China |
| **Resource Access Management (RAM)** | Issues a least-privilege sub-account for the recording function | Grants only object-level `PutObject/GetObject/DeleteObject` on the `recordings/` prefix, **without `ListObjects`** |

### 5.2 Development tooling

- **Qoder** — carries the project's AI-assisted development workflow; `.qoder/` bundles the `opsx` commands and skills (propose / apply / archive / sync / update / explore), wired into the OpenSpec workflow.
- **OpenSpec** — spec-driven development. Requirements live in `openspec/changes/` as changes, each with `proposal.md` (why & scope), `design.md` (decisions & trade-offs), `specs/` (capability contracts) and `tasks.md` (implementation steps); finalized capabilities are archived into `openspec/specs/` and completed changes into `openspec/changes/archive/`. This README's features and architecture are consolidated from those proposal documents.

## 6. Build and release process

> Full steps are in [`tools/deploy/DEPLOY.md`](tools/deploy/DEPLOY.md); rollback is in [`tools/deploy/ROLLBACK.md`](tools/deploy/ROLLBACK.md).

### 6.1 Generate data artifacts

```bash
# 1. Fetch source data (5 parquet files, ~2.5 GB, sha256-verified, resumable); use a mirror from mainland China
HF_ENDPOINT=https://hf-mirror.com tools/pipeline/fetch-dataset.sh

# 2. Extract static artifacts (with integrity checks: 157 consecutive episodes, record counts match the source)
pip install -r tools/pipeline/requirements.txt
python3 tools/pipeline/extract.py --src CanCLID/zoengjyutgaai --out dist-assets
```

### 6.2 Deploy the site and data to OSS

```bash
export OSS_BUCKET=<your-bucket>
export OSS_ENDPOINT=oss-cn-hongkong.aliyuncs.com
export OSS_ACCESS_KEY_ID=...
export OSS_ACCESS_KEY_SECRET=...

bash tools/deploy/deploy.sh
```

The script automatically: injects `VITE_ASSET_BASE` and the deploy version → builds the frontend → uploads `web/dist/` to the bucket root → incrementally uploads `dist-assets/` to the stable prefix → writes the deploy version marker. To refresh only the index (e.g. after updating episode titles / story arcs), use `tools/deploy/deploy-data-index.sh`, then re-run `deploy.sh` to publish a new site version so clients bypass stale immutable caches.

After the first deploy, enable **static-website hosting** in the OSS console (both the index and 404 pages point to `index.html`, with the error response code set to `200`), and configure CORS, lifecycle and RAM as needed.

### 6.3 Deploy the recording / scoring function (optional)

```bash
# Package (the script itself never pushes or calls any cloud API); produces a zip and an env manifest
bash tools/deploy/deploy-recordings.sh --dry-run   # preview the plan first
bash tools/deploy/deploy-recordings.sh             # actually package into dist-deploy/
```

Deploy the zip to Function Compute, set the environment variables from the `.env` manifest (scoring additionally needs `DASHSCOPE_API_KEY` and the `ASSESS_*` set), attach an HTTP trigger (auth mode **anonymous**) and note its public URL; injecting `VITE_RECORDINGS_API=<trigger URL>` at frontend build time enables recording and scoring.

### 6.4 Continuous integration

GitHub Actions (`.github/workflows/ci.yml`) runs two jobs on pushes to `main` and on pull requests: `web` (dependency security audit → typecheck → unit tests → build) and `server` (`node --test`).

## 7. Data source and licensing

- **Corpus source**: the Hugging Face dataset [`zoengjyutgaai`](https://huggingface.co/datasets/CanCLID/zoengjyutgaai) by the **Cantonese Computational Linguistics Infrastructure Development Workgroup (CanCLID)** — a *Romance of the Three Kingdoms* Cantonese pingshu corpus (157 episodes, 39,173 OPUS clips + traditional-Chinese transcripts; 5 parquet files, ~2.5 GB).
- **License**: [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/) (public-domain dedication). The source and license badge appear in the site footer and About page.
- **Raw data is not committed**: the parquet files and `dist-assets/` build output are gitignored, fetched via `tools/pipeline/fetch-dataset.sh` and verified against `tools/pipeline/dataset.sha256`.
- **Illustration copyright pending**: the source and licensing of each episode's *Romance of the Three Kingdoms* picture-book illustrations are unconfirmed; until real illustrations are cleared for use, placeholders are shown and **no unlicensed image is displayed**.
- **Recording privacy**: trial recordings are the visitor's own voice, stored isolated per anonymous ID, destroyed on exit with a 7-day lifecycle backstop; scoring hands the recording to a third-party AI service on a short-lived basis, and neither score nor transcript is persisted. See the in-app "Recording & AI-scoring privacy notice" page.

## License

This project is released under the [MIT License](LICENSE).
