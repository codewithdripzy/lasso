# Lasso CLI architecture

This guide describes the current CLI and browser-overlay package. For the complete hosted request flow, see the repository's `AGENT_ARCHITECTURE.md` and `ai-server/README.md`.

## Package responsibilities

`@lasso-ai/cli` contains:

- The `lasso` command and framework integrations.
- The browser overlay, including selection, prompt UI, progress, review, skills, and conversation history.
- A local WebSocket bridge between the browser and CLI.
- Local source inspection and file operations.
- Adapters for local coding CLIs and a client for Lasso's hosted agent runtime.
- Workspace baseline capture, live diff reporting, accept, and reject behavior.

The CLI runs on the developer's computer. It owns project filesystem access, including for hosted model runs. The hosted AI service proposes and coordinates actions; local tools execute them.

## Request flow

### Selected-element prompt

The overlay collects the user instruction, conversation, selected DOM element, source hint, viewport, relevant styles, runtime errors, and any needed screenshot. It sends an `edit` message over the local WebSocket bridge.

The bridge builds a runtime session input and chooses the selected backend:

- **Local CLI**: `LocalRuntime` starts the chosen agent in the project directory and normalizes its structured output.
- **Hosted model**: `RuntimeClient` talks to `ai-server`. Tool calls stream back to the CLI, which executes them against the local project and returns results.

### One-shot command bar

The command bar sends the current conversation to the bridge as an `oneshot` message. The bridge uses the request route for hosted requests: conversational prompts go to the conversation service, while coding prompts enter the persistent coding runtime. Local coding CLIs run through `LocalRuntime`.

Both coding paths use the same overlay progress and review UI. Conversation history stays in the sidebar; task context includes prior conversation when needed.

## Hosted services

- `ai-server/` owns hosted coding-agent sessions, model calls, agent orchestration, and runtime state.
- `server/` owns authentication, workspaces, provider authorization, billing, and quota. It does not run the coding-agent loop.
- `collab-server/` owns realtime collaboration transport and events.

The local CLI calls `ai-server` for hosted work. The AI service calls the control plane for identity and entitlement checks.

## Live changes and review

Before a coding task starts, Lasso records a workspace baseline. Agent edits are made in the project and detected as the work proceeds. The overlay shows changed files and lets the user inspect diffs while the task is active.

- **Accept** keeps the current file contents.
- **Reject** restores affected files to the captured pre-task contents.

The workspace diff is authoritative for which files changed. Agent summaries and reported file lists do not replace it.

Relevant implementation:

```text
src/runtime/workspace-guard.ts
src/runtime/review.ts
src/runtime/action-executor.ts
src/cli/bridge.ts
src/overlay/prompt/prompt.ts
src/overlay/commandbar/commandbar.ts
```

## Skills

The overlay requests a skill catalog from the CLI bridge. The CLI discovers project `SKILL.md` files under `skills/`, `.agents/skills/`, `.claude/skills/`, `.codex/skills/`, and `.cursor/skills/`. Personal uploads are saved under `~/.lasso/skills/`.

The Skills menu appears beside selected-element and one-shot prompts. Users select project or personal skills for each task. Lasso's bundled `skills/ui-design-craft/SKILL.md` is automatically included for selected-element tasks and UI-focused coding prompts. Skill text goes to local CLIs in their task prompt and to hosted models as task-scoped system context.

## Local coding CLIs

The CLI detects and adapts these local tools:

| Agent | Command |
| --- | --- |
| Claude Code | `claude` |
| Codex | `codex` |
| Cursor Agent | `cursor-agent` |
| OpenCode | `opencode` |
| Antigravity | `agy` |

Each adapter handles that CLI's invocation and structured output. Lasso owns task context, progress normalization, change review, and accept/reject behavior.

## Framework integrations

Lasso includes development integrations for Vite, Next.js, and Nuxt. Source mapping depends on the framework integration and available source metadata. Vue applications are supported through Vite and Nuxt integrations.

## Build outputs

`pnpm build` produces:

- `dist/cli/index.js`, the executable CLI.
- `dist/overlay.js`, the bundled browser overlay.
- Compiled runtime and CLI modules under `dist/`.

The built-in design skill is packaged from `skills/ui-design-craft/SKILL.md` alongside the compiled CLI.

## Diagnostics

Use `lasso logs` to inspect recent local activity and `lasso logs -f` to follow new events. The log file is stored at `~/.lasso/logs/lasso.log`.
