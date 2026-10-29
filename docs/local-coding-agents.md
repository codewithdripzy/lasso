# Coding agents in Lasso

Lasso supports hosted models and local coding CLI tools. Choose an agent from the prompt's model menu. Lasso provides project and page context, streams progress, and keeps file changes available for review.

## Supported local agents

| Agent | CLI command | Notes |
| --- | --- | --- |
| Claude Code | `claude` | Uses the Claude Code account and configuration on this computer. |
| Codex | `codex` | Uses the Codex CLI account and configured model. |
| Cursor Agent | `cursor-agent` | Uses the Cursor Agent CLI and its authentication. |
| OpenCode | `opencode` | Uses the OpenCode installation, provider setup, and model list. |
| Antigravity | `agy` | Uses the Antigravity CLI and its configured default model. |

Install and sign in to the CLI you want to use, then restart `lasso dev` so it detects the executable and account state. The command must be available on the `PATH` inherited by Lasso.

## What happens during a task

1. The overlay sends the task, conversation, selection or page context, and selected skills to the local bridge.
2. The bridge starts the selected local CLI in the project directory, or sends a hosted-model task to the Lasso AI service.
3. Lasso streams progress and changed-file information back to the overlay. Changes remain in the project while the agent works, so the development server can show them.
4. Review the changed files in the prompt tray. Accept to keep the current edits. Reject to restore the files to their pre-task state.

Lasso uses the workspace diff as the source of truth for file changes. Agent output alone does not determine which files are in the review.

## Skills

Lasso discovers `SKILL.md` files in these project directories:

- `skills/`
- `.agents/skills/`
- `.claude/skills/`
- `.codex/skills/`
- `.cursor/skills/`

Open **Skills** beside the prompt to select discovered project skills or personal skills. You can upload a Markdown skill from the same menu. Uploaded skills are stored under `~/.lasso/skills/` and can be selected in other projects.

Lasso's built-in **UI Design Craft** skill is included automatically for selected-element work and UI-focused coding requests. It guides the agent to follow the user's instructions and the project's existing design system, and to consider layout, typography, responsive behavior, accessibility, and visual consistency.

Selected skill instructions are scoped to the current task. Hosted coding requests send them to the AI service as task context; local CLI requests include them in the local agent prompt.

## Model selection

The model menu groups available hosted providers and detected local CLIs. Local agent model names follow each CLI's own conventions. If a CLI provides a configured default, select its default entry in Lasso to use that configuration.

Lasso can show an agent as unavailable when its command is missing or its account is not authenticated. Check the command and login in a regular terminal, then restart Lasso:

```bash
claude --version
codex --version
cursor-agent --version
opencode --version
agy --version
```

Use the selected CLI's own login command if it asks you to authenticate.

## Local and hosted execution

Local CLI agents run on the developer's machine through the Lasso CLI. Their project-file operations stay on that machine. Hosted models run through `ai-server`; the control-plane API in `server` handles user identity, provider access, billing, and quota. See [Agent architecture](../../AGENT_ARCHITECTURE.md), [AI server](../../ai-server/README.md), and [Server](../../server/README.md) for service responsibilities.

## Troubleshooting

| Problem | What to check |
| --- | --- |
| Agent is missing from the model menu | Confirm its CLI command is installed and on `PATH`, then restart Lasso. |
| Agent is listed but unavailable | Complete that CLI's sign-in flow and restart Lasso. |
| Changed files disappear | Check whether the task was rejected. Reject restores the pre-task files; accept keeps the edits. |
| Hosted request fails | Check `lasso auth status`, the selected provider configuration, and `lasso logs`. Local agents do not use hosted model quota. |
| Skill is missing from the menu | Confirm the file is named `SKILL.md` and is in one of the supported project skill directories, or upload it from the Skills menu. |

Use `lasso logs -f` to follow bridge and agent diagnostics while working.
