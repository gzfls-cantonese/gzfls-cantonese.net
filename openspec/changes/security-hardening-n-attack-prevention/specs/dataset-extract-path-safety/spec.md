# Spec Delta

## Purpose

Defines what the dataset extraction step guarantees when the parquet it reads is hostile —
the audio filename and episode id inside a public dataset are untrusted input that decide
where files get written on the maintainer's machine.

## ADDED Requirements

### Requirement: Audio paths from the dataset cannot escape the output tree

The audio path carried by each dataset record SHALL be validated before it is used as a
write destination. Only a flat filename matching the dataset's own layout — alphanumerics,
dot, underscore and hyphen, ending in `.opus` — SHALL be accepted. A value containing a
directory separator, a parent-relative segment, or an absolute path SHALL be rejected,
because an absolute path discards the destination directory entirely when joined onto it
and a parent-relative one climbs out of it.

The episode index the run publishes SHALL reference the validated filename, never the raw
value from the dataset, so a rejected name cannot reappear downstream as a broken or
escaped path.

#### Scenario: Hostile absolute path
- **WHEN** a record's audio path is `/tmp/pwned.opus`
- **THEN** the record is skipped, nothing is written outside the output tree, and the run
  reports it

#### Scenario: Hostile parent-relative path
- **WHEN** a record's audio path is `../../../x.opus`
- **THEN** the record is skipped and reported, and no file is written above the audio root

#### Scenario: Ordinary dataset record
- **WHEN** a record's audio path is the expected flat `<episode>_<record>.opus` name
- **THEN** the audio is written under its episode directory and indexed as before

### Requirement: Episode ids from the dataset are range-checked before formatting

An episode id SHALL be accepted only when it is a genuine integer within 1..157 — the
dataset's own contiguous episode count. A non-integer, a boolean, or a value outside that
range SHALL cause the record to be skipped and reported rather than formatted into a
directory name.

#### Scenario: Episode id out of range
- **WHEN** a record carries an episode id of `9999` or `-1`
- **THEN** the record is skipped and the run reports it

#### Scenario: Episode id of the wrong type
- **WHEN** a record carries an episode id that is not an integer
- **THEN** the record is skipped and reported

### Requirement: The resolved destination is re-checked before writing

After validation, the fully resolved destination path SHALL be confirmed to sit under the
audio root before the file is opened. This second check catches an output tree that is
itself symlinked elsewhere, which name validation alone cannot see.

#### Scenario: Output directory symlinked away
- **WHEN** the resolved destination lands outside the audio root
- **THEN** the record is skipped and reported, and no file is written there

### Requirement: Skipped records fail the run instead of passing silently

Records skipped for an unsafe path, an invalid episode id, or a destination outside the
audio root SHALL be counted and SHALL fail the run's integrity check alongside the existing
episode-contiguity and record-count checks. The failure output SHALL say how many were
skipped and show a few examples. A partial extraction SHALL NOT be publishable as a
complete dataset.

#### Scenario: One poisoned row in an otherwise valid dataset
- **WHEN** extraction skips any record as unsafe
- **THEN** the run exits non-zero naming the skipped count and examples

#### Scenario: Clean dataset
- **WHEN** every record passes validation
- **THEN** the integrity checks behave exactly as before and the run succeeds
