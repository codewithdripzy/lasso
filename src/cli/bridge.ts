// src/cli/bridge.ts
import { WebSocketServer, type WebSocket } from "ws";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import chalk from "chalk";
import type { CollabConfig } from "./project";
import { resolveLassoApiKey, resolveWorkspaceConfig, fetchModels } from "./project";
import { serverUrlFrom, agentRuntimeUrlFrom, loadCredentials } from "./auth";
import { createSnapshot, restoreSnapshot, rewindAppliedTasks, getTimeline, deleteSnapshot, type TimelineSnapshot } from "./snapshot";
import { RuntimeClient, type RuntimeSessionInput, type RuntimeEvent, type RuntimeSession, type RuntimeFacade, type BrowserContextProvider } from "./runtime-client";
import { detectBackends, modelIdForBackend, type DetectedBackend, type LocalAgentProvider } from "./backends";
import { getLocalRuntime } from "./local-runtime";
import type { BridgeMessage, GitState, ModelOption, PageEntry, Provider, ServerBridgeMessage } from "../core/interfaces/data";
import { lassoLogPath, writeLassoLog } from "./logging";

export const DEFAULT_BRIDGE_PORT = 3056;
const execFileAsync = promisify(execFile);
export type { BridgeMessage, ServerBridgeMessage } from "../core/interfaces/data";

/** Map overlay chat history to the runtime conversation shape. */
function toRuntimeConversation(messages: Array<{ role: string; content: string; createdAt?: string; timestamp?: number }> | undefined): RuntimeSessionInput["conversation"] | undefined {
  if (!Array.isArray(messages) || messages.length === 0) return undefined;
  const turns = messages
    .filter((m) => typeof m?.content === "string" && m.content.trim())
    .map((m) => ({
      role: (m.role === "user" ? "user" : m.role === "assistant" ? "assistant" : "system") as "user" | "assistant" | "system",
      content: m.content,
      timestamp: typeof m.timestamp === "number" ? m.timestamp : m.createdAt ? Date.parse(m.createdAt) || Date.now() : Date.now(),
    }));
  return turns.length > 0 ? turns : undefined;
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

export async function restartBridge(port = DEFAULT_BRIDGE_PORT): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/__lasso/bridge/restart`, { method: "POST" });
    const body = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!response.ok || !body.ok) return { ok: false, error: body.error || "The bridge rejected the restart request." };
    return { ok: true };
  } catch {
    return { ok: false, error: `No Lasso bridge is listening on 127.0.0.1:${port}. Start your project with ${chalk.cyan("lasso dev")} first.` };
  }
}

export interface BridgeStatus {
  ok: boolean;
  pid?: number;
  uptimeMs?: number;
  clients?: number;
  logFile?: string;
}

export async function getBridgeStatus(port = DEFAULT_BRIDGE_PORT): Promise<BridgeStatus> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/__lasso/bridge/status`);
    if (!response.ok) return { ok: false };
    return (await response.json()) as BridgeStatus;
  } catch {
    return { ok: false };
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
    return fs
      .readFileSync(path.join(cwd, filename), "utf8")
      .split(/\r?\n/)
      .reduce<Record<string, string>>((values, line) => {
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
    if (pkg.dependencies?.nuxt || pkg.devDependencies?.nuxt) return "nuxt";
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
  const startedAt = Date.now();
  writeLassoLog("info", "bridge_started", { cwd, port: bridgePort, pid: process.pid });
  const bridgeServer = http.createServer();
  const wss = new WebSocketServer({ server: bridgeServer });
  let connectedClients = 0;
  let overlaySocket: WebSocket | null = null;
  const taskSnapshots = new Map<string, Array<{ filePath: string; content: string | null }>>();
  const activeSessions = new Map<string, RuntimeSession>();
  const pendingReviewTasks = new Set<string>();
  // Per-task runtime facade: LocalRuntime for local coding agents (executed
  // in this process), RuntimeClient for hosted models (via Lasso server).
  const taskFacades = new Map<string, RuntimeFacade>();
  const taskControllers = new Map<string, AbortController>();
  const pendingBrowserContext = new Map<string, { resolve: (value: any) => void; reject: (error: Error) => void }>();
  const correctiveAttempts = new Map<string, number>();
  const envRoots = [cwd, path.join(cwd, "web"), path.join(cwd, "server")];
  const fileEnv = envRoots.reduce<Record<string, string>>(
    (values, root) => ({
      ...values,
      ...readEnvFile(root, ".env"),
      ...readEnvFile(root, ".env.local"),
      ...readEnvFile(root, ".env.production"),
    }),
    {}
  );

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
  const resolvedLassoKey = cliCredentials?.apiKey || resolveLassoApiKey(fileEnv) || process.env.LASSO_API_KEY || fileEnv.LASSO_API_KEY || process.env.VITE_LASSO_API_KEY || process.env.NEXT_LASSO_API_KEY || fileEnv.VITE_LASSO_API_KEY || fileEnv.NEXT_LASSO_API_KEY || "";
  const lassoKeyConfigured = Boolean(resolvedLassoKey);

  const serverUrl = serverUrlFrom(fileEnv) || "https://api.lasso.byorello.space";
  const runtimeClient = new RuntimeClient(agentRuntimeUrlFrom(fileEnv), resolvedLassoKey || undefined);

  // Load project info
  const workspaceConfig = await resolveWorkspaceConfig(fileEnv);
  const projectId = workspaceConfig?.workspaceId || "";
  const framework = detectProjectFramework(cwd);

  // Fetch models
  let models: ModelOption[] = [];
  try {
    const modelsResponse = await fetchModels(fileEnv);
    const allModels = [...(modelsResponse.anthropic || []), ...(modelsResponse.openai || []), ...(modelsResponse.google || []), ...(modelsResponse.nvidia || [])];
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
      { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash", provider: "google", locked: false },
    ];
  }

  // Detect local coding agents (installed + authenticated) on this machine
  const detectedBackends: DetectedBackend[] = await detectBackends();

  const BACKEND_LABELS: Record<LocalAgentProvider, string> = {
    claude_code: "Claude Code",
    opencode: "OpenCode",
    codex_cli: "Codex",
    cursor: "Cursor",
    antigravity: "Antigravity",
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

  const resolveWorkspacePath = (relative: unknown): string | null => {
    if (typeof relative !== "string" || !relative || path.isAbsolute(relative)) return null;
    return resolveInsideProject(path.resolve(cwd), relative);
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
    return entries.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "directory" ? -1 : 1));
  };

  bridgeServer.on("request", async (req, res) => {
    if (req.method === "GET" && req.url?.split("?", 1)[0] === "/__lasso/bridge/status") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, pid: process.pid, uptimeMs: Date.now() - startedAt, clients: connectedClients, logFile: lassoLogPath() }));
      return;
    }
    if (req.method !== "POST" || req.url?.split("?", 1)[0] !== "/__lasso/bridge/restart") return;
    for (const taskId of pendingReviewTasks) {
      const session = activeSessions.get(taskId);
      const facade = taskFacades.get(taskId) || runtimeClient;
      if (session) {
        try {
          await facade.resolveReview(session.id, []);
        } catch (error) {
          console.warn(`[lasso] Could not reject pending review ${taskId} before bridge restart:`, error);
        }
      }
    }
    pendingReviewTasks.clear();
    for (const controller of taskControllers.values()) controller.abort();
    taskControllers.clear();
    for (const socket of wss.clients) socket.close(1000, "Bridge restarted by the CLI");
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });

  // Shared runtime event handling for edit/ask, oneshot, and corrective runs.
  // review=true opens the diff review on agent_completed (edit/ask flow).
  function handleRuntimeEvent(event: RuntimeEvent, socket: WebSocket, taskId: string, session: RuntimeSession, instruction: string, review: boolean): void {
    if (taskControllers.get(taskId)?.signal.aborted) return;

    if (["agent_started", "agent_reasoning", "tool_started", "tool_completed", "agent_completed", "agent_failed", "agent_cancelled", "error"].includes(event.type)) {
      const data = (event as { data?: Record<string, unknown> }).data || {};
      const message = [data.summary, data.message, data.label, data.error].find((value) => typeof value === "string" && value.trim());
      writeLassoLog(event.type === "error" || event.type === "agent_failed" ? "error" : "info", "agent_runtime_event", {
        taskId,
        sessionId: event.sessionId,
        provider: session.model?.provider,
        type: event.type,
        ...(typeof message === "string" ? { message: message.slice(0, 400) } : {}),
        ...(typeof data.actionType === "string" ? { actionType: data.actionType } : {}),
        ...(typeof data.success === "boolean" ? { success: data.success } : {}),
        ...(typeof data.recoverable === "boolean" ? { recoverable: data.recoverable } : {}),
        ...(typeof data.requiresReview === "boolean" ? { requiresReview: data.requiresReview } : {}),
        ...(typeof data.pendingChanges === "number" ? { pendingChanges: data.pendingChanges } : {}),
      });
    }

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
          const detail = typeof raw === "string" && raw.trim() ? (raw.length > 800 ? `${raw.slice(0, 800)}…` : raw) : undefined;
          socket.send(
            JSON.stringify({
              type: "agent_status",
              taskId,
              status: "thinking",
              message: summary,
              detail,
            } satisfies ServerBridgeMessage)
          );
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
          socket.send(
            JSON.stringify({
              type: "agent_status",
              taskId,
              status: "working",
              message,
              detail: data.detail,
            } satisfies ServerBridgeMessage)
          );
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
          socket.send(
            JSON.stringify({
              type: "agent_status",
              taskId,
              status: "working",
              message: message ? `${message} didn't finish` : "A step didn't finish",
              detail: data.error || data.detail,
            } satisfies ServerBridgeMessage)
          );
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
        const summaries: string[] = (data.observations || []).map((o: any) => o?.summary).filter(Boolean);
        const errList: string[] = (data.errors || []).map((e: any) => e?.message).filter(Boolean);
        const message = summaries.length ? summaries.join(" · ") : passed ? "Checks passed" : "Checks failed";
        socket.send(
          JSON.stringify({
            type: "agent_status",
            taskId,
            status: passed ? "working" : "error",
            message,
            ...(errList.length ? { detail: errList.join("\n") } : {}),
          } satisfies ServerBridgeMessage)
        );
        break;
      }

      case "agent_completed": {
        const data = (event.data as Record<string, unknown>) || {};
        const reply = typeof data.reply === "string" ? data.reply.trim() : "";
        if (reply && data.conversational === true) {
          socket.send(
            JSON.stringify({
              type: "assistant_message",
              taskId,
              message: reply,
            } satisfies ServerBridgeMessage)
          );
          break;
        }
        const pendingChanges = typeof data.pendingChanges === "number" ? data.pendingChanges : 0;
        const requiresReview = data.requiresReview === true || pendingChanges > 0;
        if (review && requiresReview) {
          pendingReviewTasks.add(taskId);
          void handleReviewReady(session, socket, taskId);
        } else {
          const summary = typeof data.summary === "string" ? data.summary.trim() : "";
          socket.send(
            JSON.stringify({
              type: "agent_status",
              taskId,
              status: "complete",
              message: summary || "Task completed.",
            } satisfies ServerBridgeMessage)
          );
        }
        break;
      }

      case "error":
        {
          const data = (event.data as Record<string, unknown>) || {};
          const errorValue = data.error;
          const errorRecord = errorValue && typeof errorValue === "object" ? (errorValue as Record<string, unknown>) : undefined;
          const detail =
            (typeof errorValue === "string" && errorValue) || (typeof errorRecord?.message === "string" && errorRecord.message) || (typeof data.message === "string" && data.message) || (typeof data.details === "string" && data.details) || "The agent runtime failed without an error message.";

          // Local coding agents can report recoverable shell/tool errors and
          // continue their own loop. Their tool_completed event already shows
          // the failed step; do not mark the whole task as failed here.
          if (errorRecord?.recoverable === true || data.recoverable === true) break;

          socket.send(
            JSON.stringify({
              type: "agent_status",
              taskId,
              status: "error",
              message: typeof detail === "string" && detail.trim() ? detail : "The agent runtime failed without an error message.",
            } satisfies ServerBridgeMessage)
          );
        }
        break;

      case "agent_failed": {
        const data = (event.data as Record<string, unknown>) || {};
        const message = [data.error, data.message, data.details].find((value) => typeof value === "string" && value.trim());
        socket.send(
          JSON.stringify({
            type: "agent_status",
            taskId,
            status: "error",
            message: typeof message === "string" ? message : "The agent process failed without an error message.",
          } satisfies ServerBridgeMessage)
        );
        break;
      }

      case "agent_cancelled":
        socket.send(
          JSON.stringify({
            type: "agent_status",
            taskId,
            status: "stopped",
            message: "Agent stopped.",
          } satisfies ServerBridgeMessage)
        );
        break;

      case "waiting_for_user":
        socket.send(
          JSON.stringify({
            type: "agent_prompt",
            taskId,
            prompt: {
              message: (event as any).data?.question || "Input required",
              kind: "input",
            },
          } satisfies ServerBridgeMessage)
        );
        break;
    }
  }

  async function sendLocalConversationReply(facade: RuntimeFacade, session: RuntimeSession, taskId: string, socket: WebSocket): Promise<void> {
    const finalSession = await facade.getSession(session.id);
    const messages = (finalSession as any).conversation || [];
    const reply = [...messages]
      .reverse()
      .find((message: any) => message?.role === "assistant" && typeof message.content === "string")
      ?.content?.trim();
    if (reply) {
      socket.send(
        JSON.stringify({
          type: "assistant_message",
          taskId,
          message: reply,
        } satisfies ServerBridgeMessage)
      );
    } else {
      socket.send(
        JSON.stringify({
          type: "agent_status",
          taskId,
          status: "stopped",
          message: "Complete",
        } satisfies ServerBridgeMessage)
      );
    }
  }

  // The proposed edits stay on disk while the review is open. The runtime
  // guard retains the original state for rejection or partial approval.
  async function handleReviewReady(session: RuntimeSession, socket: WebSocket, taskId: string): Promise<void> {
    try {
      const facade = taskFacades.get(taskId) || runtimeClient;
      const finalSession = await facade.getSession(session.id);
      const changes = extractChangesFromSession(finalSession);

      if (changes.length > 0) {
        pendingReviewTasks.add(taskId);

        // Extract the assistant's reply from the session conversation so the user
        // sees both the explanation and the review panel — not just "Review changes".
        const sessionConvo = (finalSession as any).conversation || [];
        const assistantReply = [...sessionConvo]
          .reverse()
          .find((m: any) => m?.role === "assistant" && typeof m.content === "string")
          ?.content?.trim();

        socket.send(
          JSON.stringify({
            type: "agent_status",
            taskId,
            status: "review",
            message: assistantReply || "Review changes",
            changes,
          } satisfies ServerBridgeMessage)
        );
      } else {
        pendingReviewTasks.delete(taskId);
        await sendLocalConversationReply(facade, session, taskId, socket);
      }
    } catch (error) {
      const facade = taskFacades.get(taskId) || runtimeClient;
      try {
        await facade.resolveReview(session.id, []);
      } catch {
        /* The run may have failed before creating a review guard. */
      }
      pendingReviewTasks.delete(taskId);
      socket.send(
        JSON.stringify({
          type: "agent_status",
          taskId,
          status: "error",
          message: error instanceof Error ? error.message : "Failed to load review changes",
        } satisfies ServerBridgeMessage)
      );
    }
  }

  // Handler for edit/ask - uses runtime
  async function handleHostedConversation(taskId: string, prompt: string, model: string, provider: string, messages: any[] | undefined, socket: WebSocket, signal: AbortSignal, conversationId?: string): Promise<void> {
    const requestController = new AbortController();
    let terminalEvent: string | undefined;
    const abortRequest = () => requestController.abort();
    signal.addEventListener("abort", abortRequest, { once: true });
    const timeout = setTimeout(() => {
      writeLassoLog("error", "conversation_timeout", { taskId, endpoint: "/api/v1/agent/session" });
      if (!signal.aborted)
        socket.send(
          JSON.stringify({
            type: "agent_status",
            taskId,
            status: "error",
            message: "The conversation timed out. Please try again.",
          } satisfies ServerBridgeMessage)
        );
      requestController.abort();
    }, 30_000);
    try {
      const requestStartedAt = Date.now();
      const runtimeUrl = agentRuntimeUrlFrom(fileEnv);
      writeLassoLog("info", "agent_request_started", { method: "POST", baseUrl: runtimeUrl, endpoint: "/api/v1/agent/session", taskId, provider, model });
      const response = await fetch(`${runtimeUrl}/api/v1/agent/session`, {
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
      writeLassoLog("info", "agent_request_stream_opened", { baseUrl: runtimeUrl, endpoint: "/api/v1/agent/session", taskId, status: response.status, durationMs: Date.now() - requestStartedAt });

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
          writeLassoLog(event.type === "error" ? "error" : "debug", "conversation_event", {
            taskId,
            type: event.type,
            ...(event.error !== undefined ? { error: String(event.error) } : {}),
            ...(event.summary !== undefined ? { summary: String(event.summary) } : {}),
            ...(event.details !== undefined ? { details: String(event.details) } : {}),
            ...(event.status ? { status: String(event.status) } : {}),
          });
          if (event.type === "error") {
            terminalEvent = "error";
            throw new Error(event.error || event.summary || event.details || "Conversation failed");
          }
          if (event.type === "done") {
            terminalEvent = "done";
            socket.send(
              JSON.stringify({
                type: "assistant_message",
                taskId,
                message: cleanConversationReply(event.reply || event.summary),
              } satisfies ServerBridgeMessage)
            );
          }
        }
      }
    } catch (error) {
      if (signal.aborted) return;
      writeLassoLog("error", "conversation_failed", {
        taskId,
        error: error instanceof Error ? error.message : String(error),
      });
      socket.send(
        JSON.stringify({
          type: "agent_status",
          taskId,
          status: "error",
          message: error instanceof Error ? error.message : "Conversation failed",
        } satisfies ServerBridgeMessage)
      );
    } finally {
      writeLassoLog("info", "agent_request_stream_closed", { baseUrl: agentRuntimeUrlFrom(fileEnv), endpoint: "/api/v1/agent/session", taskId, terminalEvent: terminalEvent || "none" });
      clearTimeout(timeout);
      signal.removeEventListener("abort", abortRequest);
      taskControllers.delete(taskId);
    }
  }

  async function handleEditOrAsk(message: any, socket: WebSocket, taskId: string, instruction: string, model: string, provider: string, context: any, element: any, messages: any[] | undefined) {
    if (pendingReviewTasks.size > 0) {
      socket.send(JSON.stringify({ type: "agent_status", taskId, status: "error", message: "Accept or reject the open file review before starting another coding task." } satisfies ServerBridgeMessage));
      return;
    }
    taskControllers.get(taskId)?.abort();
    const controller = new AbortController();
    taskControllers.set(taskId, controller);

    const isLocalAgent = ["claude_code", "opencode", "codex_cli", "cursor", "antigravity"].includes(provider || "");
    if (message.type === "ask" && !isLocalAgent) {
      await handleHostedConversation(taskId, instruction, model, provider, messages, socket, controller.signal, message.conversationId);
      return;
    }

    // Do not echo the user's prompt into the thinking feed. The prompt is
    // already visible in the conversation; use a neutral status while the
    // runtime produces its first useful event.
    socket.send(
      JSON.stringify({
        type: "agent_status",
        taskId,
        status: "thinking",
        message: "Thinking…",
      } satisfies ServerBridgeMessage)
    );

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
          hasReact: fs.existsSync(path.join(cwd, "package.json")) && fs.readFileSync(path.join(cwd, "package.json"), "utf8").includes("react"),
        },
        model: {
          provider: (provider || "anthropic") as any,
          id: model || "claude-3-5-sonnet-20241022",
        },
        selection: context
          ? {
              element: element
                ? {
                    tag: element.tag,
                    text: element.label,
                    source: element.sourceHint,
                    attributes: context.attributes,
                  }
                : undefined,
              viewport: context?.viewport as any,
              route: (context?.position as any)?.route as string,
              screenshot: context?.screenshots?.full,
            }
          : undefined,
        backendConfig: isLocalAgent
          ? {
              type: "local_agent",
              provider: provider as any,
              modelId: backendModelId,
              projectPath: cwd,
            }
          : undefined,
      };

      const facade: RuntimeFacade = isLocalAgent ? getLocalRuntime() : runtimeClient;
      const session = await facade.createSession(sessionInput);
      activeSessions.set(taskId, session);
      taskFacades.set(taskId, facade);

      // The guard captures original contents before the agent starts.

      await facade.runSession(
        session.id,
        cwd,
        (event: RuntimeEvent) => {
          handleRuntimeEvent(event, socket, taskId, session, `Runtime session: ${instruction}`, true);
        },
        controller.signal,
        {
          providerApiKey: providerApiKeyFor(provider),
          browserContextProvider: ((action) => requestBrowserContext(action, taskId)) as BrowserContextProvider,
        }
      );
    } catch (error) {
      socket.send(
        JSON.stringify({
          type: "agent_status",
          taskId,
          status: "error",
          message: error instanceof Error ? error.message : "Unknown error",
        } satisfies ServerBridgeMessage)
      );
    } finally {
      if (taskControllers.get(taskId) === controller) taskControllers.delete(taskId);
    }
  }

  // Handler for approval: keep selected edits, restore excluded files, then
  // run verification. On failure a corrective run is started automatically.
  async function handleApply(message: any, socket: WebSocket, cwd: string) {
    const { taskId, changes } = message;
    const session = activeSessions.get(taskId);
    const facade = taskFacades.get(taskId) || runtimeClient;
    if (!session || !Array.isArray(changes)) {
      socket.send(
        JSON.stringify({
          type: "agent_status",
          taskId,
          status: "error",
          message: "There is no reviewable agent session for this task.",
        } satisfies ServerBridgeMessage)
      );
      return;
    }

    // The UI is only an approval surface. Never trust its diff as the source
    // of truth; reload the authoritative diff captured by the runtime.
    const latestSession = await facade.getSession(session.id);
    const authoritative = (latestSession.metadata?.pendingChanges || []) as any[];
    if (!Array.isArray(authoritative) || authoritative.length === 0) {
      socket.send(
        JSON.stringify({
          type: "agent_status",
          taskId,
          status: "error",
          message: "This task has no pending changes to apply.",
        } satisfies ServerBridgeMessage)
      );
      return;
    }
    const filePaths = authoritative.map((c) => c.filePath);
    if (authoritative.some((change) => !resolveWorkspacePath(change.filePath))) {
      socket.send(
        JSON.stringify({
          type: "agent_status",
          taskId,
          status: "error",
          message: "The review contains an invalid workspace path.",
        } satisfies ServerBridgeMessage)
      );
      return;
    }

    const approvedPaths = new Set(changes.map((change: any) => change?.filePath).filter((filePath: unknown): filePath is string => typeof filePath === "string"));
    const approvedChanges = authoritative.filter((change) => approvedPaths.has(change.filePath));
    if (approvedChanges.length === 0) {
      socket.send(
        JSON.stringify({
          type: "agent_status",
          taskId,
          status: "error",
          message: "Select at least one file to keep.",
        } satisfies ServerBridgeMessage)
      );
      return;
    }

    const approvedFilePaths = approvedChanges.map((change) => change.filePath);
    const originalFiles = new Map<string, string | null>(approvedChanges.map((change) => [change.filePath, change.operation === "created" ? null : change.oldString]));
    if (pendingReviewTasks.has(taskId)) {
      try {
        await facade.resolveReview(session.id, approvedFilePaths);
      } catch (error) {
        socket.send(JSON.stringify({ type: "agent_status", taskId, status: "error", message: error instanceof Error ? error.message : "Could not resolve the file review." } satisfies ServerBridgeMessage));
        return;
      }
    } else {
      // A rejected review can be applied again later from the saved diff.
      const applyError = applyChanges(approvedChanges);
      if (applyError) {
        restoreOriginalFiles(originalFiles);
        socket.send(JSON.stringify({ type: "agent_status", taskId, status: "error", message: applyError } satisfies ServerBridgeMessage));
        return;
      }
    }
    taskSnapshots.set(
      taskId,
      approvedChanges.map((change) => ({
        filePath: change.filePath,
        content: originalFiles.get(change.filePath) ?? null,
      }))
    );
    createSnapshot(cwd, taskId, `Apply changes for task ${taskId}`, approvedFilePaths, undefined, session.id, originalFiles);
    pendingReviewTasks.delete(taskId);

    // Post-apply verification (inconclusive when the engine can't run —
    // never reported as a failure of the changes themselves).
    let validation: { passed: boolean; errors: string[]; command: string } | undefined;
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

    socket.send(
      JSON.stringify({
        type: "applied",
        taskId,
        message: "Changes accepted successfully",
        ...(validation ? { validation } : {}),
      } satisfies ServerBridgeMessage)
    );

    if (validation && !validation.passed && session) {
      await runCorrectiveFix(session, facade, taskId, socket);
    }
  }

  function restoreOriginalFiles(originalFiles: Map<string, string | null>): void {
    for (const [relativePath, content] of originalFiles) {
      const filePath = resolveWorkspacePath(relativePath);
      if (!filePath) continue;
      try {
        if (content === null) {
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } else {
          fs.mkdirSync(path.dirname(filePath), { recursive: true });
          fs.writeFileSync(filePath, content);
        }
      } catch (error) {
        console.warn(`[lasso] Failed to restore ${relativePath} after an incomplete apply:`, error);
      }
    }
  }

  /** Reapply a previously rejected diff. First-time approval keeps the in-place edits. */
  function applyChanges(changes: any[]): string | null {
    for (const change of changes) {
      const filePath = resolveWorkspacePath(change.filePath);
      if (!filePath) return `Cannot apply ${String(change.filePath)}: invalid workspace path.`;
      const oldString = typeof change.oldString === "string" ? change.oldString : "";
      const newString = typeof change.newString === "string" ? change.newString : "";
      const operation: string = change.operation || (oldString === "" && newString === "" ? "deleted" : oldString === "" ? "created" : "modified");

      try {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        if (operation === "deleted") {
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } else if (operation === "created") {
          if (fs.existsSync(filePath)) {
            const current = fs.readFileSync(filePath, "utf8");
            if (current !== newString) return `Cannot apply ${change.filePath}: the file already exists with different contents.`;
          }
          fs.writeFileSync(filePath, newString);
        } else {
          const content = fs.readFileSync(filePath, "utf8");
          if (content === oldString) fs.writeFileSync(filePath, newString);
          else if (oldString && content.includes(oldString)) fs.writeFileSync(filePath, content.split(oldString).join(newString));
          else return `Cannot apply ${change.filePath}: the file changed since the diff was generated.`;
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

    socket.send(
      JSON.stringify({
        type: "agent_status",
        taskId,
        status: "thinking",
        message: "Fixing verification errors...",
      } satisfies ServerBridgeMessage)
    );

    try {
      await facade.runSession(
        session.id,
        cwd,
        (event: RuntimeEvent) => {
          handleRuntimeEvent(event, socket, taskId, session, "Corrective run", true);
        },
        controller.signal,
        { providerApiKey: providerApiKeyFor(session.model?.provider || "") }
      );
    } catch (error) {
      socket.send(
        JSON.stringify({
          type: "agent_status",
          taskId,
          status: "error",
          message: error instanceof Error ? error.message : "Corrective run failed",
        } satisfies ServerBridgeMessage)
      );
    }
  }

  // Handler for undo - restores snapshot
  async function handleUndo(message: any, socket: WebSocket, cwd: string) {
    const { taskId } = message;
    if (pendingReviewTasks.has(taskId)) {
      const session = activeSessions.get(taskId);
      const facade = taskFacades.get(taskId) || runtimeClient;
      if (!session) {
        socket.send(JSON.stringify({ type: "agent_status", taskId, status: "error", message: "The pending file review is no longer available." } satisfies ServerBridgeMessage));
        return;
      }
      try {
        await facade.resolveReview(session.id, []);
        pendingReviewTasks.delete(taskId);
      } catch (error) {
        socket.send(JSON.stringify({ type: "agent_status", taskId, status: "error", message: error instanceof Error ? error.message : "Could not reject the file review." } satisfies ServerBridgeMessage));
        return;
      }
      socket.send(JSON.stringify({ type: "undone", taskId, message: "Changes rejected and original files restored" } satisfies ServerBridgeMessage));
      return;
    }
    const snapshot = taskSnapshots.get(taskId) || [];

    for (const item of snapshot) {
      const filePath = resolveWorkspacePath(item.filePath);
      if (!filePath) {
        socket.send(
          JSON.stringify({
            type: "agent_status",
            taskId,
            status: "error",
            message: `Cannot undo ${item.filePath}: invalid workspace path.`,
          } satisfies ServerBridgeMessage)
        );
        return;
      }
      if (item.content === null) {
        // File didn't exist, delete if it was created
        try {
          fs.unlinkSync(filePath);
        } catch {}
      } else {
        // Restore original content
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, item.content);
      }
    }

    socket.send(
      JSON.stringify({
        type: "undone",
        taskId,
        message: "Changes undone",
      } satisfies ServerBridgeMessage)
    );
  }

  async function handleRewindConversation(message: any, socket: WebSocket, cwd: string): Promise<void> {
    const targetMessageId = typeof message.targetMessageId === "string" ? message.targetMessageId : "";
    const taskIds = Array.isArray(message.taskIds) ? message.taskIds.filter((id: unknown): id is string => typeof id === "string") : [];
    const pendingTaskIds = Array.isArray(message.pendingTaskIds) ? message.pendingTaskIds.filter((id: unknown): id is string => typeof id === "string") : [];
    if (!targetMessageId) {
      socket.send(JSON.stringify({ type: "rewind_result", targetMessageId, success: false, error: "The message to edit was not identified." } satisfies ServerBridgeMessage));
      return;
    }

    for (const pendingTaskId of pendingTaskIds) {
      if (!pendingReviewTasks.has(pendingTaskId)) continue;
      const session = activeSessions.get(pendingTaskId);
      const facade = taskFacades.get(pendingTaskId) || runtimeClient;
      if (!session) {
        socket.send(JSON.stringify({ type: "rewind_result", targetMessageId, success: false, error: "A later pending file review is no longer available." } satisfies ServerBridgeMessage));
        return;
      }
      try {
        await facade.resolveReview(session.id, []);
        pendingReviewTasks.delete(pendingTaskId);
      } catch (error) {
        socket.send(JSON.stringify({ type: "rewind_result", targetMessageId, success: false, error: error instanceof Error ? error.message : "Could not restore a later pending review." } satisfies ServerBridgeMessage));
        return;
      }
    }

    const result = rewindAppliedTasks(cwd, taskIds);
    socket.send(
      JSON.stringify({
        type: "rewind_result",
        targetMessageId,
        success: result.ok,
        ...(result.error ? { error: result.error } : {}),
        restoredFiles: result.restoredFiles,
      } satisfies ServerBridgeMessage)
    );
  }

  // Handler for stop
  async function handleStop(message: any, socket: WebSocket) {
    const { taskId } = message;
    if (taskId) {
      if (pendingReviewTasks.has(taskId)) {
        const pendingSession = activeSessions.get(taskId);
        const pendingFacade = taskFacades.get(taskId) || runtimeClient;
        if (pendingSession) {
          try {
            await pendingFacade.resolveReview(pendingSession.id, []);
          } catch {
            /* Preserve the file state if rollback conflicts. */
          }
        }
        pendingReviewTasks.delete(taskId);
      }
      taskControllers.get(taskId)?.abort();
      const session = activeSessions.get(taskId);
      const facade = taskFacades.get(taskId);
      if (session && facade) void facade.cancelSession(session.id).catch(() => {});
      activeSessions.delete(taskId);
      taskFacades.delete(taskId);
    } else {
      for (const pendingTaskId of pendingReviewTasks) {
        const pendingSession = activeSessions.get(pendingTaskId);
        const pendingFacade = taskFacades.get(pendingTaskId) || runtimeClient;
        if (pendingSession) {
          try {
            await pendingFacade.resolveReview(pendingSession.id, []);
          } catch {
            /* Preserve the file state if rollback conflicts. */
          }
        }
      }
      pendingReviewTasks.clear();
      for (const controller of taskControllers.values()) controller.abort();
      taskControllers.clear();
      for (const [id, session] of activeSessions) {
        const facade = taskFacades.get(id);
        if (facade) void facade.cancelSession(session.id).catch(() => {});
      }
      activeSessions.clear();
      taskFacades.clear();
    }
    socket.send(
      JSON.stringify({
        type: "agent_status",
        taskId,
        status: "stopped",
        message: "Agent stopped",
      } satisfies ServerBridgeMessage)
    );
  }

  /** Forward an overlay answer to the runtime's pending user question. */
  async function handleAgentPromptResponse(message: Extract<BridgeMessage, { type: "agent_prompt_response" }>, socket: WebSocket): Promise<void> {
    const session = activeSessions.get(message.taskId);
    const facade = taskFacades.get(message.taskId);
    if (!session || !facade) {
      throw new Error("No active agent session is waiting for a response.");
    }

    if (!facade.respondToPrompt) {
      throw new Error("This agent backend does not support interactive prompts.");
    }
    await facade.respondToPrompt(session.id, message.response);
    socket.send(
      JSON.stringify({
        type: "agent_status",
        taskId: message.taskId,
        status: "working",
        message: "Continuing with your response…",
      } satisfies ServerBridgeMessage)
    );
  }

  /** Queue a prompt for the active runtime's next model turn. */
  async function handleSteer(message: Extract<BridgeMessage, { type: "steer" }>, socket: WebSocket): Promise<void> {
    const session = activeSessions.get(message.taskId);
    const facade = taskFacades.get(message.taskId);
    if (!session || !facade?.steerSession) {
      socket.send(JSON.stringify({ type: "steer_result", taskId: message.taskId, queueId: message.queueId, success: false, error: "This agent backend does not support live steering." } satisfies ServerBridgeMessage));
      return;
    }

    try {
      await facade.steerSession(session.id, message.prompt);
      socket.send(JSON.stringify({ type: "steer_result", taskId: message.taskId, queueId: message.queueId, success: true } satisfies ServerBridgeMessage));
    } catch (error) {
      socket.send(JSON.stringify({ type: "steer_result", taskId: message.taskId, queueId: message.queueId, success: false, error: error instanceof Error ? error.message : "Failed to steer the agent." } satisfies ServerBridgeMessage));
    }
  }

  // Handler for switch_model
  async function handleSwitchModel(message: any, socket: WebSocket) {
    const { taskId, provider, modelId } = message;
    const session = activeSessions.get(taskId);
    if (!session) {
      socket.send(
        JSON.stringify({
          type: "agent_status",
          taskId,
          status: "error",
          message: "No active session for this task",
        } satisfies ServerBridgeMessage)
      );
      return;
    }

    try {
      const isLocalAgent = ["claude_code", "opencode", "codex_cli", "cursor", "antigravity"].includes(provider || "");
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
      socket.send(
        JSON.stringify({
          type: "agent_status",
          taskId,
          status: "working",
          message: `Switched to ${provider}/${modelId}`,
        } satisfies ServerBridgeMessage)
      );
    } catch (error) {
      socket.send(
        JSON.stringify({
          type: "agent_status",
          taskId,
          status: "error",
          message: error instanceof Error ? error.message : "Failed to switch model",
        } satisfies ServerBridgeMessage)
      );
    }
  }

  // Handler for oneshot
  async function handleOneshot(message: any, socket: WebSocket, cwd: string) {
    const { taskId, prompt, model, provider, messages, conversation } = message;
    if (pendingReviewTasks.size > 0) {
      socket.send(JSON.stringify({ type: "agent_status", taskId, status: "error", message: "Accept or reject the open file review before starting another coding task." } satisfies ServerBridgeMessage));
      return;
    }
    const runtimeConversation = toRuntimeConversation(conversation || messages);
    const instruction =
      [...(runtimeConversation || [])]
        .reverse()
        .find((entry) => entry.role === "user")
        ?.content?.trim() || (typeof prompt === "string" ? prompt.trim() : "");

    if (!instruction) {
      socket.send(JSON.stringify({ type: "agent_status", taskId, status: "error", message: "A user message is required." } satisfies ServerBridgeMessage));
      return;
    }

    taskControllers.get(taskId)?.abort();
    const controller = new AbortController();
    taskControllers.set(taskId, controller);

    // All oneshot prompts go through the selected agent/model. The agent
    // decides whether the request needs project work or a conversational reply.

    try {
      const isLocalAgent = ["claude_code", "opencode", "codex_cli", "cursor", "antigravity"].includes(provider || "");
      if (!isLocalAgent) {
        try {
          const route = await runtimeClient.routeRequest({
            prompt: instruction,
            provider,
            conversation: runtimeConversation?.map(({ role, content }) => ({ role, content })),
          });
          if (route.path === "conversation") {
            await handleHostedConversation(taskId, instruction, model, provider || "anthropic", runtimeConversation, socket, controller.signal, message.conversationId);
            return;
          }
        } catch (error) {
          // Preserve the previous coding path if an older AI server has not
          // deployed the routing endpoint yet.
          console.warn("[lasso] request routing unavailable; using coding runtime", error instanceof Error ? error.message : error);
        }
      }
      const backendModelId = modelIdForBackend(model || "", provider || "");

      const sessionInput: RuntimeSessionInput = {
        userPrompt: instruction,
        // The sidebar is the source of truth for history. The runtime prompt
        // is derived from its final user message rather than sent separately.
        conversation: runtimeConversation,
        project: {
          projectId,
          framework,
          hasTypeScript: fs.existsSync(path.join(cwd, "tsconfig.json")),
          hasReact: fs.existsSync(path.join(cwd, "package.json")) && fs.readFileSync(path.join(cwd, "package.json"), "utf8").includes("react"),
        },
        model: {
          provider: (provider || "anthropic") as any,
          id: model || "claude-3-5-sonnet-20241022",
        },
        backendConfig: isLocalAgent
          ? {
              type: "local_agent",
              provider: provider as any,
              modelId: backendModelId,
              projectPath: cwd,
            }
          : undefined,
      };

      const facade: RuntimeFacade = isLocalAgent ? getLocalRuntime() : runtimeClient;
      const session = await facade.createSession(sessionInput);
      activeSessions.set(taskId, session);
      taskFacades.set(taskId, facade);

      await facade.runSession(
        session.id,
        cwd,
        (event: RuntimeEvent) => {
          // Oneshot results use the same in-place accept/reject review flow.
          handleRuntimeEvent(event, socket, taskId, session, `Oneshot: ${instruction}`, true);
        },
        controller.signal,
        { providerApiKey: providerApiKeyFor(provider) }
      );
    } catch (error) {
      socket.send(
        JSON.stringify({
          type: "agent_status",
          taskId,
          status: "error",
          message: error instanceof Error ? error.message : "Unknown oneshot error",
        } satisfies ServerBridgeMessage)
      );
    } finally {
      if (taskControllers.get(taskId) === controller) taskControllers.delete(taskId);
    }
  }

  // Handler for restore_snapshot
  async function handleRestoreSnapshot(message: any, socket: WebSocket, cwd: string) {
    const { snapshotId } = message;
    try {
      await restoreSnapshot(cwd, snapshotId);
      socket.send(
        JSON.stringify({
          type: "agent_status",
          status: "working",
          message: "Snapshot restored",
        } satisfies ServerBridgeMessage)
      );
    } catch (error) {
      socket.send(
        JSON.stringify({
          type: "agent_status",
          status: "error",
          message: error instanceof Error ? error.message : "Failed to restore snapshot",
        } satisfies ServerBridgeMessage)
      );
    }
  }

  // Handler for get_timeline
  async function handleGetTimeline(socket: WebSocket, cwd: string) {
    try {
      const timeline = await getTimeline(cwd);
      socket.send(
        JSON.stringify({
          type: "timeline",
          snapshots: timeline,
        } satisfies ServerBridgeMessage)
      );
    } catch (error) {
      socket.send(
        JSON.stringify({
          type: "agent_status",
          status: "error",
          message: error instanceof Error ? error.message : "Failed to get timeline",
        } satisfies ServerBridgeMessage)
      );
    }
  }

  // Handler for delete_snapshot
  async function handleDeleteSnapshot(message: any, socket: WebSocket, cwd: string) {
    const { snapshotId } = message;
    try {
      await deleteSnapshot(cwd, snapshotId);
      socket.send(
        JSON.stringify({
          type: "agent_status",
          status: "working",
          message: "Snapshot deleted",
        } satisfies ServerBridgeMessage)
      );
    } catch (error) {
      socket.send(
        JSON.stringify({
          type: "agent_status",
          status: "error",
          message: error instanceof Error ? error.message : "Failed to delete snapshot",
        } satisfies ServerBridgeMessage)
      );
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
    connectedClients += 1;
    writeLassoLog("info", "overlay_connected", { clients: connectedClients });
    overlaySocket = socket;
    console.log(chalk.green("✓") + " Overlay connected");
    writeLassoLog("info", "overlay_ready");
    const creds = loadCredentials();
    const userInfo = creds?.userName ? { name: creds.userName, email: creds.userEmail } : process.env.USER ? { name: process.env.USER } : null;
    socket.send(
      JSON.stringify({
        type: "config",
        apiKeyConfigured: lassoKeyConfigured,
        agentConfigured: lassoKeyConfigured,
        models,
        collab: collabConfig?.registered ? { ...collabConfig, agentServerUrl: agentRuntimeUrlFrom(fileEnv), plan: collabConfig.plan, configuredProviders: collabConfig.configuredProviders } : null,
        user: userInfo,
      })
    );
    void getGitState(cwd).then((git) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify({ type: "git_state", git }));
    });

    socket.on("message", async (raw) => {
      let taskId: string | undefined;
      try {
        const msg: BridgeMessage = JSON.parse(raw.toString());
        taskId = (msg as any).taskId;
        console.log("[lasso] received from overlay:", msg.type);
        writeLassoLog("info", "overlay_message", { type: msg.type, taskId: (msg as any).taskId });
        switch (msg.type) {
          case "hello":
            break;

          case "edit":
          case "ask":
            await handleEditOrAsk(msg, socket, msg.taskId, msg.type === "edit" ? msg.instruction : msg.question, msg.model, msg.provider || "anthropic", msg.context, msg.element, msg.messages);
            break;

          case "apply":
            await handleApply(msg, socket, cwd);
            break;

          case "undo":
            await handleUndo(msg, socket, cwd);
            break;

          case "rewind_conversation":
            await handleRewindConversation(msg, socket, cwd);
            break;

          case "stop":
            await handleStop(msg, socket);
            break;

          case "agent_prompt_response":
            await handleAgentPromptResponse(msg, socket);
            break;

          case "steer":
            await handleSteer(msg, socket);
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
              socket.send(
                JSON.stringify({
                  type: "page_folder_created",
                  path: path.relative(root2, target),
                  error: error instanceof Error && error.message.includes("EEXIST") ? "A folder with that name already exists." : "The folder could not be created.",
                })
              );
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
              socket.send(
                JSON.stringify({
                  type: "page_created",
                  path: path.relative(root3, targetFile),
                  error: error instanceof Error ? error.message : "The file could not be created.",
                })
              );
            }
            break;

          case "runtime_error":
            // Overlay-side crash (e.g. ReferenceError) — surface it in the
            // daemon log so it's diagnosable.
            console.error("[overlay error]", (msg as any).selectionId || "", (msg as any).details || (msg as any).message || msg);
            break;

          case "page_context_response": {
            const pending = pendingBrowserContext.get(msg.requestId);
            if (!pending) break;
            pendingBrowserContext.delete(msg.requestId);
            if (msg.error) pending.reject(new Error(msg.error));
            else pending.resolve(msg.pageContext);
            break;
          }

          default:
            console.warn("Unknown bridge message type:", (msg as any).type);
        }
      } catch (error) {
        console.error("Error handling bridge message:", error);
        socket.send(
          JSON.stringify({
            type: "agent_status",
            taskId,
            status: "error",
            message: error instanceof Error ? error.message : "Unknown error",
          } satisfies ServerBridgeMessage)
        );
      }
    });

    socket.on("close", () => {
      connectedClients = Math.max(0, connectedClients - 1);
      writeLassoLog("info", "overlay_disconnected", { clients: connectedClients });
      if (socket === overlaySocket) overlaySocket = null;
      for (const [requestId, pending] of pendingBrowserContext) {
        pending.reject(new Error("The overlay disconnected before browser context was returned."));
        pendingBrowserContext.delete(requestId);
      }
    });
  });

  bridgeServer.listen(bridgePort, "127.0.0.1", () => {
    console.log(chalk.green("✓") + ` Bridge listening on ${chalk.cyan(`http://127.0.0.1:${bridgePort}`)}`);
    writeLassoLog("info", "bridge_ready", { port: bridgePort, logFile: lassoLogPath() });
  });

  return { ok: true };
}
