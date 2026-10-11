# Spec Delta

## Purpose

Defines the guarantees that hold about the artifacts this project ships — the deployed
function bundle, the uploaded static site, and the CI run that vouches for them — so that a
secret cannot ride along, a broken build cannot pass unnoticed, and the served pages carry
the headers that stop them being framed or script-injected.

## ADDED Requirements

### Requirement: The deployed function bundle carries no local environment file

Packaging the recordings function for deploy SHALL exclude `.env*` and `.DS_Store` along
with the existing exclusions, so an env file dropped next to the function for a local run
cannot be uploaded into the deployed bundle. Secret values SHALL continue to reach the
function only as named configuration at deploy time, never as a file in the artifact.

#### Scenario: Local env file present at package time
- **WHEN** a `.env` file sits next to the function source when the bundle is built
- **THEN** the produced archive contains no `.env*` entry

### Requirement: Generated credential material is not readable by other local users

A generated env manifest written during deploy SHALL be created under a restrictive umask
so it is not world-readable on a shared build machine.

#### Scenario: Manifest written on a shared machine
- **WHEN** the deploy writes its env manifest
- **THEN** the resulting file is not readable by users other than its owner

### Requirement: CI runs with least privilege

The CI workflow SHALL request no more token permission than its jobs need. Nothing in the
pipeline writes back to the repository, so the workflow token SHALL be pinned to read-only
repository contents.

#### Scenario: Workflow token scope
- **WHEN** CI runs on a push or pull request
- **THEN** the token it holds grants read-only access to repository contents and nothing
  broader

### Requirement: A dependency advisory cannot hide whether the build passed

The dependency audit SHALL run after typecheck, tests and build, not before them. An
advisory is meant to block the pipeline; running the audit first used to skip the checks it
was protecting, so a red run said nothing about whether the code still worked. A failed
audit SHALL still fail the run.

Every dependency set the project installs SHALL be covered by an audit, not only the
frontend's.

#### Scenario: Advisory present in a frontend dependency
- **WHEN** `npm audit` finds a high or critical advisory
- **THEN** the run fails, and the typecheck, test and build steps have already reported
  their own results

#### Scenario: Clean tree
- **WHEN** no advisory is present
- **THEN** typecheck, tests, build and audit all run and the pipeline is green

#### Scenario: Advisory present in a pinned pipeline dependency
- **WHEN** the pipeline advisory check finds a known vulnerability in the pinned requirements
- **THEN** the run fails, and the pipeline's own tests have already reported their results

### Requirement: Every imported dependency is declared

A tool that imports a third-party package SHALL have that package pinned in the
requirements file it is installed from, so a fresh install can run it. An undeclared
dependency is a reproducibility and supply-chain gap: the version that ends up installed is
whatever the environment happens to resolve.

#### Scenario: Fresh pipeline checkout
- **WHEN** a contributor installs the pipeline requirements from scratch and runs the logo
  generator
- **THEN** every package it imports is present at a pinned version

### Requirement: The served site ships security response headers

The static site upload SHALL set security response headers on the objects it publishes,
delivered from the deploy script rather than from console configuration. At minimum the
site SHALL carry a Content-Security-Policy that restricts script, style, media, connect and
image sources to what the site actually uses, and that sets `frame-ancestors` so the page
cannot be embedded. Embedding matters here specifically because the site prompts for
microphone permission and a framed copy of that prompt is a clickjacking target.

The policy SHALL permit the dataset origin and the recordings function origin the build is
configured with, and SHALL NOT need `unsafe-inline` for script.

#### Scenario: Deployed index document
- **WHEN** a browser fetches the deployed site root
- **THEN** the response carries a Content-Security-Policy including a `frame-ancestors`
  restriction

#### Scenario: Site embedded by a third party
- **WHEN** another site frames ours
- **THEN** the browser refuses to render it

#### Scenario: Site functionality intact
- **WHEN** the policy is in force
- **THEN** dataset fetching, audio playback and the recording flow all still work

### Requirement: Tracked files carry no live infrastructure endpoint

A committed script or document SHALL NOT embed the live function invocation URL. It is the
exact anonymous endpoint that the request-path abuse controls defend, and publishing it in
a public repository hands an attacker the target without requiring them to observe the
site. Deploy tooling SHALL take the endpoint from operator-supplied configuration, and a
checked-in example SHALL use a placeholder.

#### Scenario: Testing script in the repository
- **WHEN** a contributor reads the checked-in request-testing script
- **THEN** the function endpoint appears as a placeholder or is read from the environment,
  not as the production hostname

#### Scenario: Operator runs the script
- **WHEN** an operator supplies their own endpoint
- **THEN** the script works against it unchanged
