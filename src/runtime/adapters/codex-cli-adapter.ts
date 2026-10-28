/**
 * Codex CLI Adapter
 *
 * Adapter for OpenAI's Codex CLI (`codex exec`), a local coding agent with its
 * own agentic loop.
 *
 * Invocation: codex exec --json --skip-git-repo-check -s workspace-write [-m model] <prompt>
 * (resume: codex exec resume <thread_id> --json --skip-git-repo-check <prompt>)
 * with stdin ignored and cwd set to the project path. Output is JSONL
 * (thread.started / item.* / turn.*) normalized into BackendEvents.
 *
 * File changes are not trusted from the agent's report — the orchestrator's
 * WorkspaceGuard diffs the project after the run and restores it before review.
 *
 * Reference: https://github.com/openai/codex
 */

import { promisify } from "node:util";
import { LocalAgentAdapter, LocalAgentConfig, CommandSpec, EventSink } from "./local-agent-adapter";
import { BackendCapabilities, TaskContext } from "../backend-interface";

const execFileAsync = promisify(require("node:child_process").execFile);

interface CodexConfig extends LocalAgentConfig {
  provider: "codex_cli";
}

interface CodexItem {
  type?: string;
  item_type?: string;
  text?: string;
  command?: string;
  aggregated_output?: string;
  exit_code?: number;
  status?: string;
  changes?: Array<{ path?: string; kind?: string }>;
  error?: unknown;
  message?: string;
}

interface CodexEvent {
  type?: string;
  thread_id?: string;
  message?: string;
  error?: unknown;
  item?: CodexItem;
  usage?: unknown;
}

export class CodexCLIAdapter extends LocalAgentAdapter {
  readonly provider = "codex_cli" as const;

  constructor(config: CodexConfig) {
    super({ ...config, type: "local_agent", provider: "codex_cli" });
  }

  getCapabilities(): BackendCapabilities {
    return {
      canStreamEvents: true,
      canIsolateWorkspace: false,
      providesStructuredDiffs: false,
      supportsSessionContinuation: true,
      supportsCancellation: true,
      hasInternalLoop: true,
      supportedFileOperations: "both",
      canRunCommands: true,
      authMethod: "cli_session",
      forbiddenCommands: ["rm -rf /", "mkfs"],
    };
  }

  protected get binary(): string {
    return "codex";
  }

  protected get installInstructions(): string {
    return "Install Codex CLI: npm install -g @openai/codex (or https://github.com/openai/codex). Then run 'codex login'.";
  }

  protected get versionArgs(): string[] {
    return ["--version"];
  }

  protected get supportsResume(): boolean {
    return true;
  }

  protected async checkAuthentication(): Promise<{ authenticated: boolean; error?: string; fixInstructions?: string }> {
    try {
      await execFileAsync("codex", ["login", "status"], { timeout: 10000, windowsHide: true });
      return { authenticated: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        authenticated: false,
        error: `Codex CLI is not logged in (${message.split("\n")[0]}).`,
        fixInstructions: "Run 'codex login' and sign in with ChatGPT or an API key.",
      };
    }
  }

  protected buildCommand(context: TaskContext): CommandSpec {
    const cfg = this.config as CodexConfig;
    const resumeId = this.resumeSessionId(context);
    const prompt = this.buildTaskPrompt(context);

    const args: string[] = ["exec"];
    if (resumeId) {
      // `resume` does not accept -s; sandbox policy goes through a config override.
      args.push("resume", resumeId, "--json", "--skip-git-repo-check", "-c", `sandbox_mode="${context.mode === "conversation" ? "read-only" : "workspace-write"}"`);
      if (this.modelId) args.push("-m", this.modelId);
    } else {
      args.push("--json", "--skip-git-repo-check", "-s", "workspace-write");
      if (this.modelId) args.push("-m", this.modelId);
    }
    if (context.mode === "conversation") {
      const sandboxIndex = args.indexOf("workspace-write");
      if (sandboxIndex >= 0) args[sandboxIndex] = "read-only";
    }
    args.push(prompt);

    return { bin: "codex", args, cwd: cfg.projectPath };
  }

  protected handleLine(line: string, context: TaskContext, sink: EventSink): boolean {
    let event: CodexEvent;
    try {
      event = JSON.parse(line) as CodexEvent;
    } catch {
      return false;
    }

    switch (event.type) {
      case "thread.started": {
        if (event.thread_id) sink.state.sessionId = event.thread_id;
        sink.progress(`Codex thread started${event.thread_id ? ` (${event.thread_id})` : ""}`);
        return true;
      }

      case "turn.started": {
        sink.progress("Codex turn started");
        return true;
      }

      case "item.started":
      case "item.updated": {
        const item = event.item || {};
        const itemType = item.item_type || item.type;
        if (itemType === "command_execution" && item.command) {
          sink.toolStarted("shell", item.command.slice(0, 200));
        } else if (itemType === "file_change") {
          sink.toolStarted("file_change", undefined);
        }
        return true;
      }

      case "item.completed": {
        this.handleItemCompleted(event.item || {}, sink);
        return true;
      }

      case "error": {
        const message = event.message || this.describeError(event.error) || "Codex reported an error";
        this.recordFailure(sink, message);
        return true;
      }

      case "turn.failed": {
        const message = this.describeError(event.error) || "Codex turn failed";
        this.recordFailure(sink, message);
        return true;
      }

      case "turn.completed": {
        sink.state.receivedTerminalSuccess = true;
        return true;
      }

      default:
        return true;
    }
  }

  private handleItemCompleted(item: CodexItem, sink: EventSink): void {
    switch (item.item_type || item.type) {
      case "command_execution": {
        const success = typeof item.exit_code === "number" ? item.exit_code === 0 : item.status === "completed";
        sink.toolCompleted("shell", success, (item.command || "").slice(0, 200));
        if (!success && item.aggregated_output) {
          sink.error(`Command failed (exit ${item.exit_code ?? "?"}): ${item.aggregated_output.slice(-300)}`, { recoverable: true });
        }
        break;
      }

      case "file_change": {
        sink.toolCompleted("file_change", true);
        for (const change of item.changes || []) {
          if (!change.path) continue;
          const rel = this.relPath(change.path);
          const kind = (change.kind || "").toLowerCase();
          if (kind.includes("delete")) sink.fileChange("deleted", rel);
          else sink.fileChange("modified", rel);
        }
        break;
      }

      case "assistant_message":
      case "agent_message": {
        if (item.text) {
          sink.progress(item.text);
          sink.state.summary = item.text;
        }
        break;
      }

      case "error": {
        const message = this.describeError(item.error) || item.message || "Codex item error";
        this.recordFailure(sink, message);
        break;
      }

      default:
        break;
    }
  }

  private recordFailure(sink: EventSink, message: string): void {
    if (!sink.state.failureMessage) sink.state.failureMessage = message;
    if (/usage limit|rate limit|quota|billing|upgrade to plus/i.test(message)) {
      sink.state.authFailure = true;
    }
    // "error" and "turn.failed" often carry the same message — record once.
    if (!sink.state.errors.some((e) => e.message === message)) {
      sink.error(message, { recoverable: false, authFailure: sink.state.authFailure });
    }
  }

  private describeError(error: unknown): string | undefined {
    if (!error) return undefined;
    if (typeof error === "string") return error;
    if (typeof error === "object") {
      const value = error as Record<string, unknown>;
      const nested = [value.message, (value.data as Record<string, unknown> | undefined)?.message, (value.cause as Record<string, unknown> | undefined)?.message].find((item): item is string => typeof item === "string" && item.trim().length > 0);
      if (nested) return nested;
      try {
        return JSON.stringify(error).slice(0, 800);
      } catch {
        return undefined;
      }
    }
    return String(error);
  }

  protected inspectFailureText(text: string): { message: string; authFailure?: boolean } | null {
    if (!text) return null;
    if (/not logged in|please run ['"]?codex login|authentication/i.test(text)) {
      return { message: "Codex CLI is not authenticated.", authFailure: true };
    }
    if (/usage limit|upgrade to plus|quota exceeded/i.test(text)) {
      return { message: "Codex usage limit reached — try again later or upgrade the account.", authFailure: true };
    }
    return null;
  }
}
