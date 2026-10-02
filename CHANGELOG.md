# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Cursor CLI support**: Added Cursor as a local agent option alongside Claude Code, Codex, and OpenCode. Users can now select Cursor models in the model dropdown if Cursor is installed on their system. Cursor uses similar output parsing to Claude Code with progress tracking and error handling.

- **Model locking based on API key configuration**: Models are now locked with a lock icon in the dropdown when the user hasn't configured the provider's API key in their dashboard. Free plan users can only use models from providers with configured keys. Paid plan users have all models unlocked. CLI agents (Claude Code, Codex, OpenCode, Cursor) are always unlocked since users manage their own credentials.
- **One-shot mode with global command bar**: Press ⌘K to open a command interface
  anywhere in your app. Describe what you want to build (e.g., "Build a complete billing
  system with invoices and payment tracking") and Lasso will plan, execute, and
  validate the changes automatically. The agent runs through understand → plan →
  execute → validate, with real-time progress visibility.
- **`lasso create` command**: Create brand-new Lasso projects with framework scaffolding.
  Supports Next.js, React, Vue, Svelte, and Solid with TypeScript and package manager
  selection. Optionally describe your app during creation to trigger one-shot mode
  automatically.
- **`lasso doctor` command**: Diagnose configuration and integration problems.
  Checks for `lasso.config.json`, API key configuration, framework detection, and
  package.json presence.
- **Scope management**: One-shot mode supports project-level (broad changes across
  entire codebase) and component-level (targeted changes) scopes to prevent agents
  from wandering through unrelated files.
- **Agent task workflow**: concurrent prompts now appear in In progress and
  Completed tabs. Review-ready tasks expose a Review action, and accepted changes
  move the task to Completed.
- **Component conversation continuity**: prompts reuse the latest conversation and
  change history for a stable component identity across repeated prompts and DOM
  replacement during HMR.
- **Interactive local-agent prompts**: Claude Code, Codex, and OpenCode run with
  piped stdin. Permission or input requests can be answered from a task-scoped
  overlay prompt with Allow, Deny, or custom text.
- **Secondary overlay toolbar**: added a New Page workflow with a project-folder
  explorer, filename/content form, path validation, and explicit file creation.
- **Redesigned New Page dialog**: replaced the flat folder dropdown with a
  VS Code-style lazy tree of the project. You type only a page name and pick a
  folder; nested folders are created inline with a `+` button, folders load on
  demand, a filter box narrows deep trees, and clicking a file reuses its name.
  Selecting a folder no longer collapses it, and the starter file is generated
  from the extension (`.tsx`, `.ts`, `.css`, `.json`, `.md`).
- **Readable agent permission prompts**: the prompt no longer dumps raw local-agent
  log lines. Filesystem failures such as `EACCES: permission denied` and
  `Cause([Die([…])])` now surface as errors with a suggested fix, because
  Allow/Deny can never resolve them. Only genuine approval and sign-in requests
  open the Allow/Deny prompt.
- **Clickable agent prompt**: the prompt panel opts back into pointer events, so
  Allow, Deny, and custom options respond to clicks again; Enter submits typed
  input and Escape sends Deny, matching the close button.
- **Custom toolbar tooltips**: toolbar labels now use an accessible Lasso-styled
  tooltip on hover and keyboard focus instead of browser-native title popovers.
- **Filtered agent progress**: useful tool/progress events remain visible while
  process IDs, startup messages, and heartbeat logs are hidden.
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
