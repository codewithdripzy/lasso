// src/cli/bridge.ts
import { WebSocketServer, type WebSocket } from "ws";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import chalk from "chalk";
import { proposeChanges, type AgentConfig, type SourceChange } from "./agent";

const BRIDGE_PORT = 3056;
const execFileAsync = promisify(execFile);
type GitState = { isRepo: boolean; branch?: string; status?: string[]; hasChanges?: boolean; hasRemote?: boolean; remote?: string };

export type BridgeMessage =
  | { type: "hello"; from: "overlay" | "cli" }
  | { type: "edit"; instruction: string; model: string; provider?: "anthropic" | "openai" | "google" | "ollama"; messages?: Array<{ role: string; content: string; createdAt?: string }>; changesHistory?: Array<{ summary: string; changes: SourceChange[]; createdAt?: string }>; context?: { selectionId?: string; position?: Record<string, number>; viewport?: Record<string, unknown>; styles?: Record<string, string>; attributes?: Record<string, string>; runtimeErrors?: string[]; screenshots?: { full?: string; element?: string } }; element: { tag: string; group: string; label: string; html?: string; sourceHint?: string } }
  | { type: "runtime_error"; selectionId?: string; details: string }
  | { type: "apply"; changes: SourceChange[] }
  | { type: "undo" }
  | { type: "stop" }
  | { type: "git_status" }
  | { type: "git_init" }
  | { type: "git_commit"; message: string }
  | { type: "git_push" }
  | { type: "agent_status"; status: "thinking" | "working" | "review" | "error" | "stopped"; message: string };

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

export function startBridge(cwd = process.cwd()) {
  const bridgeServer = http.createServer(); // dedicated, empty HTTP server
  const wss = new WebSocketServer({ server: bridgeServer });
  let overlaySocket: WebSocket | null = null;
  let lastSnapshot: Array<{ filePath: string; content: string }> = [];
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

  const availableModels = async () => {
    const locals = await localModels();
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
      ...locals,
    ];
  };

  wss.on("connection", (socket) => {
    overlaySocket = socket;
    console.log(chalk.green("✓") + " Overlay connected");
    socket.send(JSON.stringify({ type: "config", apiKeyConfigured: lassoKeyConfigured, agentConfigured: Boolean(agentConfig), models: [] }));
    void availableModels().then((models) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify({ type: "config", apiKeyConfigured: lassoKeyConfigured, agentConfigured: Boolean(agentConfig), models }));
    });
    void getGitState(cwd).then((git) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify({ type: "git_state", git }));
    });

    socket.on("message", async (raw) => {
      const msg: BridgeMessage = JSON.parse(raw.toString());
      if (msg.type === "edit") {
        console.log("[lasso] received edit:", { model: msg.model, provider: msg.provider, selectionId: msg.context?.selectionId, messages: msg.messages?.length || 0, changes: msg.changesHistory?.length || 0, screenshots: Boolean(msg.context?.screenshots?.full || msg.context?.screenshots?.element) });
      } else {
        console.log("[lasso] received from overlay:", msg);
      }
      if (msg.type === "edit") {
        if (!lassoKeyConfigured) {
          socket.send(JSON.stringify({ type: "agent_status", status: "error", message: "Set VITE_LASSO_API_KEY or NEXT_LASSO_API_KEY in your app environment before sending an edit." }));
          return;
        }
        if (!agentConfig) {
          socket.send(JSON.stringify({ type: "agent_status", status: "error", message: "Add a supported agent key: GOOGLE_GENERATIVE_AI_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY." }));
          return;
        }
        socket.send(JSON.stringify({ type: "agent_status", status: "thinking", message: "Reading the selected component…" }));
        socket.send(JSON.stringify({ type: "agent_status", status: "working", message: "Inspecting source, conversation, and visual context…" }));
        activeAgentController?.abort();
        const controller = new AbortController();
        activeAgentController = controller;
        void proposeChanges(cwd, msg, { ...agentConfig, provider: msg.provider || agentConfig.provider, model: msg.model }, controller.signal)
          .then((proposal) => {
            if (!controller.signal.aborted) socket.send(JSON.stringify({ type: "agent_status", status: "review", message: proposal.summary, changes: proposal.changes }));
          })
          .catch((error: unknown) => {
            if (controller.signal.aborted) return;
            const message = error instanceof Error ? error.message : "The agent could not prepare a change.";
            socket.send(JSON.stringify({ type: "agent_status", status: "error", message }));
          })
          .finally(() => {
            if (activeAgentController === controller) activeAgentController = null;
          });
      } else if (msg.type === "stop") {
        activeAgentController?.abort();
        activeAgentController = null;
        socket.send(JSON.stringify({ type: "agent_status", status: "stopped", message: "Agent stopped." }));
      } else if (msg.type === "runtime_error") {
        socket.send(JSON.stringify({ type: "agent_status", status: "error", message: `Runtime error detected${msg.selectionId ? ` for selection ${msg.selectionId}` : ""}: ${msg.details}` }));
      } else if (msg.type === "git_status") {
        socket.send(JSON.stringify({ type: "git_state", git: await getGitState(cwd) }));
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
      } else if (msg.type === "apply") {
        try {
          lastSnapshot = [];
          for (const change of msg.changes) {
            const filePath = path.resolve(cwd, change.filePath);
            if (!filePath.startsWith(`${path.resolve(cwd)}${path.sep}`)) throw new Error("A proposed file was outside the project.");
            const content = fs.readFileSync(filePath, "utf8");
            if (content.split(change.oldString).length - 1 !== 1) throw new Error(`Could not safely apply ${change.filePath}. The selected text changed.`);
            lastSnapshot.push({ filePath, content });
            fs.writeFileSync(filePath, content.replace(change.oldString, change.newString));
          }
          socket.send(JSON.stringify({ type: "applied", message: `${msg.changes.length} file${msg.changes.length === 1 ? "" : "s"} updated. Your dev server will reload.` }));
        } catch (error) {
          for (const snapshot of lastSnapshot) fs.writeFileSync(snapshot.filePath, snapshot.content);
          lastSnapshot = [];
          socket.send(JSON.stringify({ type: "agent_status", status: "error", message: error instanceof Error ? error.message : "The change could not be applied." }));
        }
      } else if (msg.type === "undo") {
        for (const snapshot of lastSnapshot) fs.writeFileSync(snapshot.filePath, snapshot.content);
        const count = lastSnapshot.length;
        lastSnapshot = [];
        socket.send(JSON.stringify({ type: "undone", message: count ? "The accepted change was reverted." : "There is no accepted change to undo." }));
      }
    });

    socket.on("close", () => {
      overlaySocket = null;
      console.log(chalk.yellow("!") + " Overlay disconnected");
    });
  });

  bridgeServer.listen(BRIDGE_PORT);

  function send(msg: BridgeMessage) {
    if (overlaySocket?.readyState === overlaySocket?.OPEN) {
      overlaySocket!.send(JSON.stringify(msg));
    }
  }

  return { send };
}
