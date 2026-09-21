# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Open-source documentation: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`,
  `SECURITY.md`, `SUPPORT.md`, `LICENSE` (ISC), and this changelog.

## [0.1.0] - 2026-09-?? <!-- set the release date -->

### Added

- `lasso` CLI with `dev` command (default). Detects Vite or Next.js and starts the
  dev server with the Lasso overlay attached.
- Browser overlay: floating toolbar, select mode (click or lasso), center-point
  element matching, inline prompt box, diff preview with accept/undo.
- WebSocket bridge (`startBridge`) connecting the overlay to the local CLI.
- Source mapping: Vite build plugin (`data-source` attributes, exact JSX lines);
  Next.js via React `_debugSource` fiber data.
- Pluggable agent adapters: `builtin` (Anthropic), `claude-code` (headless
  passthrough), and `custom` — selectable via `lasso.config.json`.
- In-memory diff contract: old-string/new-string pairs, no disk writes until accept.

### Fixed

- Nothing yet — 0.1.0 is the initial release of the working-name Lasso.

### Notes

- Version 0.1.0 was developed as an internal prototype. This changelog records
  behavior from that point forward. The project uses the product name **Lasso**.