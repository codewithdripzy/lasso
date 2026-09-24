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
import { startHost, waitForShutdown } from "./host/daemon";
import { hostProxyPort, hostDnsPort } from "./host/paths";
import { spawnDaemon, daemonStatus, stopDaemon, enableAutoStart, disableAutoStart, daemonPortMessage } from "./host/install";
import { listHostProjects, registerWithHost } from "./host/client";
import { loadRegistry, generateUniqueDomain, validateDomain } from "./host/registry";

const VERSION = "0.1.0";
const program = new Command();

program.name("lasso").description("Select UI in your running app, describe a change, AI edits the real source.").version(VERSION);

function projectEnv() {
    return readProjectEnv(process.cwd());
}

// prettier-ignore
program.command("init")
    .description("Register this app with your Lasso workspace, create lasso.config.json, and register a local .lasso domain with Lasso Host")
    .action(async () => {
        const cwd = process.cwd();

        const existing = readProjectConfig(cwd);
        if (existing) {
            console.log(chalk.green("✓") + ` Already initialized: ${chalk.cyan(existing.id)} (from ${existing.source}).`);
            if (existing.domain) console.log(chalk.dim(`  Local domain: ${chalk.cyan(existing.domain)}`));
            console.log(chalk.dim(`  Run ${chalk.cyan("lasso register")} to re-register the domain with Lasso Host.`));
            return;
        }

        console.log(chalk.dim("Registering the project with your Lasso workspace…"));
        const result = await initProject(cwd, projectEnv());

        if (!result.ok) {
            console.error(chalk.red("✗") + ` ${result.error}`);
            process.exit(1);
        }

        console.log("");
        console.log(chalk.green("✓") + ` Project created: ${chalk.cyan(result.projectId!)}`);
        if (result.domain) console.log(chalk.green("✓") + ` Local domain: ${chalk.cyan(result.domain)}`);
        if (result.workspaceId) console.log(chalk.green("✓") + ` Workspace: ${chalk.cyan(result.workspaceId)}`);
        console.log("")
        console.log(chalk.dim(`Created:`));
        console.log(chalk.dim(`  ${LASSO_CONFIG_FILE} — commit it so teammates share this project.`));
    });

// prettier-ignore
const daemon = program.command("daemon [action]")
    .description("Start/stop Lasso Host — the local .lasso domain server (start|status|stop|restart|install|uninstall)")
    .usage("[action]")
    .action(async (action?: string) => {
        const env = projectEnv();
        const port = hostProxyPort(env);
        const dnsPort = hostDnsPort(env);

        switch (action || "start") {
            case "start": {
                const result = await spawnDaemon(env);
                if (!result.ok) {
                    if (result.error) console.error(chalk.red("✗") + ` ${result.error}`);
                    process.exitCode = 1;
                    return;
                }
                if (result.alreadyRunning) {
                    console.log(chalk.dim("Lasso Host is already running."));
                    const { projects } = await listHostProjects(port);
                    for (const project of projects) {
                        console.log(chalk.green("✓") + ` ${chalk.cyan(project.domain)}`);
                    }
                    return;
                }
                console.log(chalk.green("✓") + " Lasso Host started" + (result.pid ? ` (pid ${result.pid})` : "") + ".");
                console.log(chalk.dim(`  Projects become available at ${chalk.cyan(`${daemonPortMessage(env)}`)} once you run ${chalk.cyan("lasso init")} in them.`));
                console.log(chalk.dim(`  DNS listener: 127.0.0.1:${dnsPort} · Log: ~/.lasso/host/daemon.log`));
                return;
            }
            case "status": {
                const report = await daemonStatus(env);
                console.log("");
                console.log(chalk.bold("Lasso Host"));
                console.log(chalk.dim(`  Status: ${report.running ? chalk.green("running") + (report.pid ? ` (pid ${report.pid})` : "") : chalk.red("not running")}`));
                console.log(chalk.dim(`  Proxy port: ${hostProxyPort(env)}`));
                console.log(chalk.dim(`  DNS port: ${hostDnsPort(env)}`));
                console.log(chalk.dim(`  Domain resolution: ${report.resolver.installed ? chalk.green("configured") : chalk.yellow("not configured")} — ${report.resolver.detail}`));
                console.log(chalk.dim(`  Automatic startup: ${report.autoStart ? chalk.green("enabled (LaunchAgent)") : chalk.yellow("disabled")}`));
                if (report.running && report.health) {
                    console.log(chalk.dim(`  Registered projects: ${report.health.registered ?? 0}`));
                    console.log(chalk.dim(`  Running now: ${report.health.running ?? 0}`));
                }
                return;
            }
            case "stop": {
                const result = await stopDaemon(env);
                if (result.error) {
                    console.error(chalk.red("✗") + ` ${result.error}`);
                    process.exitCode = 1;
                    return;
                }
                console.log(chalk.green("✓") + " Lasso Host stopped.");
                return;
            }
            case "restart": {
                await stopDaemon(env);
                const result = await spawnDaemon(env);
                if (!result.ok) {
                    if (result.error) console.error(chalk.red("✗") + ` ${result.error}`);
                    process.exitCode = 1;
                    return;
                }
                console.log(chalk.green("✓") + " Lasso Host restarted.");
                return;
            }
            case "install": {
                console.log(chalk.dim("Installing Lasso Host…"));

                const enabled = await enableAutoStart();
                if (enabled.error) console.error(chalk.yellow("!") + ` ${enabled.error}`);
                else console.log(chalk.green("✓") + " Automatic startup configured (LaunchAgent).");

                const resolverResult = await createResolverInstall(dnsPort);
                if (resolverResult.ok) console.log(chalk.green("✓") + ` Domain resolution: ${resolverResult.message}`);
                else console.log(chalk.yellow("!") + ` Domain resolution: ${resolverResult.message}`);

                const spawned = await spawnDaemon(env);
                if (spawned.ok) {
                    console.log(chalk.green("✓") + (spawned.alreadyRunning ? " Lasso Host already running." : " Lasso Host started."));
                } else if (spawned.error) {
                    console.error(chalk.yellow("!") + ` ${spawned.error}`);
                }

                console.log(chalk.dim(`  ${daemonPortMessage(env)} — run ${chalk.cyan("lasso init")} in a project to get a domain.`));
                return;
            }
            case "uninstall": {
                const disabled = await disableAutoStart();
                if (disabled.error) console.error(chalk.yellow("!") + ` ${disabled.error}`);
                else console.log(chalk.green("✓") + " Automatic startup disabled.");

                const stopped = await stopDaemon(env);
                if (stopped.error) console.error(chalk.yellow("!") + ` ${stopped.error}`);
                else console.log(chalk.green("✓") + " Lasso Host stopped.");

                const resolverResult = await createResolverUninstall();
                if (resolverResult.ok) console.log(chalk.green("✓") + ` Domain resolution: ${resolverResult.message}`);
                else console.log(chalk.yellow("!") + ` Domain resolution: ${resolverResult.message}`);
                return;
            }
            default:
                console.error(chalk.red("✗") + ` Unknown daemon action "${action}". Try: start | status | stop | restart | install | uninstall`);
                process.exitCode = 1;
        }
    });

// prettier-ignore
program.command("_host", { hidden: true })
    .description("Run Lasso Host in the foreground (internal)")
    .action(async () => {
        const env = projectEnv();
        const result = await startHost({ proxyPort: hostProxyPort(env), dnsPort: hostDnsPort(env), version: VERSION });
        if (result.error) {
            console.error(chalk.red("✗") + ` ${result.error}`);
            process.exit(1);
        }
        waitForShutdown();
    });

function createResolverInstall(dnsPort: number) {
    // Lazy import to keep the daemon command light.
    return import("./host/dns.js").then(({ createDomainResolver }) => createDomainResolver().install(dnsPort));
}

function createResolverUninstall() {
    return import("./host/dns.js").then(({ createDomainResolver }) => createDomainResolver().uninstall(0));
}

// prettier-ignore
program.command("projects")
    .description("List projects registered with Lasso Host and their running state")
    .action(async () => {
        const port = hostProxyPort(projectEnv());
        const { health, projects } = await listHostProjects(port);

        if (projects.length === 0) {
            console.log(chalk.dim("No projects registered with Lasso Host yet. Run ") + chalk.cyan("lasso init") + chalk.dim(" in a project to register one."));
            return;
        }

        console.log("");
        console.log(chalk.bold("Lasso Projects") + (health ? "" : chalk.dim("  (Lasso Host is not running)")));
        for (const project of projects) {
            const marker = project.status === "running" ? chalk.green("●") : chalk.gray("○");
            console.log(` ${marker} ${chalk.cyan(project.domain)}`);
            console.log(chalk.dim(`   ${project.directory}`));
            const detail = project.status === "running" && project.port ? `Running · ${project.port}${project.pid ? ` (pid ${project.pid})` : ""}` : "Stopped";
            console.log(`   ${project.status === "running" ? chalk.green(detail) : chalk.gray(detail)}`);
        }
        if (!health) {
            console.log("");
            console.log(chalk.dim(`  Start it with ${chalk.cyan("lasso daemon")}.`));
        }
    });

// prettier-ignore
program.command("register [domain]")
    .description("Register the current project under a local .lasso domain with Lasso Host (uses lasso.config.json or generates one)")
    .action(async (domainArg?: string) => {
        const cwd = process.cwd();
        const env = projectEnv();
        const port = hostProxyPort(env);

        const config = readProjectConfig(cwd);
        const projectId = config?.id || "";

        let domain = (domainArg || "").trim().toLowerCase();
        if (domain && !validateDomain(domain)) {
            console.error(chalk.red("✗") + ` "${domain}" is not a valid .lasso domain (lowercase letters, numbers, and hyphens).`);
            process.exit(1);
        }

        if (!domain) {
            if (config?.domain) {
                domain = config.domain;
            } else {
                domain = generateUniqueDomain(cwd, loadRegistry());
            }
        }

        const result = await registerWithHost(domain, cwd, projectId, port);
        if (!result.ok) {
            console.error(chalk.red("✗") + ` ${result.error}`);
            process.exit(1);
        }

        if (config && config.domain && config.domain !== domain) {
            console.log(chalk.dim("Changed domain:"));
            console.log(chalk.dim(`  Removed: ${config.domain}`));
            console.log(chalk.green(`  Registered: ${chalk.cyan(domain)} → ${chalk.dim(cwd)}`));
            const updated = { id: config.id, domain };
            require("node:fs").writeFileSync(path.join(cwd, LASSO_CONFIG_FILE), JSON.stringify(updated, null, 2) + "\n");
            console.log(chalk.dim(`  Updated ${LASSO_CONFIG_FILE}.`));
        } else {
            console.log(chalk.green("✓") + ` Registered ${chalk.cyan(domain)}`);
            console.log(chalk.green("✓") + ` Points to ${chalk.dim(cwd)}`);
            if (config && !config.domain) {
                require("node:fs").writeFileSync(path.join(cwd, LASSO_CONFIG_FILE), JSON.stringify({ id: config.id, domain }, null, 2) + "\n");
                console.log(chalk.dim(`  Added domain to ${LASSO_CONFIG_FILE}.`));
            }
        }
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