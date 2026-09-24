# Architecture

> Product name: **Lasso**.

## 1. Core principle

Lasso edits **source code**, never the live DOM. A visual selection is a pointer into a
codebase, not a target for direct manipulation. This decision shapes every component
below — it's what separates a real dev tool from a demo that only works on static HTML.

## 2. Repository layout

```
src/
  cli/                    # the Node CLI (the coordinator)
    index.ts              # entry point: `lasso` / `lasso dev`, framework detection dispatch, `daemon`/`projects`/`register`
    project.ts            # project identity: `lasso init` (writes `{id, domain}`), `lasso dev` session resolution
    auth.ts               # `lasso auth`: browser-OAuth login, credential store (~/.lasso/credentials.json), status, logout
    bridge.ts             # WebSocket bridge the overlay connects to
    server/
      vite.ts             # Vite dev server with the source-mapping plugin injected in-memory
      next.ts             # Next.js dev server integration (React _debugSource)
    utils/
      framework.ts        # framework/bundler detection
    host/                 # Lasso Host: user-level local domains + app hosting
      paths.ts            # host dir (~/.lasso/host), registry/pid/log paths, ports, the `.lasso` TLD
      registry.ts         # domain → {projectId, directory} persistence (atomic, 0600), unique-domain generation
      runtime.ts          # auto-start dev servers (Vite/Next), readiness polling, port picking
      dns.ts              # UDP responder (*.lasso → 127.0.0.1, NXDOMAIN outside) + per-OS resolver config
      daemon.ts           # the background host: HTTP+WS proxy, /_host/* control API, single-instance, crash guard
      client.ts           # CLI-side helpers: health, registry read/register, stop/restart
      install.ts          # `lasso daemon install/uninstall`, LaunchAgent, daemon spawn/status
      vite-host-entry.js  # programmatic Vite with `.lasso` allow-listed (Vite rejects unknown Host headers)
  overlay/
    index.ts              # browser-side overlay (single file, bundled to dist/overlay.js)
                          # also hosts the realtime client: presence, locks, comments, voice
```

Two artifacts ship from `pnpm build`:

- `dist/cli/index.js` — the CLI, compiled with `tsc`
- `dist/overlay.js` — the browser overlay, bundled with `esbuild`

## 3. System overview

Three parties, all coordinating around one shared filesystem:

```
┌─────────────────────────────── Your machine ───────────────────────────────┐
│                                                                             │
│   Browser                        Local CLI                                │
│  ┌──────────────┐   selection   ┌──────────────────┐   writes   ┌───────┐  │
│  │ Overlay       │──────────────▶│ Bridge            │───────────▶│ Source │ │
│  │ (lasso, UI)   │   + prompt    │ Source resolver   │            │ files  │ │
│  │ Running app   │◀──────────────│ Diff preview      │            └───────┘ │
│  │ (Vite/Next    │  diff/accept  │ Agent adapter     │                 │    │
│  │  HMR)         │               └────────┬──────────┘                 │    │
│  └──────────────┘                         │                    dev server │
│                                            │                    watches ↓  │
└────────────────────────────────────────────┼──────────────────────────────┘
                                              │
                                   ┌──────────┴──────────┐
                                   │   Coding agent       │
                                   │  (pluggable — see §6)│
                                   └──────────────────────┘
```

Everything except the coding agent call runs locally. Nothing is ever written to disk
without an explicit accept from the user. The agent is the only party that ever leaves the
machine, and only with the exact context the CLI assembled for it.

## 4. Browser layer (capture only)

Responsibilities, and _only_ these:

- Render the floating toolbar (idle / select-mode / selection-active states).
- Lasso or click select. Match elements by **center-point containment**, not bounding-box
  overlap (overlap over-selects parents whose edge merely brushes the lasso rect).
- Resolve each selected DOM node to a `data-source` attribute (file, line, component name)
  injected by the dev-time build plugin. Where no plugin is present, fall back to React's
  `_debugSource` fiber data.
- Take a screenshot of the selection (`html2canvas`) — visual context measurably improves
  edit quality even when the AI has the source.
- Show the inline prompt box anchored to the selection (never a blocking `prompt()`).
- Render the diff/accept/undo UI once the CLI streams a proposed change back.
- **Never mutate the DOM.** All visual changes the user sees post-edit come from the
  framework's own HMR reload, not from this layer.

Transport: a persistent **WebSocket** to the local CLI (`src/cli/bridge.ts`), not one-shot
`fetch` calls — this lets the CLI push streaming diff previews and error states back
without polling.

## 5. Local CLI (the coordinator)

A Node process that wraps the user's existing dev server. Entry: `src/cli/index.ts`.

### 5.1 Responsibilities

1. Detect framework/bundler on `npx lasso` (`src/cli/utils/framework.ts` reads
   `vite.config.*`, `next.config.*`, `package.json`).
2. Spawn the dev server programmatically with the source-mapping plugin injected in memory
   (`src/cli/server/vite.ts`, `src/cli/server/next.ts`) — the user's own config files are
   never touched on disk.
3. Host the WebSocket bridge (`src/cli/bridge.ts`) the browser overlay connects to.
4. On a selection + instruction: read the referenced source file(s), assemble context
   (source snippet, imports, relevant CSS/Tailwind config, screenshot, instruction), and
   hand it to the coding agent (§6).
5. Hold the returned diff in memory and stream it to the browser for preview — never write
   on receipt.
6. On accept: snapshot the file's prior content (for undo), then apply the diff.
7. On undo: restore the snapshot, full stop — no re-generation needed, so retries are free.

### 5.2 Source resolution strategies

| Setup                         | Method                                                                                                                                               |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vite (React/Vue/Svelte/Solid) | Native Vite plugin, spawned via `createServer()` — injects `data-source` attrs at transform time. No config file edits.                              |
| Next.js                       | React's `_debugSource` fiber data, read at runtime — no build plugin needed, slightly less precise (nearest component boundary, not exact JSX line). |
| Webpack-only / CRA / Angular  | **Not supported in v1.** The CLI should say so explicitly rather than fail silently.                                                                  |

### 5.3 Diff format

The agent returns **old-string/new-string pairs**, not a full-file rewrite. Full-file
regeneration risks silently dropping code the model wasn't told about; a targeted
find-and-replace is deterministic and safe to apply mechanically.

### 5.4 Multi-instance handling

Editing a component's source file affects every rendered instance, since the source is
shared. This is usually correct, but the UI should say so explicitly at accept-time
("this edits the component template — affects N instances on this page") so it never feels
like the tool did something unexpected.

## 6. Coding agent — pluggable, not hardcoded

Lasso ships its own default agent, but the CLI's job is to assemble _context_, not to be
married to one model.

```
context (source + screenshot + instruction)
        │
        ▼
  ┌───────────────┐
  │ Agent adapter  │   interface: given context, return old/new string pairs
  └───────┬───────┘
          │
   ┌──────┼───────────────────┬─────────────────────┐
   ▼      ▼                   ▼                      ▼
 Built-in   Claude Code        User's own CLI coding   Any future
 agent      (headless/         agent (Cursor CLI,      adapter
 (default)  `claude -p`)       Aider, etc.)
```

- **Built-in agent** (`agent: "builtin"`): default path, zero setup, calls a hosted model
  directly (`@anthropic-ai/sdk`) with the assembled context and the old/new-string contract
  from §5.3.
- **Claude Code passthrough** (`agent: "claude-code"`): the CLI shells out to Claude Code
  in headless/print mode (`claude -p`), passing the assembled context as the prompt and
  parsing its file edits back into the same diff-preview pipeline. This lets a user keep
  using their existing Claude Code setup (subscription, project memory, MCP tools) while
  still getting the point-and-select UX.
- **Bring-your-own-agent** (`agent: "custom"`): define the adapter interface once (context
  in, old/new-string pairs out) and let power users wire in whatever CLI coding tool they
  already trust. Lasso's value in this mode is entirely the capture + context-assembly
  pipeline (§4–5), not the model itself.

Selection is a config choice, not an either/or product decision:

```json
// lasso.config.json (before `lasso init`)
{
  "agent": "builtin" // | "claude-code" | "custom"
}

// lasso.config.json (after `lasso init` — id is the only project field)
{
  "agent": "builtin",
  "id": "proj_3f2a9c…" // workspace-scoped; commit it so teammates share the session
}
```

## 7. Realtime collaboration (optional)

The overlay also speaks to `collab-server` (a Socket.IO server in the monorepo) so
teammates can collaborate on the same running app. Identity is split across two
credentials: the **API key** (`lss_live_…` — who you are + which workspace) and
the **project id** (which Lasso project you're opening). The API key comes from
`LASSO_API_KEY`, or — after `lasso auth login` — from `~/.lasso/credentials.json`.
Startup flows:

```text
0) lasso auth login (once per machine, device-style OAuth)
   │  auth.ts POSTs /auth/cli/start → prints + opens the verification URL
   │  (web /oauth/continue/cli?code=…, cookie auth) → /auth/cli/confirm mints an API key
   │  in the user's first ACTIVE workspace; auth.ts polls /auth/cli/status
   ▼
   the key is delivered exactly once and stored at ~/.lasso/credentials.json (0600)

1) lasso init (once per repo, API-key auth)
   │  project.ts POSTs the app manifest to /collab/projects/register
   ▼
   collab-server hashes the key → api_keys → derives the workspace → creates or
   reuses the project there (idempotent by git remote/name). CLI writes
   lasso.config.json = { "id": "proj_…" }. Key never touches disk.

2) lasso dev (every run, API-key auth)
   │  reads lasso.config.json, POSTs /collab/projects/:projectId/session
   ▼
   collab-server resolves key → workspace, verifies the project belongs to it
   (else 403 → realtime disabled, local editing continues), authenticates the
   session (uid === projectId).
   ▼  bridge sends { collab: { projectId, realtimeUrl, name, workspaceId } } with `config`
   ▼
   overlay io(realtimeUrl) → session:join { sessionId: projectId }
   ◀ session joins are gated: the browser user must own the session's workspace
```

### Element identity

Cross-user locks, comments, and spotlight key off a deterministic `elementKey`:

1. `data-source` / `data-lasso-source` attribute (best — from the build plugin) → `attr:…`
2. element `id` → `id:…`
3. stable CSS path (an `nth-child` chain on the ancestors) → `css:…`

This is **not** the random per-click `selectionId`. Two browsers looking at the same
app derive the same key, so a lock acquired on "the hero heading" in one tab is visible
and enforceable in the other. The overlay keeps an `elementRegistry` mapping key → local
Element to re-highlight remote selections.

### Flow pieces

- **Presence**: every joined socket emits `presence:update` (≈ every 30 s) with
  `selection: { elementId, label, sourceHint }`; the server broadcasts
  `presence:changed` snapshots. Only the selected element is synced (not raw
  coordinates), which keeps the wire tiny and the boxes meaningful.
- **Lock mode**: before running an agent edit, the overlay `lock:acquire`s the
  element. A `ok:false reason:"LOCKED"` ack means a teammate owns it → the edit is
  blocked and a chip shows who. The lock is released when the edit is applied or
  undone, and the client extends its held lock on the heartbeat.
- **Comments**: `comments:add` with `elementId` + `meta` (source hint, label,
  position); the panel can filter to the current element or the whole session.
  Replies nest under a root comment via `parentId`.
- **Spotlight**: clicking a presence avatar emits `collab:spotlight`; every tab
  highlights the element (or the sender's own highlight) for ~2.6 s with a
  "name → element" chip.
- **Voice**: P2P WebRTC mesh. `voice:join` returns existing peers; the newcomer
  creates a peer connection per peer and offers; existing members answer. Media
  never touches the server. Muting is a right-click on the (live) voice button.

Auth uses the app's own auth cookie (`withCredentials: true`) with `auth: { token }`
read from `document.cookie` as a fallback. That works on `localhost` because
cookie-origin and realtime-server-origin are same-site; production deployments keep
both on the same registrable domain (documented in the collab-server README).

## 8. Lasso Host (local domains + app hosting)

Lasso Host turns every project into a first-class local URL. `lasso init` now also
generates a stable unique domain for the project (`{ "id": "proj_…", "domain": "…" }`),
so `http://app.lasso` maps to that project — no remembering ports, no manual
`npm run dev`.

- **Daemon**: `lasso daemon` starts a single-instance background process
  (pid-guarded by holding the proxy port; extra invocations fail with
  "already running"). Control endpoints under `/_host/*` (health, registry,
  register, unregister, stop, restart). Logs to `~/.lasso/host/daemon.log`.
- **Proxy**: binds `127.0.0.1` only. Any request with a `*.lasso` Host header is
  resolved through the registry and reverse-proxied to that project's dev server;
  non-`.lasso` hosts get a 404, so nothing outside the namespace is served.
  WebSocket upgrades (HMR) pass through the same path.
- **Auto-start**: a request to a stopped project spawns its dev server and waits
  for readiness before proxying. Vite is launched programmatically
  (`vite-host-entry.js`) with `*.lasso` allow-listed because Vite rejects unknown
  Host headers; Next runs via `next dev --port`. Unknown frameworks report a clear
  error rather than blindly running `npm run dev`. A crash guard stops restarts
  after repeated immediate crashes.
- **DNS**: `*.lasso` resolves to `127.0.0.1` via a tiny UDP responder (A record;
  NXDOMAIN outside the namespace). Platform config behind a `DomainResolver`
  interface: macOS `/etc/resolver/lasso` (the only `sudo` step; the responder's
  port is otherwise unprivileged), Linux systemd-resolved split-DNS, and Windows
  hosts entries. The proxy runs on a high port (4377), so registered URLs are
  shown as `http://app.lasso:4377` unless DNS is installed.
- **Registry**: `~/.lasso/host/registry.json` (atomic write, `0600`) maps
  domain → `{ projectId, directory, registeredAt }`. `lasso register` reuses an
  existing registration for the same directory, never duplicates, and migrates
  the old domain when a new one is given (also rewriting `lasso.config.json`).
- **Trust**: no API keys or source paths in project config; only registered
  domains proxy; the daemon listens on loopback by default.

## 9. Open questions for v1

- Exact context window budget per request (full file vs. just the referenced function).
- Whether the diff-preview UI lives in the browser overlay only, or also as a terminal
  side panel for the CLI.
- Rate limiting / cost guardrails when using a hosted default agent vs. a user's own
  Claude Code subscription.
- Extending source resolution beyond Vite and Next.js (Webpack/CRA/Angular).

## 10. Trust model

- **Telemetry-free by default.** Nothing about a user's source code leaves their machine
  except what's explicitly sent to whichever agent they've configured.
- **No writes without accept.** Diffs live in memory until the user confirms; undo restores
  a pre-edit snapshot.
- **Configs are never modified.** Build plugins are injected in memory via the CLI.

See `SECURITY.md` for how to report anything that breaks this model.