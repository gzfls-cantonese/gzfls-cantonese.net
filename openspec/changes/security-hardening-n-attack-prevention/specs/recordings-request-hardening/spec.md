# Spec Delta

## Purpose

Defines what an anonymous, unauthenticated caller may ask the recordings function to do,
how much of it, and how the function refuses everything else — so that one hostile client
can neither exhaust the instance, nor spend unbounded ASR money, nor reach another
visitor's recordings.

## ADDED Requirements

### Requirement: Request body size is bounded before routing

The function SHALL reject a request whose body exceeds 1 MB with `413` and a JSON error,
before any route logic runs. Reaching the cap SHALL stop accumulating the body without
aborting the request stream, so the response is still delivered and the socket stays
usable for the platform to close. Every route takes a few hundred bytes of JSON, so no
legitimate caller is affected.

#### Scenario: Oversized body is refused and the socket survives
- **WHEN** a client streams more than 1 MB to any route
- **THEN** the function responds `413` with a JSON error body and does not grow its buffer
  past the cap

#### Scenario: Body within the cap is routed normally
- **WHEN** a client sends a valid payload under 1 MB
- **THEN** the request reaches its route and is answered on its own merits

### Requirement: Caller identity and recording descriptors are validated

Every mutating route SHALL require an `X-Anon-Id` header matching a UUIDv4 pattern and
SHALL answer `403` when it is absent or malformed. Route payloads SHALL be validated
before use: `episode` as an integer within 1..999, `entryId` against a fixed character
allow-list of at most 64 characters, `recId` against the same, `mime` against the four
accepted audio types, and `ext` on the scoring route against the extensions those mimes
produce. A malformed body SHALL answer `400`.

The mime lookup SHALL NOT resolve inherited object properties: a mime string such as
`constructor`, `toString` or `__proto__` SHALL be treated as unsupported and answer `400`,
not as a hit that carries a function into the object key.

#### Scenario: Missing or malformed anonymous id
- **WHEN** a request carries no `X-Anon-Id`, or one that is not a UUIDv4
- **THEN** the function responds `403` and performs no storage or scoring work

#### Scenario: Prototype key offered as a mime type
- **WHEN** a presign request sends `mime: "constructor"`
- **THEN** the function responds `400 unsupported mime` and creates no object key

#### Scenario: Out-of-range episode
- **WHEN** a request carries `episode` outside 1..999
- **THEN** the function responds `400`

### Requirement: A caller cannot multiply its identity by re-spelling it

The anonymous id is matched case-insensitively but used verbatim as both a rate-limit
dimension and a storage prefix, so the same identity spelled in different letter cases
counts as several identities. The function SHALL normalise the validated anonymous id to a
single canonical spelling before it is used for limiting or for building a key, so that
varying letter case does not grant additional budget or a second prefix.

Normalisation SHALL happen after validation, not instead of it. Because conforming clients
generate a lowercase id, canonicalising to lowercase SHALL NOT move any existing recording
out from under its owner.

#### Scenario: Same id in upper and lower case
- **WHEN** a caller sends its anonymous id in uppercase and then in lowercase
- **THEN** both requests draw on one rate-limit budget and address one storage prefix

#### Scenario: Existing recordings after normalisation
- **WHEN** a returning visitor who recorded before this change scores or disposes a recording
- **THEN** the key still resolves to the object already stored under their id

### Requirement: Object keys are server-derived and confined to the caller's own prefix

The function SHALL construct every storage key itself from the validated anon id and
descriptors. It SHALL NOT accept a client-supplied key on any route. Because the key
always begins with the caller's own anon prefix, a caller SHALL be unable to address,
score or delete an object belonging to a different anon id, and a foreign or already
deleted recording reference SHALL resolve to a key that does not exist.

The function SHALL expose no route that lists or downloads stored recordings.

#### Scenario: Scoring someone else's recording
- **WHEN** a caller submits a `recId` that belongs to a different anon id
- **THEN** the rebuilt key does not exist under the caller's prefix and the function
  responds `404 recording not found`

#### Scenario: Deleting someone else's recording
- **WHEN** a `/dispose` body names recordings created under a different anon id
- **THEN** those items are not deleted and are not counted in the response's `deleted`

### Requirement: The destructive storage call re-asserts prefix containment

The storage delete operation SHALL independently assert that its key lies under the
configured recordings prefix and SHALL refuse otherwise, rather than relying on the route
layer having validated it. This is defence in depth for the one call that removes data.

#### Scenario: Key outside the prefix reaches delete
- **WHEN** delete is invoked with a key that does not begin with the recordings prefix
- **THEN** the call is refused and no object is deleted

### Requirement: JSON responses are not renderable as another type

Every JSON response, including error bodies, SHALL carry `x-content-type-options:
nosniff`, because error bodies echo client-supplied identifiers back to the caller.

#### Scenario: Error body echoing a client value
- **WHEN** the function returns any `4xx` or `5xx` JSON error
- **THEN** the response includes `x-content-type-options: nosniff`

### Requirement: Scoring is capped before any billable work happens

The scoring route SHALL enforce fixed-window caps along three dimensions — the anonymous
id, the client IP, and the function instance as a whole — and SHALL answer `429` with a
`Retry-After` header when any dimension is at its limit. All three checks SHALL run before
the function reads object storage or calls the ASR service, so a denied request bills
nothing. A limit of zero SHALL disable that dimension.

The instance-wide hourly cap SHALL NOT be derived from any caller-supplied value, because
both other dimensions are: anonymous ids are minted client-side without a signature and
the IP arrives in a request header. The instance-wide cap is the only one that bounds ASR
spend against a caller rotating identities.

Because anonymous callers are unauthenticated, the scoring route SHALL additionally verify
the recording exists before invoking the ASR service.

#### Scenario: Caller rotates anonymous ids
- **WHEN** a client exceeds the hourly cap and retries with freshly minted anon ids and a
  spoofed forwarded IP on each request
- **THEN** the instance-wide hourly cap still returns `429` and no ASR call is billed

#### Scenario: Scoring a recording that is not there
- **WHEN** a scoring request passes validation but names a key that does not exist
- **THEN** the function responds `404` without calling the ASR service

#### Scenario: A denied request does not extend its own lockout
- **WHEN** a capped client keeps retrying
- **THEN** the denied requests do not advance its counters, and `Retry-After` reports the
  real window rollover rather than growing

### Requirement: Rate-limit state is memory-bounded

The set of identities tracked by the limiter SHALL be bounded. Once it exceeds 20 000
entries the limiter SHALL first drop identities whose daily window has rolled over, and if
that frees nothing SHALL evict oldest-inserted entries until back under the bound. The
instance-wide counter key SHALL never be evicted, or a caller rotating identities could
reset the only cap they cannot dodge.

#### Scenario: Endless fresh identities
- **WHEN** a client mints new anon ids faster than any daily window rolls over
- **THEN** tracked entries stay at or below the bound and the instance-wide counter keeps
  its accumulated value

### Requirement: Object-creating and object-destroying routes are rate limited

Rate limiting SHALL NOT be confined to the scoring route. `/presign-upload` and `/dispose`
SHALL enforce the same per-anon and per-IP fixed-window caps and answer `429` with
`Retry-After` when exceeded, because both are anonymously reachable and both cause billed
storage operations: each presign makes a distinct object writable, and each dispose item
causes an authenticated delete.

#### Scenario: Presign flood
- **WHEN** a client requests upload signatures in a tight loop past its hourly cap
- **THEN** further presign requests receive `429` with a `Retry-After` and no further
  signature is issued

#### Scenario: Dispose flood
- **WHEN** a client calls `/dispose` past its hourly cap
- **THEN** the request receives `429` and no delete is attempted

### Requirement: One dispose request carries a bounded number of items

The `/dispose` route SHALL cap how many items a single request body may name and SHALL
refuse the request rather than perform an unbounded sequence of deletes. Invalid items
continue to be skipped without counting toward `deleted`.

#### Scenario: Dispose body naming thousands of recordings
- **WHEN** a `/dispose` body names more items than the per-request cap
- **THEN** the function refuses the request and performs no deletes

### Requirement: Upload size is bounded by the signature, not by what the caller declares

The duration a caller declares when requesting an upload signature SHALL NOT be the only
bound on what it may store. The signature the function issues SHALL itself constrain the
size of the object the client can upload, so a caller that declares a short duration
cannot write an arbitrarily large object directly to storage. Uploads SHALL remain
browser-to-storage and SHALL NOT be proxied through the function.

#### Scenario: Declared duration is a lie
- **WHEN** a caller requests a signature declaring a 3-second recording and then uploads
  hundreds of megabytes to it
- **THEN** the storage service rejects the upload on the signature's own size condition

### Requirement: The development storage backend cannot be enabled in production

The local backend exists so the whole record-upload-score flow runs without cloud
credentials, and it necessarily exposes an unauthenticated write route for the audio the
browser would otherwise PUT straight to storage. The function SHALL refuse to start when
that backend is selected in an environment that also carries production storage
credentials, rather than silently serving an unauthenticated write route. A
misconfiguration SHALL fail at startup with a message naming both settings.

#### Scenario: Both backends configured at once
- **WHEN** the function starts with a local storage directory and production object-storage
  credentials both present
- **THEN** it exits at startup without binding a port, and the error names both settings

#### Scenario: Local development
- **WHEN** the function starts with only a local storage directory configured
- **THEN** the unauthenticated write route is available and the flow runs without
  credentials

### Requirement: The client IP used for limiting is not chosen by the caller

The per-IP rate-limit dimension SHALL NOT take its value from a client-controlled header
verbatim. Where the platform supplies a forwarded-client address, the function SHALL use
the hop the platform appended rather than the first hop the caller wrote, and SHALL fall
back to a dimension it can trust when no forwarded address is present. The instance-wide
cap SHALL remain the guarantee that does not depend on this.

#### Scenario: Spoofed forwarded-for header
- **WHEN** a client sends `X-Forwarded-For` with a fabricated first hop and rotates it per
  request
- **THEN** the value used for the per-IP window does not change with the fabricated hop
