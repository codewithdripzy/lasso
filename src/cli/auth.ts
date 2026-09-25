import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import chalk from "chalk";
import open from "open";

export interface CliCredentials {
  apiKey: string;
  keyId: string;
  workspaceId: string;
  workspaceName: string;
  userName: string;
  userEmail: string;
  createdAt: string;
}

const CREDENTIALS_DIR = path.join(os.homedir(), ".lasso");
const CREDENTIALS_FILE = path.join(CREDENTIALS_DIR, "credentials.json");

/**
 * Base URL of the Lasso API (the main server, not the realtime server). The
 * `lasso auth` flow lives here because the browser confirm needs the web session.
 * Defaults to the hosted Lasso API. Set LASSO_AUTH_URL or LASSO_API_URL for
 * local development.
 */
export function serverUrlFrom(fileEnv: Record<string, string>): string {
  return (
    process.env.LASSO_AUTH_URL ||
    fileEnv.LASSO_AUTH_URL ||
    process.env.LASSO_API_URL ||
    fileEnv.LASSO_API_URL ||
    "https://api.lasso.byorello.space"
  ).replace(/\/$/, "");
}

export function fetchWithTimeout(url: string, init?: RequestInit, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

export function loadCredentials(): CliCredentials | null {
  try {
    const raw = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, "utf8")) as Partial<CliCredentials>;
    if (raw && typeof raw.apiKey === "string" && raw.apiKey) return raw as CliCredentials;
  } catch {
    // no credentials yet
  }
  return null;
}

export function saveCredentials(credentials: CliCredentials) {
  fs.mkdirSync(CREDENTIALS_DIR, { recursive: true });
  const temp = `${CREDENTIALS_FILE}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(credentials, null, 2) + "\n", { mode: 0o600 });
  fs.renameSync(temp, CREDENTIALS_FILE);
  try {
    fs.chmodSync(CREDENTIALS_FILE, 0o600);
  } catch {
    // chmod is best-effort (Windows)
  }
}

export function clearCredentials() {
  try {
    fs.unlinkSync(CREDENTIALS_FILE);
  } catch {
    // nothing to clear
  }
}

function mask(key: string) {
  return `${key.slice(0, 9)}••••${key.slice(-4)}`;
}

interface StatusResponse {
  status?: string;
  message?: string;
  apiKey?: string;
  keyId?: string;
  workspaceId?: string;
  workspaceName?: string;
  user?: { name?: string; email?: string };
}

/**
 * `lasso auth login` — device-style OAuth. The CLI asks the server for a
 * one-time code + verification URL, opens the browser, and polls the status
 * endpoint until the logged-in dashboard user authorizes. On success the
 * freshly minted API key is stored in ~/.lasso/credentials.json (0600).
 */
export async function authLogin(cwd: string, fileEnv: Record<string, string>): Promise<{ ok: boolean; error?: string }> {
  const serverUrl = serverUrlFrom(fileEnv);
  const apiUrl = `${serverUrl}/api/v1`;

  let startResponse: Response;
  try {
    startResponse = await fetchWithTimeout(`${apiUrl}/auth/cli/start`, { method: "POST" });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "request failed";
    return { ok: false, error: `Could not reach the Lasso API at ${serverUrl} (${reason}). Is the Lasso server running?` };
  }

  if (!startResponse.ok) {
    const body = (await startResponse.json().catch(() => ({}))) as { message?: string };
    return { ok: false, error: body.message || `Could not start the login flow (${startResponse.status}).` };
  }

  const started = (await startResponse.json()) as { cliId?: string; verificationUrl?: string; expiresInSeconds?: number };
  if (!started.cliId || !started.verificationUrl) {
    return { ok: false, error: "The server did not return an authorization URL." };
  }

  console.log(`\n${chalk.bold("Lasso CLI authorization")}`);
  console.log(`  Open this URL to authorize the Lasso CLI:\n`);
  console.log(`  ${chalk.cyan(started.verificationUrl)}\n`);

  let opened = false;
  if (!process.env.LASSO_NO_BROWSER) {
    opened = Boolean(await open(started.verificationUrl).catch(() => null));
  }
  if (opened) {
    console.log(chalk.dim("  Waiting for you to authorize in the browser…\n"));
  } else {
    console.log(chalk.dim("  Tip: paste the URL into your browser if it didn't open automatically.\n"));
  }

  const pollMs = 2000;
  const timeoutMs = Math.max((started.expiresInSeconds || 600) * 1000 - 5000, 10000);
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, pollMs));

    let response: Response;
    try {
      response = await fetchWithTimeout(`${apiUrl}/auth/cli/status?code=${encodeURIComponent(started.cliId)}`);
    } catch {
      continue;
    }

    if (!response.ok) continue;

    const status = (await response.json().catch(() => ({}))) as StatusResponse;
    if (status.status === "authorized" && status.apiKey) {
      const credentials: CliCredentials = {
        apiKey: status.apiKey,
        keyId: status.keyId || "",
        workspaceId: status.workspaceId || "",
        workspaceName: status.workspaceName || "",
        userName: status.user?.name || "",
        userEmail: status.user?.email || "",
        createdAt: new Date().toISOString(),
      };
      saveCredentials(credentials);

      const who = credentials.userEmail || "your account";
      console.log(chalk.green("✓") + ` Authenticated as ${chalk.bold(who)}` + (credentials.workspaceName ? ` (workspace ${chalk.cyan(credentials.workspaceName)})` : "") + ".");
      console.log(chalk.dim(`  Credential saved to ${CREDENTIALS_FILE}.`));
      return { ok: true };
    }

    if (status.status === "expired" || status.status === "error") {
      return { ok: false, error: status.message || "The authorization link expired. Run `lasso auth login` again." };
    }
  }

  return { ok: false, error: "Timed out waiting for authorization. Run `lasso auth login` again when ready." };
}

export function authStatus(): CliCredentials | null {
  return loadCredentials();
}

export function credentialSummary(credentials: CliCredentials) {
  return {
    userEmail: credentials.userEmail,
    userName: credentials.userName,
    workspaceName: credentials.workspaceName,
    workspaceId: credentials.workspaceId,
    masked: mask(credentials.apiKey),
  };
}

export function authLogout() {
  clearCredentials();
}
