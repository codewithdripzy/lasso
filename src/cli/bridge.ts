// src/cli/bridge.ts
import { WebSocketServer, type WebSocket } from "ws";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import chalk from "chalk";
import { answerQuestion, detectLocalAgents, proposeChanges, generateCommitMessage, respondToAgentPrompt, type AgentConfig, type SourceChange, type LocalAgent, type AgentPrompt } from "./agent";
import type { CollabConfig } from "./project";
import { resolveLassoApiKey } from "./project";
import { serverUrlFrom, loadCredentials } from "./auth";

export const DEFAULT_BRIDGE_PORT = 3056;
const execFileAsync = promisify(execFile);
type GitState = { isRepo: boolean; branch?: string; status?: string[]; hasChanges?: boolean; hasRemote?: boolean; remote?: string };

export type BridgeMessage =
  | { type: "hello"; from: "overlay" | "cli" }
  | { type: "edit"; taskId: string; instruction: string; model: string; provider?: "anthropic" | "openai" | "google" | "ollama" | "nvidia" | "cli"; messages?: Array<{ role: string; content: string; createdAt?: string }>; changesHistory?: Array<{ summary: string; changes: SourceChange[]; createdAt?: string }>; context?: { selectionId?: string; position?: Record<string, number>; viewport?: Record<string, unknown>; styles?: Record<string, string>; attributes?: Record<string, string>; runtimeErrors?: string[]; screenshots?: { full?: string; element?: string } }; element: { tag: string; group: string; label: string; html?: string; sourceHint?: string } }
  | { type: "ask"; taskId: string; question: string; model: string; provider?: "anthropic" | "openai" | "google" | "ollama" | "nvidia" | "cli"; messages?: Array<{ role: string; content: string; createdAt?: string }>; context?: { selectionId?: string; position?: Record<string, number>; viewport?: Record<string, unknown>; styles?: Record<string, string>; attributes?: Record<string, string>; runtimeErrors?: string[]; screenshots?: { full?: string; element?: string } }; element: { tag: string; group: string; label: string; html?: string; sourceHint?: string } }
  | { type: "runtime_error"; selectionId?: string; details: string }
  | { type: "apply"; taskId: string; changes: SourceChange[] }
  | { type: "undo"; taskId?: string }
  | { type: "stop"; taskId?: string }
  | { type: "agent_prompt_response"; taskId: string; response: string }
  | { type: "list_page_folders"; path?: string }
  | { type: "create_page"; folder: string; fileName: string; content: string }
  | { type: "create_page_folder"; parent: string; name: string }
  | { type: "git_status" }
  | { type: "git_generate_message"; model: string; provider?: "anthropic" | "openai" | "google" | "ollama" | "nvidia" | "cli" }
  | { type: "git_init" }
  | { type: "git_commit"; message: string }
  | { type: "git_push" }
  | { type: "agent_status"; taskId?: string; status: "thinking" | "working" | "review" | "error" | "stopped"; message: string }
  | { type: "transcribe"; requestId: string; audio: string; mimeType?: string; language?: string }
  | { type: "oneshot"; prompt: string; scope?: "project" | "component"; model?: string; provider?: "anthropic" | "openai" | "google" | "ollama" | "nvidia" | "cli"; messages?: Array<{ role: "user" | "assistant"; content: string }>; taskId?: string; pageContext?: any };

type ModelOption = { id: string; label: string; provider: "anthropic" | "openai" | "google" | "ollama" | "nvidia" | "cli" };
type PageEntry = { name: string; path: string; type: "directory" | "file" };

export type ServerBridgeMessage =
  | { type: "config"; apiKeyConfigured: boolean; agentConfigured: boolean; models: ModelOption[]; collab?: CollabConfig | null; user?: { name?: string; email?: string } | null }
  | { type: "git_state"; git: GitState }
  | { type: "git_result"; message?: string; error?: string }
  | { type: "git_progress"; message: string }
  | { type: "git_commit_message"; message?: string; error?: string }
  | { type: "agent_status"; taskId?: string; status: "thinking" | "working" | "review" | "error" | "stopped"; message: string; detail?: string; changes?: SourceChange[]; thinking?: Array<{ title: string; detail?: string; durationMs?: number }>; totalThinkingTimeMs?: number }
  | { type: "agent_prompt"; taskId: string; prompt: AgentPrompt }
  | { type: "page_folders"; path: string; entries: PageEntry[]; project?: string; error?: string }
  | { type: "page_created"; path: string; error?: string }
  | { type: "page_folder_created"; path: string; error?: string }
  | { type: "assistant_message"; taskId?: string; message: string }
  | { type: "applied"; taskId?: string; message: string }
  | { type: "undone"; taskId?: string; message: string }
  | { type: "transcribe_result"; requestId: string; success: boolean; text?: string; provider?: string; error?: string };

export async function restartBridge(port = DEFAULT_BRIDGE_PORT): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/__lasso/bridge/restart`, { method: "POST" });
    const body = await response.json().catch(() => ({})) as { ok?: boolean; error?: string };
    if (!response.ok || !body.ok) return { ok: false, error: body.error || "The bridge rejected the restart request." };
    return { ok: true };
  } catch {
    return { ok: false, error: `No Lasso bridge is listening on 127.0.0.1:${port}. Start your project with ${chalk.cyan("lasso dev")} first.` };
  }
}

async function gitCommand(cwd: string, args: string[]) {
  const result = await execFileAsync("git", args, { cwd, maxBuffer: 1024 * 1024 });
  return result.stdout.trim();
}

async function getGitState(cwd: string): Promise<GitState> {
  try {
    await gitCommand(cwd, ["rev-parse", "--is-inside-work-tree"]);
  } catch {
    return { isRepo: false };
  }
  const status = (await gitCommand(cwd, ["status", "--short"])).split("\n").filter(Boolean);
  const branch = await gitCommand(cwd, ["branch", "--show-current"]).catch(() => "");
  const remote = await gitCommand(cwd, ["remote", "get-url", "origin"]).catch(() => "");
  return { isRepo: true, branch, status, hasChanges: status.length > 0, hasRemote: Boolean(remote), remote };
}

function fileLineEnding(content: string): "\n" | "\r\n" {
  return content.includes("\r\n") ? "\r\n" : "\n";
}

function withLineEnding(value: string, lineEnding: "\n" | "\r\n") {
  return value.replace(/\r\n?|\n/g, lineEnding);
}

function resolveProposedFile(cwd: string, proposedPath: string, allowNew = false): string {
  const root = path.resolve(cwd);
  const candidate = path.resolve(root, proposedPath);
  if (candidate.startsWith(`${root}${path.sep}`) && fs.existsSync(candidate)) return candidate;

  // Some React/Next source maps contain an absolute path from an older
  // checkout. Rebase only the recognizable src/... suffix into this project.
  const normalized = proposedPath.replace(/\\/g, "/");
  const srcIndex = normalized.lastIndexOf("/src/");
  if (srcIndex >= 0) {
    const rebased = path.join(root, normalized.slice(srcIndex + 1));
    if (rebased.startsWith(`${root}${path.sep}`) && fs.existsSync(rebased)) return rebased;
    if (allowNew && (rebased.startsWith(`${root}${path.sep}`) || rebased === root)) return rebased;
  }

  if (candidate.startsWith(`${root}${path.sep}`) || candidate === root) {
    if (allowNew) return candidate;
    throw new Error(`Could not find the proposed file in the current project: ${proposedPath}`);
  }

  throw new Error(`The proposed file is outside the current project: ${proposedPath}`);
}

function occurrenceCount(content: string, needle: string) {
  if (!needle) return 0;
  let count = 0;
  let from = 0;
  while (true) {
    const index = content.indexOf(needle, from);
    if (index < 0) return count;
    count += 1;
    from = index + needle.length;
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function whitespaceEquivalentRange(content: string, oldString: string) {
  const trimmed = oldString.trim();
  if (!trimmed) return null;
  const pattern = trimmed.split(/\s+/).map(escapeRegExp).join("\\s+");
  const matches = Array.from(content.matchAll(new RegExp(pattern, "g")));
  if (matches.length !== 1 || matches[0].index === undefined) return null;
  const start = matches[0].index;
  return { start, end: start + matches[0][0].length };
}

function prepareChange(content: string, change: SourceChange) {
  const lineEnding = fileLineEnding(content);
  const oldString = withLineEnding(change.oldString, lineEnding);
  const newString = withLineEnding(change.newString, lineEnding);
  const matches = occurrenceCount(content, oldString);
  if (matches === 0) {
    const range = whitespaceEquivalentRange(content, oldString);
    if (range) return { ...range, oldString: content.slice(range.start, range.end), newString };
    throw new Error(`Could not safely apply ${change.filePath}. The source changed after the suggestion was generated. Regenerate the review so it uses the current source.`);
  }
  if (matches > 1) {
    throw new Error(`Could not safely apply ${change.filePath}. The selected code is not unique (${matches} matches).`);
  }
  const start = content.indexOf(oldString);
  return { start, end: start + oldString.length, oldString, newString };
}

function proposalMatchesCurrentSource(cwd: string, changes: SourceChange[]): boolean {
  try {
    for (const change of changes) {
      if (!change.oldString) continue;
      const filePath = resolveProposedFile(cwd, change.filePath);
      const content = fs.readFileSync(filePath, "utf8");
      // Try exact match first
      try {
        prepareChange(content, change);
      } catch {
        // If exact match fails, try with normalized whitespace
        const normalizedContent = content.replace(/\s+/g, " ").trim();
        const normalizedOldString = change.oldString.replace(/\s+/g, " ").trim();
        const normalizedNewString = change.newString.replace(/\s+/g, " ").trim();
        if (!normalizedContent.includes(normalizedOldString)) {
          throw new Error("Source content does not match proposed change (even with normalized whitespace)");
        }
      }
    }
    return true;
  } catch {
    return false;
  }
}

function readEnvFile(cwd: string, filename: string) {
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

export function startBridge(cwd = process.cwd(), collabConfig: CollabConfig | null = null, bridgePort = DEFAULT_BRIDGE_PORT) {
  const bridgeServer = http.createServer(); // dedicated, empty HTTP server
  const wss = new WebSocketServer({ server: bridgeServer });
  let overlaySocket: WebSocket | null = null;
  const taskSnapshots = new Map<string, Array<{ filePath: string; content: string | null }>>();
  const editRequests = new Map<string, Extract<BridgeMessage, { type: "edit" }>>();
  const editConfigs = new Map<string, AgentConfig>();
  const reviewRefreshAttempts = new Map<string, number>();
  const envRoots = [cwd, path.join(cwd, "web"), path.join(cwd, "server")];
  const fileEnv = envRoots.reduce<Record<string, string>>((values, root) => ({
    ...values,
    ...readEnvFile(root, ".env"),
    ...readEnvFile(root, ".env.local"),
    ...readEnvFile(root, ".env.production"),
  }), {});
  const resolvedLassoKey =
    resolveLassoApiKey(fileEnv) ||
    process.env.LASSO_API_KEY ||
    fileEnv.LASSO_API_KEY ||
    process.env.VITE_LASSO_API_KEY ||
    process.env.NEXT_LASSO_API_KEY ||
    fileEnv.VITE_LASSO_API_KEY ||
    fileEnv.NEXT_LASSO_API_KEY ||
    "";
  const lassoKeyConfigured = Boolean(resolvedLassoKey);
  const localProviderKeys: Record<string, string | undefined> = {
    google: process.env.GOOGLE_GENERATIVE_AI_API_KEY || fileEnv.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || fileEnv.GEMINI_API_KEY,
    openai: process.env.OPENAI_API_KEY || fileEnv.OPENAI_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY || fileEnv.ANTHROPIC_API_KEY,
    nvidia: process.env.NVIDIA_API_KEY || fileEnv.NVIDIA_API_KEY,
    ollama: process.env.OLLAMA_BASE_URL || fileEnv.OLLAMA_BASE_URL || process.env.OLLAMA_MODEL || fileEnv.OLLAMA_MODEL ? "ollama" : undefined,
  };
  let agentConfig: AgentConfig | null = (() => {
    const provider = (process.env.LASSO_AGENT_PROVIDER || fileEnv.LASSO_AGENT_PROVIDER || process.env.AI_PROVIDER || fileEnv.AI_PROVIDER || "").toLowerCase();
    const selectedProvider = provider === "google" || provider === "gemini" ? "google" : provider === "openai" ? "openai" : provider === "ollama" ? "ollama" : provider === "anthropic" ? "anthropic" : provider === "nvidia" ? "nvidia" : localProviderKeys.ollama ? "ollama" : localProviderKeys.nvidia ? "nvidia" : localProviderKeys.google ? "google" : localProviderKeys.openai ? "openai" : localProviderKeys.anthropic ? "anthropic" : "google";
    const apiKey = selectedProvider === "ollama" ? "ollama" : localProviderKeys[selectedProvider];
    if (!apiKey && !lassoKeyConfigured) return null;
    return {
      provider: selectedProvider as AgentConfig["provider"],
      apiKey: apiKey || resolvedLassoKey,
      model: process.env.LASSO_AGENT_MODEL || fileEnv.LASSO_AGENT_MODEL || process.env.AI_MODEL || fileEnv.AI_MODEL,
      baseUrl: selectedProvider === "nvidia" ? "https://integrate.api.nvidia.com/v1" : process.env.OLLAMA_BASE_URL || fileEnv.OLLAMA_BASE_URL ? `${(process.env.OLLAMA_BASE_URL || fileEnv.OLLAMA_BASE_URL || "http://localhost:11434/api").replace(/\/api\/?$/, "")}/v1` : undefined,
    };
  })();
  let activeAgentController: AbortController | null = null;
  const taskControllers = new Map<string, AbortController>();
  let localAgents = new Set<LocalAgent>();

  const pageIgnoredDirs = new Set(["node_modules", ".git", ".next", "dist", "build", ".turbo", "out", "coverage", ".vercel", ".cache"]);

  const resolveInsideProject = (root: string, relative: string): string | null => {
    const target = path.resolve(root, relative && relative !== "." ? relative : "");
    return target === root || target.startsWith(`${root}${path.sep}`) ? target : null;
  };

  // Directories are returned first so the overlay can render an explorer-style
  // tree that mirrors how VS Code orders folders above files.
  const pageEntries = (root: string, relative: string): PageEntry[] => {
    const directory = resolveInsideProject(root, relative);
    if (!directory) return [];
    let entries: PageEntry[] = [];
    try {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (entry.name.startsWith(".") || (entry.isDirectory() && pageIgnoredDirs.has(entry.name))) continue;
        entries.push({
          name: entry.name,
          path: relative && relative !== "." ? path.join(relative, entry.name) : entry.name,
          type: entry.isDirectory() ? "directory" : "file",
        });
      }
    } catch {
      // Folders that cannot be read are treated as empty.
    }
    return entries.sort((a, b) =>
      a.type === b.type ? a.name.localeCompare(b.name) : a.type === "directory" ? -1 : 1
    );
  };

  bridgeServer.on("request", (req, res) => {
    if (req.method !== "POST" || req.url?.split("?", 1)[0] !== "/__lasso/bridge/restart") return;

    activeAgentController?.abort();
    for (const controller of taskControllers.values()) controller.abort();
    taskControllers.clear();
    activeAgentController = null;
    for (const socket of wss.clients) socket.close(1000, "Bridge restarted by the CLI");

    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });

  async function localModels() {
    const base = process.env.OLLAMA_BASE_URL || fileEnv.OLLAMA_BASE_URL || "http://localhost:11434/api";
    try {
      const response = await fetch(`${base.replace(/\/$/, "")}/tags`);
      if (!response.ok) return [];
      const payload = await response.json() as { models?: Array<{ name?: string }> };
      return (payload.models || []).filter((model) => model.name).map((model) => ({ id: model.name!, label: `${model.name} · Local`, provider: "ollama" as const }));
    } catch {
      return [];
    }
  }

  async function openCodeModels() {
    if (!localAgents.has("opencode")) return [];
    try {
      const result = await execFileAsync("opencode", ["models"], { maxBuffer: 1024 * 1024 });
      return result.stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.:@/-]+$/.test(line))
        .map((model) => ({ id: `opencode:${model}`, label: `OpenCode · ${model}`, provider: "cli" as const }));
    } catch {
      return [];
    }
  }

  async function cursorModels() {
    if (!localAgents.has("cursor")) return [];
    try {
      const result = await execFileAsync("cursor", ["model", "list"], { maxBuffer: 1024 * 1024 });
      return result.stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("Available models"))
        .map((line) => {
          const parts = line.split(/\s+/);
          const id = parts[0]?.trim();
          const name = parts.slice(1).join(" ").trim();
          return id ? { id: `cursor:${id}`, label: `Cursor · ${name}`, provider: "cli" as const } : null;
        })
        .filter((model): model is { id: string; label: string; provider: "cli" } => model !== null);
    } catch {
      return [];
    }
  }

  const availableModels = async (collabConfig: CollabConfig | null = null) => {
    localAgents = await detectLocalAgents();
    const locals = await localModels();
    const discoveredOpenCodeModels = await openCodeModels();
    const discoveredCursorModels = await cursorModels();
    if (locals.length && !agentConfig) {
      const base = process.env.OLLAMA_BASE_URL || fileEnv.OLLAMA_BASE_URL || "http://localhost:11434/api";
      agentConfig = { provider: "ollama", apiKey: "ollama", model: process.env.OLLAMA_MODEL || fileEnv.OLLAMA_MODEL, baseUrl: `${base.replace(/\/api\/?$/, "")}/v1` };
    }

    const isPaidPlan = collabConfig?.plan && collabConfig.plan !== "free";
    const configuredProviders = collabConfig?.configuredProviders || [];

    const allModels = [
      // Nvidia NIM models (free open source models - listed first)
      { id: "meta/llama-3.1-70b-instruct", label: "Llama 3.1 70B", provider: "nvidia" as const },
      { id: "meta/llama-3.1-8b-instruct", label: "Llama 3.1 8B", provider: "nvidia" as const },
      { id: "nvidia/llama-3.1-nemotron-70b-instruct", label: "Nemotron 70B", provider: "nvidia" as const },
      { id: "nvidia/llama-3.1-nemotron-51b-instruct", label: "Nemotron 51B", provider: "nvidia" as const },
      { id: "mistralai/mistral-large-2-instruct", label: "Mistral Large 2", provider: "nvidia" as const },
      { id: "mistralai/mixtral-8x22b-v0.1", label: "Mixtral 8x22B", provider: "nvidia" as const },
      { id: "mistralai/codestral-22b-instruct-v0.1", label: "Codestral 22B", provider: "nvidia" as const },
      { id: "google/gemma-2-27b-it", label: "Gemma 2 27B", provider: "nvidia" as const },
      { id: "ibm/granite-34b-code-instruct", label: "Granite 34B Code", provider: "nvidia" as const },
      { id: "deepseek-ai/deepseek-coder-6.7b-instruct", label: "DeepSeek Coder 6.7B", provider: "nvidia" as const },
      { id: "nvidia/nemotron-3.5-lightning-30b-a3b", label: "Nemotron Lightning 30B", provider: "nvidia" as const },
      { id: "nvidia/nemotron-4-340b-instruct", label: "Nemotron 4 340B", provider: "nvidia" as const },
      { id: "meta/llama-3.2-11b-vision-instruct", label: "Llama 3.2 11B Vision", provider: "nvidia" as const },
      { id: "microsoft/phi-3.5-moe-instruct", label: "Phi-3.5 MoE", provider: "nvidia" as const },
      { id: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning", label: "Nemotron Nano 30B", provider: "nvidia" as const },
      // Existing models
      { id: "claude-sonnet-4-5-20250929", label: "Claude Sonnet 4.5", provider: "anthropic" as const },
      { id: "claude-opus-4-1-20250805", label: "Claude Opus 4.1", provider: "anthropic" as const },
      { id: "gpt-4.1", label: "GPT-4.1", provider: "openai" as const },
      { id: "gpt-4.1-mini", label: "GPT-4.1 mini", provider: "openai" as const },
      { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash", provider: "google" as const },
      { id: "gemini-3.7-flash", label: "Gemini 3.7 Flash", provider: "google" as const },
      { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro Preview", provider: "google" as const },
      { id: "gemini-3-flash-preview", label: "Gemini 3 Flash Preview", provider: "google" as const },
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", provider: "google" as const },
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", provider: "google" as const },
      { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite", provider: "google" as const },
      ...(localAgents.has("claude-code") ? [
        { id: "claude-code:sonnet", label: "Claude Code · Sonnet", provider: "cli" as const },
        { id: "claude-code:opus", label: "Claude Code · Opus", provider: "cli" as const },
        { id: "claude-code:haiku", label: "Claude Code · Haiku", provider: "cli" as const },
      ] : []),
      ...(localAgents.has("codex") ? [
        { id: "codex:gpt-5", label: "Codex · GPT-5", provider: "cli" as const },
        { id: "codex:gpt-5-codex", label: "Codex · GPT-5-Codex", provider: "cli" as const },
      ] : []),
      ...(localAgents.has("opencode") ? [
        { id: "opencode:opencode/big-pickle", label: "OpenCode · Big Pickle", provider: "cli" as const },
        { id: "opencode:deepseek/deepseek-chat", label: "OpenCode · DeepSeek Chat", provider: "cli" as const },
        { id: "opencode:anthropic/claude-sonnet-4-5", label: "OpenCode · Claude Sonnet", provider: "cli" as const },
        { id: "opencode:openai/gpt-5", label: "OpenCode · GPT-5", provider: "cli" as const },
      ] : []),
      ...(localAgents.has("cursor") ? [
        { id: "cursor:claude-sonnet-4.5", label: "Cursor · Claude Sonnet 4.5", provider: "cli" as const },
        { id: "cursor:claude-opus-4", label: "Cursor · Claude Opus 4", provider: "cli" as const },
        { id: "cursor:claude-3.5-sonnet", label: "Cursor · Claude 3.5 Sonnet", provider: "cli" as const },
        { id: "cursor:gpt-4o", label: "Cursor · GPT-4o", provider: "cli" as const },
        { id: "cursor:gpt-4o-mini", label: "Cursor · GPT-4o mini", provider: "cli" as const },
      ] : []),
      ...discoveredOpenCodeModels,
      ...discoveredCursorModels,
      ...locals,
    ];

    // Lock models based on provider API key configuration
    // Paid plans have all models unlocked
    // Free plans only have models unlocked for providers with configured API keys
    const providerKeyMapping: Record<string, string> = {
      anthropic: "ANTHROPIC_API_KEY",
      openai: "OPENAI_API_KEY",
      google: "GOOGLE_GENERATIVE_AI_API_KEY",
      nvidia: "NVIDIA_API_KEY",
      ollama: "OLLAMA_BASE_URL",
    };

    return allModels.map((model) => {
      if (model.provider === "cli") {
        // CLI agents are always unlocked (user manages their own credentials)
        return model;
      }

      if (isPaidPlan) {
        // Paid plans have all hosted models unlocked
        return model;
      }

      // Free plans: check if provider is configured
      const envKey = providerKeyMapping[model.provider];
      const isConfigured = configuredProviders.includes(model.provider) || 
                          Boolean(process.env[envKey]) || 
                          Boolean(fileEnv[envKey as keyof typeof fileEnv]);

      if (!isConfigured) {
        return {
          ...model,
          locked: true,
          lockedReason: "Configure your API key in the dashboard to use this model",
        };
      }

      return model;
    });
  };

  wss.on("connection", (socket) => {
    overlaySocket = socket;
    console.log(chalk.green("✓") + " Overlay connected");
    const creds = loadCredentials();
    const userInfo = creds?.userName
      ? { name: creds.userName, email: creds.userEmail }
      : (process.env.USER ? { name: process.env.USER } : null);
    socket.send(JSON.stringify({ type: "config", apiKeyConfigured: lassoKeyConfigured, agentConfigured: lassoKeyConfigured || Boolean(agentConfig) || localAgents.size > 0, models: [], collab: collabConfig?.registered ? { ...collabConfig, plan: collabConfig.plan, configuredProviders: collabConfig.configuredProviders } : null, user: userInfo }));
    void availableModels(collabConfig).then((models) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify({ type: "config", apiKeyConfigured: lassoKeyConfigured, agentConfigured: lassoKeyConfigured || Boolean(agentConfig) || localAgents.size > 0, models, collab: collabConfig?.registered ? { ...collabConfig, plan: collabConfig.plan, configuredProviders: collabConfig.configuredProviders } : null, user: userInfo }));
    });
    void getGitState(cwd).then((git) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify({ type: "git_state", git }));
    });

    const runEditReview = (request: Extract<BridgeMessage, { type: "edit" }>, config: AgentConfig, statusMessage?: string) => {
      taskControllers.get(request.taskId)?.abort();
      const controller = new AbortController();
      taskControllers.set(request.taskId, controller);
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify({ type: "agent_status", taskId: request.taskId, status: "working", message: statusMessage || "Working…" }));
      }
      void proposeChanges(cwd, request, config, controller.signal, (message, detail, level) => {
        if (!controller.signal.aborted && socket.readyState === socket.OPEN) {
          socket.send(JSON.stringify({ type: "agent_status", taskId: request.taskId, status: level === "error" ? "error" : "working", message, detail }));
        }
      }, (prompt) => {
        if (!controller.signal.aborted && socket.readyState === socket.OPEN) {
          socket.send(JSON.stringify({ type: "agent_prompt", taskId: request.taskId, prompt }));
        }
      })
        .then((proposal) => {
          if (controller.signal.aborted || socket.readyState !== socket.OPEN) return;
          if (!proposalMatchesCurrentSource(cwd, proposal.changes)) {
            const refreshAttempts = reviewRefreshAttempts.get(request.taskId) || 0;
            const MAX_REFRESH_ATTEMPTS = 3;
            if (refreshAttempts < MAX_REFRESH_ATTEMPTS) {
              reviewRefreshAttempts.set(request.taskId, refreshAttempts + 1);
              setTimeout(() => {
                if (!controller.signal.aborted && socket.readyState === socket.OPEN) {
                  runEditReview(request, config, `The source changed while the proposal was being prepared. Refreshing the review… (${refreshAttempts + 1}/${MAX_REFRESH_ATTEMPTS})`);
                }
              }, 500 * (refreshAttempts + 1));
            } else {
              socket.send(JSON.stringify({ type: "agent_status", taskId: request.taskId, status: "error", message: "The source is still changing after multiple refresh attempts. Stop the dev-server edit or try the request again." }));
            }
            return;
          }
          socket.send(JSON.stringify({ type: "agent_status", taskId: request.taskId, status: "review", message: proposal.summary, changes: proposal.changes }));
        })
        .catch((error: unknown) => {
          if (socket.readyState !== socket.OPEN) return;
          if (controller.signal.aborted) {
            socket.send(JSON.stringify({ type: "agent_status", taskId: request.taskId, status: "stopped", message: "Agent stopped." }));
            return;
          }
          socket.send(JSON.stringify({ type: "agent_status", taskId: request.taskId, status: "error", message: error instanceof Error ? error.message : "The agent could not prepare a change." }));
        })
        .finally(() => {
          if (taskControllers.get(request.taskId) === controller) taskControllers.delete(request.taskId);
        });
    };

    socket.on("message", async (raw) => {
      const msg: BridgeMessage = JSON.parse(raw.toString());
      if (msg.type === "edit" || msg.type === "ask") {
        console.log(`[lasso] received ${msg.type}:`, { model: msg.model, provider: msg.provider, selectionId: msg.context?.selectionId, messages: msg.messages?.length || 0, changes: msg.type === "edit" ? msg.changesHistory?.length || 0 : 0, screenshots: Boolean(msg.context?.screenshots?.full || msg.context?.screenshots?.element) });
      } else {
        console.log("[lasso] received from overlay:", msg);
      }
      if (msg.type === "list_page_folders") {
        const requested = msg.path || ".";
        const root = path.resolve(cwd);
        const directory = resolveInsideProject(root, requested);
        if (!directory) {
          socket.send(JSON.stringify({ type: "page_folders", path: requested, entries: [], error: "That folder is outside the current project." }));
          return;
        }
        socket.send(JSON.stringify({ type: "page_folders", path: requested, entries: pageEntries(root, requested), project: path.basename(root) }));
        return;
      }
      if (msg.type === "create_page_folder") {
        const root = path.resolve(cwd);
        const name = path.basename(msg.name || "");
        const parent = resolveInsideProject(root, msg.parent || ".");
        if (!parent || !name || name !== msg.name || name === "." || name === "..") {
          socket.send(JSON.stringify({ type: "page_folder_created", path: msg.name || "", error: "Enter a folder name without slashes or dots." }));
          return;
        }
        const target = path.resolve(parent, name);
        if (!target.startsWith(`${root}${path.sep}`)) {
          socket.send(JSON.stringify({ type: "page_folder_created", path: name, error: "Choose a folder inside the current project." }));
          return;
        }
        try {
          fs.mkdirSync(target);
          socket.send(JSON.stringify({ type: "page_folder_created", path: path.relative(root, target) }));
        } catch (error) {
          socket.send(JSON.stringify({
            type: "page_folder_created",
            path: path.relative(root, target),
            error: error instanceof Error && error.message.includes("EEXIST") ? "A folder with that name already exists." : "The folder could not be created.",
          }));
        }
        return;
      }
      if (msg.type === "create_page") {
        const root = path.resolve(cwd);
        const folder = resolveInsideProject(root, msg.folder || ".");
        // A page name may contain "/" so the overlay can create nested routes in
        // one step, but every segment is validated and resolved inside the project.
        const segments = (msg.fileName || "").split("/").map((segment) => segment.trim()).filter(Boolean);
        const fileName = segments.pop() || "";
        if (!folder || !fileName || segments.some((segment) => segment === "." || segment === "..") || fileName === "." || fileName === "..") {
          socket.send(JSON.stringify({ type: "page_created", path: msg.fileName || "", error: "Choose a valid project folder and file name." }));
          return;
        }
        const target = path.resolve(folder, ...segments, fileName);
        if (!target.startsWith(`${root}${path.sep}`)) {
          socket.send(JSON.stringify({ type: "page_created", path: msg.fileName, error: "Choose a valid project folder and file name." }));
          return;
        }
        try {
          fs.mkdirSync(path.dirname(target), { recursive: true });
          fs.writeFileSync(target, msg.content.slice(0, 200000), { encoding: "utf8", flag: "wx" });
          socket.send(JSON.stringify({ type: "page_created", path: path.relative(root, target) }));
        } catch (error) {
          socket.send(JSON.stringify({ type: "page_created", path: path.relative(root, target), error: error instanceof Error && error.message.includes("EEXIST") ? "A file with that name already exists." : "The page could not be created." }));
        }
        return;
      }
      if (msg.type === "ask") {
        const localProvider = msg.provider === "cli";
        const cliProvider = msg.model?.startsWith("claude-code:") ? "claude-code" : msg.model?.startsWith("opencode:") ? "opencode" : msg.model?.startsWith("cursor:") ? "cursor" : "codex";
        if (!lassoKeyConfigured && !localProvider) {
          socket.send(JSON.stringify({ type: "agent_status", taskId: msg.taskId, status: "error", message: "Set your Lasso API key before asking the hosted agent a question." }));
          return;
        }
        if (!agentConfig && !localProvider) {
          socket.send(JSON.stringify({ type: "agent_status", taskId: msg.taskId, status: "error", message: "No hosted agent is configured. Select Claude Code/Codex or add a provider key." }));
          return;
        }
        taskControllers.get(msg.taskId)?.abort();
        const controller = new AbortController();
        taskControllers.set(msg.taskId, controller);
        const selectedConfig: AgentConfig = localProvider
          ? { provider: cliProvider, model: msg.model }
          : { ...agentConfig!, provider: (msg.provider || agentConfig!.provider) as AgentConfig["provider"], model: msg.model };
        socket.send(JSON.stringify({ type: "agent_status", taskId: msg.taskId, status: "working", message: "Working…" }));
        void answerQuestion(cwd, { taskId: msg.taskId, question: msg.question, context: msg.context, element: msg.element, messages: msg.messages }, selectedConfig, controller.signal, (message, detail, level) => {
          if (!controller.signal.aborted && socket.readyState === socket.OPEN) socket.send(JSON.stringify({ type: "agent_status", taskId: msg.taskId, status: level === "error" ? "error" : "working", message, detail }));
        }, (prompt) => {
          if (!controller.signal.aborted && socket.readyState === socket.OPEN) socket.send(JSON.stringify({ type: "agent_prompt", taskId: msg.taskId, prompt }));
        }).then((answer) => {
          if (!controller.signal.aborted) socket.send(JSON.stringify({ type: "assistant_message", taskId: msg.taskId, message: answer }));
        }).catch((error: unknown) => {
          if (!controller.signal.aborted) socket.send(JSON.stringify({ type: "agent_status", taskId: msg.taskId, status: "error", message: error instanceof Error ? error.message : "The agent could not answer." }));
        }).finally(() => {
          if (taskControllers.get(msg.taskId) === controller) taskControllers.delete(msg.taskId);
        });
      } else if (msg.type === "edit") {
        const localProvider = msg.provider === "cli";
        const cliProvider = msg.model?.startsWith("claude-code:") ? "claude-code" : msg.model?.startsWith("opencode:") ? "opencode" : msg.model?.startsWith("cursor:") ? "cursor" : "codex";
        if (!lassoKeyConfigured && !localProvider) {
          socket.send(JSON.stringify({ type: "agent_status", taskId: msg.taskId, status: "error", message: "Set VITE_LASSO_API_KEY or NEXT_LASSO_API_KEY in your app environment before sending an edit." }));
          return;
        }
        if (!agentConfig && !localProvider) {
          socket.send(JSON.stringify({ type: "agent_status", taskId: msg.taskId, status: "error", message: "Add a supported agent key: GOOGLE_GENERATIVE_AI_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY." }));
          return;
        }
        const selectedConfig: AgentConfig = localProvider
          ? { provider: cliProvider, model: msg.model }
          : { ...agentConfig!, provider: (msg.provider || agentConfig!.provider) as AgentConfig["provider"], model: msg.model };
        editRequests.set(msg.taskId, msg);
        editConfigs.set(msg.taskId, selectedConfig);
        reviewRefreshAttempts.set(msg.taskId, 0);
        runEditReview(msg, selectedConfig);
      } else if (msg.type === "agent_prompt_response") {
        respondToAgentPrompt(msg.taskId, msg.response);
      } else if (msg.type === "stop") {
        if (msg.taskId) taskControllers.get(msg.taskId)?.abort();
        else for (const controller of taskControllers.values()) controller.abort();
        socket.send(JSON.stringify({ type: "agent_status", taskId: msg.taskId, status: "stopped", message: "Agent stopped." }));
      } else if (msg.type === "runtime_error") {
        socket.send(JSON.stringify({ type: "agent_status", status: "error", message: `Runtime error detected${msg.selectionId ? ` for selection ${msg.selectionId}` : ""}: ${msg.details}` }));
      } else if (msg.type === "git_status") {
        socket.send(JSON.stringify({ type: "git_state", git: await getGitState(cwd) }));
      } else if (msg.type === "git_generate_message") {
        const localProvider = msg.provider === "cli";
        const cliProvider = msg.model?.startsWith("claude-code:") ? "claude-code" : msg.model?.startsWith("opencode:") ? "opencode" : msg.model?.startsWith("cursor:") ? "cursor" : "codex";
        if (!agentConfig && !localProvider) {
          socket.send(JSON.stringify({ type: "git_commit_message", error: "No AI provider is configured." }));
          return;
        }
        const selectedConfig: AgentConfig = localProvider
          ? { provider: cliProvider, model: msg.model }
          : { ...agentConfig!, provider: (msg.provider || agentConfig!.provider) as AgentConfig["provider"], model: msg.model };
        const controller = new AbortController();
        activeAgentController?.abort();
        activeAgentController = controller;
        socket.send(JSON.stringify({ type: "git_progress", message: "Generating a commit message…" }));
        void getGitState(cwd).then((git) => generateCommitMessage(cwd, git.status || [], selectedConfig, controller.signal, (message, detail) => {
          if (!controller.signal.aborted && socket.readyState === socket.OPEN) socket.send(JSON.stringify({ type: "git_progress", message: detail ? `${message} · ${detail}` : message }));
        })).then((message) => {
          if (!controller.signal.aborted) socket.send(JSON.stringify({ type: "git_commit_message", message }));
        }).catch((error: unknown) => {
          if (!controller.signal.aborted) socket.send(JSON.stringify({ type: "git_commit_message", error: error instanceof Error ? error.message : "Unable to generate a commit message." }));
        }).finally(() => { if (activeAgentController === controller) activeAgentController = null; });
      } else if (msg.type === "git_init") {
        try {
          await gitCommand(cwd, ["init"]);
          socket.send(JSON.stringify({ type: "git_result", message: "Git repository initialized." }));
          socket.send(JSON.stringify({ type: "git_state", git: await getGitState(cwd) }));
        } catch (error) {
          socket.send(JSON.stringify({ type: "git_result", error: error instanceof Error ? error.message : "Git could not be initialized." }));
        }
      } else if (msg.type === "git_commit") {
        try {
          const commitMessage = msg.message.trim().slice(0, 120);
          if (!commitMessage) throw new Error("Enter a commit message first.");
          await gitCommand(cwd, ["add", "-A"]);
          await gitCommand(cwd, ["commit", "-m", commitMessage]);
          socket.send(JSON.stringify({ type: "git_result", message: "Changes committed." }));
          socket.send(JSON.stringify({ type: "git_state", git: await getGitState(cwd) }));
        } catch (error) {
          socket.send(JSON.stringify({ type: "git_result", error: error instanceof Error ? error.message : "Changes could not be committed." }));
        }
      } else if (msg.type === "git_push") {
        try {
          await gitCommand(cwd, ["push"]);
          socket.send(JSON.stringify({ type: "git_result", message: "Changes pushed to the configured remote." }));
          socket.send(JSON.stringify({ type: "git_state", git: await getGitState(cwd) }));
        } catch (error) {
          socket.send(JSON.stringify({ type: "git_result", error: error instanceof Error ? error.message : "Changes could not be pushed." }));
        }
      } else if (msg.type === "transcribe") {
        const serverUrl = serverUrlFrom(fileEnv);
        const creds = loadCredentials();
        const apiKey = resolvedLassoKey || agentConfig?.apiKey || collabConfig?.apiKey || creds?.apiKey;
        try {
          const resp = await fetch(`${serverUrl}/api/v1/transcribe`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
            },
            body: JSON.stringify({
              audio: msg.audio,
              mimeType: msg.mimeType,
              language: msg.language,
            }),
          });
          const data: any = await resp.json();
          socket.send(JSON.stringify({
            type: "transcribe_result",
            requestId: msg.requestId,
            success: Boolean(data.success),
            text: data.text || "",
            provider: data.provider || "gradium",
            error: data.message,
          }));
        } catch (error: any) {
          socket.send(JSON.stringify({
            type: "transcribe_result",
            requestId: msg.requestId,
            success: false,
            error: error instanceof Error ? error.message : "Failed to contact transcription service",
          }));
        }
      } else if (msg.type === "oneshot") {
        console.log("[lasso] one-shot request:", msg.prompt, msg.scope);
        const taskId = msg.taskId || `oneshot-${Date.now()}`;
        
        const localProvider = msg.provider === "cli" || msg.model?.startsWith("claude-code:") || msg.model?.startsWith("opencode:") || msg.model?.startsWith("cursor:") || msg.model?.startsWith("codex:");
        const cliProvider = msg.model?.startsWith("claude-code:") ? "claude-code" : msg.model?.startsWith("opencode:") ? "opencode" : msg.model?.startsWith("cursor:") ? "cursor" : "codex";

        const apiKey = resolvedLassoKey || agentConfig?.apiKey || collabConfig?.apiKey;

        if (!localProvider && !lassoKeyConfigured && !agentConfig && !apiKey) {
          socket.send(JSON.stringify({
            type: "agent_status",
            taskId,
            status: "error",
            message: "No AI provider or Lasso key configured. Sign in with 'lasso auth login' or configure a provider key in .env."
          }));
          return;
        }

        const provider = (msg.provider || agentConfig?.provider || "google") as AgentConfig["provider"];
        const model = msg.model || agentConfig?.model || (provider === "nvidia" ? "meta/llama-3.1-70b-instruct" : provider === "google" ? "gemini-2.5-flash" : "claude-3-7-sonnet");
        const localKey = localProviderKeys[provider];

        const selectedConfig: AgentConfig = localProvider
          ? { provider: cliProvider, model: msg.model || "claude-code:sonnet" }
          : {
              ...(agentConfig || {}),
              provider,
              model,
              apiKey: localKey || apiKey,
              baseUrl: provider === "nvidia" ? "https://integrate.api.nvidia.com/v1" : provider === "ollama" ? `${(process.env.OLLAMA_BASE_URL || fileEnv.OLLAMA_BASE_URL || "http://localhost:11434/api").replace(/\/api\/?$/, "")}/v1` : undefined,
            };

        const controller = new AbortController();
        taskControllers.set(taskId, controller);

        socket.send(JSON.stringify({ type: "agent_status", taskId, status: "thinking", message: "Planning your request..." }));

        // Import the one-shot agent function
        const { runOneShotAgent } = await import("./oneshot.js");

        const targetApiUrl = collabConfig?.apiUrl || process.env.LASSO_SERVER_URL || process.env.API_URL || (process.env.NODE_ENV === "development" ? "http://localhost:3005" : "https://api.lasso.byorello.space");
        
        runOneShotAgent(
          cwd,
          msg.prompt,
          msg.scope || "project",
          selectedConfig,
          controller.signal,
          (status: "thinking" | "working" | "review" | "error" | "stopped", message: string, detail?: string) => {
            if (!controller.signal.aborted && socket.readyState === socket.OPEN) {
              socket.send(JSON.stringify({ type: "agent_status", taskId, status, message, detail }));
            }
          },
          (prompt: { question: string; options?: string[] }) => {
            if (!controller.signal.aborted && socket.readyState === socket.OPEN) {
              socket.send(JSON.stringify({ type: "agent_prompt", taskId, prompt }));
            }
          },
          msg.messages,
          targetApiUrl,
          apiKey,
          taskId,
          msg.pageContext
        ).then((result) => {
          if (!controller.signal.aborted && socket.readyState === socket.OPEN) {
            if (result.ok) {
              const hasChanges = Array.isArray(result.changes) && result.changes.length > 0;
              socket.send(JSON.stringify({
                type: "agent_status",
                taskId,
                status: hasChanges ? "review" : "complete",
                message: result.summary,
                todo: result.todo,
                changes: result.changes,
                thinking: result.thinking,
                totalThinkingTimeMs: result.totalThinkingTimeMs,
              }));
            } else {
              socket.send(JSON.stringify({ type: "agent_status", taskId, status: "error", message: result.error || "One-shot agent failed" }));
            }
          }
        }).catch((error: unknown) => {
          if (!controller.signal.aborted && socket.readyState === socket.OPEN) {
            socket.send(JSON.stringify({ type: "agent_status", taskId, status: "error", message: error instanceof Error ? error.message : "One-shot agent encountered an error" }));
          }
        }).finally(() => {
          if (taskControllers.get(taskId) === controller) taskControllers.delete(taskId);
        });
      } else if (msg.type === "apply") {
        try {
          const snapshots: Array<{ filePath: string; content: string | null }> = [];
          const planned = new Map<string, { filePath: string; content: string; exists: boolean; start: number; end: number; oldString: string; newString: string }[]>();
          for (const change of msg.changes) {
            const isNew = !change.oldString;
            const filePath = resolveProposedFile(cwd, change.filePath, true);
            const exists = fs.existsSync(filePath);
            const content = exists ? fs.readFileSync(filePath, "utf8") : "";
            const prepared = (!exists || isNew)
              ? { start: 0, end: content.length, oldString: content, newString: change.newString }
              : prepareChange(content, change);
            const fileChanges = planned.get(filePath) || [];
            if (fileChanges.some((item) => prepared.start < item.end && item.start < prepared.end)) {
              throw new Error(`Could not safely apply ${change.filePath}. Proposed changes overlap.`);
            }
            fileChanges.push({ filePath, content, exists, ...prepared });
            planned.set(filePath, fileChanges);
          }

          // Validate every change before writing any file, then apply each
          // file's replacements from the end toward the beginning.
          taskSnapshots.set(msg.taskId, snapshots);
          for (const [filePath, changes] of planned) {
            const exists = changes[0]!.exists;
            const content = changes[0]!.content;
            snapshots.push({ filePath, content: exists ? content : null });
            const nextContent = exists
              ? [...changes]
                  .sort((a, b) => b.start - a.start)
                  .reduce((value, change) => value.slice(0, change.start) + change.newString + value.slice(change.end), content)
              : changes[0]!.newString;
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
            fs.writeFileSync(filePath, nextContent);
          }
          socket.send(JSON.stringify({ type: "applied", taskId: msg.taskId, message: `${msg.changes.length} file${msg.changes.length === 1 ? "" : "s"} updated. Your dev server will reload.` }));
        } catch (error) {
          // Validation happens before writes, but restore this task's snapshot
          // if a filesystem error occurs during the write phase.
          for (const snapshot of taskSnapshots.get(msg.taskId) || []) {
            if (snapshot.content === null) {
              if (fs.existsSync(snapshot.filePath)) fs.unlinkSync(snapshot.filePath);
            } else {
              fs.writeFileSync(snapshot.filePath, snapshot.content);
            }
          }
          taskSnapshots.delete(msg.taskId);
          const message = error instanceof Error ? error.message : "The change could not be applied.";
          const sourceChanged = message.includes("The source changed after the suggestion was generated");
          const editRequest = editRequests.get(msg.taskId);
          const editConfig = editConfigs.get(msg.taskId);
          const refreshAttempts = reviewRefreshAttempts.get(msg.taskId) || 0;
          if (sourceChanged && editRequest && editConfig && refreshAttempts < 1) {
            reviewRefreshAttempts.set(msg.taskId, refreshAttempts + 1);
            runEditReview(editRequest, editConfig, "The source changed. Refreshing the review against the current file…");
          } else {
            socket.send(JSON.stringify({ type: "agent_status", taskId: msg.taskId, status: "error", message }));
          }
        }
      } else if (msg.type === "undo") {
        const snapshots = taskSnapshots.get(msg.taskId || "") || [];
        for (const snapshot of snapshots) {
          if (snapshot.content === null) {
            if (fs.existsSync(snapshot.filePath)) fs.unlinkSync(snapshot.filePath);
          } else {
            fs.writeFileSync(snapshot.filePath, snapshot.content);
          }
        }
        taskSnapshots.delete(msg.taskId || "");
        socket.send(JSON.stringify({ type: "undone", taskId: msg.taskId, message: snapshots.length ? "The accepted change was reverted." : "There is no accepted change to undo." }));
      }
    });

    socket.on("close", () => {
      overlaySocket = null;
      console.log(chalk.yellow("!") + " Overlay disconnected");
    });
  });

  let bridgeListening = false;
  bridgeServer.on("listening", () => {
    bridgeListening = true;
  });
  bridgeServer.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      console.warn(chalk.yellow("!") + ` Lasso bridge port ${bridgePort} is already in use; reusing the existing bridge.`);
      return;
    }
    console.error(chalk.red("Lasso bridge error:"), error.message);
  });
  bridgeServer.listen(bridgePort, "127.0.0.1");

  function send(msg: ServerBridgeMessage) {
    if (overlaySocket?.readyState === overlaySocket?.OPEN) {
      overlaySocket!.send(JSON.stringify(msg));
    }
  }

  return {
    send,
    close() {
      if (bridgeListening) bridgeServer.close();
      wss.close();
    },
  };
}
