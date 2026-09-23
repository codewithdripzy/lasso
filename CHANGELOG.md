# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Open-source documentation: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`,
  `SECURITY.md`, `SUPPORT.md`, `LICENSE` (ISC), and this changelog.
- **`lasso auth` command group**: `lasso auth login` (browser OAuth — the CLI
  prints/opens a verification URL, the logged-in dashboard user confirms, and the
  CLI stores the minted API key in `~/.lasso/credentials.json` at `0600`),
  `lasso auth status` (who's signed in + workspace + masked key), and
  `lasso auth logout`. All credits feed `init`/`dev` automatically; `LASSO_API_KEY`
  still overrides the stored credential.
- **`lasso init`**: registers the app with your Lasso workspace (API-key
  authenticated) and writes `lasso.config.json` containing only the project id
  (`{ "id": "proj_…" }`). Idempotent — re-running reuses the id; commit the file
  so teammates share the same project. The API key is **not** stored in config.
- **`lasso dev` project session**: reads `lasso.config.json`, authenticates with
  the API key (`LASSO_API_KEY` env / prompt), lets the realtime server resolve
  the key → workspace → project and authenticate the project session. Renders
  realtime collaboration unavailable (local editing unaffected) when there is no
  config, no key, or the project belongs to another workspace.
- **Realtime collaboration in the overlay**: presence avatars with online/away
  dots, click-an-avatar spotlight, remote selection rings, and a live
  "teammate is working …" activity strip.
- **Component lock mode in the UI**: taking a suggestion acquires a lock on the
  selected element; teammates see a "Locked by …" chip and the edit is blocked
  until release/expiry.
- **Comments panel**: thread comments anchored to the selected element (or whole
  session), reply/resolve/reopen/delete, with a badge on the toolbar button.
- **Voice chat**: P2P WebRTC mesh — join from the toolbar, mute with a right-click
  while live.
- CLI → overlay `config` message carries `collab: { projectId, realtimeUrl,
  name, version, workspaceId }` so the overlay can join the right (workspace-
  gated) session. The bridge only forwards a config it successfully authenticated.

## [0.1.0] - 2026-09-21

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