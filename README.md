<div align="center">

<img src="https://lasso.byorello.space/_next/image?url=%2Ficons%2Flogo.png&w=256&q=75" alt="Lasso" width="96" />

# Lasso

### Point at it. Describe it. Ship it.

**AI-powered visual code editing for your real source code.**

Select any part of your running app, describe what you want changed, and Lasso turns that selection into a real code change — with a diff you approve before anything is written.

<br />

[![npm version](https://img.shields.io/npm/v/lasso?style=flat-square&color=6366f1)](https://www.npmjs.com/package/lasso)
[![npm downloads](https://img.shields.io/npm/dm/lasso?style=flat-square&color=6366f1)](https://www.npmjs.com/package/lasso)
[![GitHub stars](https://img.shields.io/github/stars/codewithdripzy/lasso?style=flat-square&color=6366f1)](https://github.com/codewithdripzy/lasso)
[![GitHub contributors](https://img.shields.io/github/contributors/codewithdripzy/lasso?style=flat-square&color=6366f1)](https://github.com/codewithdripzy/lasso/graphs/contributors)
[![license](https://img.shields.io/github/license/codewithdripzy/lasso?style=flat-square&color=6366f1)](LICENSE)
[![Node.js](https://img.shields.io/node/v/lasso?style=flat-square&color=6366f1)](https://nodejs.org/)

<br />

**npm downloads** · **GitHub stars** · **contributors** · **open source**

<br />

[Website](https://lasso.byorello.space) · [Documentation](#documentation) · [Quickstart](#quickstart) · [GitHub](https://github.com/codewithdripzy/lasso)

</div>

---

## What is Lasso?

Lasso is a **local-first visual coding tool**.

Instead of describing your entire problem in a chat window, point directly at the thing you want to change.

```text
Select a component
       ↓
Describe the change
       ↓
AI understands the source
       ↓
Preview the diff
       ↓
Accept
       ↓
Your source code changes
```

**Lasso edits your actual source files — not the live DOM.**

That means your changes survive refreshes, work with your framework's own rendering system, and remain ordinary code that you can review, commit, or undo.

---

## Why Lasso?

Traditional visual editing tools manipulate the rendered page.

Lasso works differently.

| | Lasso |
|---|---|
| 🎯 **Point at the UI** | Select exactly what you want to change |
| 🧠 **AI understands context** | The selected component is resolved back to your source |
| 📝 **Real code changes** | Lasso modifies your actual source files |
| 👀 **Preview first** | Every change comes back as a diff |
| 🔒 **You stay in control** | Nothing is written until you explicitly accept |
| ↩️ **Undo changes** | Revert an accepted change from a local snapshot |
| 💻 **Local-first** | The bridge, source resolution, and editing pipeline run locally |
| 🔌 **Bring your own agent** | Use Lasso's built-in agent, Claude Code, or your own adapter |

---

## Features

### Visual selection

Turn on Lasso Mode and interact with your application normally.

- Click any component
- Lasso-drag across multiple elements
- Hover to see what will be selected
- Select empty space to insert new UI

### Source-aware editing

Lasso doesn't stop at the DOM.

Selections are resolved back to the component and source code that produced them.

**Vite**

Uses an injected build plugin to resolve source files and JSX/component locations.

**Next.js**

Uses React's source metadata as a fallback without requiring changes to your project configuration.

### AI-powered changes

Give Lasso a natural-language instruction:

> "Make this header sticky and add a subtle blur."

or:

> "Turn this into a two-column pricing section."

or:

> "Add a loading state below this button."

Lasso assembles the relevant source context and sends it to your configured coding agent.

### Diff-first workflow

Lasso never silently rewrites your project.

```text
AI proposal
    ↓
Review diff
    ↓
Accept ────────→ Write to source
    │
    └──────────→ Reject
```

Accepted changes are written to the filesystem and your framework's normal development workflow takes over.

### Bring your own agent

Lasso's editing pipeline is agent-agnostic.

Use:

- `builtin`
- `claude-code`
- `custom`

Your selection and project context stay inside the Lasso pipeline while the actual coding agent can be swapped independently.

When installed, Lasso automatically detects the `claude` and `codex` commands
on your PATH and adds **Claude Code · Local** and **Codex · Local** to the
prompt model menu. Local agents run in read-only/planning mode and return a
reviewable proposal; Lasso remains the only process that writes accepted
changes to your source files.

### Team collaboration (realtime)

Lasso can be live — teammates watch your selection, lock components so nobody
edits the same element at once, leave review comments, and talk over the app.

- **Presence & Live Cursors**: see team members online in the toolbar, with live
  cursor tracking across the viewport showing user names and color badges. Click
  an avatar to **spotlight** the element that teammate is looking at.
- **Lock mode**: taking an AI suggestion locks the selected element for the
  duration of the edit. Teammates see a "Locked by …" badge and are prevented
  from conflicting edits until release or expiry.
- **Voice Mode & Speech-to-Text**: speak prompt instructions directly using the
  mic tool. Features an automated STT pooling backend that transcribes via
  Gradium first, falling back to Deepgram if credits or connections fail.
- **Comments & Dictation**: thread comments anchored to the element you selected
  (or the whole session), with attachments, GIFs, replies, and voice dictation.
- **Voice chat**: P2P WebRTC mesh — no media goes through a server.
- **Clipboard**: store and reuse code snippets, design references, and prompt
  templates in private or shared workspaces.

To share a live session with your team, sign in once with `npx lasso auth login`
(easy browser OAuth — no manual keys), then run `npx lasso init`: it registers
your app with your Lasso workspace and writes `lasso.config.json` containing the
stable project id — commit that file so teammates joining the repo share the
same session. The API key itself is never stored in config.

The credential from `lasso auth login` is kept in `~/.lasso/credentials.json`
(chmod 600) and is used automatically by `init` and `dev`. To override it, or to
use a dashboard-created key instead, set `LASSO_API_KEY` — the environment
always wins over the stored credential.

Point the overlay at a different realtime server with any of
`LASSO_REALTIME_URL`, `REALTIME_URL`, or `NEXT_PUBLIC_REALTIME_URL`
(default: `http://localhost:3007`).

---

## Local domains with Lasso Host

`lasso init` also gives every project a stable local URL. It writes
`{ "id": "proj_…", "domain": "app.lasso" }` and registers the domain, so the
project is served at `http://app.lasso:<port>` without manually starting a dev
server:

- `lasso daemon` — start/stop/restart/status the background host (reverse
  HTTP **and WebSocket/HMR** proxy to your project's dev server on `*.lasso`
  domains, loopback-only, single instance).
- `lasso register [domain]` — register the current directory under a `.lasso`
  domain (reuse, generate, or change one); never duplicates.
- `lasso projects` — list registered domains and running state.
- `lasso daemon install/uninstall` — attach a macOS LaunchAgent (auto-start on
  login) and configure the system DNS resolver so bare `app.lasso` works.

The Host answers `*.lasso → 127.0.0.1` itself (small local DNS responder),
starts a stopped project's dev server on first traffic (Vite/Next), proxies it,
and refuses any non-`.lasso` host. Registration state lives in
`~/.lasso/host/registry.json`.

---

## Supported frameworks

| Framework | Status |
|---|---|
| React + Vite | ✅ Supported |
| Vue + Vite | ✅ Supported |
| Svelte + Vite | ✅ Supported |
| Solid + Vite | ✅ Supported |
| Next.js | ✅ Supported |
| Webpack | 🚧 Not yet |
| Create React App | 🚧 Not yet |
| Angular | 🚧 Not yet |

> Lasso currently targets Vite-based applications and Next.js. Unsupported frameworks are detected explicitly rather than failing silently.

---

## Quickstart

### 1. Install

```bash
npm install --save-dev lasso
```

Or:

```bash
pnpm add -D lasso
```

```bash
yarn add -D lasso
```

### 2. Start Lasso

From your application's root:

```bash
npx lasso
```

This is equivalent to:

```bash
npx lasso dev
```

Lasso detects your framework, starts the development environment with its integration injected in memory, and connects the browser overlay.

To enable team realtime collaboration, first run `npx lasso init` (once per repo)
and set `LASSO_API_KEY` — see [Team collaboration](#team-collaboration-realtime) above.

Your existing configuration files are **not modified**.

### 3. Select something

Enable **Lasso Mode** from the floating toolbar.

Click a component or drag around a region of your application.

### 4. Describe the change

For example:

```text
Make this card more compact and add a hover animation.
```

### 5. Review the diff

Lasso generates a proposed source-code change.

Review it.

```text
Accept → apply the change
Reject → discard the proposal
Undo   → restore the previous snapshot
```

That's it.

---

## Agent configuration

Create `lasso.config.json` in your project root:

```json
{
  "agent": "builtin"
}
```

### Built-in agent

```json
{
  "agent": "builtin"
}
```

Uses Lasso's built-in agent through the Anthropic SDK.

Requires:

```bash
export ANTHROPIC_API_KEY=your_key
```

### Claude Code

```json
{
  "agent": "claude-code"
}
```

Lasso can delegate the coding task to Claude Code in headless mode while keeping the same selection → context → diff → accept workflow.

### Custom agent

```json
{
  "agent": "custom"
}
```

Build your own adapter for another coding agent.

The adapter contract is intentionally simple:

```text
Lasso context
    ↓
Your agent
    ↓
old string → new string
    ↓
Lasso diff preview
```

---

## How it works

Lasso has three main pieces.

```text
┌──────────────────────┐
│      Browser         │
│                      │
│  Select UI element   │
│  Capture screenshot  │
│  Presence, locks,    │
│  comments, voice     │
└──────────┬───────────┘
           │
           │ WebSocket
           ▼
┌──────────────────────┐      ┌──────────────────────┐
│     Lasso CLI        │      │  Realtime server     │
│                      │      │  (collab-server)     │
│  Resolve source      │      │                      │
│  Assemble context    │      │  presence · locks    │
│  Run coding agent    │ ───▶ │  comments · voice    │
│  Generate diff       │      │  project registry    │
└──────────┬───────────┘      └──────────────────────┘
           │
           │ accepted diff
           ▼
┌──────────────────────┐
│     Source code      │
│                      │
│  Your actual files   │
│  Your framework      │
└──────────────────────┘
```

The browser overlay is responsible for **selection, context capture, and the
realtime client** (presence, locks, comments, voice).

The CLI handles **source resolution, agent orchestration, diffs, and filesystem
changes**; on startup it authenticates the project session (`lasso.config.json`
+ `LASSO_API_KEY`) with the realtime server for realtime collaboration.

The framework remains responsible for rendering the result.

---

## Local-first by design

Lasso is designed around your local development environment.

The browser communicates with a local Lasso CLI through a dedicated WebSocket bridge.

The CLI:

1. Detects your framework
2. Resolves the selected component
3. Reads the relevant source
4. Collects imports and surrounding context
5. Captures the selected UI
6. Sends the assembled context to your configured agent
7. Receives a proposed change
8. Shows you the diff
9. Writes only after you accept

The goal is simple:

**Your development environment stays yours.**

---

## Project metrics

Lasso is open source and distributed through npm.

The numbers below are pulled from public package and repository activity where available.

| Metric | |
|---|---:|
| npm downloads | [![npm downloads](https://img.shields.io/npm/dm/lasso?style=flat-square&color=6366f1)](https://www.npmjs.com/package/lasso) |
| GitHub stars | [![GitHub stars](https://img.shields.io/github/stars/codewithdripzy/lasso?style=flat-square&color=6366f1)](https://github.com/codewithdripzy/lasso) |
| Contributors | [![GitHub contributors](https://img.shields.io/github/contributors/codewithdripzy/lasso?style=flat-square&color=6366f1)](https://github.com/codewithdripzy/lasso/graphs/contributors) |
| Latest release | [![npm version](https://img.shields.io/npm/v/lasso?style=flat-square&color=6366f1)](https://www.npmjs.com/package/lasso) |
| License | [![license](https://img.shields.io/github/license/codewithdripzy/lasso?style=flat-square&color=6366f1)](LICENSE) |

> npm downloads represent package downloads, not unique users or installations.

---

## Status

### `0.1.0`

Lasso is early and intentionally opinionated.

The core visual editing pipeline is being built around:

- Vite integration
- Next.js integration
- Visual component selection
- Source-code resolution
- Local WebSocket communication
- AI-generated source changes
- Diff preview
- Explicit accept/reject
- Undo
- Pluggable coding agents

Expect breaking changes before `1.0`.

---

## Documentation

| Document | Description |
|---|---|
| [Architecture](ARCHITECTURE.md) | System architecture and design decisions |
| [Contributing](CONTRIBUTING.md) | Development setup and contribution guide |
| [Support](SUPPORT.md) | Questions, bugs, and community support |
| [Security](SECURITY.md) | Vulnerability reporting |
| [Changelog](CHANGELOG.md) | Release history |
| [Publishing](docs/PUBLISHING.md) | npm publishing guide |

More examples and guides are available on the [Lasso website](https://lasso.byorello.space).

---

## Contributing

Lasso is open source and contributions are welcome.

```bash
git clone https://github.com/codewithdripzy/lasso.git
cd lasso

npm install
npm run build
```

If you find a bug, have an idea, or want to contribute a framework integration, open an issue or pull request.

---

## Support

If Lasso saves you time and you want to support development:

<a href="https://www.buymeacoffee.com/thecodeguyy">
  <img src="https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png" alt="Buy me a coffee" height="40">
</a>

- **Buy Me a Coffee:** [@thecodeguyy](https://www.buymeacoffee.com/thecodeguyy)
- **X:** [@fikayomibanks](https://x.com/fikayomibanks)
- **GitHub:** [@codewithdripzy](https://github.com/codewithdripzy)

---

## License

[ISC](LICENSE) © 2026 Lasso contributors.

<div align="center">

<br />

### Point at it. Describe it. Ship it.

Made for developers who want to change their code the way they change their UI.

</div>
