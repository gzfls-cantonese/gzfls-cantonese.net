# Spec Delta

## Purpose

Defines which origins may read the recordings function's responses cross-origin, and which
URLs the browser is allowed to act on — the two places where a value that did not come from
us (a request `Origin`, a presigned destination, a link in a JSON manifest) would otherwise
be trusted.

## ADDED Requirements

### Requirement: Cross-origin reads are limited to an explicit origin allow-list

The function SHALL echo `access-control-allow-origin` only when the request's `Origin`
matches an entry in the configured allow-list, and SHALL omit the header entirely when it
does not, so the browser blocks the response. It SHALL NOT reflect an arbitrary `Origin`.

This is required because the platform's trigger layer adds
`access-control-allow-credentials: true` on its own; reflecting any origin alongside that
header would let any website read responses cross-origin. Omitting the header leaves a
non-browser caller, which sends no `Origin`, entirely unaffected.

The allow-list SHALL be overridable by configuration for deploys under another domain. It
SHALL include the plaintext `http` site origin only for as long as the site is served over
both schemes with no redirect, and that entry SHALL be dropped once the CDN forces HTTPS.

#### Scenario: Allowed site origin
- **WHEN** a browser request carries an `Origin` on the allow-list
- **THEN** the response echoes that origin in `access-control-allow-origin`

#### Scenario: Foreign site origin
- **WHEN** a browser request carries an `Origin` that is not on the allow-list
- **THEN** the response carries no `access-control-allow-origin` header at all, and the
  browser refuses the page its response

#### Scenario: Non-browser caller
- **WHEN** a request carries no `Origin` header
- **THEN** the request is served normally and no allow-origin header is emitted

### Requirement: Responses that depend on the request origin are marked uncacheable across origins

Whenever the response headers depend on the value of the request's `Origin` — including
when the origin was rejected — the function SHALL send `vary: Origin`, so a shared cache
cannot serve one origin's answer to another.

#### Scenario: Rejected origin still varies
- **WHEN** a request from a disallowed origin is answered
- **THEN** the response still carries `vary: Origin`

### Requirement: The browser never hands a recording to a destination it did not get over https

A recording is personal data, so the client SHALL upload audio only to an `https:` URL.
Given an upload destination from the function, the client SHALL accept an absolute `https:`
URL, and SHALL accept a root-relative path by resolving it against its own configured API
base. It SHALL refuse every other form — any non-https scheme, and a protocol-relative
`//host` value, which with no configured API base would resolve against the attacker's host
rather than ours. Refusing SHALL fail the upload rather than fall back to a plaintext
destination.

#### Scenario: Tampered presign response
- **WHEN** the upload destination handed to the client is `http://…` or `//evil.example/…`
- **THEN** the client refuses to upload and surfaces an error, and no audio bytes leave the
  browser

#### Scenario: Local development backend
- **WHEN** the upload destination is a root-relative path
- **THEN** the client resolves it against the configured API base and uploads there

### Requirement: Links taken from remote content are inert unless they are https

The dataset manifest is a JSON file on the storage bucket, so its `licenseUrl` and `source`
values are remote input rendered straight into anchor hrefs. The client SHALL render such a
link only when it parses as an `https:` URL, and SHALL otherwise render a dead anchor. A
`javascript:` URL, a `data:` URL and a relative value SHALL all degrade to the dead anchor,
so a rewritten manifest cannot execute script in our origin.

The fallback SHALL NOT change what the reader sees as the link text, only where it goes.

#### Scenario: Manifest rewritten to carry script
- **WHEN** the manifest's `licenseUrl` is `javascript:alert(document.cookie)`
- **THEN** the rendered anchor points at a dead href and activates no script

#### Scenario: Well-formed manifest
- **WHEN** the manifest carries ordinary `https:` links
- **THEN** they render and navigate as before

### Requirement: The anonymous identity is unguessable and is the only credential

The anon id is the sole thing separating one visitor's recordings from another's, so the
client SHALL generate it from a cryptographically secure source. It SHALL NOT fall back to
a non-cryptographic pseudorandom generator, since a predictable id would let an attacker
derive another visitor's id and read their transcripts or delete their recordings.

The client SHALL persist the id so a returning visitor keeps their own recordings, and
SHALL reuse the stored value rather than minting a new one.

#### Scenario: Browser without a secure random source
- **WHEN** the client runs where no cryptographically secure generator is available
- **THEN** it does not silently fall back to a guessable id

#### Scenario: Returning visitor
- **WHEN** a visitor reloads the page
- **THEN** the same anon id is sent and their previous recordings are still theirs
