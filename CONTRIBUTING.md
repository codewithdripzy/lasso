# Contributing to Lasso

Thanks for wanting to help build Lasso. This project is young, opinionated, and heavily
shaped by its [architecture decisions](ARCHITECTURE.md) — please read that file before
making a change, because most "small" fixes touch one of its core invariants.

## Project layout

```
src/
  cli/
    index.ts            # CLI entry (`lasso` / `lasso dev`), framework detection dispatch
    bridge.ts           # WebSocket bridge the browser overlay connects to
    server/
      vite.ts           # Vite dev server with the source-mapping plugin injected in-memory
      next.ts           # Next.js dev server integration (uses React _debugSource)
    utils/
      framework.ts      # framework/bundler detection
  overlay/
    index.ts            # browser-side overlay: toolbar, selection, prompt, diff/accept UI
```

## Development setup

```bash
git clone <your-fork-url> lasso
cd lasso
pnpm install
```

We use **pnpm**. There is no test suite yet (see [Tests](#tests)).

### Scripts

| Command                | What it does                                            |
| ---------------------- | ------------------------------------------------------ |
| `pnpm dev`             | Run the CLI in watch mode (`tsx src/cli/index.ts`)      |
| `pnpm build`           | Build both artifacts (CLI + overlay)                    |
| `pnpm build:cli`       | `tsc -p config/tsconfig.cli.json` → `dist/cli/index.js` |
| `pnpm build:overlay`   | `esbuild src/overlay/index.ts` → `dist/overlay.js`      |
| `pnpm typecheck`       | Typecheck CLI and overlay                               |
| `pnpm start`           | Run the built CLI from `dist/`                          |
| `pnpm format`          | `prettier --write .`                                    |
| `pnpm format:check`    | Verify formatting                                       |
| `pnpm test`            | No tests are registered yet — leave it passing          |

Two artifacts ship: `dist/cli/index.js` (the Node CLI, compiled with `tsc`) and
`dist/overlay.js` (the browser bundle, compiled with `esbuild` into a single file). Keep
them buildable after your change: `pnpm typecheck && pnpm build`.

## Coding standards

- **Formatting**: Prettier. The repo's config is `.prettierrc` (note the deliberately long
  `printWidth: 300` — don't "fix" it). Run `pnpm format` before pushing.
- **TypeScript strict**. The CLI and overlay are typechecked separately
  (`config/tsconfig.cli.json`, `config/tsconfig.overlay.json`).
- **No comments unless they earn their place.** Prefer self-documenting code
  (`kebab-case` CSS class names, explicit variable names). Explain *why*, never *what*.

### Architecture invariants (non-negotiable)

From [ARCHITECTURE.md](ARCHITECTURE.md):

1. **Lasso edits source code, never the live DOM.** The overlay is capture-only. UI changes
   a user sees post-edit must come from the framework's own HMR, not from the overlay.
2. **Agent output is old-string/new-string pairs**, never full-file rewrites.
3. **Nothing is written to disk until the user accepts.** Diffs live in memory; undo
   restores a snapshot of the pre-edit content.
4. **Config files are never modified.** Plugins are injected in memory via the CLI.
5. **Telemetry-free by default.** User source code leaves the machine only when sent to the
   agent the user configured.

## Making changes

1. Fork the repository and create a branch: `git checkout -b feat/my-change`.
2. Make the change with tests or a manual repro described in the PR.
3. Run `pnpm format && pnpm typecheck && pnpm build`.
4. Push and open a pull request. Reference any issue it closes (e.g. `Closes #123`).

### Commit messages

Short, imperative, focused on a single concern:

```
feat: add Webpack source resolution
fix: clamp lasso rect to viewport bounds
refactor: extract agent adapter interface
docs: explain BYOK model selection
```

## Good first contributions

- Wire shared states/tests for the overlay bundle (`pnpm test` currently no-ops).
- Add a `tests/` harness around the `old-string/new-string` diff contract (see §4.3).
- Document another agent adapter (any CLI coding tool) end-to-end.
- Open issues for the open questions listed at the bottom of `ARCHITECTURE.md`.

## Reporting bugs

Open an issue with: expected vs. actual behavior, the framework + version, Node version,
and the smallest repro you can manage (ideally a paste of the failing diff, not a screenshot).
Security issues go to [SECURITY.md](SECURITY.md), not the issue tracker.

## Code of conduct

All participants agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md). In short:
be respectful, assume good intent, and keep the conversation technical.