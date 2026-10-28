# Lasso

Lasso lets you select part of a running website, describe a change, and review the code edits made by an AI coding agent. You can also describe a larger task from the command bar.

Lasso runs alongside your app. It connects the page to your local project so the agent can inspect and change the source files that render it.

## What you can do

- Select an element or an area of your page and ask for a change.
- Use the command bar for tasks that affect several files.
- Work with a hosted AI model or a supported coding CLI installed on your computer.
- See agent progress, tool activity, and proposed file changes.
- Keep accepted changes or reject the review to restore the files to their earlier contents.
- Use your app's normal development server and hot reload.

## Before you start

You need:

- Node.js 18 or newer.
- A project with dependencies already installed.
- A supported development setup: Vite, Next.js, or Nuxt. Vue projects using Vite are supported.
- An AI model configured in Lasso, or a supported local coding agent that is installed and signed in.

Lasso starts Vite, Next.js, and Nuxt projects automatically. Other frameworks may need you to start their development server yourself. Lasso can still connect to a manually started app when its project setup is supported.

## Install and start Lasso

From your project folder, run:

```bash
npx @lasso-ai/cli
```

Or install the CLI once for your computer:

```bash
npm install --global @lasso-ai/cli
```

Then start it inside your project:

```bash
lasso dev
```

Lasso detects the framework, starts the development server with the overlay, and prints the local address to open. Keep this terminal open while you work.

## Make your first change

1. Open the local address printed by Lasso.
2. Select the Lasso selection tool in the page toolbar.
3. Click an element, or drag to select an area.
4. Describe the change you want and send it.
5. Follow the agent's progress and review the changed files.
6. Accept the changes to keep them, or reject them to restore the original file contents.

For a larger task, open the command bar with **⌘K** on macOS or **Ctrl+K** on Windows and Linux. Describe the outcome you want, then review the files when the agent finishes.

## Choose an AI coding agent

Lasso can use a hosted model or a local coding agent. Local agents use the login and settings from their own CLI. Install and sign in to the agent first, then restart or refresh the Lasso overlay so it can detect it.

Supported local coding agents:

| Agent | CLI command | Sign in |
| --- | --- | --- |
| Claude Code | `claude` | Run `claude` and follow its login steps |
| OpenCode | `opencode` | Run `opencode auth login` |
| Codex CLI | `codex` | Run `codex login` |
| Cursor Agent | `cursor-agent` | Run `cursor-agent login` |
| Antigravity CLI | `agy` | Run `agy` and complete sign in |

Antigravity uses its configured default model unless you choose a model in its configuration. It streams task progress to Lasso and can continue a conversation using its session ID. See the [Antigravity CLI guide](https://antigravity.google/docs/cli/headless/) and [authentication guide](https://antigravity.google/docs/install/).

## Supported frameworks

| Setup | Lasso support |
| --- | --- |
| Vite with React, Vue, Svelte, or Solid | Starts through Lasso's Vite integration |
| Next.js | Starts through Lasso's Next.js integration |
| Nuxt | Starts through Lasso's Nuxt integration |
| Other frameworks | Start the development server yourself; support depends on the app's source setup |

Lasso does not rewrite your framework configuration just to start the supported development servers.

## Useful commands

Run these commands from your project folder:

```bash
lasso dev       # Start your app with the Lasso overlay
lasso logs      # Show recent Lasso activity
lasso logs -f   # Follow new log entries
lasso auth status # Show your Lasso account status
lasso create    # Create a new project, including Vue and Nuxt projects
lasso help      # List commands
```

Some commands, including project registration and local `.lasso` domains, use a Lasso account:

```bash
lasso auth login
lasso init
lasso daemon status
```

Run `lasso help` to see the exact commands and options available in your installed version.

## Troubleshooting

### Lasso cannot detect my coding agent

Check that the agent's command works in a new terminal. For example:

```bash
agy --version
agy models
```

If it is installed but not signed in, open the agent once and complete its sign-in flow. Then restart Lasso.

### My app does not start

Run the install command for your project first, such as `npm install`. Check the terminal output for errors. You can also start the framework's development server yourself and review the Lasso logs with `lasso logs -f`.

### The overlay is missing

Confirm that you opened the address printed by `lasso dev`, not a separate development server address. If the overlay still does not appear, restart Lasso and check `lasso logs -f`.

### A change is not what I wanted

Reject the open review to restore the original file contents. Then send a clearer follow-up request. Keep accepted changes by accepting the review.

## More help

- [Local coding agent details](docs/local-coding-agents.md)
- [Report a problem](https://github.com/codewithdripzy/lasso/issues)
- [Contribute to Lasso](https://github.com/codewithdripzy/lasso/blob/main/CONTRIBUTING.md)

Lasso is licensed under the ISC License.
