# Tasks

## 1. i18n core and locale switcher

- [x] 1.1 Create `web/src/i18n/messages.ts`: `Locale = 'zh-Hant' | 'en'`, the
      `Messages` interface as the single source of truth for keys, and `zhHant` /
      `en` dictionaries typed `Record<Locale, Messages>`. Seed it with only the
      header, nav, switcher, and document-title keys this group needs; later
      groups add their own. Verify: `npm run typecheck` passes, and omitting an
      `en` value for a declared key makes it fail.
- [x] 1.2 Add a dictionary exhaustiveness test that walks both dictionaries and
      asserts identical key sets and that every value is a non-empty string or
      function — this is what closes the spec's "no raw keys, no blanks" case for
      `''` placeholders, which `Record<Locale, Messages>` permits. Verify:
      `npm test` passes, and the test fails when an `en` value is set to `''`.
- [x] 1.3 Create `web/src/i18n/locale.tsx`: context created with the `zh-Hant`
      dictionary as its default value (so unwrapped renders behave as today),
      `LocaleProvider` with lazy init from the `sanguo.locale` key in
      `localStorage`, and `useLocale()` / `useT()` hooks. All storage access
      wrapped in `try/catch`, and a stored value outside the known locales falls
      back to `zh-Hant`. Verify: unit tests cover no-provider-renders-Chinese,
      stored `en` renders English, corrupt stored value falls back to `zh-Hant`,
      and a throwing `localStorage` still permits `setLocale` for the session.
- [x] 1.4 Mount `LocaleProvider` above `BrowserRouter` in `web/src/main.tsx`.
      Verify: `npm test` green with no existing test modified — the default locale
      is unchanged, so the current Chinese assertions still hold.
- [x] 1.5 Add a `LocaleSwitcher` to the `.nav` in `web/src/ui/Layout.tsx`: a
      globe + chevron icon button that discloses both locales by their native
      names (`繁體中文` / `English`), marking the active one with `aria-current`,
      carrying the current locale in the trigger's accessible name, and closing on
      selection, on Escape, and on a pointer down outside. Verify: tests assert
      picking `English` re-renders the nav in English without a reload and closes
      the panel, that switching on an `/episode/1` route keeps that route, that the
      switcher works on the unmatched-route 404 view, and that Escape and an
      outside pointer down each close the panel.
- [x] 1.6 Sync `document.documentElement.lang` and `document.title` from the
      provider in a `useLayoutEffect` keyed on locale, leaving `web/index.html`'s
      static `lang="zh-Hant"` and Chinese title as the first-visit default.
      Verify: tests assert both change on switch, and that a returning `en`
      visitor has English `lang` and title on the first render.
- [x] 1.7 Add switcher and dropdown-panel styling to `web/src/styles/global.css`
      consistent with the existing `.nav` treatment, plus `white-space: nowrap` and
      `flex-shrink: 0` on the header items so a too-narrow row overflows visibly
      instead of wrapping into two lines. Verify: geometry assertions in a hidden
      same-origin iframe at 430 / 390 / 360 / 320px in both locales — brand, nav
      links, and switcher on one row, no overlap, no document overflow, header
      height stable at 61px, and the open panel inside the viewport.

## 2. Failure causes as reason codes

Lands before any error copy is converted, because per design decision 4 no
non-component module may produce user-facing text. Keep `npm test` green at each
step rather than leaving failures for group 3.

- [x] 2.1 `web/src/data/api.ts`: add a `reason` field
      (`'network' | 'http' | 'parse'`) to `DataError` alongside `status`, and
      reduce `message` to a locale-independent diagnostic carrying the URL and
      status. Verify: update `api.test.ts` — which currently asserts
      `rejects.toThrow(/网络错误/)` — to assert the reason code on all three
      failure paths; `npm test` green.
- [x] 2.2 `web/src/data/useAsync.ts`: expose the raw rejection as
      `error: unknown` instead of flattening to `(err as Error).message`. Verify:
      `npm run typecheck` fails at the known render sites (`HomePage`'s
      `ErrorState` prop and `EpisodePage`'s error branch) until they are updated.
      Two, not three: `EpisodePage`'s `manifest` load never renders its error.
- [x] 2.3 Add a `describeDataError(error, t)` helper that maps a reason code to
      localized text and formats an unexpected non-`DataError` rejection, then use
      it in `HomePage`'s `ErrorState` and `EpisodePage`'s error branch. Verify:
      tests assert the English text for each of the three reasons, and that
      switching locale re-translates a load error already on screen.
      Landed in `web/src/i18n/errors.ts`, with the `載入失敗：` shell, `重試`, `返回`,
      and `返回選集` keys converted alongside it so no half-translated block remains.
- [x] 2.4 `web/src/ui/EpisodePage.tsx`: replace the inline
      `new Error('集號無效')` with a `DataError` carrying its own reason code, and
      convert the invalid-episode branch's message and back link to the
      dictionary. Verify: test asserts both the invalid-episode message and the
      thrown reason render in English under the `en` locale.
- [x] 2.5 `web/src/data/useTrialRecord.ts`: change `TrialAssessment`'s failed
      branch from `error: string` to `reason`, covering the five existing causes
      (scoring unavailable, rate limited, recording destroyed, timeout, unknown);
      turn `assessErrorMessage` into a classifier returning a reason; and convert
      the two `setError(...)` calls (unsupported recording format, microphone
      access denied) to reason codes on the same field. Verify: update the
      existing mapping table test at `useTrialRecord.test.tsx:251-255` to assert
      reason codes for all five causes; `npm test` green.
- [x] 2.6 `web/src/ui/TrialRecorder.tsx`: translate assessment and recorder
      reasons at render time. Verify: tests assert each reason renders its English
      text, and that switching locale re-translates a scoring failure already
      displayed in the bubble. Landed via `describeTrialError` in
      `web/src/i18n/errors.ts`, next to `describeDataError`.

## 3. Component copy conversion

Convert each area to the dictionary and land its own tests. Add the keys each
task needs to `Messages` and both dictionaries in the same step, so the
exhaustiveness test from 1.2 keeps passing throughout.

- [x] 3.1 `web/src/ui/Layout.tsx`: brand text, nav links, and the non-home footer
      source block. Note the source block is duplicated verbatim in `HomePage`, so
      both call sites share one set of keys. Verify: tests assert the footer
      renders in English and that both copies stay identical.
      The English wordmark is `Cantonese Tales`; at ≤360px `html[lang='en']` hides
      it and leaves the baked logo mark, because the full wordmark (112px at 14px)
      does not fit beside the nav and the switcher at 320px.
- [x] 3.2 `web/src/ui/HomePage.tsx`: hero heading, both sub-lines, the ep-card
      `第 N 集` fallback and `{count} 段 · {minutes}` meta, the loading state, and
      the home source footer. Split `formatMinutes` into a pure seconds→minutes
      rounding helper plus dictionary wording that handles English plurals, and
      update `EpisodePage`'s import accordingly. Verify: tests assert the episode
      and segment counts match between locales with English unit wording, and that
      `1` vs many minutes/segments pluralise correctly.
      `formatMinutes` became `toMinutes` (pure rounding); the wording lives in the
      `ep.meta` / `home.hero.sub2` messages. Also corrected the loading state's
      Simplified `目录` to `目錄`, the same inconsistency group 2 removed from
      `api.ts`.
- [x] 3.3 `web/src/ui/EpisodePage.tsx`: back link, the `{count} 段 · {duration}`
      meta line, the loading state, and the `第 N 集` display-title fallback. The
      dataset-supplied title stays Chinese. Verify: test asserts English chrome
      around an unchanged Chinese episode title.
      The couplet split now runs on the dataset title only. Splitting the fallback
      as well stacked `第 / 1 / 集` on three lines (`.episode__title-line` is
      `display: block`), which would have become `Episode / 1` in English.
- [x] 3.4 `web/src/ui/ScriptPanel.tsx`: the scroll hint and the Jyutping toggle
      label. Verify: tests assert both render in English, and that the transcript
      spans and per-character cells still carry `lang="zh-Hant"` under the `en`
      locale with characters and Jyutping byte-identical to the `zh-Hant` render.
- [x] 3.5 `web/src/ui/PlayerBar.tsx`: the play/pause `aria-label`s, all five
      `statusLabel` cases, and the skipped-segment message. The `errorEntryId`
      shown in `<code>` is dataset content and stays as-is. Verify: tests assert
      the English accessible names and every status label, and that the position
      readout shows identical numbers in both locales.
      The skipped-segment sentence is split into `player.skipped.before` /
      `.after` so the `<code>` element survives; the Simplified `暂停` / `已暂停`
      became `暫停` / `已暫停`.
- [x] 3.6 `web/src/ui/TrialRecorder.tsx`: the dock caption, the holding prompt,
      the privacy link, the uploading indicator, the assess and assessing button
      labels, the replay `aria-label`s, the score unit, and the non-Cantonese
      language warning. Verify: tests assert each in English, including that a
      score renders the same number with English unit wording.
      Also converted the mic button's `長按錄音` accessible name, and corrected the
      Simplified `朗读` / `回放录音` / `暂停回放` to Traditional.
- [x] 3.7 `web/src/ui/CoverImage.tsx` and `web/src/ui/Logo.tsx`: the cover
      `alt`/`aria-label` strings and the logo `alt`. The baked logo and favicon
      vector marks are untouched. Verify: tests assert English accessible text and
      that the logo `src` and favicon are unchanged across a locale switch.
      > `CoverImage.test.tsx` asserts the cover `alt` and the placeholder
      > badge/`aria-label` translate while `src` is byte-identical;
      > `Layout.test.tsx` asserts the logo `alt` translates while `src` is
      > unchanged. The favicon is a static `<link>` in `web/index.html` and is
      > never rewritten by React, so no runtime assertion applies.
- [x] 3.8 `web/src/App.tsx`: the 404 heading and body. Verify: test asserts both
      render in English and the switcher in the header still works from that view.
      > `App.test.tsx` drives the switcher from `/no-such-page` and asserts both
      > strings re-render in English. Task 5.2 extends this file to the other routes.
- [x] 3.9 `web/src/player/usePlayer.ts`: read the locale via `useLocale()`, add it
      to the Media Session effect's dependencies, and take the fallback title and
      album label from the dictionary. `entry.id` and the dataset-supplied
      `episodeTitle` stay as-is. Verify: test asserts the metadata is rewritten in
      English on a locale switch and that the action handlers are still registered
      afterwards.
      > `usePlayer.test.tsx` stubs `navigator.mediaSession` and `MediaMetadata`
      > (jsdom has neither, and the hook degrades silently without them) and
      > asserts the album/artist/fallback-title re-translate on a switch, the
      > dataset `episodeTitle` stays verbatim in both locales, and all four action
      > handlers are still functions afterwards. The artist fallback reuses the
      > existing `ep.number` message.

## 4. Long-form pages

- [x] 4.1 `web/src/ui/AboutPage.tsx`: heading, both intro paragraphs, the dataset
      source section, the licence badge, and both links. The manifest-supplied
      `license`, `licenseUrl`, and `source` values are data and stay as-is.
      Verify: test asserts every static paragraph renders in English while the
      licence string still comes from the manifest.
      > `AboutPage.test.tsx` (4 tests) covers both locales' static copy, that the
      > licence name / dataset id / both hrefs stay verbatim across a switch, and
      > that the contact mailto and the built-in licence fallback still render when
      > the manifest request fails. The dataset's own Chinese name
      > 「張悅楷講古語音-三國演義子數據集」 stays verbatim in the English paragraph
      > too, since it is the subset's proper name on Hugging Face. Also fixed a
      > Simplified leak in the Chinese copy: 繁體脚本 → 繁體腳本. Browser check at
      > 1280px and 390px in both locales: no document overflow.
- [x] 4.2 `web/src/ui/RecordingPrivacyPage.tsx`: all six sections. Translate
      claim-for-claim against the existing Chinese text and the actual behaviour in
      `server/recordings/`, keeping the specifics exact — private OSS prefix with
      anon-ID isolation, server issuing only upload and delete with no list or
      download endpoint, dispose-on-exit with the 7-day lifecycle fallback, and
      third-party ASR via Alibaba Model Studio in Singapore with score and
      transcript never persisted. Verify: `RecordingPrivacyPage.test.tsx` updated
      to assert the English headings and the load-bearing claims, and a reviewer
      pass confirms no claim was weakened or invented in translation.
      > Reviewing the code turned up **two claims in the existing Chinese text that
      > the implementation does not support**; the user chose to correct both
      > languages together rather than carry them into English:
      > - The anonymous ID was described as produced "only within this browser
      >   session". `web/src/data/recordings.ts:73-90` generates it once and
      >   persists it in `localStorage` ("Stable per-device anon id"), so both
      >   locales now say it is stored on the device and stable across sessions.
      >   Section 1's lead no longer claims both items are session-scoped.
      > - Deletion was described as including retries. `disposeRecordings`
      >   (`recordings.ts:159-176`) makes one attempt and swallows failure; the
      >   `MAX_ATTEMPTS = 3` retry belongs to upload only. Both locales now say
      >   deletion is attempted once and not retried, with the 7-day OSS lifecycle
      >   rule as the backstop.
      >
      > The other eight claims were checked and hold: private prefix with
      > per-anon-ID keys (`handler.mjs:41-43`), only `/presign-upload`, `/dispose`,
      > and `/assess` routes with no list or download (`handler.mjs:20,78-83`),
      > server-rebuilt paths plus traversal guard (`handler.mjs:97-112`,
      > `backend.mjs:17-26`), GET-only presigned URL with a 300s default TTL
      > (`oss.mjs:33-44`, `config.mjs:27`), stateless assess with nothing written
      > back and no payload logging (`assess.mjs:2-8`, `server.mjs:42`), and CC0
      > reference text (`reference.mjs:24-53`). The 7-day lifecycle rule and the
      > Singapore region are deployment configuration, not code, and remain
      > described as the site's configuration rather than as a code guarantee.
      >
      > Inline emphasis: the statement carries 14 load-bearing `**spans**`. Rather
      > than shatter each sentence into before/emphasis/after keys, dictionary
      > values may carry `**…**` markers rendered by `web/src/i18n/richText.tsx`
      > (see design.md). Browser check at 1280px and 390px in both locales: all
      > six sections present, 14 `<strong>` elements each, no stray `**` in the
      > rendered text, no document overflow.

## 5. Integration checks

- [x] 5.1 Sweep for untranslated chrome: grep `web/src` for CJK literals outside
      `i18n/messages.ts` and confirm every remaining hit is dataset content, a
      code comment, or the logo mark rather than a user-facing string. Verify: the
      grep output contains no UI chrome string.
      > `Grep '\p{Han}'` over `web/src` excluding `i18n/messages.ts`. Every hit is
      > one of four kinds: code/CSS comments (`data/types.ts:4,29`,
      > `styles/global.css:377,762`, `ui/Logo.tsx:10`, `ui/CoverImage.tsx:13`),
      > test fixtures and assertions, the baked `aria-label` in
      > `assets/logo.svg` / `assets/favicon.svg` (overridden at runtime by
      > `Logo.tsx`'s localized `<img alt>`), and no component-level literal at
      > all. `web/index.html` keeps its static `<title>` and `lang="zh-Hant"` by
      > design (task 5.4). Fixed one stray Simplified 小人书 → 小人書 in the
      > `CoverImage.tsx` comment.
- [x] 5.2 Add an `App`-level integration test that mounts the real `App` with the
      provider, switches locale, and asserts translated output across the home,
      episode, about, privacy, and 404 routes. This is the guard against the
      silently-Chinese failure mode a context default introduces. Verify:
      `npm test` green, and the test fails if `LocaleProvider` is removed from
      `main.tsx`.
      > `web/src/App.test.tsx` (7 tests) does not hand-build a provider: it stubs
      > `react-dom/client` with `vi.doMock` and captures the element `main.tsx`
      > passes to `createRoot`, then renders that element per route with
      > `window.history.pushState` and drives the locale through the real header
      > switcher. Verified the guard bites — with `<LocaleProvider>` stripped from
      > `main.tsx`, 6 of the 7 tests fail (only "mounts the provider" passes,
      > since it asserts the captured element exists), then restored.
      > jsdom needs `ResizeObserver` / `getBoundingClientRect` / `offsetHeight`
      > stubs or `@tanstack/react-virtual` renders zero transcript rows.
      > Full suite: 148 tests / 20 files green, `npm run typecheck` clean.
- [x] 5.3 Verify in a real browser over the LAN URL at phone width, in English, on
      all five routes — focusing on the header nav, script toolbar, player bar
      meta row, recorder caption, and the ep-card grid at ≤430px, since English
      labels are materially longer than Chinese and the recorder caption already
      overflows its box by design. Verify: no truncation, overlap, or broken
      two-column card layout; report any spot needing shorter wording rather than
      silently clipping.
      > Measured with `evaluate_script` geometry assertions inside hidden
      > same-origin iframes (the embedded browser cannot resize or screenshot),
      > at 320/360/375/390/414/430. Locale driven through the real switcher, never
      > by touching `localStorage`. Note: a height-constrained iframe adds a 15px
      > desktop scrollbar that silently shrinks `clientWidth`, so frames are sized
      > tall enough that `innerWidth === clientWidth` before any width is trusted.
      >
      > All five routes clean in English: `/`, `/episode/1`, `/about`,
      > `/recording-privacy`, `/no-such-page` — zero `documentElement` overflow,
      > zero elements past the right edge, no clipped node, ep-grid still two
      > columns from 375px up, privacy page renders all 14 `<strong>` spans with no
      > stray `**` marker.
      >
      > Two spots needed shorter wording rather than clipping, both found by
      > measurement and both reported to the user before changing:
      > - **Recorder caption.** The English `Hold, then release to record this line
      >   and score it with AI` measured 294px against a hard 180px ceiling —
      >   `.trial-caption` is `nowrap` and centred on the mic button, whose centre
      >   sits 230px into a 320px viewport, so the caption's own width becomes page
      >   overflow. Shortened to `Hold to record, then score with AI` (176.3px,
      >   right edge 318.2px) → zero overflow at 320 and 390. The wording also
      >   stops implying that scoring fires on release, which it does not: scoring
      >   is a separate button. The pre-existing Chinese caption (191.8px, 6px
      >   overflow at 320 only) was left alone on the user's instruction.
      > - **Episode-card meta.** The first measurement reported 118px of room at
      >   375px, which was wrong twice over: `clientWidth` includes padding, and
      >   `.home__mid` is an internal scroll container whose 15px classic desktop
      >   scrollbar does not exist on a phone (overlay scrollbars). With the
      >   scrollbar suppressed and padding subtracted, the real per-card content
      >   box is 126px at 375, 133px at 390, 145px at 414. The requested
      >   `308 segments, 28 mins` needs 133.3px at 12px, so it wrapped at both
      >   375 and 390 and grew every card from 104.1px to 119.1px. All 157
      >   episodes are 3-digit segments + 2-digit minutes, so the wrap was certain,
      >   not marginal. Resolved by dropping `.ep-card__meta` from 12px to 11px
      >   (8.3%, one element, not a site-wide scale change) and writing the unit as
      >   the standard abbreviation `min`: `308 segments, 28 min` measures 117.7px,
      >   single line at 320/375/390/414/430 with 8.3px of slack in the worst case
      >   (375px) — enough margin for Roboto being wider than the SF metrics
      >   measured here. Card height settles at 102.1px. `segs.` was rejected as
      >   non-standard English. The 11px applies to both locales, so the Chinese
      >   card meta also drops a point; card height there is 107.1px.
      > - **Episode-page meta** shares the `ep.meta` key but renders at 14px inside
      >   `.episode__info`, which is pinned to 160px by the fixed-width cover.
      >   `308 segments, 28 min` needs 145.2px, so the full wording fits there with
      >   no size change and stays on one line at 320px.
- [x] 5.4 Confirm the build and the deploy surface are untouched: `npm run build`
      and `npm test` green from `web/`, `web/index.html` still declares
      `lang="zh-Hant"` and the Chinese title as its static default, and
      `git status` shows no change under `server/`, `tools/`, `data/`,
      `dist-assets/`, or `web/package.json`. Verify: the `git status` output is
      confined to `web/src` and `web/index.html`.
      > `npm run build` green (`tsc --noEmit && vite build`, 50 modules, no new
      > dependency) and `npm test` green at 149 tests / 20 files.
      > `web/index.html` is not in `git status` at all — unmodified, still
      > `lang="zh-Hant"` and `<title>品三國 · 識粵語</title>`.
      > `git status --short server tools data dist-assets web/package.json
      > web/index.html` is empty. Every tracked modification and every new source
      > file is under `web/src/`. The only other untracked paths are
      > `openspec/changes/add-english-language-switcher/` (this change's own
      > planning artifacts, not deploy surface) and a pre-existing
      > `edge-mandarin-recording.webm` at the repo root dated 2026-10-07, which
      > predates this work and was left untouched.
