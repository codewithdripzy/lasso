// src/cli/bridge.ts
import { WebSocketServer, type WebSocket } from "ws";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import chalk from "chalk";
import { answerQuestion, detectLocalAgents, proposeChanges, generateCommitMessage, type AgentConfig, type SourceChange, type LocalAgent } from "./agent";
import type { CollabConfig } from "./project";
import { serverUrlFrom } from "./auth";

export const DEFAULT_BRIDGE_PORT = 3056;
const execFileAsync = promisify(execFile);
type GitState = { isRepo: boolean; branch?: string; status?: string[]; hasChanges?: boolean; hasRemote?: boolean; remote?: string };

export type BridgeMessage =
  | { type: "hello"; from: "overlay" | "cli" }
  | { type: "edit"; taskId: string; instruction: string; model: string; provider?: "anthropic" | "openai" | "google" | "ollama" | "cli"; messages?: Array<{ role: string; content: string; createdAt?: string }>; changesHistory?: Array<{ summary: string; changes: SourceChange[]; createdAt?: string }>; context?: { selectionId?: string; position?: Record<string, number>; viewport?: Record<string, unknown>; styles?: Record<string, string>; attributes?: Record<string, string>; runtimeErrors?: string[]; screenshots?: { full?: string; element?: string } }; element: { tag: string; group: string; label: string; html?: string; sourceHint?: string } }
  | { type: "ask"; taskId: string; question: string; model: string; provider?: "anthropic" | "openai" | "google" | "ollama" | "cli"; messages?: Array<{ role: string; content: string; createdAt?: string }>; context?: { selectionId?: string; position?: Record<string, number>; viewport?: Record<string, unknown>; styles?: Record<string, string>; attributes?: Record<string, string>; runtimeErrors?: string[]; screenshots?: { full?: string; element?: string } }; element: { tag: string; group: string; label: string; html?: string; sourceHint?: string } }
  | { type: "runtime_error"; selectionId?: string; details: string }
  | { type: "apply"; taskId: string; changes: SourceChange[] }
  | { type: "undo"; taskId?: string }
  | { type: "stop"; taskId?: string }
  | { type: "git_status" }
  | { type: "git_generate_message"; model: string; provider?: "anthropic" | "openai" | "google" | "ollama" | "cli" }
  | { type: "git_init" }
  | { type: "git_commit"; message: string }
  | { type: "git_push" }
  | { type: "agent_status"; taskId?: string; status: "thinking" | "working" | "review" | "error" | "stopped"; message: string }
  | { type: "transcribe"; requestId: string; audio: string; mimeType?: string; language?: string };

type ModelOption = { id: string; label: string; provider: "anthropic" | "openai" | "google" | "ollama" | "cli" };

export type ServerBridgeMessage =
  | { type: "config"; apiKeyConfigured: boolean; agentConfigured: boolean; models: ModelOption[]; collab?: CollabConfig | null }
  | { type: "git_state"; git: GitState }
  | { type: "git_result"; message?: string; error?: string }
  | { type: "git_progress"; message: string }
  | { type: "git_commit_message"; message?: string; error?: string }
  | { type: "agent_status"; taskId?: string; status: "thinking" | "working" | "review" | "error" | "stopped"; message: string; detail?: string; changes?: SourceChange[] }
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

function resolveProposedFile(cwd: string, proposedPath: string): string {
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
  }

  if (!candidate.startsWith(`${root}${path.sep}`)) throw new Error(`The proposed file is outside the current project: ${proposedPath}`);
  throw new Error(`Could not find the proposed file in the current project: ${proposedPath}`);
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
      const filePath = resolveProposedFile(cwd, change.filePath);
      prepareChange(fs.readFileSync(filePath, "utf8"), change);
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
  const taskSnapshots = new Map<string, Array<{ filePath: string; content: string }>>();
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
  const lassoKeyConfigured = Boolean(process.env.VITE_LASSO_API_KEY || process.env.NEXT_LASSO_API_KEY || fileEnv.VITE_LASSO_API_KEY || fileEnv.NEXT_LASSO_API_KEY);
  let agentConfig: AgentConfig | null = (() => {
    const provider = (process.env.LASSO_AGENT_PROVIDER || fileEnv.LASSO_AGENT_PROVIDER || process.env.AI_PROVIDER || fileEnv.AI_PROVIDER || "").toLowerCase();
    const keys = {
      google: process.env.GOOGLE_GENERATIVE_AI_API_KEY || fileEnv.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || fileEnv.GEMINI_API_KEY,
      openai: process.env.OPENAI_API_KEY || fileEnv.OPENAI_API_KEY,
      anthropic: process.env.ANTHROPIC_API_KEY || fileEnv.ANTHROPIC_API_KEY,
      ollama: process.env.OLLAMA_BASE_URL || fileEnv.OLLAMA_BASE_URL || process.env.OLLAMA_MODEL || fileEnv.OLLAMA_MODEL,
    };
    const selectedProvider = provider === "google" || provider === "gemini" ? "google" : provider === "openai" ? "openai" : provider === "ollama" ? "ollama" : provider === "anthropic" ? "anthropic" : keys.ollama ? "ollama" : keys.google ? "google" : keys.openai ? "openai" : "anthropic";
    const apiKey = selectedProvider === "ollama" ? "ollama" : keys[selectedProvider];
    if (!apiKey) return null;
    return {
      provider: selectedProvider,
      apiKey,
      model: process.env.LASSO_AGENT_MODEL || fileEnv.LASSO_AGENT_MODEL || process.env.AI_MODEL || fileEnv.AI_MODEL,
      baseUrl: process.env.OLLAMA_BASE_URL || fileEnv.OLLAMA_BASE_URL ? `${(process.env.OLLAMA_BASE_URL || fileEnv.OLLAMA_BASE_URL || "http://localhost:11434/api").replace(/\/api\/?$/, "")}/v1` : undefined,
    };
  })();
  let activeAgentController: AbortController | null = null;
  const taskControllers = new Map<string, AbortController>();
  let localAgents = new Set<LocalAgent>();

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

  const availableModels = async () => {
    localAgents = await detectLocalAgents();
    const locals = await localModels();
    const discoveredOpenCodeModels = await openCodeModels();
    if (locals.length && !agentConfig) {
      const base = process.env.OLLAMA_BASE_URL || fileEnv.OLLAMA_BASE_URL || "http://localhost:11434/api";
      agentConfig = { provider: "ollama", apiKey: "ollama", model: process.env.OLLAMA_MODEL || fileEnv.OLLAMA_MODEL, baseUrl: `${base.replace(/\/api\/?$/, "")}/v1` };
    }
    return [
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
      ...discoveredOpenCodeModels,
      ...locals,
    ];
  };

  wss.on("connection", (socket) => {
    overlaySocket = socket;
    console.log(chalk.green("✓") + " Overlay connected");
    socket.send(JSON.stringify({ type: "config", apiKeyConfigured: lassoKeyConfigured, agentConfigured: Boolean(agentConfig) || localAgents.size > 0, models: [], collab: collabConfig?.registered ? collabConfig : null }));
    void availableModels().then((models) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify({ type: "config", apiKeyConfigured: lassoKeyConfigured, agentConfigured: Boolean(agentConfig) || localAgents.size > 0, models, collab: collabConfig?.registered ? collabConfig : null }));
    });
    void getGitState(cwd).then((git) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify({ type: "git_state", git }));
    });

    const runEditReview = (request: Extract<BridgeMessage, { type: "edit" }>, config: AgentConfig, statusMessage?: string) => {
      taskControllers.get(request.taskId)?.abort();
      const controller = new AbortController();
      taskControllers.set(request.taskId, controller);
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify({ type: "agent_status", taskId: request.taskId, status: "working", message: statusMessage || "Starting agent…" }));
      }
      void proposeChanges(cwd, request, config, controller.signal, (message, detail) => {
        if (!controller.signal.aborted && socket.readyState === socket.OPEN) {
          socket.send(JSON.stringify({ type: "agent_status", taskId: request.taskId, status: "working", message, detail }));
        }
      })
        .then((proposal) => {
          if (controller.signal.aborted || socket.readyState !== socket.OPEN) return;
          if (!proposalMatchesCurrentSource(cwd, proposal.changes)) {
            const refreshAttempts = reviewRefreshAttempts.get(request.taskId) || 0;
            if (refreshAttempts < 1) {
              reviewRefreshAttempts.set(request.taskId, refreshAttempts + 1);
              runEditReview(request, config, "The source changed while the proposal was being prepared. Refreshing the review…");
            } else {
              socket.send(JSON.stringify({ type: "agent_status", taskId: request.taskId, status: "error", message: "The source is still changing. Stop the dev-server edit or try the request again." }));
            }
            return;
          }
          socket.send(JSON.stringify({ type: "agent_status", taskId: request.taskId, status: "review", message: proposal.summary, changes: proposal.changes }));
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted && socket.readyState === socket.OPEN) {
            socket.send(JSON.stringify({ type: "agent_status", taskId: request.taskId, status: "error", message: error instanceof Error ? error.message : "The agent could not prepare a change." }));
          }
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
      if (msg.type === "ask") {
        const localProvider = msg.provider === "cli";
        const cliProvider = msg.model.startsWith("claude-code:") ? "claude-code" : msg.model.startsWith("opencode:") ? "opencode" : "codex";
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
        socket.send(JSON.stringify({ type: "agent_status", taskId: msg.taskId, status: "working", message: "Starting agent…" }));
        void answerQuestion(cwd, { question: msg.question, context: msg.context, element: msg.element, messages: msg.messages }, selectedConfig, controller.signal, (message, detail) => {
          if (!controller.signal.aborted && socket.readyState === socket.OPEN) socket.send(JSON.stringify({ type: "agent_status", taskId: msg.taskId, status: "working", message, detail }));
        }).then((answer) => {
          if (!controller.signal.aborted) socket.send(JSON.stringify({ type: "assistant_message", taskId: msg.taskId, message: answer }));
        }).catch((error: unknown) => {
          if (!controller.signal.aborted) socket.send(JSON.stringify({ type: "agent_status", taskId: msg.taskId, status: "error", message: error instanceof Error ? error.message : "The agent could not answer." }));
        }).finally(() => {
          if (taskControllers.get(msg.taskId) === controller) taskControllers.delete(msg.taskId);
        });
      } else if (msg.type === "edit") {
        const localProvider = msg.provider === "cli";
        const cliProvider = msg.model.startsWith("claude-code:") ? "claude-code" : msg.model.startsWith("opencode:") ? "opencode" : "codex";
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
        const cliProvider = msg.model.startsWith("claude-code:") ? "claude-code" : msg.model.startsWith("opencode:") ? "opencode" : "codex";
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
        try {
          const resp = await fetch(`${serverUrl}/api/v1/transcribe`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
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
      } else if (msg.type === "apply") {
        try {
          const snapshots: Array<{ filePath: string; content: string }> = [];
          const planned = new Map<string, { filePath: string; content: string; start: number; end: number; oldString: string; newString: string }[]>();
          for (const change of msg.changes) {
            const filePath = resolveProposedFile(cwd, change.filePath);
            const content = fs.readFileSync(filePath, "utf8");
            const prepared = prepareChange(content, change);
            const fileChanges = planned.get(filePath) || [];
            if (fileChanges.some((item) => prepared.start < item.end && item.start < prepared.end)) {
              throw new Error(`Could not safely apply ${change.filePath}. Proposed changes overlap.`);
            }
            fileChanges.push({ filePath, content, ...prepared });
            planned.set(filePath, fileChanges);
          }

          // Validate every change before writing any file, then apply each
          // file's replacements from the end toward the beginning.
          taskSnapshots.set(msg.taskId, snapshots);
          for (const [filePath, changes] of planned) {
            const content = changes[0]!.content;
            snapshots.push({ filePath, content });
            const nextContent = [...changes]
              .sort((a, b) => b.start - a.start)
              .reduce((value, change) => value.slice(0, change.start) + change.newString + value.slice(change.end), content);
            fs.writeFileSync(filePath, nextContent);
          }
          socket.send(JSON.stringify({ type: "applied", taskId: msg.taskId, message: `${msg.changes.length} file${msg.changes.length === 1 ? "" : "s"} updated. Your dev server will reload.` }));
        } catch (error) {
          // Validation happens before writes, but restore this task's snapshot
          // if a filesystem error occurs during the write phase.
          for (const snapshot of taskSnapshots.get(msg.taskId) || []) fs.writeFileSync(snapshot.filePath, snapshot.content);
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
        for (const snapshot of snapshots) fs.writeFileSync(snapshot.filePath, snapshot.content);
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
