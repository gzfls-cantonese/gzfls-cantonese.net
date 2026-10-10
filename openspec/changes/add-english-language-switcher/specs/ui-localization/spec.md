# Spec Delta

## Purpose

Defines the web app's UI-locale contract: which locales exist, which surfaces are
translated and which are deliberately left in the original, how a visitor selects
and keeps a locale, and how document metadata tracks the active choice. It makes
the app navigable by visitors who cannot read Chinese without altering the
Cantonese learning material they came for.

## ADDED Requirements

### Requirement: Two selectable UI locales

The app SHALL present its user interface in either Traditional Chinese (`zh-Hant`)
or English (`en`), chosen by the visitor through a control in the site header. The
control SHALL be present on every route, including the not-found view, and SHALL
indicate which locale is currently active. Switching locale SHALL re-render the
interface immediately, without a page reload and without navigating away from the
current route.

#### Scenario: Switching to English from the home page

- **WHEN** a visitor selects English on the home page
- **THEN** every translated interface string on the page renders in English
- **AND** the visitor remains on the home page with no reload

#### Scenario: Switching on a deep route preserves the route

- **WHEN** a visitor selects English while viewing an episode page
- **THEN** the interface renders in English
- **AND** the URL still addresses the same episode and the same episode content
  stays loaded

#### Scenario: Switcher is reachable from the not-found view

- **WHEN** a visitor lands on an unmatched route
- **THEN** the locale switcher is available in the header
- **AND** selecting a locale translates the not-found message

#### Scenario: Switching back restores Chinese

- **WHEN** a visitor in the English interface selects Traditional Chinese
- **THEN** every translated string renders in Traditional Chinese again

### Requirement: Default locale is Traditional Chinese

For a visitor with no stored locale choice, the app SHALL render in Traditional
Chinese. The app SHALL NOT infer a locale from the browser's or operating
system's language, so first-visit behaviour is identical to the pre-localization
site.

#### Scenario: First visit renders Traditional Chinese

- **WHEN** a visitor loads the site with no stored locale choice
- **THEN** the interface renders in Traditional Chinese

#### Scenario: English browser still defaults to Chinese

- **WHEN** a visitor whose browser language is English loads the site for the
  first time with no stored locale choice
- **THEN** the interface renders in Traditional Chinese
- **AND** the switcher shows Traditional Chinese as the active locale

### Requirement: Locale choice persists across visits

The app SHALL remember the visitor's locale choice in the browser's local storage
and restore it on subsequent visits. A restored choice SHALL be applied before the
interface first renders, so a returning visitor never sees the interface flash in
the other locale. An absent, unreadable, or unrecognised stored value SHALL fall
back to the default locale rather than producing an error or a blank interface.
Local storage being unavailable or blocked SHALL NOT prevent the visitor from
switching locale for the current session.

#### Scenario: Returning visitor keeps their choice

- **WHEN** a visitor who previously selected English reloads the site
- **THEN** the interface renders in English from the first render

#### Scenario: Unrecognised stored value falls back to default

- **WHEN** the stored locale value is not one of the supported locales
- **THEN** the interface renders in Traditional Chinese
- **AND** no error is surfaced to the visitor

#### Scenario: Storage blocked still allows switching

- **WHEN** the browser refuses local storage access
- **THEN** the interface still renders in the default locale
- **AND** selecting a locale still changes the interface for the current session
- **AND** no error is surfaced to the visitor

### Requirement: Translation covers the interface chrome

The app SHALL translate every string it generates for interface purposes:
navigation and header labels, page and section headings, buttons and their
accessible names, form and toggle labels, hints, player status text, progress and
count readouts, loading states, error and failure messages, the About page, the
Recording Privacy statement, the not-found view, and the document title. In the
active locale, no interface string SHALL render as a raw message key, as an empty
value, or in the other locale.

#### Scenario: Player and recorder controls translate

- **WHEN** a visitor using the English interface plays an episode and uses the
  press-and-hold recorder
- **THEN** the play and pause accessible names, the playback status text, the
  recording caption, the holding prompt, the upload indicator, and the scoring
  button labels all render in English

#### Scenario: Recording privacy statement translates

- **WHEN** a visitor using the English interface opens the recording privacy page
- **THEN** every heading, paragraph, and list item of the statement renders in
  English

#### Scenario: No raw keys or blanks appear

- **WHEN** a visitor using the English interface visits every route
- **THEN** no visible string is a message key, a placeholder token, or empty
  where the Chinese interface shows text

#### Scenario: Load failure message translates

- **WHEN** the episode list or an episode index fails to load while the interface
  is in English
- **THEN** the failure message and the retry control render in English

#### Scenario: Scoring failure message translates

- **WHEN** AI scoring of a trial recording fails while the interface is in
  English — whether because scoring is unavailable, rate limited, the recording
  is already destroyed, or the request times out
- **THEN** the message shown to the visitor is the English equivalent for that
  specific cause

### Requirement: Learning content is not translated

The app SHALL NOT translate or alter the Cantonese learning material. Story-arc
names, episode titles, transcript lines, and their per-character Jyutping SHALL
render exactly as the dataset provides them, in Traditional Chinese, under every
locale. The brand logo mark and the site favicon SHALL likewise remain unchanged,
since their glyphs are baked into vector paths shared with the project's other
surfaces.

Locale-specific chrome MAY sit beside such content, provided the content string is
emitted unchanged and the chrome is generated by the interface rather than
substituted into it. The English arc ordinal on home-page part headings — rendered
as `Part III. 赤壁烈火・鼎足初成` — is the only such label; introducing another
SHALL be an explicit revision of this requirement.

#### Scenario: Transcript unchanged under the English interface

- **WHEN** a visitor using the English interface opens an episode
- **THEN** each transcript line shows the same traditional characters and the same
  Jyutping as under the Chinese interface

#### Scenario: Arc and episode titles stay in Chinese

- **WHEN** a visitor using the English interface views the home page
- **THEN** each arc heading carries its curated name in Traditional Chinese,
  prefixed with the interface-generated label `Part {roman numeral}.`
- **AND** episode card titles render in Traditional Chinese
- **AND** the surrounding labels, counts, and durations render in English

#### Scenario: The Chinese interface adds no arc ordinal

- **WHEN** a visitor using the Chinese interface views the home page
- **THEN** each arc heading is the curated name alone, with no `Part …` label

#### Scenario: Logo and favicon are locale-independent

- **WHEN** a visitor switches between locales
- **THEN** the header logo and the browser tab icon are unchanged

### Requirement: Document metadata tracks the active locale

The app SHALL keep the document's language attribute and its title in sync with
the active locale, on initial load and on every switch. Transcript content SHALL
continue to be annotated as Traditional Chinese regardless of the interface
locale, so assistive technology and font selection for the learning material stay
correct.

#### Scenario: Language attribute follows the switch

- **WHEN** a visitor switches the interface to English
- **THEN** the document language attribute identifies English
- **AND** switching back sets it to Traditional Chinese

#### Scenario: Document title follows the switch

- **WHEN** a visitor switches the interface to English
- **THEN** the browser tab title is the English site title
- **AND** switching back restores the Chinese title

#### Scenario: Returning English visitor loads with English metadata

- **WHEN** a visitor who previously selected English loads any route
- **THEN** the document language attribute and title are English from the first
  render

#### Scenario: Transcript keeps its Chinese annotation

- **WHEN** a visitor using the English interface views a transcript
- **THEN** the transcript text is still annotated as Traditional Chinese

### Requirement: Interpolated values render correctly in both locales

Strings that embed runtime values — episode and segment counts, durations,
progress positions, recording lengths, and AI scores — SHALL render those values
correctly in both locales, with the unit wording and number formatting
appropriate to the active locale. Values SHALL NOT be dropped, duplicated, or
transliterated when the locale changes.

#### Scenario: Catalogue counts under English

- **WHEN** a visitor using the English interface views the home page
- **THEN** the episode count and segment count shown match the values shown under
  the Chinese interface, with English unit wording

#### Scenario: Episode duration under English

- **WHEN** a visitor using the English interface views an episode header or card
- **THEN** the duration is the same number of minutes as under the Chinese
  interface, labelled in English

#### Scenario: AI score under English

- **WHEN** scoring of a trial recording succeeds while the interface is in English
- **THEN** the numeric score is unchanged and its unit label renders in English

#### Scenario: Position readout under English

- **WHEN** a visitor using the English interface plays an episode
- **THEN** the current-position and total-segment readout shows the same numbers
  as under the Chinese interface

### Requirement: Locale is a presentation-layer concern

Locale selection SHALL NOT change any URL, route, network request path, or
server-side behaviour. The dataset asset paths, the recordings API paths, and the
deployed object layout SHALL be identical under every locale, so switching locale
issues no new data request and requires no change to the deployment.

#### Scenario: Switching locale issues no data request

- **WHEN** a visitor switches locale on an episode page that has already loaded
- **THEN** no request is made for the manifest, the episode index, or any audio
  object as a result of the switch

#### Scenario: URLs are locale-independent

- **WHEN** a visitor switches locale
- **THEN** the address bar path and query are unchanged
- **AND** a link copied under one locale resolves to the same view under the other
