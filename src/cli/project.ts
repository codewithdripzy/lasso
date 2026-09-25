import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import chalk from "chalk";
import { detectFramework } from "./utils/framework";
import { loadCredentials, fetchWithTimeout } from "./auth";
import { loadRegistry, findByDirectory, generateUniqueDomain } from "./host/registry";
import { registerWithHost } from "./host/client";
import { hostProxyPort } from "./host/paths";
import { ensureNextAllowedDevOrigin } from "./next-config";

const execFileAsync = promisify(execFile);

export const LASSO_CONFIG_FILE = "lasso.config.json";
const PROJECT_STATE_FILE = ".lasso-project.json";

export interface CollabConfig {
    projectId: string;
    name: string;
    version?: string;
    realtimeUrl: string;
    apiUrl: string;
    registered: boolean;
    registeredAt?: string;
    claimed: boolean;
    workspaceId?: string;
    token?: string;
    apiKey?: string;
}

export interface InitResult {
    ok: boolean;
    error?: string;
    projectId?: string;
    workspaceId?: string;
    name?: string;
    domain?: string;
}

export function readEnvFile(filename: string, cwd: string): Record<string, string> {
    try {
        return fs.readFileSync(path.join(cwd, filename), "utf8").split(/\r?\n/).reduce<Record<string, string>>((values, line) => {
            const match = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
            if (match) {
                let value = match[2].trim();
                if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
                values[match[1]] = value.trim();
            }
            return values;
        }, {});
    } catch {
        return {};
    }
}

/** Reads .env / .env.local / .env.production from the project and common sub-roots. */
export function readProjectEnv(cwd: string): Record<string, string> {
    const envRoots = [cwd, path.join(cwd, "web"), path.join(cwd, "server")];
    return envRoots.reduce<Record<string, string>>((values, root) => ({
        ...values,
        ...readEnvFile(".env", root),
        ...readEnvFile(".env.local", root),
        ...readEnvFile(".env.production", root),
    }), {});
}

function readJson(filePath: string): Record<string, unknown> | null {
    try {
        return JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<string, unknown>;
    } catch {
        return null;
    }
}

function envFrom(fileEnv: Record<string, string>) {
    const all = { ...process.env, ...fileEnv };
    return all[`REALTIME_URL`] || all[`LASSO_REALTIME_URL`] || all[`NEXT_PUBLIC_REALTIME_URL`] || all[`API_URL`] || "";
}

function realtimeUrlFrom(fileEnv: Record<string, string>): string {
    const fromEnv = envFrom(fileEnv);
    if (fromEnv) return fromEnv;
    const all = { ...process.env, ...fileEnv };
    // If a local port override is explicitly set, prefer localhost.
    if (all[`COLLAB_PORT`] || all[`REALTIME_PORT`]) {
        const port = all[`COLLAB_PORT`] || all[`REALTIME_PORT`];
        return `http://localhost:${port}`;
    }
    // Default to the hosted collab server; fall back to local dev server.
    return `https://collab.lasso.byorello.space`;
}

/**
 * The Lasso API key (`lss_live_…`) is the CLI credential. Lookup order:
 * the environment (`LASSO_API_KEY` + `.env` files) first, then the credential
 * stored by `lasso auth login`. It is NEVER written to lasso.config.json.
 */
export function resolveLassoApiKey(fileEnv: Record<string, string>): string {
  const fromEnv = (process.env.LASSO_API_KEY || fileEnv.LASSO_API_KEY || "").trim();
  if (fromEnv) return fromEnv;
  const stored = loadCredentials();
  return stored?.apiKey || "";
}

function parseAuthor(author: unknown): string {
    if (typeof author === "string") return author;
    if (author && typeof author === "object") {
        const parts = [(author as { name?: string }).name, (author as { email?: string }).email].filter(Boolean);
        return parts.join(" ");
    }
    return "";
}

function parseRepository(repository: unknown): string {
    if (typeof repository === "string") return repository;
    if (repository && typeof repository === "object") {
        const url = (repository as { url?: string }).url;
        if (url) return url.replace(/^git\+/, "");
    }
    return "";
}

function dependencyNames(pkg: Record<string, unknown>): string[] {
    const names: string[] = [];
    for (const section of ["dependencies", "devDependencies", "peerDependencies"]) {
        const map = pkg[section];
        if (map && typeof map === "object") names.push(...Object.keys(map as Record<string, unknown>));
    }
    return names.slice(0, 80);
}

async function detectGitRemote(cwd: string): Promise<string> {
    try {
        const result = await execFileAsync("git", ["remote", "get-url", "origin"], { cwd, maxBuffer: 1024 * 1024 });
        return result.stdout.trim();
    } catch {
        return "";
    }
}

/**
 * The project identity that makes collaboration work. `lasso init` writes it;
 * `lasso dev` reads it and validates it server-side against the API key's workspace.
 * `domain` (the local `.lasso` Host domain) is optional and local-only.
 */
export function readProjectConfig(cwd: string): { id: string; source: string; domain?: string } | null {
    const direct = readJson(path.join(cwd, LASSO_CONFIG_FILE));
    const directId = direct && typeof direct.id === "string" ? direct.id.trim() : "";
    if (directId) {
        const domain = direct && typeof direct.domain === "string" ? direct.domain.trim() : undefined;
        return { id: directId, source: LASSO_CONFIG_FILE, domain: domain || undefined };
    }

    // Transitional: honor the legacy state file until a fresh `lasso init` is run.
    const legacy = readJson(path.join(cwd, PROJECT_STATE_FILE));
    const legacyId = legacy && typeof legacy.projectId === "string" ? legacy.projectId.trim() : "";
    if (legacyId) return { id: legacyId, source: PROJECT_STATE_FILE };

    return null;
}

interface ProjectMetadata {
    name: string;
    version: string;
    gitRemote: string;
    payload: Record<string, unknown>;
}

async function buildProjectMetadata(cwd: string, framework: string): Promise<ProjectMetadata> {
    const pkg = readJson(path.join(cwd, "package.json")) || {};
    const name = typeof pkg.name === "string" && pkg.name ? pkg.name : path.basename(cwd) || "untitled";
    const version = typeof pkg.version === "string" ? pkg.version : "";
    const gitRemote = (typeof pkg.repository === "string" ? pkg.repository : parseRepository(pkg.repository)) || (await detectGitRemote(cwd));

    const payload = {
        name,
        version,
        description: typeof pkg.description === "string" ? pkg.description : "",
        framework,
        gitRemote,
        repository: gitRemote,
        author: parseAuthor(pkg.author),
        homepage: typeof pkg.homepage === "string" ? pkg.homepage : "",
        keywords: Array.isArray(pkg.keywords) ? (pkg.keywords as string[]).slice(0, 40) : [],
        packageInfo: {
            name,
            version,
            description: typeof pkg.description === "string" ? pkg.description : "",
            license: typeof pkg.license === "string" ? pkg.license : "",
            type: typeof pkg.type === "string" ? pkg.type : "",
            dependencies: dependencyNames(pkg),
        },
    };

    return { name, version, gitRemote, payload };
}

function promptForApiKey(): Promise<string | null> {
    return new Promise((resolve) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.question(`No Lasso key found. Run ${chalk.cyan("npx @lasso-ai/cli auth login")} to sign in, or paste an API key (create one in the dashboard: ${chalk.cyan("lss_live_…")}): `, (answer) => {
            rl.close();
            resolve(answer.trim() || null);
        });
    });
}

/**
 * `lasso init` — creates (or re-registers) the project in the API key's workspace,
 * writes `lasso.config.json` with the project id and its local `.lasso` Host domain,
 * and registers the domain with Lasso Host (or the local registry if Host isn't
 * running). Only `{ "id": "proj_…", "domain": "….lasso" }` is stored — the API key
 * never touches this file.
 */
export async function initProject(cwd: string, fileEnv: Record<string, string>): Promise<InitResult> {
    const realtimeUrl = realtimeUrlFrom(fileEnv).replace(/\/$/, "");
    const apiUrl = `${realtimeUrl}/api/v1`;

    const framework = detectFramework(cwd);
    const { name, payload } = await buildProjectMetadata(cwd, framework);

    let apiKey = resolveLassoApiKey(fileEnv);
    if (!apiKey) apiKey = (await promptForApiKey()) || "";

    if (!apiKey) {
        return { ok: false, error: "No Lasso API key found. Set LASSO_API_KEY in your environment or paste it when prompted." };
    }

    try {
        const response = await fetchWithTimeout(`${apiUrl}/collab/projects/register`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(payload),
        });

        const body = (await response.json().catch(() => ({}))) as {
            message?: string;
            project?: { id?: string; name?: string; workspaceId?: string };
        };

        if (!response.ok) {
            if (response.status === 401) {
                return { ok: false, error: "Your Lasso API key is invalid or inactive. Create or reactivate one in the dashboard." };
            }
            if (response.status === 403) {
                return { ok: false, error: "Your API key does not have access to a Lasso workspace." };
            }
            return { ok: false, error: body.message || `Project registration failed (${response.status}).` };
        }

        const projectId = body.project?.id;
        if (!projectId) {
            return { ok: false, error: "The server did not return a project id." };
        }

        const registry = loadRegistry();
        const existing = findByDirectory(registry, cwd);
        const domain = existing ? existing.domain : generateUniqueDomain(cwd, registry);
        await registerWithHost(domain, cwd, projectId, hostProxyPort(fileEnv));

        if (framework === "next") {
            const injected = ensureNextAllowedDevOrigin(cwd, domain);
            if (!injected.ok) console.warn(chalk.yellow("!") + ` Could not add ${domain} to Next.js allowedDevOrigins: ${injected.reason}`);
            else if (injected.changed) console.log(chalk.green("✓") + ` Added ${chalk.cyan(domain)} to ${path.basename(injected.file!)}`);
        }

        fs.writeFileSync(path.join(cwd, LASSO_CONFIG_FILE), JSON.stringify({ id: projectId, domain }, null, 2) + "\n");

        return {
            ok: true,
            projectId,
            workspaceId: body.project?.workspaceId,
            name: body.project?.name || name,
            domain,
        };
    } catch (error) {
        const reason = error instanceof Error ? error.message : "request failed";
        return { ok: false, error: `Could not reach the Lasso realtime server at ${realtimeUrl} (${reason}). Is it running?` };
    }
}

/**
 * `lasso dev` — consumes `lasso.config.json`: authenticates with the API key, lets the
 * server resolve the key's workspace, validates the project belongs to it, and
 * authenticates the project session. Returns null-enabled CollabConfig so realtime is
 * safely degraded (no collaboration, local editing unaffected) on any failure.
 */
export async function resolveCollabSession(cwd: string, fileEnv: Record<string, string>, projectId: string): Promise<CollabConfig> {
    const realtimeUrl = realtimeUrlFrom(fileEnv).replace(/\/$/, "");
    const apiUrl = `${realtimeUrl}/api/v1`;

    const config: CollabConfig = {
        projectId,
        name: "",
        version: "",
        realtimeUrl,
        apiUrl,
        registered: false,
        claimed: false,
    };

    const apiKey = resolveLassoApiKey(fileEnv);
    if (!apiKey) {
        console.warn(chalk.yellow("!") + " No Lasso credential found. Run " + chalk.cyan("npx @lasso-ai/cli auth login") + " (or set LASSO_API_KEY) to enable realtime collaboration." );
        return config;
    }

    try {
        const response = await fetchWithTimeout(`${apiUrl}/collab/projects/${encodeURIComponent(projectId)}/session`, {
            method: "POST",
            headers: { authorization: `Bearer ${apiKey}` },
        });

        if (!response.ok) {
            const reason =
                response.status === 401
                    ? "Your Lasso API key is invalid or inactive."
                    : response.status === 403
                        ? "This project belongs to another workspace."
                        : `The server rejected the project session (${response.status}).`;
            console.warn(chalk.yellow("!") + ` Realtime collaboration unavailable: ${reason}`);
            return config;
        }

        const body = (await response.json()) as {
            project?: { id?: string; name?: string; version?: string; workspaceId?: string };
            session?: { id?: string };
            token?: string;
        };

        config.name = body.project?.name || "";
        config.version = body.project?.version || "";
        config.workspaceId = body.project?.workspaceId || "";
        config.token = body.token || "";
        config.apiKey = apiKey;
        config.registered = true;
        config.claimed = Boolean(body.session?.id);
        config.registeredAt = new Date().toISOString();

        console.log(
            chalk.green("✓") +
            " Project session opened " +
            chalk.cyan(config.name || projectId) +
            `${config.workspaceId ? ` · workspace ${config.workspaceId}` : ""}`
        );

        return config;
    } catch (error) {
        const reason = error instanceof Error ? error.message : "request failed";
        console.warn(chalk.yellow("!") + ` Realtime collaboration unavailable: cannot reach ${realtimeUrl} (${reason}).`);
        return config;
    }
}
