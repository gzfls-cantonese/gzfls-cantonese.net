# Design

## Context

See `proposal.md` — Why, and `specs/ui-localization/spec.md` for the behaviour
contract. This document covers the technical choices those imply.

Current state that shapes the approach:

- The app is a client-rendered SPA (`BrowserRouter` mounted in `main.tsx` over
  `App.tsx`), React 18 + TypeScript, no i18n library, no existing locale notion.
  `web/index.html` statically declares `lang="zh-Hant"` and the Chinese title.
- Strings live in three structurally different places, and each needs a different
  mechanism:
  1. **Components** — the bulk: `Layout`, `HomePage`, `EpisodePage`,
     `ScriptPanel`, `PlayerBar`, `TrialRecorder`, `AboutPage`,
     `RecordingPrivacyPage`, `CoverImage`, `Logo`, and the 404 view in `App.tsx`.
     These can read React context.
  2. **Hooks** — `useTrialRecord` (assessment error mapping) and `usePlayer`
     (Media Session metadata). These are inside the provider tree, so they can
     also read context.
  3. **Plain modules** — `api.ts` throws `DataError` from a `fetch` wrapper with
     no React context in scope. Its Chinese message currently travels as a plain
     string through `useAsync.error` and is rendered verbatim.
- Several strings interpolate runtime values (counts, minutes, episode numbers,
  scores, durations, URLs, HTTP statuses), and English needs pluralisation that
  Chinese does not (`1 minute` / `2 minutes`, `1 segment` / `8 segments`).
- The codebase already has the right precedent for machine-readable failures:
  `RecordingsError` in `recordings.ts` carries `status` and `reason`, and
  `useTrialRecord.assessErrorMessage` maps that to human text.
- Seven existing test files assert on Chinese strings, including
  `useTrialRecord.test.tsx:251-255`, which unit-tests the assessment error
  mapping as a pure function.

## Goals / Non-Goals

**Goals:**

- One mechanism for all three string locations, so a locale switch updates
  *everything currently on screen* — including an already-displayed error message
  — without a reload.
- Missing or mistyped translations fail at build time, not at runtime.
- Zero new runtime dependencies.
- Keep existing tests meaningful: the default locale is unchanged, so their
  Chinese assertions stay valid rather than being rewritten.

**Non-Goals:**

- No pluralisation/ICU message-format parser, no translation namespaces, no
  lazy-loaded locale bundles, no locale-aware date/number formatting beyond the
  counts and durations already displayed.
- No third locale and no locale-specific routing or asset paths.
- No translation memory, extraction tooling, or external translation workflow.

## Decisions

### 1. Typed flat dictionary, values are strings or functions

A single `Messages` interface is the source of truth for keys; the dictionary is
typed `Record<Locale, Messages>` with `Locale = 'zh-Hant' | 'en'`. Keys are flat
and dotted by area (`nav.episodes`, `player.status.playing`,
`recorder.assess.rateLimited`) rather than nested objects, which keeps lookups
readable at call sites and avoids deep-partial typing.

Values are `string` or a function of a typed argument object.

*Why functions over `{token}` template strings:* English needs real
pluralisation, and a function gives it for free (`n === 1 ? 'minute' : 'minutes'`)
while keeping argument names and types checked by `tsc`. A token format would
need a runtime parser, silently accept a missing or misspelled token, and still
not solve plurals.

*Alternative considered:* `react-i18next`. Rejected — it brings two runtime
dependencies, JSON resource files, and namespace machinery to serve a two-locale
UI, and its string keys are not exhaustively type-checked without extra tooling.

### 2. Completeness enforced by the type system

Because `Messages` declares every key and the dictionary is
`Record<Locale, Messages>`, adding a key without an English value is a compile
error, and `tsc --noEmit` (already the `build` and `typecheck` script) catches it
in CI. This is what makes the spec's "no raw keys, no blanks, no wrong-locale
string" requirement enforceable rather than a review chore.

### 3. Locale in React context, with a Chinese default value

A `LocaleProvider` mounted once above the router exposes `{ locale, setLocale, t }`
through `useLocale()`. The context is created **with a default value of the
`zh-Hant` dictionary** rather than `null`.

*Why a default instead of a null-check:* a component rendered without the
provider behaves exactly as the app does today. That keeps the seven existing
test files working without wrapping every `render()` call, and it means only the
tests that deliberately exercise English need a provider. It also removes a
`if (!ctx) throw` branch from every consumer.

*Trade-off accepted:* a forgotten provider fails silently as Chinese instead of
crashing. Mitigated by an integration test that mounts the real `App` and
asserts the switcher changes the rendered language (Decision 8).

### 4. Failure causes travel as codes; human text is resolved at render time

This is the load-bearing decision, and the reason the spec can promise that an
error already on screen re-translates when the locale changes.

A message string captured at throw time is frozen in the wrong locale. So no
non-component module produces user-facing text:

- `DataError` in `api.ts` gains a `reason` field
  (`'network' | 'http' | 'parse'`) alongside `status`, mirroring
  `RecordingsError`. Its `message` becomes a locale-independent diagnostic
  (URL and status), useful in the console and in tests, and is no longer rendered.
- `useAsync` stops flattening the rejection to `.message` and exposes the raw
  `error: unknown`. Only three call sites exist (`HomePage`, and twice in
  `EpisodePage`), and only two render the error, so this is contained.
- A `describeDataError(error, t)` helper maps a cause code to localized text at
  render time, and is the single place that formats an unexpected non-`DataError`
  rejection.
- `EpisodePage`'s inline `new Error('集號無效')` becomes a `DataError` with its own
  reason code; the invalid-episode branch already renders its own localized copy.
- `TrialAssessment`'s `{ status: 'failed', error: string }` becomes
  `{ status: 'failed', reason: AssessErrorReason }`, with the five existing causes
  (`scoringUnavailable`, `rateLimited`, `recordingGone`, `timeout`, `unknown`)
  preserved as codes. `assessErrorMessage` stops returning text and instead
  classifies the error into a reason; `TrialRecorder` translates.
- The recorder's own `setError(...)` calls (`此瀏覽器不支援錄音格式`,
  `無法存取麥克風，請檢查授權`) become reason codes on the same field.

*Alternative considered:* pass `t` into `assessErrorMessage(err, t)` and keep
strings. Rejected — it still freezes the chosen text into state at failure time,
so switching locale afterwards leaves a stale-language message on screen.

### 5. Media Session metadata reads locale from the hook

`usePlayer` is a hook inside the provider tree, so it calls `useLocale()` and the
metadata effect lists `locale` in its dependencies, which re-runs it on switch and
rewrites `navigator.mediaSession.metadata`. The work title and album label become
dictionary entries; `entry.id` and the dataset-supplied `episodeTitle` stay as-is,
since those are learning content.

### 6. Numeric wording moves into the dictionary; rounding stays a pure helper

`formatMinutes` in `HomePage.tsx` currently fuses `Math.round(seconds / 60)` with
the wording `分鐘`, and `EpisodePage` imports it from there. Split the two: the
rounding becomes a pure number-to-number helper, and the wording belongs to
dictionary entries that take `{ segments, minutes }` and handle English plurals.
This also drops the odd cross-component import of a formatter from a page module.

### 7. Persistence and document metadata

- Storage key `sanguo.locale` (namespaced like the existing
  `sanguo.recordings.anonId`). Reads and writes are wrapped in `try/catch`:
  Safari private mode and blocked storage throw on access, and per the spec that
  must degrade to a working in-session switch, not a broken page.
- The provider initialises state lazily from storage, validating the value
  against the known locales and falling back to `zh-Hant`.
- `document.documentElement.lang` and `document.title` are set in a
  `useLayoutEffect` keyed on locale, so they are correct before the browser
  paints and update on every switch. `web/index.html` keeps its static
  `lang="zh-Hant"` and Chinese title as the first-visit default.

*Alternative considered:* an inline blocking script in `index.html` head that
sets `lang`/`title` from storage pre-hydration. Rejected as unnecessary — the
shell is an empty `<div id="root">`, so no visible Chinese chrome can flash; only
the tab title and `lang` are briefly default-valued for a returning English
visitor, and `useLayoutEffect` runs before paint. Revisit only if that flash is
ever observed.

*Scope of "remembers":* persistence is per origin and per browser profile, and can
be evicted. Both limits, and why neither is worked around here, are recorded under
Risks / Trade-offs.

### 8. Switcher is a globe + abbreviation dropdown in the existing nav

`Layout.tsx`'s `.nav` gains a `LocaleSwitcher`: a compact button (globe icon, the
active locale's abbreviation `中` / `Eng`, chevron) that discloses a short panel
listing both locales by their native names (`繁體中文` / `English`), with
`aria-current` on the active one.

*Why a dropdown rather than a segmented pill showing both options:* the pill was
measured in a real browser and does not fit below 390px. English nav labels are
much wider than their Chinese originals, and with the pill present the header
needed roughly 360px of content width — so at 360px the brand wordmark wrapped to
two lines, and at 320px the pill itself stacked to 58px tall and the header grew
from 61px to 79px. Hiding the pill by script reproduced a clean 61px header at all
three widths, which confirms the switcher was the cause rather than the English
labels alone. A globe + chevron costs about 46px instead of 113px, bringing the
worst case (320px, English) to roughly 293px of the 296px available, so nothing
has to be abbreviated and the brand wordmark survives.

*Why the abbreviation was added back:* a bare globe reads as a generic icon, so
visitors did not necessarily recognise it as a language control. Showing only the
*active* locale's abbreviation keeps the trigger compact — measured at 73.4px
against the pill's 113px — and the header stays at 61px with no clipping and no
horizontal overflow at 320, 360, 375, 390, 414 and 430px. Below 375px the brand
wordmark is already hidden by an existing rule, which is what makes room.

Native names are still what the visitor picks from, so the original goal holds:
someone who cannot read the current locale can recognise their own in the panel.
The active locale is conveyed at rest both visually (the abbreviation) and through
the button's accessible name (`Interface language: English`), and in the open
panel by `aria-current` plus a marker dot.

The panel is a disclosure (`aria-expanded` / `aria-haspopup`) rather than a
`role="menu"`, so the options are plain focusable buttons reachable by Tab and no
arrow-key contract is implied. It closes on selection, on Escape, and on a pointer
down outside the switcher.

Placement in `.nav` puts it in the header on every route including the 404 view,
which `Layout` already renders.

### 9. Test strategy

- Existing tests keep their Chinese assertions; they exercise the default locale
  and the context default means they need no provider wrapper.
- `useTrialRecord.test.tsx`'s error-mapping table changes from asserting Chinese
  strings to asserting reason codes — the mapping stays a pure function, so the
  test shape survives.
- `api.test.ts`'s `rejects.toThrow(/网络错误/)` changes to assert the reason code.
  Note this string was Simplified Chinese in an otherwise Traditional UI, an
  inconsistency this change removes.
- New tests: dictionary completeness is compile-time (Decision 2); behaviour
  needs an English-locale render of the switcher, an assertion that switching
  re-translates an already-displayed error, a `lang`/`title` assertion, a
  storage-blocked fallback, and one end-to-end test that mounts `App` to prove the
  provider is actually wired.

### 10. Inline emphasis travels inside the string as `**…**`

`RecordingPrivacyPage` carries fourteen emphasized spans, and every one of them is
a load-bearing legal claim rather than decoration. A flat string dictionary cannot
express them, so the two options were to split each sentence into
before/emphasis/after keys, or to let a value carry a marker.

The marker won: `web/src/i18n/richText.tsx` splits a value on `/\*\*(.+?)\*\*/g`
and wraps the captured groups in `<strong>`. Splitting instead would have taken
this page from about fourteen keys to about forty, cut every sentence into
fragments that cannot be read in either language, and made the two locales hard to
compare side by side — which is exactly what a claim-for-claim translation review
needs to do.

The renderer is deliberately minimal: only `**…**`, no nesting, no escaping, and
no other inline element. An unclosed marker does not match the pattern and so
renders literally, which puts the typo on screen instead of swallowing the rest of
the sentence. This is a convention for emphasis only; a value that needs a link or
any other element still splits into separate keys around the JSX, as
`AboutPage` and the reference/contact paragraphs here do.

*Alternative considered:* a `{strong}` token pair parsed at runtime, or storing
React nodes in the dictionary. Rejected — the first is the same idea with more
parsing and worse readability, and the second would put JSX in a data module,
breaking the rule that only components produce user-facing markup.

## Risks / Trade-offs

- **[English copy makes the layout overflow]** Chinese labels are far shorter
  than English (`選集` → `Episodes`, `顯示粵拼Jyutping` → `Show Jyutping`), and
  the header nav, script toolbar, player bar meta row, and recorder caption are
  all tight. The recorder caption already overflows its 56px box by design.
  → Mitigation: verify each of those at ≤430px in a real browser during apply,
  not just by unit test; prefer short English wording over literal translation;
  allow the caption and toolbar to wrap rather than truncating.
- **[Forgotten provider fails silently as Chinese]** → Mitigation: the `App`-level
  integration test in Decision 9.
- **[The stored preference does not survive an origin change]** `localStorage` is
  partitioned per origin and per browser profile, and production is currently
  reachable over both `http://` and `https://` with no redirect between them. Those
  are two distinct origins with separate storage, so a visitor who picks English on
  one and returns on the other gets the default locale again. The existing
  `sanguo.recordings.anonId` key already lives with exactly this limitation, so the
  change adds no new class of exposure — but "remembers your choice" holds only
  within one origin. → Mitigation: record the limitation here rather than code
  around it. The real fix is the already-pending decision to force HTTPS, after
  which the split disappears and the recording anon id benefits too. A
  non-`Secure`, non-`HttpOnly` cookie would bridge the gap in the interim, since
  cookies are not scheme-partitioned and JS can read them, but adding one purely to
  paper over a deployment gap is not worth the extra request bytes on a static site.
- **[The stored preference can be evicted]** Private and incognito windows discard
  `localStorage` on close, "clear site data" removes it, and Safari's ITP caps
  script-writable storage at 7 days for a site the visitor has not interacted with
  recently. Choosing a locale counts as interaction and resets that clock, but a
  gap longer than 7 days can still evict the choice. → Mitigation: eviction must
  degrade to the documented default locale rather than to an error or a blank
  interface, which the spec already requires and task 1.3 tests. No server-side
  profile is added to compensate — the app deliberately has no accounts.
- **[Reason-code refactor touches working error paths]** `useAsync`'s error
  contract changes shape, and `TrialAssessment`'s field is renamed. Both are
  covered by existing tests, which must be updated in the same step rather than
  left failing. → Mitigation: sequence the code refactor before the copy, and
  keep `npm test` green at each step.
- **[Translating the Recording Privacy statement is legally-sensitive prose]** It
  makes specific claims about OSS prefix isolation, the absence of list/download
  endpoints, dispose-on-exit with a 7-day lifecycle fallback, and third-party ASR
  in Singapore. A loose English rendering could misstate what the system does.
  → Mitigation: translate it claim-for-claim against the existing Chinese text and
  the server implementation, not from memory; keep the technical specifics
  (7 days, no list/download, Model Studio Singapore) exact.
- **[Transcript `lang` annotation could be lost]** The per-character transcript
  cells carry `lang="zh-Hant"` for font selection and screen readers. A careless
  switch to the active locale would break pronunciation of the learning material.
  → Mitigation: the spec requires transcript spans stay `zh-Hant` under every
  locale; assert it in a test.
- **[Media Session metadata churn]** Adding `locale` to the effect's dependencies
  re-registers the action handlers on switch. They are idempotent and the effect
  already cleans up, so this is benign, but it is a real re-run.

## Migration Plan

No data migration and no deploy-pipeline change: the dictionary ships inside the
app bundle, so `deploy.sh` behaves exactly as today and `tools/deploy/` is
untouched. Rollback is the existing rebuild-and-redeploy of the previous
revision; because no URL, asset path, or stored server state changes, the only
residue is a `sanguo.locale` key in visitors' browsers, which an older build
simply ignores.

Ship behind no flag. The default locale is unchanged, so a visitor who never
touches the switcher sees the identical site.
