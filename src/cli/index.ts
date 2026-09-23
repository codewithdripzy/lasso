#!/usr/bin/env node
import os from "node:os";
import path from "node:path";
import chalk from "chalk";
import { Command } from "commander";
import { startBridge } from "./bridge";
import { startViteServer } from "./server/vite"
import { startNextServer } from "./server/next";
import { detectFramework } from "./utils/framework";
import { initProject, readProjectConfig, resolveCollabSession, readProjectEnv, LASSO_CONFIG_FILE, type CollabConfig } from "./project";
import { authLogin, authLogout, credentialSummary, loadCredentials } from "./auth";

const program = new Command();

program.name("lasso").description("Select UI in your running app, describe a change, AI edits the real source.").version("0.1.0");

// prettier-ignore
program.command("init").description("Register this app with your Lasso workspace and write lasso.config.json").action(async () => {
    const cwd = process.cwd();

    const existing = readProjectConfig(cwd);
    if (existing) {
        console.log(chalk.green("✓") + ` Already initialized: ${chalk.cyan(existing.id)} (from ${existing.source}).`);
        return;
    }

    console.log(chalk.dim("Registering the project with your Lasso workspace…"));
    const result = await initProject(cwd, readProjectEnv(cwd));

    if (!result.ok) {
        console.error(chalk.red("✗") + ` ${result.error}`);
        process.exit(1);
    }

    console.log(chalk.green("✓") + ` Configured ${chalk.cyan(result.name || "project")} → ${chalk.cyan(result.projectId!)}`);
    if (result.workspaceId) console.log(chalk.dim(`Workspace: ${result.workspaceId}`));
    console.log(chalk.dim(`Wrote ${chalk.bold(LASSO_CONFIG_FILE)} — commit it so teammates share this project.`));
});

// prettier-ignore
const auth = program.command("auth").description("Sign this machine into your Lasso account (the `lasso auth` OAuth flow)");

// prettier-ignore
auth.command("login").description("Sign in with the browser OAuth flow and store a Lasso credential locally").action(async () => {
    const cwd = process.cwd();
    const fileEnv = readProjectEnv(cwd);

    const result = await authLogin(cwd, fileEnv);
    if (!result.ok) {
        console.error(chalk.red("✗") + ` ${result.error}`);
        process.exit(1);
    }
});

// prettier-ignore
auth.command("status").description("Show the Lasso credential stored on this machine").action(() => {
    const credentials = loadCredentials();
    if (!credentials) {
        console.log(chalk.dim("Not authenticated. Run ") + chalk.cyan("npx lasso auth login") + chalk.dim(" to sign in."));
        return;
    }
    const summary = credentialSummary(credentials);
    console.log(chalk.green("✓") + ` Authenticated as ${chalk.bold(summary.userEmail || "your account")}` + (summary.userName ? ` (${summary.userName})` : ""));
    if (summary.workspaceName) console.log(chalk.dim(`Workspace: ${summary.workspaceName} (${summary.workspaceId})`));
    if (summary.masked) console.log(chalk.dim("Credential: ") + summary.masked);
    console.log(chalk.dim(`Stored at: ${path.join(os.homedir(), ".lasso", "credentials.json")}`));
});

// prettier-ignore
auth.command("logout").description("Remove the Lasso credential from this machine").action(() => {
    if (!loadCredentials()) {
        console.log(chalk.dim("Not authenticated."));
        return;
    }
    authLogout();
    console.log(chalk.green("✓") + " Signed out. Revoke the key from the dashboard if you no longer need it.");
});

// prettier-ignore
program.command("dev", { isDefault: true }).description("Start your dev server with the Lasso overlay attached").action(async () => {
    const cwd = process.cwd();
    const framework = detectFramework(cwd);

    const fileEnv = readProjectEnv(cwd);
    const existing = readProjectConfig(cwd);
    let collabConfig: CollabConfig | null = null;
    if (existing?.id) {
        collabConfig = await resolveCollabSession(cwd, fileEnv, existing.id);
    } else {
        console.log(chalk.yellow("!") + ` No ${chalk.bold(LASSO_CONFIG_FILE)} found. Run ${chalk.cyan("npx lasso init")} to enable realtime collaboration.`);
    }

    startBridge(cwd, collabConfig);

    switch (framework) {
      case "vite":
        console.log(chalk.green("✓") + " Detected: Vite");
        await startViteServer(cwd);
        break;
      case "next":
        console.log(chalk.green("✓") + " Detected: Next.js");
        await startNextServer(cwd);
        break;
      default:
        console.log(chalk.yellow("!") + " Couldn't detect a supported framework (Vite or Next.js) in this directory.");
        process.exit(1);
    }
});

program.parse();
