# Lasso

Select any part of your running app, describe a change, and let AI edit the **real source code**.

Lasso is a local-first dev tool. You point at a component in the browser, type what you want
changed, and — after a diff preview and your explicit accept — the change lands in your
source files. The live DOM is never mutated; editing happens at the source level, so the
framework's own reload mirrors every frame.

## Why Lasso

Most "click-the-element and edit it" tools rewrite the live DOM and fall apart the moment the
page reloads. Lasso treats a selection as a **pointer into your codebase**, not a target for
direct manipulation:

- **Edits source, not pixels.** A selection resolves to a file + line + component. Changes are
  applied as deterministic old-string/new-string pairs to your code.
- **Nothing is written without your say-so.** The agent's proposal streams back as a diff;
  you preview, accept, or undo. Undo restores a snapshot — retries are free.
- **Local and private.** Everything except the coding-agent call runs on your machine.
  No telemetry, nothing leaves your machine except what you explicitly send to the agent
  you configured.
- **Bring your own agent.** Choose the built-in model, Claude Code (headless), or any CLI
  coding tool you already trust. See [Agent configuration](#agent-configuration).

## Features

- Floating overlay in select mode with lasso / click selection (`src/overlay`)
- Source resolution for **Vite** (native build plugin, exact JSX lines) and **Next.js**
  (React `_debugSource` fiber data)
- Persistent WebSocket bridge to a local CLI (`src/cli`)
- Inline prompt box, screenshot-of-selection context, diff preview + accept + undo
- Pluggable agent adapters: `builtin`, `claude-code`, `custom` (`lasso.config.json`)

## Status

> Product name: **Lasso**.

- **0.1.0** — early, opinionated, not yet stable. Expect breaking changes.
- V1 is scoped to Vite and Next.js. Webpack-only / CRA / Angular projects are **not supported**
  yet; the CLI refuses loudly rather than failing silently.

## Requirements

- Node.js **>= 18**
- An app using **Vite** or **Next.js**
- For the built-in agent: an Anthropic API key (or configure another agent — see
  [Agent configuration](#agent-configuration))

## Quickstart

Install the CLI:

```bash
npm install --save-dev lasso        # or: pnpm add -D lasso / yarn add -D lasso
```

From your app's root, start the dev server with the overlay attached:

```bash
npx lasso          # equivalent to: npx lasso dev
```

Lasso detects the framework from your `vite.config.*` / `next.config.*` / `package.json`,
starts the dev server with its build plugin injected in memory (your config files are never
modified), and opens the overlay. Then:

1. Toggle **Lasso Mode** in the toolbar.
2. Click an element (or lasso-select a region).
3. Type a change in the prompt — e.g. "make the header sticky and darker".
4. Preview the diff, hit **Accept** to apply it to the source, or **Undo** to revert.

## Agent configuration

Create a `lasso.config.json` in your project root:

```json
{
  "agent": "builtin"
}
```

- `"builtin"` — default; calls a hosted model (`@anthropic-ai/sdk`) with the assembled
  context. `ANTHROPIC_API_KEY` must be set.
- `"claude-code"` — shells out to Claude Code in headless mode, passing the assembled
  context as the prompt and parsing edits back into the same diff pipeline.
- `"custom"` — wire in any CLI coding tool via the adapter interface (context in,
  old/new-string pairs out).

## Documentation

- `ARCHITECTURE.md` — how the pieces fit together (capture, bridge, source resolution,
  agent adapters) and the v1 design decisions.
- `CONTRIBUTING.md` — how to set up a dev environment and open a pull request.
- `SUPPORT.md` — where to ask questions and report bugs.
- `SECURITY.md` — how to report a security vulnerability.

## License

[ISC](LICENSE) © 2026 Lasso contributors.

---

*Made for developers who want the AI to change code the way they would — one accepted diff at a time.*