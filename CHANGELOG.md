# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-11-11

### Changed

- Adopt node-GTFS v5 configuration: `database`, `sources`, `extensions`, `reporting`, and `export`.
- Replace the default export with `reviewGtfs()`, typed review callbacks, and structured results.
- Introduce `review.sourceId`, `review.input`, and `review.flaggedStopName`.
- Use kebab-case CLI flags matching node-GTFS, with direct invocation and an optional `review` alias.
- Make extensions and export overwrites opt-in; use node-GTFS export naming and reporting.
- Review stops in stop ID order and import only the selected source.
- Replace legacy tooling with tsdown, strict TypeScript, Oxlint, and release-it checks.
- Use native speech commands with asynchronous terminal input; Linux now requires espeak.

### Fixed

- Scope reads, writes, counts, and exports to the selected source.
- Speak original stop names for flagged stops and clear flags when accepted.
- Propagate speech and review errors, close owned connections, and preserve existing output on failures.
- Remove global error-handler side effects and report configuration errors once.

### Added

- Full config sample and multi-platform CI.
- Regression tests for source isolation, review behavior, configuration, speech failures, and package boundaries.

## [0.4.0] - 2026-11-10

### Updated

- Update to node-gtfs v5
- Dependency Updates

## [0.3.2] - 2025-02-25

### Updated

- Dependency Updates

## [0.3.1] - 2024-09-23

### Updated

- Dependency Updates

## [0.3.0] - 2024-09-19

### Fixed

- Handle case when no sqlitePath is specified

### Updated

- Dependency Updates

## [0.2.1] - 2024-07-09

### Fixed

- Fix for export folder name
- Fix for export stats

### Added

- Release-it Changelog

### Updated

- Dependency Updates

## [0.2.0] - 2024-06-20

### Updated

- Dependency Updates
- Add lint-staged prettier
- Typescript

## [0.1.1] - 2021-08-19

### Changed

- Add support for ending processing early
- Documentation updates

## [0.1.0] - 2021-08-19

### Changed

- Initial Release

[Unreleased]: https://github.com/BlinkTagInc/gtfs-tts/compare/1.0.0...main
[1.0.0]: https://github.com/BlinkTagInc/gtfs-tts/compare/0.4.0...1.0.0
