<div align="center">

<img src="https://lasso.byorello.space/icons/logo.png" alt="Lasso" width="92" />

### Point at it. Describe it. Ship it.

**Visual coding for your real source code.**

Select an element in your running app, describe the change, and review the files as your coding agent works.

[![npm version](https://img.shields.io/npm/v/%40lasso-ai%2Fcli?style=flat-square&color=6366f1)](https://www.npmjs.com/package/@lasso-ai/cli)
[![npm downloads](https://img.shields.io/npm/dm/%40lasso-ai%2Fcli?style=flat-square&color=6366f1)](https://www.npmjs.com/package/@lasso-ai/cli)
[![GitHub stars](https://img.shields.io/github/stars/codewithdripzy/lasso?style=flat-square&color=6366f1)](https://github.com/codewithdripzy/lasso)
[![Contributors](https://img.shields.io/github/contributors/codewithdripzy/lasso?style=flat-square&color=6366f1)](https://github.com/codewithdripzy/lasso/graphs/contributors)
[![License](https://img.shields.io/github/license/codewithdripzy/lasso?style=flat-square&color=6366f1)](LICENSE)
[![Node.js](https://img.shields.io/node/v/%40lasso-ai/cli?style=flat-square&color=6366f1)](https://nodejs.org/)

[Website](https://lasso.byorello.space) · [Docs](https://lasso.byorello.space/docs) · [GitHub](https://github.com/codewithdripzy/lasso)

</div>

---

## Get started

Install Lasso and run it from your project folder:

```bash
npm install --global @lasso-ai/cli
cd your-project
lasso dev
```

Or try it without a global install:

```bash
npx @lasso-ai/cli dev
```

Open the local URL printed in your terminal. Select an element, describe the change, and follow the agent's progress. Changed files appear in the review tray while the agent works. **Accept** keeps the edits. **Reject** restores the files to their pre-task state.

## Use Lasso Host

Lasso Host gives your local projects stable `.lasso` addresses and can start registered development servers for you.

```bash
# Sign in to your Lasso account
lasso auth login

# Install and start Lasso Host
lasso daemon install

# From the project folder, register it and create its local domain
lasso init

# Check the host and registered projects
lasso daemon status
lasso projects
```

The `lasso init` command creates `lasso.config.json` in the project. Use `lasso daemon` to start the host without configuring automatic startup. See the [Lasso Host guide](https://lasso.byorello.space/docs/host) for setup details and troubleshooting.

If a `.lasso` address or Lasso Host stops working, restart the daemon and check its status:

```bash
lasso daemon restart
lasso daemon status
```

## Works with your coding agent

Choose a hosted model in Lasso, or use a coding CLI already installed on your computer:

| Agent | Command |
| --- | --- |
| Claude Code | `claude` |
| Codex | `codex` |
| Cursor Agent | `cursor-agent` |
| OpenCode | `opencode` |
| Antigravity | `agy` |

Sign in with the agent's own CLI first. Lasso passes project context to the selected agent and keeps its file edits available for review.

## Skills

Lasso discovers project `SKILL.md` files and lets you upload personal skills from the prompt menu. The built-in UI Design Craft skill is included automatically for selected-element and UI-focused tasks. Read the [Skills guide](https://lasso.byorello.space/docs/skills) to add your own.

## Supported projects

Lasso can start Vite, Next.js, and Nuxt projects. Vite projects using React, Vue, Svelte, or Solid are supported. Other development servers can be started separately when the project integration is supported.

## Useful commands

```bash
lasso dev          # Start your project with the Lasso overlay
lasso logs -f      # Follow Lasso activity
lasso auth status  # Check your Lasso account
lasso daemon       # Start Lasso Host
lasso help         # List commands
```

If Lasso Host or a `.lasso` address has issues, run `lasso daemon restart` and then `lasso daemon status`.

## Help and contribution

- [Documentation](https://lasso.byorello.space/docs)
- [Local coding agent guide](docs/local-coding-agents.md)
- [Report an issue](https://github.com/codewithdripzy/lasso/issues)
- [Contributing guide](CONTRIBUTING.md)

Lasso is open source under the [ISC License](LICENSE).
