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
    index.ts              # entry point: `lasso` / `lasso dev`, framework detection dispatch
    bridge.ts             # WebSocket bridge the overlay connects to
    server/
      vite.ts             # Vite dev server with the source-mapping plugin injected in-memory
      next.ts             # Next.js dev server integration (React _debugSource)
    utils/
      framework.ts        # framework/bundler detection
  overlay/
    index.ts              # browser-side overlay (single file, bundled to dist/overlay.js)
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
// lasso.config.json
{
  "agent": "builtin" // | "claude-code" | "custom"
}
```

## 7. Open questions for v1

- Exact context window budget per request (full file vs. just the referenced function).
- Whether the diff-preview UI lives in the browser overlay only, or also as a terminal
  side panel for the CLI.
- Rate limiting / cost guardrails when using a hosted default agent vs. a user's own
  Claude Code subscription.
- Extending source resolution beyond Vite and Next.js (Webpack/CRA/Angular).

## 8. Trust model

- **Telemetry-free by default.** Nothing about a user's source code leaves their machine
  except what's explicitly sent to whichever agent they've configured.
- **No writes without accept.** Diffs live in memory until the user confirms; undo restores
  a pre-edit snapshot.
- **Configs are never modified.** Build plugins are injected in memory via the CLI.

See `SECURITY.md` for how to report anything that breaks this model.