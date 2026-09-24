# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Open-source documentation: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`,
  `SECURITY.md`, `SUPPORT.md`, `LICENSE` (ISC), and this changelog.
- **Lasso Host** (`src/cli/host/`) — a user-level local domain server + runtime
  that serves registered projects through `*.lasso` domains. New commands:
  - `lasso daemon [start|status|stop|restart|install|uninstall]` — background
    single-instance daemon (reverse HTTP **and WebSocket/HMR proxy**), persistent
    project registry at `~/.lasso/host/registry.json`, always-bound `127.0.0.1`.
    `install` adds a macOS LaunchAgent (auto-start at login) and configures the
    local DNS resolver (`/etc/resolver/lasso` via `sudo`); `uninstall` reverses it.
  - `lasso register [domain]` — register the current project under a `.lasso`
    domain (or reuse/generate one), syncs `lasso.config.json`, and replaces the
    previous domain when it changes. Re-registering never creates duplicates.
  - `lasso projects` — list registered domains with running/stopped state.
  - `lasso init` now also generates a unique local domain (derived from the
    project directory name), registers it with Lasso Host, and writes
    `{ "id": "proj_…", "domain": "app.lasso" }`.
  - Auto-start on traffic: a request to a stopped project starts its dev server
    (Vite launched programmatically with `.lasso` allow-listed, Next dev via
    `next dev --port`), waits for readiness, then proxies — no manual
    `npm run dev`. Crashing projects are guarded (no runaway restarts).
  - DNS: a tiny UDP responder answers `*.lasso → 127.0.0.1` (NXDOMAIN outside
    the namespace); the platform resolver abstraction covers macOS
    (`/etc/resolver/lasso`), Linux (systemd-resolved split-DNS), and Windows
    (per-domain hosts entries, best-effort). No API keys or arbitrary paths are
    exposed — only registered domains are proxied.
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
  dots, click-an-avatar spotlight, remote selection rings, live teammate cursors
  with custom user colors and name badges, and a live activity strip.
- **Live multiplayer cursors**: broadcast cursor movement via Socket.IO presence,
  rendering smoothed remote pointers for teammates in real time.
- **Component lock mode in the UI**: taking a suggestion acquires a lock on the
  selected element; teammates see a refined "Locked by …" badge and the edit is
  blocked until release or expiry.
- **Speech-to-Text (STT) voice input & dictation**:
  - Interactive microphone button in the prompt card with animated listening and
    transcribing states.
  - Voice dictation button in the comment compose bar.
  - Client-side audio recording module (`src/overlay/audio/transcribe.ts`) using
    the `MediaRecorder` API.
  - Multi-provider pooling via the backend server: primary transcription via
    Gradium (`api.gradium.ai`), with automatic failover to Deepgram (`api.deepgram.com`)
    when credits finish or errors occur.
  - CLI bridge support for local `transcribe` and `transcribe_result` relay.
- **Comments panel**: thread comments anchored to the selected element (or whole
  session), reply/resolve/reopen/delete, attachments, GIFs, and voice dictation.
- **Clipboard & Snippets panel**: manage, copy, and share frequently used code
  snippets, design tokens, and references with private and shared tabs.
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