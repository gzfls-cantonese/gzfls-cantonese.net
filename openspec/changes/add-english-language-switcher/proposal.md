# Proposal

## Why

Every user-facing string in the web app is Traditional Chinese, so a visitor who
cannot read Chinese cannot navigate the site at all — the header nav, the episode
grid labels, the transcript toolbar, the press-and-hold recorder, its AI-scoring
prompts and errors, and the recording-privacy statement are all opaque to them.
That excludes exactly the audience the site exists to serve: people learning
Cantonese from scratch, who by definition have not yet acquired the script. An
English locale makes the app usable for them while leaving the learning material
itself — the 評書 audio and its traditional transcript — untouched.

## What Changes

- Add a typed two-locale message dictionary (`zh-Hant` and `en`) covering every
  user-facing UI string, so a missing English entry is a compile error rather
  than a runtime blank.
- Add a locale context/provider and a translation hook consumed by the UI.
- Add a locale switcher to the header nav. The choice persists to `localStorage`
  and applies immediately without a reload.
- Default to `zh-Hant`. First-visit behaviour is unchanged from today; no browser
  language sniffing, so a Chinese-literate visitor with an English OS is not
  surprised by an English first render.
- Sync `document.documentElement.lang` and `document.title` to the active locale.
- Localize strings produced outside components, where a hook is not available:
  the trial-recording assessment error mapping, the data-fetch error message, and
  the Media Session metadata shown on OS media controls.
- Localize the About page and the Recording Privacy page in full.
- Update the existing component tests, which currently assert on Chinese strings.

**Non-goals** (settled during proposal review, recorded so the boundary is
explicit at apply time):

- No translation of story-arc names, episode titles, or transcript lines. Those
  come from `data/episode-titles.json` and the generated `dist-assets/` manifest,
  so translating them would reach into the pipeline and the OSS data deploy. The
  transcript is the learning material and stays in the original.
- No URL-based locale routing (no `/en/...` prefix). Routes, internal links, and
  the OSS static-hosting SPA fallback stay exactly as they are.
- No `navigator.language` auto-detection.
- No new runtime dependency: no i18n library.

## Capabilities

### New Capabilities

- `ui-localization`: the app's UI-locale contract — which locales exist, what
  surface is covered by translation and what is deliberately excluded, how the
  visitor's choice is made and persisted, what the default is, and how document
  metadata tracks the active locale.

### Modified Capabilities

None. `deploy-layout` is unaffected: the change adds no asset, no route, and no
URL shape, so the stable `<PREFIX>/data/` prefix, the bucket-root site serving,
the injected `VITE_ASSET_BASE`, and the rebuild-and-redeploy rollback all
continue to hold as specified.

## Impact

**Code** — `web/` only, and only the presentation and client-state layers:

- `web/src/ui/`: `Layout`, `HomePage`, `EpisodePage`, `ScriptPanel`, `PlayerBar`,
  `TrialRecorder`, `AboutPage`, `RecordingPrivacyPage`, `CoverImage`, `Logo`
- `web/src/App.tsx` (the 404 view), `web/index.html` (`lang`, `<title>`)
- `web/src/data/api.ts`, `web/src/data/useTrialRecord.ts`,
  `web/src/player/usePlayer.ts` — non-component string producers
- New module directory for the dictionary, provider, hook, and switcher
- Existing tests asserting Chinese strings: `HomePage.test.tsx`,
  `ScriptPanel.test.tsx`, `TrialRecorder.test.tsx`, `RecordingPrivacyPage.test.tsx`,
  `useTrialRecord.test.tsx`, `api.test.ts`, `recordings.test.ts`

**Not affected** — `server/`, `tools/`, `data/`, `dist-assets/`, `CanCLID/`, the
OSS bucket layout, and every script under `tools/deploy/`. `deploy.sh` needs no
change because the locale ships inside the app bundle rather than as a data
asset.

**Dependencies** — none added. The dictionary and context are hand-rolled, which
keeps `web/package.json` unchanged.

**Brand assets** — the logo and favicon bake `品三國 · 識粵語` into vector paths
and are shared with the project's other surfaces, so they are not localized. The
`alt`/`aria-label` text around them is.
