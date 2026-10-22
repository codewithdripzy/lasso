// src/cli/bridge.ts
import { WebSocketServer, type WebSocket } from "ws";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import chalk from "chalk";
import type { CollabConfig, WorkspaceConfig, ModelsResponse } from "./project";
import { resolveLassoApiKey, resolveWorkspaceConfig, fetchModels } from "./project";
import { serverUrlFrom, loadCredentials } from "./auth";
import { createSnapshot, restoreSnapshot, getTimeline, deleteSnapshot, getSnapshotByTaskId, getSnapshotBySessionId, type TimelineSnapshot } from "./snapshot";
import { RuntimeClient, type RuntimeSessionInput, type RuntimeEvent, type RuntimeSession, type RuntimeFacade, type BrowserContextProvider } from "./runtime-client";
import { detectBackends, modelIdForBackend, type DetectedBackend, type LocalAgentProvider } from "./backends";
import { getLocalRuntime } from "./local-runtime";

export const DEFAULT_BRIDGE_PORT = 3056;
const execFileAsync = promisify(execFile);
type GitState = { isRepo: boolean; branch?: string; status?: string[]; hasChanges?: boolean; hasRemote?: boolean; remote?: string };

type Provider = "anthropic" | "openai" | "google" | "nvidia" | "ollama" | "claude_code" | "opencode" | "codex_cli" | "cursor";

export type BridgeMessage =
  | { type: "hello"; from: "overlay" | "cli" }
  | { type: "edit"; taskId: string; instruction: string; model: string; provider?: "anthropic" | "openai" | "google" | "nvidia" | "ollama" | "claude_code" | "opencode" | "codex_cli" | "cursor"; messages?: Array<{ role: string; content: string; createdAt?: string }>; changesHistory?: Array<{ summary: string; changes: any[]; createdAt?: string }>; context?: { selectionId?: string; position?: Record<string, number>; viewport?: Record<string, unknown>; styles?: Record<string, string>; attributes?: Record<string, string>; runtimeErrors?: string[]; screenshots?: { full?: string; element?: string } }; element: { tag: string; group: string; label: string; html?: string; sourceHint?: string } }
  | { type: "ask"; taskId: string; question: string; model: string; provider?: "anthropic" | "openai" | "google" | "nvidia" | "ollama" | "claude_code" | "opencode" | "codex_cli" | "cursor"; messages?: Array<{ role: string; content: string; createdAt?: string }>; context?: { selectionId?: string; position?: Record<string, number>; viewport?: Record<string, unknown>; styles?: Record<string, string>; attributes?: Record<string, string>; runtimeErrors?: string[]; screenshots?: { full?: string; element?: string } }; element: { tag: string; group: string; label: string; html?: string; sourceHint?: string } }
  | { type: "runtime_error"; selectionId?: string; details: string }
  | { type: "apply"; taskId: string; changes: any[] }
  | { type: "undo"; taskId?: string }
  | { type: "stop"; taskId?: string }
  | { type: "agent_prompt_response"; taskId: string; response: string }
  | { type: "list_page_folders"; path?: string }
  | { type: "create_page"; folder: string; fileName: string; content: string }
  | { type: "create_page_folder"; parent: string; name: string }
  | { type: "git_status" }
  | { type: "git_generate_message"; model: string; provider?: "anthropic" | "openai" | "google" | "nvidia" | "ollama" | "claude_code" | "opencode" | "codex_cli" | "cursor"; taskId?: string; pageContext?: any }
  | { type: "git_init" }
  | { type: "git_commit"; message: string }
  | { type: "git_push" }
  | { type: "agent_status"; taskId?: string; status: "thinking" | "working" | "review" | "error" | "stopped"; message: string }
  | { type: "transcribe"; requestId: string; audio: string; mimeType?: string; language?: string }
  | { type: "oneshot"; prompt: string; scope?: "project" | "component"; model?: string; provider?: "anthropic" | "openai" | "google" | "nvidia" | "ollama" | "claude_code" | "opencode" | "codex_cli" | "cursor"; messages?: Array<{ role: "user" | "assistant"; content: string }>; taskId?: string }
  | { type: "page_context_response"; requestId: string; pageContext?: any; error?: string }
  | { type: "restore_snapshot"; snapshotId: string }
  | { type: "get_timeline" }
  | { type: "delete_snapshot"; snapshotId: string }
  | { type: "switch_model"; taskId: string; provider: string; modelId: string };

type ModelOption = { id: string; label: string; provider: Provider; locked?: boolean; lockedReason?: string };

/** Map overlay chat history to the runtime conversation shape. */
function toRuntimeConversation(
  messages: Array<{ role: string; content: string; createdAt?: string }> | undefined
): RuntimeSessionInput["conversation"] | undefined {
  if (!Array.isArray(messages) || messages.length === 0) return undefined;
  const turns = messages
    .filter((m) => typeof m?.content === "string" && m.content.trim())
    .map((m) => ({
      role: (m.role === "user" ? "user" : m.role === "assistant" ? "assistant" : "system") as
        | "user"
        | "assistant"
        | "system",
      content: m.content,
      timestamp: m.createdAt ? Date.parse(m.createdAt) || Date.now() : Date.now(),
    }));
  return turns.length > 0 ? turns : undefined;
}

function isConversationalPrompt(prompt: string): boolean {
  const p = prompt.trim().toLowerCase().replace(/[!?.,;:]+$/, "");
  
  // 1. Direct greetings and conversational niceties
  const greetings = [
    "hi", "hello", "hey", "heya", "howdy", "sup", "yo",
    "good morning", "good afternoon", "good evening",
    "thanks", "thank you", "thx", "ty", "cool", "awesome", "great", "nice",
    "who are you", "what are you", "what can you do", "help", "help me",
    "what is lasso", "how do you work", "how does this work",
  ];
  if (greetings.includes(p)) return true;

  // Short greetings
  if (/^(hi|hello|hey|howdy|yo)\b/i.test(p) && p.split(/\s+/).length <= 4) {
    const buildKeywords = /\b(build|create|add|make|fix|update|modify|change|refactor|implement|delete|remove|style|install|wire|code)\b/i;
    if (!buildKeywords.test(p)) return true;
  }

  // 2. Action verbs indicating deliberate code changes
  const mutationVerbs = /\b(build|create|add|make|fix|update|modify|change|refactor|implement|delete|remove|style|install|wire|code|replace|set|switch|swap|rewrite|restyle|rebuild|apply)\b/i;

  // 3. Question / informational prefixes
  const infoPrefixes = /^(what|how|why|when|where|who|which|can you explain|explain|describe|tell me|check out|check|look at|summarize|give me an overview|overview|inspect)\b/i;

  if (infoPrefixes.test(p) && !mutationVerbs.test(p)) {
    return true;
  }

  // 4. Questions about the project / app / page without mutation verbs
  if (/\b(about|doing|does this|is this|mean|purpose|work|repo|project|codebase|app|application|page|overview|summary)\b/i.test(p) && !mutationVerbs.test(p)) {
    return true;
  }

  return false;
}

function cleanConversationReply(value: unknown): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return "";
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed?.reply === "string") return parsed.reply.trim();
  } catch {
    const match = text.match(/"reply"\s*:\s*"((?:\\.|[^"\\])*)"/);
    if (match) {
      try {
        return JSON.parse(`"${match[1]}"`).trim();
      } catch {
        return match[1].replace(/\\n/g, "\n").replace(/\\"/g, '"').trim();
      }
    }
  }
  return text;
}
type PageEntry = { name: string; path: string; type: "directory" | "file" };

export type ServerBridgeMessage =
  | { type: "config"; apiKeyConfigured: boolean; agentConfigured: boolean; models: ModelOption[]; collab?: CollabConfig | null; user?: { name?: string; email?: string } | null }
  | { type: "git_state"; git: GitState }
  | { type: "git_result"; message?: string; error?: string }
  | { type: "git_progress"; message: string }
  | { type: "git_commit_message"; message?: string; error?: string }
  | { type: "agent_status"; taskId?: string; status: "thinking" | "working" | "review" | "error" | "stopped"; message: string; detail?: string; changes?: any[]; thinking?: Array<{ title: string; detail?: string; durationMs?: number }>; totalThinkingTimeMs?: number }
  | { type: "agent_prompt"; taskId: string; prompt: { message: string; kind: "permission" | "input" | "multiselect"; options?: string[] } }
  | { type: "page_folders"; path: string; entries: PageEntry[]; project?: string; error?: string }
  | { type: "page_created"; path: string; error?: string }
  | { type: "page_folder_created"; path: string; error?: string }
  | { type: "assistant_message"; taskId?: string; message: string }
  | { type: "applied"; taskId?: string; message: string; validation?: { passed: boolean; errors: string[]; command: string } }
  | { type: "undone"; taskId?: string; message: string }
  | { type: "transcribe_result"; requestId: string; success: boolean; text?: string; provider?: string; error?: string }
  | { type: "timeline"; snapshots: TimelineSnapshot[] };

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

function readEnvFile(filename: string, cwd: string): Record<string, string> {
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

function detectProjectFramework(cwd: string): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(cwd, "package.json"), "utf8"));
    if (pkg.dependencies?.next || pkg.devDependencies?.next) return "next";
    if (pkg.dependencies?.react || pkg.devDependencies?.react) return "react";
    if (pkg.dependencies?.vue || pkg.devDependencies?.vue) return "vue";
    if (pkg.dependencies?.svelte || pkg.devDependencies?.svelte) return "svelte";
    if (pkg.dependencies?.solid || pkg.devDependencies?.solid) return "solid";
  } catch {}
  return "unknown";
}

// Helper to extract review changes from a runtime session.
// Prefers the authoritative guard diff (session.metadata.pendingChanges) and
// falls back to normalizing recorded actions (accepting filePath OR path).
function extractChangesFromSession(session: RuntimeSession | null): any[] {
  if (!session) return [];

  const metadata = (session as { metadata?: Record<string, unknown> }).metadata;
  const pending = metadata?.pendingChanges;
  if (Array.isArray(pending) && pending.length > 0) {
    return pending.map((change: any) => ({
      filePath: change.filePath,
      oldString: change.oldString ?? "",
      newString: change.newString ?? "",
      operation: change.operation || (change.oldString === "" && change.newString === "" ? "deleted" : change.oldString === "" ? "created" : "modified"),
    }));
  }

  const changes: any[] = [];
  for (const action of session.actions || []) {
    const data = (action.data || {}) as Record<string, unknown>;
    const filePath = (data.filePath || data.path) as string | undefined;
    if (!filePath) continue;

    if (action.type === "edit_file") {
      changes.push({
        filePath,
        oldString: (data.oldString as string) ?? "",
        newString: (data.newString as string) ?? "",
        operation: "modified",
      });
    } else if (action.type === "create_file") {
      changes.push({
        filePath,
        oldString: "",
        newString: (data.content as string) ?? "",
        operation: "created",
      });
    } else if (action.type === "delete_file") {
      changes.push({
        filePath,
        oldString: (data.oldContent as string) ?? "(deleted)",
        newString: "",
        operation: "deleted",
      });
    }
  }
  return changes;
}

export async function startBridge(cwd = process.cwd(), collabConfig: CollabConfig | null = null, bridgePort = DEFAULT_BRIDGE_PORT) {
  const bridgeServer = http.createServer();
  const wss = new WebSocketServer({ server: bridgeServer });
  let overlaySocket: WebSocket | null = null;
  const taskSnapshots = new Map<string, Array<{ filePath: string; content: string | null }>>();
  const activeSessions = new Map<string, RuntimeSession>();
  // Per-task runtime facade: LocalRuntime for local coding agents (executed
  // in this process), RuntimeClient for hosted models (via Lasso server).
  const taskFacades = new Map<string, RuntimeFacade>();
  const taskControllers = new Map<string, AbortController>();
  const pendingBrowserContext = new Map<string, { resolve: (value: any) => void; reject: (error: Error) => void }>();
  const correctiveAttempts = new Map<string, number>();
  const envRoots = [cwd, path.join(cwd, "web"), path.join(cwd, "server")];
  const fileEnv = envRoots.reduce<Record<string, string>>((values, root) => ({
    ...values,
    ...readEnvFile(root, ".env"),
    ...readEnvFile(root, ".env.local"),
    ...readEnvFile(root, ".env.production"),
  }), {});

  // Resolve the user's own model-provider key (BYOK) for hosted runs: the
  // server calls the provider with it and never stores it.
  const PROVIDER_ENV_KEYS: Record<string, string[]> = {
    anthropic: ["ANTHROPIC_API_KEY"],
    openai: ["OPENAI_API_KEY"],
    google: ["GOOGLE_GENERATIVE_AI_API_KEY", "GOOGLE_API_KEY"],
    nvidia: ["NVIDIA_API_KEY"],
  };
  function providerApiKeyFor(provider: string): string | undefined {
    for (const envName of PROVIDER_ENV_KEYS[provider] || []) {
      const value = (process.env[envName] || fileEnv[envName] || "").trim();
      if (value) return value;
    }
    return undefined;
  }

  function requestBrowserContext(action: { id: string; type: "browser_check"; data?: Record<string, unknown> }, taskId: string): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!overlaySocket || overlaySocket.readyState !== overlaySocket.OPEN) {
        reject(new Error("Live browser context is unavailable because the overlay is disconnected."));
        return;
      }
      pendingBrowserContext.set(action.id, { resolve, reject });
      overlaySocket.send(JSON.stringify({ type: "page_context_request", requestId: action.id, taskId, check: action.data || {} }));
    });
  }

  const cliCredentials = loadCredentials();
  const resolvedLassoKey = cliCredentials?.apiKey ||
    resolveLassoApiKey(fileEnv) ||
    process.env.LASSO_API_KEY ||
    fileEnv.LASSO_API_KEY ||
    process.env.VITE_LASSO_API_KEY ||
    process.env.NEXT_LASSO_API_KEY ||
    fileEnv.VITE_LASSO_API_KEY ||
    fileEnv.NEXT_LASSO_API_KEY ||
    "";
  const lassoKeyConfigured = Boolean(resolvedLassoKey);

  const serverUrl = serverUrlFrom(fileEnv) || "https://api.lasso.byorello.space";
  const runtimeClient = new RuntimeClient(serverUrl, resolvedLassoKey || undefined);

  // Load project info
  const workspaceConfig = await resolveWorkspaceConfig(fileEnv);
  const projectId = workspaceConfig?.workspaceId || "";
  const framework = detectProjectFramework(cwd);

  // Fetch models
  let models: ModelOption[] = [];
  try {
    const modelsResponse = await fetchModels(fileEnv);
    const allModels = [
      ...(modelsResponse.anthropic || []),
      ...(modelsResponse.openai || []),
      ...(modelsResponse.google || []),
      ...(modelsResponse.nvidia || []),
    ];
    models = allModels.map((m: any) => ({
      id: m.id,
      label: m.name || m.id,
      provider: m.provider,
      locked: false,
    }));
  } catch {
    models = [
      { id: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet", provider: "anthropic", locked: false },
      { id: "gpt-4o", label: "GPT-4o", provider: "openai", locked: false },
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", provider: "google", locked: false },
    ];
  }

  // Detect local coding agents (installed + authenticated) on this machine
  const detectedBackends: DetectedBackend[] = await detectBackends();

  const BACKEND_LABELS: Record<LocalAgentProvider, string> = {
    claude_code: "Claude Code",
    opencode: "OpenCode",
    codex_cli: "Codex CLI",
    cursor: "Cursor",
  };

  for (const backend of detectedBackends) {
    if (!backend.installed) continue;
    for (const option of backend.models) {
      models.push({
        id: option.id,
        label: `${BACKEND_LABELS[backend.provider]} · ${option.label}`,
        provider: backend.provider,
        locked: !backend.authenticated,
        lockedReason: backend.authenticated ? undefined : backend.error || `${BACKEND_LABELS[backend.provider]} is not authenticated.`,
      });
    }
  }

  const pageIgnoredDirs = new Set(["node_modules", ".git", ".next", "dist", "build", ".turbo", "out", "coverage", ".vercel", ".cache"]);

  const resolveInsideProject = (root: string, relative: string): string | null => {
    const target = path.resolve(root, relative && relative !== "." ? relative : "");
    return target === root || target.startsWith(`${root}${path.sep}`) ? target : null;
  };

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
    } catch {}
    return entries.sort((a, b) =>
      a.type === b.type ? a.name.localeCompare(b.name) : a.type === "directory" ? -1 : 1
    );
  };

  bridgeServer.on("request", (req, res) => {
    if (req.method !== "POST" || req.url?.split("?", 1)[0] !== "/__lasso/bridge/restart") return;
    for (const controller of taskControllers.values()) controller.abort();
    taskControllers.clear();
    for (const socket of wss.clients) socket.close(1000, "Bridge restarted by the CLI");
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });

  // Shared runtime event handling for edit/ask, oneshot, and corrective runs.
  // review=true opens the diff review on agent_completed (edit/ask flow).
  function handleRuntimeEvent(
    event: RuntimeEvent,
    socket: WebSocket,
    taskId: string,
    session: RuntimeSession,
    instruction: string,
    review: boolean
  ): void {
    if (taskControllers.get(taskId)?.signal.aborted) return;

    switch (event.type) {
      case "agent_started":
        // The command bar owns the neutral initial status; real runtime events
        // replace it as soon as the agent has useful progress to report.
        break;

      case "agent_reasoning": {
        // The model's actual reasoning summary — dynamic content only.
        // Raw thoughts (when the provider exposes them) ride along as the
        // step's detail line.
        const summary = (event.data as any)?.summary;
        if (summary) {
          const raw = (event.data as any)?.raw;
          const detail =
            typeof raw === "string" && raw.trim()
              ? raw.length > 800
                ? `${raw.slice(0, 800)}…`
                : raw
              : undefined;
          socket.send(JSON.stringify({
            type: "agent_status",
            taskId,
            status: "thinking",
            message: summary,
            detail,
          } satisfies ServerBridgeMessage));
        }
        break;
      }

      case "tool_started": {
        const data = (event.data as any) || {};
        // Model invocations are internal — the reasoning summaries bracket
        // them; never surface "Running model" style steps.
        if (data.actionType === "model") break;
        const message = data.label || data.tool;
        if (message) {
          socket.send(JSON.stringify({
            type: "agent_status",
            taskId,
            status: "working",
            message,
            detail: data.detail,
          } satisfies ServerBridgeMessage));
        }
        break;
      }

      case "tool_completed": {
        const data = (event.data as any) || {};
        if (data.actionType === "model") break;
        // Success: the step auto-completes when the next event arrives.
        // Only failures surface, with the real error.
        if (data.success === false) {
          const message = data.label || data.tool;
          socket.send(JSON.stringify({
            type: "agent_status",
            taskId,
            status: "working",
            message: message ? `${message} didn't finish` : "A step didn't finish",
            detail: data.error || data.detail,
          } satisfies ServerBridgeMessage));
        }
        break;
      }

      case "phase_changed":
        // Internal phase names ("execute", "verify") are jargon — the
        // reasoning and action labels already tell the real story.
        break;

      case "verification_started":
        // No canned status line — the check names/results arrive with
        // verification_completed and become the real progress copy.
        break;

      case "verification_completed": {
        const data = (event.data as any) || {};
        const passed = data.success ?? data.passed;
        const summaries: string[] = (data.observations || [])
          .map((o: any) => o?.summary)
          .filter(Boolean);
        const errList: string[] = (data.errors || [])
          .map((e: any) => e?.message)
          .filter(Boolean);
        const message = summaries.length
          ? summaries.join(" · ")
          : passed
            ? "Checks passed"
            : "Checks failed";
        socket.send(JSON.stringify({
          type: "agent_status",
          taskId,
          status: passed ? "working" : "error",
          message,
          ...(errList.length ? { detail: errList.join("\n") } : {}),
        } satisfies ServerBridgeMessage));
        break;
      }

      case "agent_completed":
        if (!review) break;
        void handleReviewReady(session, socket, taskId, instruction);
        break;

      case "error":
        socket.send(JSON.stringify({
          type: "agent_status",
          taskId,
          status: "error",
          message: (event.data as any).error || "Unknown error",
        } satisfies ServerBridgeMessage));
        break;

      case "waiting_for_user":
        socket.send(JSON.stringify({
          type: "agent_prompt",
          taskId,
          prompt: {
            message: (event as any).data?.question || "Input required",
            kind: "input",
          },
        } satisfies ServerBridgeMessage));
        break;
    }
  }

  async function sendLocalConversationReply(
    facade: RuntimeFacade,
    session: RuntimeSession,
    taskId: string,
    socket: WebSocket
  ): Promise<void> {
    const finalSession = await facade.getSession(session.id);
    const messages = (finalSession as any).conversation || [];
    const reply = [...messages]
      .reverse()
      .find((message: any) => message?.role === "assistant" && typeof message.content === "string")?.content?.trim();
    if (reply) {
      socket.send(JSON.stringify({
        type: "assistant_message",
        taskId,
        message: reply,
      } satisfies ServerBridgeMessage));
    } else {
      socket.send(JSON.stringify({
        type: "agent_status",
        taskId,
        status: "stopped",
        message: "Complete",
      } satisfies ServerBridgeMessage));
    }
  }

  // The server rolled the workspace back before review, so the current files
  // are the originals: capture them for undo, then open the review panel.
  async function handleReviewReady(
    session: RuntimeSession,
    socket: WebSocket,
    taskId: string,
    instruction: string
  ): Promise<void> {
    try {
      const facade = taskFacades.get(taskId) || runtimeClient;
      const finalSession = await facade.getSession(session.id);
      const changes = extractChangesFromSession(finalSession);

      if (changes.length > 0) {
        taskSnapshots.set(taskId, changes.map((change: any) => {
          const abs = path.join(cwd, change.filePath);
          let content: string | null = null;
          try {
            content = fs.readFileSync(abs, "utf8");
          } catch {
            content = null; // did not exist before the task (created file)
          }
          return { filePath: change.filePath, content };
        }));

        createSnapshot(cwd, taskId, instruction, changes.map((change: any) => change.filePath), undefined, session.id);

        // Extract the assistant's reply from the session conversation so the user
        // sees both the explanation and the review panel — not just "Review changes".
        const sessionConvo = (finalSession as any).conversation || [];
        const assistantReply = [...sessionConvo]
          .reverse()
          .find((m: any) => m?.role === "assistant" && typeof m.content === "string")
          ?.content?.trim();

        socket.send(JSON.stringify({
          type: "agent_status",
          taskId,
          status: "review",
          message: assistantReply || "Review changes",
          changes,
        } satisfies ServerBridgeMessage));
      } else {
        await sendLocalConversationReply(facade, session, taskId, socket);
      }
    } catch (error) {
      socket.send(JSON.stringify({
        type: "agent_status",
        taskId,
        status: "error",
        message: error instanceof Error ? error.message : "Failed to load review changes",
      } satisfies ServerBridgeMessage));
    }
  }

  // Handler for edit/ask - uses runtime
  async function handleHostedConversation(
    taskId: string,
    prompt: string,
    model: string,
    provider: string,
    messages: any[] | undefined,
    socket: WebSocket,
    signal: AbortSignal,
    conversationId?: string,
  ): Promise<void> {
    const requestController = new AbortController();
    const abortRequest = () => requestController.abort();
    signal.addEventListener("abort", abortRequest, { once: true });
    const timeout = setTimeout(() => {
      if (!signal.aborted) socket.send(JSON.stringify({
        type: "agent_status",
        taskId,
        status: "error",
        message: "The conversation timed out. Please try again.",
      } satisfies ServerBridgeMessage));
      requestController.abort();
    }, 30_000);
    try {
      const response = await fetch(`${serverUrl}/api/v1/agent/session`, {
        method: "POST",
        headers: {
          Accept: "text/event-stream",
          "Content-Type": "application/json",
          ...(resolvedLassoKey ? { Authorization: `Bearer ${resolvedLassoKey}` } : {}),
        },
        body: JSON.stringify({
          prompt,
          model: { id: model, provider },
          messages: Array.isArray(messages) ? messages : undefined,
          conversationId: conversationId || undefined,
          projectId: projectId || undefined,
        }),
        signal: requestController.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`Conversation request failed (${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (!payload || payload === "[DONE]") continue;
          const event = JSON.parse(payload);
          if (event.type === "error") throw new Error(event.error || "Conversation failed");
          if (event.type === "done") {
            socket.send(JSON.stringify({
              type: "assistant_message",
              taskId,
              message: cleanConversationReply(event.reply || event.summary),
            } satisfies ServerBridgeMessage));
          }
        }
      }
    } catch (error) {
      if (signal.aborted) return;
      socket.send(JSON.stringify({
        type: "agent_status",
        taskId,
        status: "error",
        message: error instanceof Error ? error.message : "Conversation failed",
      } satisfies ServerBridgeMessage));
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener("abort", abortRequest);
      taskControllers.delete(taskId);
    }
  }

  async function handleEditOrAsk(
    message: any,
    socket: WebSocket,
    taskId: string,
    instruction: string,
    model: string,
    provider: string,
    context: any,
    element: any,
    messages: any[] | undefined
  ) {
    taskControllers.get(taskId)?.abort();
    const controller = new AbortController();
    taskControllers.set(taskId, controller);

    const isLocalAgent = ["claude_code", "opencode", "codex_cli", "cursor"].includes(provider || "");
    if ((message.type === "ask" || isConversationalPrompt(instruction)) && !isLocalAgent) {
      await handleHostedConversation(taskId, instruction, model, provider, messages, socket, controller.signal, message.conversationId);
      return;
    }

    // Do not echo the user's prompt into the thinking feed. The prompt is
    // already visible in the conversation; use a neutral status while the
    // runtime produces its first useful event.
    socket.send(JSON.stringify({
      type: "agent_status",
      taskId,
      status: "thinking",
      message: "Thinking…",
    } satisfies ServerBridgeMessage));

    try {
      // Overlay model option ids are prefixed ("claude_code:sonnet") — the
      // agent CLIs need the unprefixed/normalized form.
      const backendModelId = modelIdForBackend(model || "", provider || "");
      
      const sessionInput: RuntimeSessionInput = {
        userPrompt: instruction,
        conversation: toRuntimeConversation(messages),
        project: {
          projectId,
          framework,
          hasTypeScript: fs.existsSync(path.join(cwd, "tsconfig.json")),
          hasReact: fs.existsSync(path.join(cwd, "package.json")) && 
                   fs.readFileSync(path.join(cwd, "package.json"), "utf8").includes("react"),
        },
        model: {
          provider: (provider || "anthropic") as any,
          id: model || "claude-3-5-sonnet-20241022",
        },
        selection: context ? {
          element: element ? {
            tag: element.tag,
            text: element.label,
            source: element.sourceHint,
            attributes: context.attributes,
          } : undefined,
          viewport: context?.viewport as any,
          route: (context?.position as any)?.route as string,
          screenshot: context?.screenshots?.full,
        } : undefined,
        backendConfig: isLocalAgent ? {
          type: "local_agent",
          provider: provider as any,
          modelId: backendModelId,
          projectPath: cwd,
        } : undefined,
      };

      const facade: RuntimeFacade = isLocalAgent ? getLocalRuntime() : runtimeClient;
      const session = await facade.createSession(sessionInput);
      activeSessions.set(taskId, session);
      taskFacades.set(taskId, facade);

      // Originals are captured when the review is ready (the workspace was
      // already rolled back at that point).

      await facade.runSession(session.id, cwd, (event: RuntimeEvent) => {
        handleRuntimeEvent(event, socket, taskId, session, `Runtime session: ${instruction}`, true);
      }, controller.signal, {
        providerApiKey: providerApiKeyFor(provider),
        browserContextProvider: ((action) => requestBrowserContext(action, taskId)) as BrowserContextProvider,
      });
    } catch (error) {
      socket.send(JSON.stringify({
        type: "agent_status",
        taskId,
        status: "error",
        message: error instanceof Error ? error.message : "Unknown error",
      } satisfies ServerBridgeMessage));
    }
  }

  // Handler for apply - applies approved pending changes, then runs server-side
  // verification. On failure a corrective run is started automatically.
  async function handleApply(message: any, socket: WebSocket, cwd: string) {
    const { taskId, changes } = message;
    const session = activeSessions.get(taskId);
    const filePaths = changes.map((c: any) => c.filePath);

    // The server rolled the workspace back before review, so the disk still
    // holds the originals — capture them now (if the review didn't already).
    if (filePaths.length > 0 && (!taskSnapshots.has(taskId) || (taskSnapshots.get(taskId) || []).length === 0)) {
      taskSnapshots.set(taskId, changes.map((change: any) => {
        const abs = path.join(cwd, change.filePath);
        let content: string | null = null;
        try {
          content = fs.readFileSync(abs, "utf8");
        } catch {
          content = null;
        }
        return { filePath: change.filePath, content };
      }));
    }

    if (filePaths.length > 0) {
      createSnapshot(cwd, taskId, `Apply changes for task ${taskId}`, filePaths, undefined, session?.id);
    }

    const applyError = applyChanges(changes, cwd);
    if (applyError) {
      // Roll back partial application so the project stays consistent
      const originals = taskSnapshots.get(taskId) || [];
      for (const item of originals) {
        try {
          const abs = path.join(cwd, item.filePath);
          if (item.content === null) {
            if (fs.existsSync(abs)) fs.unlinkSync(abs);
          } else {
            fs.mkdirSync(path.dirname(abs), { recursive: true });
            fs.writeFileSync(abs, item.content);
          }
        } catch {}
      }
      socket.send(JSON.stringify({
        type: "agent_status",
        taskId,
        status: "error",
        message: applyError,
      } satisfies ServerBridgeMessage));
      return;
    }

    // Post-apply verification (inconclusive when the engine can't run —
    // never reported as a failure of the changes themselves).
    let validation: { passed: boolean; errors: string[]; command: string } | undefined;
    const facade = taskFacades.get(taskId) || runtimeClient;
    if (session) {
      try {
        const result = await facade.verifySession(session.id, cwd);
        validation = {
          passed: result.passed,
          errors: result.errors.map((e) => e.message),
          command: result.command || "verification",
        };
      } catch {
        validation = undefined;
      }
    }

    socket.send(JSON.stringify({
      type: "applied",
      taskId,
      message: "Changes applied successfully",
      ...(validation ? { validation } : {}),
    } satisfies ServerBridgeMessage));

    if (validation && !validation.passed && session) {
      await runCorrectiveFix(session, facade, taskId, socket);
    }
  }

  /** Apply approved changes to disk. Returns an error message or null. */
  function applyChanges(changes: any[], cwd: string): string | null {
    for (const change of changes) {
      const filePath = path.join(cwd, change.filePath);
      const dir = path.dirname(filePath);
      const oldString = typeof change.oldString === "string" ? change.oldString : "";
      const newString = typeof change.newString === "string" ? change.newString : "";
      const operation: string = change.operation ||
        (oldString === "" && newString === "" ? "deleted" : oldString === "" ? "created" : "modified");

      try {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        if (operation === "deleted") {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        } else if (operation === "created" || (oldString === "" && operation !== "modified")) {
          fs.writeFileSync(filePath, newString);
        } else {
          // Full-content replacement; split/join avoids String.replace's
          // special $-pattern handling in the replacement text.
          const content = fs.readFileSync(filePath, "utf8");
          let next: string;
          if (content === oldString) {
            next = newString;
          } else if (oldString && content.includes(oldString)) {
            next = content.split(oldString).join(newString);
          } else {
            return `Cannot apply ${change.filePath}: the file changed since the diff was generated.`;
          }
          fs.writeFileSync(filePath, next);
        }
      } catch (error) {
        return `Failed to apply ${change.filePath}: ${error instanceof Error ? error.message : "Unknown error"}`;
      }
    }
    return null;
  }

  // Automatic corrective run after failed post-apply verification (bounded).
  async function runCorrectiveFix(session: RuntimeSession, facade: RuntimeFacade, taskId: string, socket: WebSocket): Promise<void> {
    const attempts = correctiveAttempts.get(taskId) || 0;
    if (attempts >= 2) return;
    correctiveAttempts.set(taskId, attempts + 1);

    taskControllers.get(taskId)?.abort();
    const controller = new AbortController();
    taskControllers.set(taskId, controller);

    socket.send(JSON.stringify({
      type: "agent_status",
      taskId,
      status: "thinking",
      message: "Fixing verification errors...",
    } satisfies ServerBridgeMessage));

    try {
      await facade.runSession(session.id, cwd, (event: RuntimeEvent) => {
        handleRuntimeEvent(event, socket, taskId, session, "Corrective run", true);
      }, controller.signal, { providerApiKey: providerApiKeyFor(session.model?.provider || "") });
    } catch (error) {
      socket.send(JSON.stringify({
        type: "agent_status",
        taskId,
        status: "error",
        message: error instanceof Error ? error.message : "Corrective run failed",
      } satisfies ServerBridgeMessage));
    }
  }

  // Handler for undo - restores snapshot
  async function handleUndo(message: any, socket: WebSocket, cwd: string) {
    const { taskId } = message;
    const snapshot = taskSnapshots.get(taskId) || [];

    for (const item of snapshot) {
      if (item.content === null) {
        // File didn't exist, delete if it was created
        try {
          fs.unlinkSync(path.join(cwd, item.filePath));
        } catch {}
      } else {
        // Restore original content
        fs.writeFileSync(path.join(cwd, item.filePath), item.content);
      }
    }

    socket.send(JSON.stringify({
      type: "undone",
      taskId,
      message: "Changes undone",
    } satisfies ServerBridgeMessage));
  }

  // Handler for stop
  async function handleStop(message: any, socket: WebSocket) {
    const { taskId } = message;
    if (taskId) {
      taskControllers.get(taskId)?.abort();
      const session = activeSessions.get(taskId);
      const facade = taskFacades.get(taskId);
      if (session && facade) void facade.cancelSession(session.id).catch(() => {});
      activeSessions.delete(taskId);
      taskFacades.delete(taskId);
    } else {
      for (const controller of taskControllers.values()) controller.abort();
      taskControllers.clear();
      for (const [id, session] of activeSessions) {
        const facade = taskFacades.get(id);
        if (facade) void facade.cancelSession(session.id).catch(() => {});
      }
      activeSessions.clear();
      taskFacades.clear();
    }
    socket.send(JSON.stringify({
      type: "agent_status",
      taskId,
      status: "stopped",
      message: "Agent stopped",
    } satisfies ServerBridgeMessage));
  }

  // Handler for switch_model
  async function handleSwitchModel(message: any, socket: WebSocket) {
    const { taskId, provider, modelId } = message;
    const session = activeSessions.get(taskId);
    if (!session) {
      socket.send(JSON.stringify({
        type: "agent_status",
        taskId,
        status: "error",
        message: "No active session for this task",
      } satisfies ServerBridgeMessage));
      return;
    }

    try {
      const isLocalAgent = ["claude_code", "opencode", "codex_cli", "cursor"].includes(provider || "");
      const facade = taskFacades.get(taskId) || runtimeClient;
      await facade.switchModel(
        session.id,
        {
          provider: provider as any,
          id: modelId,
        },
        undefined,
        isLocalAgent
          ? {
              type: "local_agent",
              provider: provider as any,
              modelId: modelIdForBackend(modelId || "", provider || ""),
              projectPath: cwd,
            }
          : undefined
      );
      socket.send(JSON.stringify({
        type: "agent_status",
        taskId,
        status: "working",
        message: `Switched to ${provider}/${modelId}`,
      } satisfies ServerBridgeMessage));
    } catch (error) {
      socket.send(JSON.stringify({
        type: "agent_status",
        taskId,
        status: "error",
        message: error instanceof Error ? error.message : "Failed to switch model",
      } satisfies ServerBridgeMessage));
    }
  }

  // Handler for oneshot
  async function handleOneshot(message: any, socket: WebSocket, cwd: string) {
    const { taskId, prompt, model, provider } = message;
    const instruction = prompt;

    taskControllers.get(taskId)?.abort();
    const controller = new AbortController();
    taskControllers.set(taskId, controller);

    // Greetings and conversational messages still go through the selected
    // agent/model. The overlay only skips expensive page capture for them;
    // there are no canned assistant responses in the bridge.

    try {
      const isLocalAgent = ["claude_code", "opencode", "codex_cli", "cursor"].includes(provider || "");
      if (isConversationalPrompt(prompt) && !isLocalAgent) {
        await handleHostedConversation(taskId, prompt, model, provider, message.messages, socket, controller.signal, message.conversationId);
        return;
      }
      const backendModelId = modelIdForBackend(model || "", provider || "");
      
      const sessionInput: RuntimeSessionInput = {
        userPrompt: prompt,
        project: {
          projectId,
          framework,
          hasTypeScript: fs.existsSync(path.join(cwd, "tsconfig.json")),
          hasReact: fs.existsSync(path.join(cwd, "package.json")) && 
                   fs.readFileSync(path.join(cwd, "package.json"), "utf8").includes("react"),
        },
        model: {
          provider: (provider || "anthropic") as any,
          id: model || "claude-3-5-sonnet-20241022",
        },
        backendConfig: isLocalAgent ? {
          type: "local_agent",
          provider: provider as any,
          modelId: backendModelId,
          projectPath: cwd,
        } : undefined,
      };

      const facade: RuntimeFacade = isLocalAgent ? getLocalRuntime() : runtimeClient;
      const session = await facade.createSession(sessionInput);
      activeSessions.set(taskId, session);
      taskFacades.set(taskId, facade);

      await facade.runSession(session.id, cwd, (event: RuntimeEvent) => {
        // Oneshot results are reviewed exactly like edit/ask: the workspace is
        // rolled back and only approval re-applies the changes.
        handleRuntimeEvent(event, socket, taskId, session, `Oneshot: ${instruction}`, true);
      }, controller.signal, { providerApiKey: providerApiKeyFor(provider) });
    } catch (error) {
      socket.send(JSON.stringify({
        type: "agent_status",
        taskId,
        status: "error",
        message: error instanceof Error ? error.message : "Unknown oneshot error",
      } satisfies ServerBridgeMessage));
    }
  }

  // Handler for restore_snapshot
  async function handleRestoreSnapshot(message: any, socket: WebSocket, cwd: string) {
    const { snapshotId } = message;
    try {
      await restoreSnapshot(cwd, snapshotId);
      socket.send(JSON.stringify({
        type: "agent_status",
        status: "working",
        message: "Snapshot restored",
      } satisfies ServerBridgeMessage));
    } catch (error) {
      socket.send(JSON.stringify({
        type: "agent_status",
        status: "error",
        message: error instanceof Error ? error.message : "Failed to restore snapshot",
      } satisfies ServerBridgeMessage));
    }
  }

  // Handler for get_timeline
  async function handleGetTimeline(socket: WebSocket, cwd: string) {
    try {
      const timeline = await getTimeline(cwd);
      socket.send(JSON.stringify({
        type: "timeline",
        snapshots: timeline,
      } satisfies ServerBridgeMessage));
    } catch (error) {
      socket.send(JSON.stringify({
        type: "agent_status",
        status: "error",
        message: error instanceof Error ? error.message : "Failed to get timeline",
      } satisfies ServerBridgeMessage));
    }
  }

  // Handler for delete_snapshot
  async function handleDeleteSnapshot(message: any, socket: WebSocket, cwd: string) {
    const { snapshotId } = message;
    try {
      await deleteSnapshot(cwd, snapshotId);
      socket.send(JSON.stringify({
        type: "agent_status",
        status: "working",
        message: "Snapshot deleted",
      } satisfies ServerBridgeMessage));
    } catch (error) {
      socket.send(JSON.stringify({
        type: "agent_status",
        status: "error",
        message: error instanceof Error ? error.message : "Failed to delete snapshot",
      } satisfies ServerBridgeMessage));
    }
  }

  // Git handlers
  async function handleGitStatus(socket: WebSocket, cwd: string) {
    socket.send(JSON.stringify({ type: "git_state", git: await getGitState(cwd) }));
  }

  async function handleGitGenerateMessage(message: any, socket: WebSocket, cwd: string) {
    const git = await getGitState(cwd);
    if (!git.isRepo) {
      socket.send(JSON.stringify({ type: "git_commit_message", error: "Not a git repository" }));
      return;
    }
    const diff = await gitCommand(cwd, ["diff", "--cached"]).catch(() => "");
    if (!diff) {
      socket.send(JSON.stringify({ type: "git_commit_message", error: "No staged changes" }));
      return;
    }
    // TODO: Use runtime for commit message generation
    socket.send(JSON.stringify({ type: "git_commit_message", message: "feat: changes" }));
  }

  async function handleGitInit(socket: WebSocket, cwd: string) {
    try {
      await gitCommand(cwd, ["init"]);
      socket.send(JSON.stringify({ type: "git_result", message: "Git repository initialized" }));
    } catch (error) {
      socket.send(JSON.stringify({ type: "git_result", error: error instanceof Error ? error.message : "Failed to initialize git" }));
    }
  }

  async function handleGitCommit(message: any, socket: WebSocket, cwd: string) {
    try {
      await gitCommand(cwd, ["commit", "-m", message.message]);
      socket.send(JSON.stringify({ type: "git_result", message: "Changes committed" }));
    } catch (error) {
      socket.send(JSON.stringify({ type: "git_result", error: error instanceof Error ? error.message : "Failed to commit" }));
    }
  }

  async function handleGitPush(socket: WebSocket, cwd: string) {
    try {
      await gitCommand(cwd, ["push"]);
      socket.send(JSON.stringify({ type: "git_result", message: "Changes pushed" }));
    } catch (error) {
      socket.send(JSON.stringify({ type: "git_result", error: error instanceof Error ? error.message : "Failed to push" }));
    }
  }

  wss.on("connection", (socket) => {
    overlaySocket = socket;
    console.log(chalk.green("✓") + " Overlay connected");
    const creds = loadCredentials();
    const userInfo = creds?.userName
      ? { name: creds.userName, email: creds.userEmail }
      : (process.env.USER ? { name: process.env.USER } : null);
    socket.send(JSON.stringify({ 
      type: "config", 
      apiKeyConfigured: lassoKeyConfigured, 
      agentConfigured: lassoKeyConfigured, 
      models, 
      collab: collabConfig?.registered ? { ...collabConfig, plan: collabConfig.plan, configuredProviders: collabConfig.configuredProviders } : null, 
      user: userInfo 
    }));
    void getGitState(cwd).then((git) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify({ type: "git_state", git }));
    });

    socket.on("message", async (raw) => {
      const msg: BridgeMessage = JSON.parse(raw.toString());
      console.log("[lasso] received from overlay:", msg.type);

      try {
        switch (msg.type) {
          case "hello":
            break;

          case "edit":
          case "ask":
            await handleEditOrAsk(
              msg,
              socket,
              msg.taskId,
              msg.type === "edit" ? msg.instruction : msg.question,
              msg.model,
              msg.provider || "anthropic",
              msg.context,
              msg.element,
              msg.messages
            );
            break;

          case "apply":
            await handleApply(msg, socket, cwd);
            break;

          case "undo":
            await handleUndo(msg, socket, cwd);
            break;

          case "stop":
            await handleStop(msg, socket);
            break;

          case "switch_model":
            await handleSwitchModel(msg, socket);
            break;

          case "oneshot":
            await handleOneshot(msg, socket, cwd);
            break;

          case "restore_snapshot":
            await handleRestoreSnapshot(msg, socket, cwd);
            break;

          case "get_timeline":
            await handleGetTimeline(socket, cwd);
            break;

          case "delete_snapshot":
            await handleDeleteSnapshot(msg, socket, cwd);
            break;

          case "git_status":
            await handleGitStatus(socket, cwd);
            break;

          case "git_generate_message":
            await handleGitGenerateMessage(msg, socket, cwd);
            break;

          case "git_init":
            await handleGitInit(socket, cwd);
            break;

          case "git_commit":
            await handleGitCommit(msg, socket, cwd);
            break;

          case "git_push":
            await handleGitPush(socket, cwd);
            break;

          case "list_page_folders":
            const requested = msg.path || ".";
            const root = path.resolve(cwd);
            const directory = resolveInsideProject(root, requested);
            if (!directory) {
              socket.send(JSON.stringify({ type: "page_folders", path: requested, entries: [], error: "That folder is outside the current project." }));
              return;
            }
            socket.send(JSON.stringify({ type: "page_folders", path: requested, entries: pageEntries(root, requested), project: path.basename(root) }));
            break;

          case "create_page_folder":
            const root2 = path.resolve(cwd);
            const name = path.basename(msg.name || "");
            const parent = resolveInsideProject(root2, msg.parent || ".");
            if (!parent || !name || name !== msg.name || name === "." || name === "..") {
              socket.send(JSON.stringify({ type: "page_folder_created", path: msg.name || "", error: "Enter a folder name without slashes or dots." }));
              return;
            }
            const target = path.resolve(parent, name);
            if (!target.startsWith(`${root2}${path.sep}`)) {
              socket.send(JSON.stringify({ type: "page_folder_created", path: name, error: "Choose a folder inside the current project." }));
              return;
            }
            try {
              fs.mkdirSync(target);
              socket.send(JSON.stringify({ type: "page_folder_created", path: path.relative(root2, target) }));
            } catch (error) {
              socket.send(JSON.stringify({
                type: "page_folder_created",
                path: path.relative(root2, target),
                error: error instanceof Error && error.message.includes("EEXIST") ? "A folder with that name already exists." : "The folder could not be created.",
              }));
            }
            break;

          case "create_page":
            const root3 = path.resolve(cwd);
            const folder = resolveInsideProject(root3, msg.folder || ".");
            if (!folder) {
              socket.send(JSON.stringify({ type: "page_created", path: msg.fileName, error: "That folder is outside the current project." }));
              return;
            }
            const targetFile = path.resolve(folder, msg.fileName);
            if (!targetFile.startsWith(`${root3}${path.sep}`)) {
              socket.send(JSON.stringify({ type: "page_created", path: msg.fileName, error: "Choose a location inside the current project." }));
              return;
            }
            try {
              fs.mkdirSync(path.dirname(targetFile), { recursive: true });
              fs.writeFileSync(targetFile, msg.content);
              socket.send(JSON.stringify({ type: "page_created", path: path.relative(root3, targetFile) }));
            } catch (error) {
              socket.send(JSON.stringify({
                type: "page_created",
                path: path.relative(root3, targetFile),
                error: error instanceof Error ? error.message : "The file could not be created.",
              }));
            }
            break;

          case "runtime_error":
            // Overlay-side crash (e.g. ReferenceError) — surface it in the
            // daemon log so it's diagnosable.
            console.error(
              "[overlay error]",
              (msg as any).selectionId || "",
              (msg as any).details || (msg as any).message || msg
            );
            break;

          default:
            console.warn("Unknown bridge message type:", (msg as any).type);
        }
      } catch (error) {
        console.error("Error handling bridge message:", error);
        socket.send(JSON.stringify({
          type: "agent_status",
          taskId: (msg as any).taskId,
          status: "error",
          message: error instanceof Error ? error.message : "Unknown error",
        } satisfies ServerBridgeMessage));
      }
    });

    socket.on("close", () => {
      if (socket === overlaySocket) overlaySocket = null;
    });
  });

  bridgeServer.listen(bridgePort, "127.0.0.1", () => {
    console.log(chalk.green("✓") + ` Bridge listening on ${chalk.cyan(`http://127.0.0.1:${bridgePort}`)}`);
  });

  return { ok: true };
}
