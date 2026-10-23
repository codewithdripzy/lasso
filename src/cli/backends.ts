/**
 * Local coding agent discovery for the Lasso CLI.
 *
 * Detects which agent CLIs are installed on THIS machine and whether they are
 * authenticated, using each agent's own structured status command (never
 * human-readable output scraping):
 *
 *   claude      → claude --version / claude auth status (JSON: loggedIn)
 *   codex       → codex --version / codex login status (exit code)
 *   opencode    → opencode --version / opencode providers list / opencode models
 *   cursor-agent→ cursor-agent -v / cursor-agent status --format json (JSON: isAuthenticated)
 *
 * Auth failures do not mark a backend as missing — it is reported with
 * fix instructions so the overlay can show why it is locked.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type LocalAgentProvider = "claude_code" | "opencode" | "codex_cli" | "cursor";

export interface DetectedBackendModel {
  /** Model option id sent by the overlay (e.g. "opencode:big-pickle") */
  id: string;
  label: string;
  /**
   * Value for backendConfig.modelId — already normalized for the agent's CLI
   * ("" means the agent's configured default).
   */
  modelId: string;
}

export interface DetectedBackend {
  provider: LocalAgentProvider;
  installed: boolean;
  authenticated: boolean;
  version?: string;
  models: DetectedBackendModel[];
  error?: string;
  fixInstructions?: string;
}

async function probe(bin: string, args: string[], timeout = 10000): Promise<{ ok: boolean; stdout: string; stderr: string; code: number | undefined; failed: boolean }> {
  try {
    const { stdout, stderr } = await execFileAsync(bin, args, { timeout, windowsHide: true });
    return { ok: true, stdout, stderr, code: 0, failed: false };
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string; code?: number; killed?: boolean };
    if (e.killed) {
      return { ok: false, stdout: e.stdout || "", stderr: "timeout", code: undefined, failed: true };
    }
    return {
      ok: false,
      stdout: e.stdout || "",
      stderr: e.stderr || String(error),
      code: typeof e.code === "number" ? e.code : undefined,
      failed: true,
    };
  }
}

function stripAnsi(text: string): string {
  return text.replace(/\u001b\[[0-9;]*m/g, "").replace(/\u001b\][^\u0007]*\u0007/g, "");
}

/** OpenCode-hosted free models are restricted to OpenCode's own product UI. */
export function isOpenCodeHeadlessRestrictedModel(modelId: string): boolean {
  const id = modelId.trim().toLowerCase();
  return id === "opencode/big-pickle" || id.endsWith("-free") || id.includes("-free-");
}

function parseJson<T = Record<string, unknown>>(stdout: string): T | null {
  const start = stdout.indexOf("{");
  if (start < 0) return null;
  try {
    return JSON.parse(stdout.slice(start)) as T;
  } catch {
    return null;
  }
}

async function detectClaudeCode(): Promise<DetectedBackend> {
  const base: DetectedBackend = {
    provider: "claude_code",
    installed: false,
    authenticated: false,
    models: [
      { id: "claude_code:sonnet", label: "Sonnet", modelId: "sonnet" },
      { id: "claude_code:opus", label: "Opus", modelId: "opus" },
      { id: "claude_code:haiku", label: "Haiku", modelId: "haiku" },
    ],
  };

  const version = await probe("claude", ["--version"]);
  if (version.failed) {
    return {
      ...base,
      error: "Claude Code CLI not found.",
      fixInstructions: "Install: npm install -g @anthropic-ai/claude-code",
    };
  }
  base.installed = true;
  base.version = version.stdout.trim().split("\n")[0];

  const auth = await probe("claude", ["auth", "status"], 15000);
  const parsed = parseJson<{ loggedIn?: boolean }>(auth.stdout);
  if (parsed && typeof parsed.loggedIn === "boolean") {
    base.authenticated = parsed.loggedIn;
    if (!parsed.loggedIn) {
      base.error = "Claude Code is not logged in.";
      base.fixInstructions = "Run 'claude' once and complete the login flow.";
    }
    return base;
  }

  // Fallback: exit code decides
  base.authenticated = auth.ok;
  if (!auth.ok) {
    base.error = "Claude Code authentication could not be verified.";
    base.fixInstructions = "Run 'claude' once and complete the login flow.";
  }
  return base;
}

async function detectOpenCode(): Promise<DetectedBackend> {
  const base: DetectedBackend = {
    provider: "opencode",
    installed: false,
    authenticated: false,
    models: [],
  };

  const version = await probe("opencode", ["--version"]);
  if (version.failed) {
    return {
      ...base,
      error: "OpenCode CLI not found.",
      fixInstructions: "Install: npm install -g opencode-ai",
    };
  }
  base.installed = true;
  base.version = version.stdout.trim().split("\n")[0];

  const providers = await probe("opencode", ["providers", "list"], 15000);
  if (providers.failed) {
    base.error = "OpenCode authentication could not be verified.";
    base.fixInstructions = "Run 'opencode providers list' and configure credentials with 'opencode auth login'.";
    return base;
  }

  const text = stripAnsi(`${providers.stdout}\n${providers.stderr}`);
  const credStart = text.indexOf("Credentials");
  const envStart = text.indexOf("Environment");
  if (credStart >= 0) {
    const section = text.slice(credStart, envStart > credStart ? envStart : undefined);
    if (!section.includes("●")) {
      base.error = "OpenCode has no stored credentials.";
      base.fixInstructions = "Run 'opencode auth login' or set a provider API key.";
      return base;
    }
  }
  base.authenticated = true;

  // Model list (may fail without breaking detection)
  const models = await probe("opencode", ["models"], 15000);
  if (models.ok) {
    const ids = models.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => /^[a-z0-9-]+\/[a-z0-9._-]+$/i.test(line))
      .filter((line) => !isOpenCodeHeadlessRestrictedModel(line))
      .slice(0, 30);
    base.models = ids.map((full) => {
      const name = full.split("/")[1];
      return {
        id: `opencode:${name}`,
        label: name,
        modelId: full,
      };
    });
  }
  if (base.models.length === 0) {
    base.models = [{ id: "opencode:claude-sonnet-4", label: "Claude Sonnet 4", modelId: "opencode/claude-sonnet-4" }];
  }
  return base;
}

async function detectCodex(): Promise<DetectedBackend> {
  const base: DetectedBackend = {
    provider: "codex_cli",
    installed: false,
    authenticated: false,
    models: [{ id: "codex_cli:default", label: "Default model (codex config)", modelId: "" }],
  };

  const version = await probe("codex", ["--version"]);
  if (version.failed) {
    return {
      ...base,
      error: "Codex CLI not found.",
      fixInstructions: "Install: npm install -g @openai/codex",
    };
  }
  base.installed = true;
  base.version = version.stdout.trim().split("\n")[0];

  const auth = await probe("codex", ["login", "status"], 15000);
  if (!auth.ok) {
    base.error = "Codex CLI is not logged in.";
    base.fixInstructions = "Run 'codex login' and sign in with ChatGPT or an API key.";
    return base;
  }
  base.authenticated = true;
  return base;
}

async function detectCursor(): Promise<DetectedBackend> {
  const base: DetectedBackend = {
    provider: "cursor",
    installed: false,
    authenticated: false,
    models: [
      { id: "cursor:sonnet-4", label: "Sonnet 4", modelId: "sonnet-4" },
      { id: "cursor:gpt-5", label: "GPT-5", modelId: "gpt-5" },
    ],
  };

  const version = await probe("cursor-agent", ["-v"]);
  if (version.failed) {
    return {
      ...base,
      error: "Cursor Agent CLI not found.",
      fixInstructions: "Install: curl https://cursor.com/install -fsS | bash",
    };
  }
  base.installed = true;
  base.version = version.stdout.trim().split("\n")[0];

  const auth = await probe("cursor-agent", ["status", "--format", "json"], 15000);
  const parsed = parseJson<{ isAuthenticated?: boolean }>(auth.stdout);
  if (parsed && typeof parsed.isAuthenticated === "boolean") {
    base.authenticated = parsed.isAuthenticated;
    if (!parsed.isAuthenticated) {
      base.error = "Cursor Agent is not authenticated.";
      base.fixInstructions = "Run 'cursor-agent login'.";
      return base;
    }
  } else if (auth.failed) {
    base.error = "Cursor Agent is not authenticated.";
    base.fixInstructions = "Run 'cursor-agent login'.";
    return base;
  } else {
    base.authenticated = true;
  }

  const models = await probe("cursor-agent", ["models"], 15000);
  if (models.ok) {
    const ids = models.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => /^[a-z0-9][a-z0-9.-]*$/i.test(line))
      .slice(0, 20);
    if (ids.length > 0) {
      base.models = ids.map((id) => ({ id: `cursor:${id}`, label: id, modelId: id }));
    }
  }
  return base;
}

/**
 * Probe all supported local agents in parallel.
 * Fault-tolerant: a missing or broken CLI never rejects the whole list.
 */
export async function detectBackends(): Promise<DetectedBackend[]> {
  return Promise.all([detectClaudeCode(), detectOpenCode(), detectCodex(), detectCursor()]);
}

/**
 * Whether a model option id belongs to a local agent (provider prefix match).
 */
export const LOCAL_MODEL_PREFIXES = ["claude_code:", "claude-code:", "opencode:", "codex:", "codex_cli:", "cursor:"];

/**
 * Extract the modelId for backendConfig from an overlay model option id.
 * Examples:
 *   "claude_code:sonnet"   → "sonnet"
 *   "opencode:big-pickle"  → "opencode/big-pickle"
 *   "codex_cli:default"    → "" (agent's configured default)
 *   "claude-3-5-sonnet"    → "claude-3-5-sonnet" (hosted ids pass through)
 */
export function modelIdForBackend(optionId: string, provider: string): string {
  if (!LOCAL_MODEL_PREFIXES.some((p) => optionId.startsWith(p)) && !["claude_code", "opencode", "codex_cli", "cursor"].includes(provider)) {
    return optionId;
  }
  const colon = optionId.indexOf(":");
  const raw = colon >= 0 ? optionId.slice(colon + 1) : optionId;

  if (provider === "opencode") {
    if (raw === "default") return "";
    return raw.includes("/") ? raw : `opencode/${raw}`;
  }
  if (provider === "codex_cli") {
    return raw === "default" ? "" : raw;
  }
  return raw;
}
