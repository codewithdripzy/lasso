/**
 * Claude Code Adapter
 *
 * Adapter for the Claude Code CLI (`claude`), the Anthropic coding agent.
 *
 * Claude Code has its own agentic loop, so Lasso delegates the task wholesale:
 *   claude -p <prompt> --output-format stream-json --verbose --permission-mode acceptEdits
 *
 * The JSONL stream (system/init, assistant, result) is normalized into
 * BackendEvents. File changes are NOT trusted from the agent's report —
 * the orchestrator's WorkspaceGuard diffs the project after the run and
 * restores it before review, so nothing is applied without approval.
 *
 * Reference: https://docs.claude.com/en/docs/claude-code/headless
 */

import { promisify } from "node:util";
import crypto from "node:crypto";
import { LocalAgentAdapter, LocalAgentConfig, CommandSpec, EventSink } from "./local-agent-adapter";
import { BackendCapabilities, TaskContext } from "../backend-interface";

const execFileAsync = promisify(require("node:child_process").execFile);

interface ClaudeCodeConfig extends LocalAgentConfig {
  provider: "claude_code";
  maxTurns?: number;
  maxBudgetUsd?: number;
}

/** Claude Code stream-json line (subset we act on) */
interface ClaudeEvent {
  type: "system" | "assistant" | "result" | "stream_event" | string;
  subtype?: string;
  session_id?: string;
  model?: string;
  error?: string;
  message?: {
    role?: string;
    content?: Array<{
      type: "text" | "tool_use" | "tool_result" | string;
      text?: string;
      name?: string;
      id?: string;
      input?: Record<string, unknown>;
      is_error?: boolean;
      content?: unknown;
    }>;
  };
  is_error?: boolean;
  result?: string;
  num_turns?: number;
  permission_denials?: unknown[];
}

const TOOL_FILE_KEYS = ["file_path", "filePath", "path", "notebook_path"];

export class ClaudeCodeAdapter extends LocalAgentAdapter {
  readonly provider = "claude_code" as const;

  constructor(config: ClaudeCodeConfig) {
    super({ ...config, type: "local_agent", provider: "claude_code" });
  }

  getCapabilities(): BackendCapabilities {
    return {
      canStreamEvents: true,
      // Operates directly on the project; WorkspaceGuard guarantees rollback before review.
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
    return "claude";
  }

  protected get installInstructions(): string {
    return "Install Claude Code: npm install -g @anthropic-ai/claude-code (or https://docs.claude.com/en/docs/claude-code/setup)";
  }

  protected get versionArgs(): string[] {
    return ["--version"];
  }

  protected get supportsResume(): boolean {
    return true;
  }

  protected async checkAuthentication(): Promise<{ authenticated: boolean; error?: string; fixInstructions?: string }> {
    try {
      const { stdout } = (await execFileAsync("claude", ["auth", "status"], {
        timeout: 10000,
        windowsHide: true,
      })) as { stdout: string };
      const jsonStart = stdout.indexOf("{");
      if (jsonStart >= 0) {
        try {
          const parsed = JSON.parse(stdout.slice(jsonStart));
          if (parsed && typeof parsed.loggedIn === "boolean") {
            return parsed.loggedIn ? { authenticated: true } : { authenticated: false, error: "Claude Code is not logged in.", fixInstructions: "Run 'claude' once and log in, or run 'claude auth login'." };
          }
        } catch {
          // Fall through to exit-code based result.
        }
      }
      return { authenticated: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        authenticated: false,
        error: `Could not verify Claude Code authentication: ${message}`,
        fixInstructions: "Run 'claude' once and complete the login flow, then retry.",
      };
    }
  }

  protected buildCommand(context: TaskContext): CommandSpec {
    const cfg = this.config as ClaudeCodeConfig;
    const resumeId = this.resumeSessionId(context);
    const sessionId = crypto.randomUUID();

    const args = ["-p", this.buildTaskPrompt(context), "--output-format", "stream-json", "--verbose", "--permission-mode", cfg.permissionMode || "acceptEdits"];

    if (this.modelId) args.push("--model", this.modelId);
    if (resumeId) args.push("--resume", resumeId);
    else args.push("--session-id", sessionId);
    if (cfg.maxTurns) args.push("--max-turns", String(cfg.maxTurns));
    if (cfg.maxBudgetUsd) args.push("--max-budget-usd", String(cfg.maxBudgetUsd));

    return { bin: "claude", args, cwd: cfg.projectPath };
  }

  protected handleLine(line: string, context: TaskContext, sink: EventSink): boolean {
    let event: ClaudeEvent;
    try {
      event = JSON.parse(line) as ClaudeEvent;
    } catch {
      return false;
    }

    if (typeof event.session_id === "string" && event.session_id) {
      sink.state.sessionId = event.session_id;
    }

    switch (event.type) {
      case "system": {
        if (event.subtype === "init") {
          sink.state.sessionId = event.session_id || sink.state.sessionId;
          sink.progress(`Claude Code session started${event.model ? ` (model: ${event.model})` : ""}`);
        }
        return true;
      }

      case "assistant": {
        this.handleAssistant(event, sink);
        return true;
      }

      case "result": {
        if (event.is_error) {
          sink.state.failureMessage = event.result || "Claude Code reported an error";
          if (/credit balance|billing|quota|rate.?limit/i.test(sink.state.failureMessage)) {
            sink.state.authFailure = true;
          }
        } else if (event.subtype === "success" || !event.is_error) {
          sink.state.receivedTerminalSuccess = true;
          if (event.result) sink.state.summary = event.result;
        }
        return true;
      }

      case "stream_event": {
        // Incremental progress; ignore bulk content, keep assistant-level info only.
        return true;
      }

      default:
        return true;
    }
  }

  private handleAssistant(event: ClaudeEvent, sink: EventSink): void {
    const content = event.message?.content || [];

    if (event.error) {
      const text = content
        .map((c) => c.text || "")
        .filter(Boolean)
        .join(" ");
      sink.state.failureMessage = text || `Claude Code error: ${event.error}`;
      if (/billing|auth|unauthorized|credit/i.test(event.error) || /credit balance|not logged in|unauthorized/i.test(sink.state.failureMessage)) {
        sink.state.authFailure = true;
      }
      sink.error(sink.state.failureMessage, { recoverable: false, authFailure: sink.state.authFailure });
      return;
    }

    for (const block of content) {
      if (block.type === "text" && block.text) {
        sink.progress(block.text);
      } else if (block.type === "tool_use" && block.name) {
        const input = block.input || {};
        sink.toolStarted(block.name, this.describeToolInput(block.name, input));
        this.reportFileOperation(block.name, input, sink);
      } else if (block.type === "tool_result" && block.is_error) {
        const msg = typeof block.content === "string" ? block.content : JSON.stringify(block.content).slice(0, 500);
        sink.error(`Tool returned an error: ${msg}`, { recoverable: true, asEvent: true });
      }
    }
  }

  private describeToolInput(name: string, input: Record<string, unknown>): string | undefined {
    switch (name) {
      case "Bash":
        return typeof input.command === "string" ? input.command.slice(0, 200) : undefined;
      case "Read":
      case "Write":
      case "Edit":
      case "MultiEdit":
      case "NotebookEdit": {
        const key = TOOL_FILE_KEYS.find((k) => typeof input[k] === "string");
        return key ? String(input[key]) : undefined;
      }
      default:
        return typeof input.description === "string" ? input.description : undefined;
    }
  }

  private reportFileOperation(toolName: string, input: Record<string, unknown>, sink: EventSink): void {
    const key = TOOL_FILE_KEYS.find((k) => typeof input[k] === "string");
    if (!key) return;
    const rel = this.relPath(String(input[key]));

    // Claude's Write creates-or-overwrites; the guard diff decides the real operation.
    if (toolName === "Write" || toolName === "Edit" || toolName === "MultiEdit" || toolName === "NotebookEdit") {
      sink.fileChange("modified", rel);
    }
  }

  protected inspectFailureText(text: string): { message: string; authFailure?: boolean } | null {
    if (!text) return null;
    if (/authentication required|not logged in|please run ['"]?claude auth|invalid api key/i.test(text)) {
      return {
        message: "Claude Code authentication failed.",
        authFailure: true,
      };
    }
    if (/credit balance is too low|billing_error/i.test(text)) {
      return { message: "Claude Code account has insufficient credit balance.", authFailure: true };
    }
    if (/usage limit reached|rate limit/i.test(text)) {
      return { message: "Claude Code usage limit reached — try again later.", authFailure: true };
    }
    return null;
  }
}
