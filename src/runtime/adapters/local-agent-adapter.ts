/**
 * LocalAgentAdapter - Shared base for external coding agent backends.
 *
 * Claude Code, OpenCode, Codex CLI, and Cursor are full coding agents with
 * their own internal loops. Lasso does NOT wrap them in a competing model
 * loop: it delegates a task, streams their native structured output,
 * normalizes it into BackendEvents, and lets the orchestrator own
 * diff review, verification, and session state.
 *
 * Every adapter in this package:
 *   - invokes the agent's official non-interactive CLI with structured output
 *     (JSON/JSONL), never human-readable terminal scraping,
 *   - checks installation and authentication separately from execution,
 *   - relies on WorkspaceGuard (owned by the orchestrator) for rollback, so
 *     no agent's changes ever persist before user approval.
 */

import { spawn, ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import crypto from "node:crypto";
import path from "node:path";
import { IBackend, BackendType, BackendProvider, BackendCapabilities, BackendConfig, TaskContext, BackendEvent, BackendEvent as Event, BackendResult } from "../backend-interface";
import { AgentAction, AgentError, Observation } from "../agent-runtime";

const execFileAsync = promisify(require("node:child_process").execFile);

export interface LocalAgentConfig {
  type: "local_agent";
  provider: BackendProvider;
  modelId?: string;
  projectPath: string;
  /** Permission/approval mode passed to the agent CLI, if supported */
  permissionMode?: string;
  /** Provider-specific knobs */
  providerConfig?: Record<string, unknown>;
}

export interface CommandSpec {
  bin: string;
  args: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
}

export type AgentRunState = {
  /** External agent session/thread id (for continuation) */
  sessionId?: string;
  /** Final assistant summary, when the agent provides one */
  summary?: string;
  /** Errors reported by the agent while running */
  errors: AgentError[];
  /** Normalized conversation (user prompt + assistant summary) */
  conversation: Array<{ role: "user" | "assistant" | "system"; content: string; timestamp: number }>;
  /** Tools executed during the run (for progress + observations) */
  tools: Array<{ name: string; success?: boolean; detail?: string }>;
  /** True only when the agent's OWN terminal success signal was observed */
  receivedTerminalSuccess: boolean;
  /** Failure message when the run failed */
  failureMessage?: string;
  /** Set when the failure is an authentication/authorization problem */
  authFailure?: boolean;
  /** Set when the run was cancelled by Lasso */
  cancelled: boolean;
};

export function newRunState(): AgentRunState {
  return {
    errors: [],
    conversation: [],
    tools: [],
    receivedTerminalSuccess: false,
    cancelled: false,
  };
}

/** Sink used by adapters while parsing native events → normalized BackendEvents */
export class EventSink {
  constructor(
    private readonly taskId: string,
    private readonly emitRaw: (event: Event) => void,
    public readonly state: AgentRunState
  ) {}

  emit(type: Event["type"], data?: Record<string, unknown>): void {
    this.emitRaw({ type, taskId: this.taskId, timestamp: Date.now(), data });
  }

  progress(message: string): void {
    this.emit("task_progress", { message });
  }

  toolStarted(name: string, detail?: string): void {
    this.emit("tool_started", { tool: name, detail });
  }

  toolCompleted(name: string, success = true, detail?: string): void {
    this.emit("tool_completed", { tool: name, success, detail });
    this.state.tools.push({ name, success, detail });
  }

  fileChange(operation: "created" | "modified" | "deleted", filePath: string): void {
    if (operation === "deleted") this.emit("file_deleted", { filePath });
    else if (operation === "created") this.emit("file_created", { filePath });
    else this.emit("file_modified", { filePath });
  }

  error(message: string, options: { recoverable?: boolean; authFailure?: boolean; asEvent?: boolean } = {}): void {
    const agentError: AgentError = {
      id: crypto.randomUUID(),
      type: options.authFailure ? "permission" : "execution",
      message,
      phase: "execute",
      timestamp: Date.now(),
      recoverable: options.recoverable ?? true,
    };
    this.state.errors.push(agentError);
    if (options.authFailure) this.state.authFailure = true;
    if (options.asEvent !== false) {
      this.emit("error", { error: agentError, message });
    }
  }
}

export abstract class LocalAgentAdapter implements IBackend {
  readonly id: string;
  readonly type: BackendType = "local_agent";
  abstract readonly provider: BackendProvider;
  readonly modelId: string;

  protected readonly config: LocalAgentConfig;
  protected process?: ChildProcess;
  private currentTaskId?: string;
  private killTimer?: NodeJS.Timeout;

  constructor(config: LocalAgentConfig) {
    this.id = `${this.constructor.name}-${crypto.randomUUID()}`;
    this.config = config;
    this.modelId = config.modelId || "";
  }

  // ── subclass contract ────────────────────────────────────────────────

  abstract getCapabilities(): BackendCapabilities;

  /** Executable name resolved via PATH (e.g. "claude", "codex", "cursor-agent") */
  protected abstract get binary(): string;

  /** Human-readable install documentation URL or command */
  protected abstract get installInstructions(): string;

  /** Command used to probe installation + version */
  protected abstract get versionArgs(): string[];

  /** Check authentication using the agent's own session/credentials */
  protected abstract checkAuthentication(): Promise<{
    authenticated: boolean;
    error?: string;
    fixInstructions?: string;
  }>;

  /** Build the CLI invocation for this task */
  protected abstract buildCommand(context: TaskContext): CommandSpec;

  /**
   * Parse one line of the agent's structured output.
   * Return false when the line could not be parsed (used for diagnostics).
   */
  protected abstract handleLine(line: string, context: TaskContext, sink: EventSink): boolean;

  /**
   * Optional: extra stderr/stdout text inspection for failures
   * (e.g. "Authentication required" messages).
   */
  protected inspectFailureText(text: string): { message: string; authFailure?: boolean } | null {
    return null;
  }

  /** Whether this adapter can resume its own external session */
  protected get supportsResume(): boolean {
    return false;
  }

  // ── availability ─────────────────────────────────────────────────────

  async checkAvailability(): Promise<{
    available: boolean;
    installed: boolean;
    authenticated: boolean;
    version?: string;
    error?: string;
    fixInstructions?: string;
  }> {
    let version: string | undefined;
    try {
      const { stdout } = (await execFileAsync(this.binary, this.versionArgs, {
        timeout: 8000,
        windowsHide: true,
      })) as { stdout: string };
      version = stdout.trim().split("\n")[0]?.trim() || undefined;
    } catch {
      return {
        available: false,
        installed: false,
        authenticated: false,
        error: `${this.provider} is not installed (${this.binary} not found on PATH).`,
        fixInstructions: this.installInstructions,
      };
    }

    const auth = await this.checkAuthentication();
    if (!auth.authenticated) {
      return {
        available: false,
        installed: true,
        authenticated: false,
        version,
        error: auth.error || `${this.provider} is installed but not authenticated.`,
        fixInstructions: auth.fixInstructions || this.installInstructions,
      };
    }

    return { available: true, installed: true, authenticated: true, version };
  }

  // ── execution ────────────────────────────────────────────────────────

  async executeTask(context: TaskContext, onEvent: (event: BackendEvent) => void, signal?: AbortSignal): Promise<BackendResult> {
    this.currentTaskId = context.taskId;
    const state = newRunState();
    const sink = new EventSink(context.taskId, onEvent, state);

    sink.emit("task_started", { provider: this.provider, model: this.modelId || undefined });
    sink.state.conversation.push({ role: "user", content: context.userPrompt, timestamp: Date.now() });

    if (signal?.aborted) {
      state.cancelled = true;
      return this.buildResult(state, context, -1);
    }

    let command: CommandSpec;
    try {
      command = this.buildCommand(context);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to build agent command";
      sink.error(message, { recoverable: false });
      sink.emit("task_failed", { error: message });
      return this.buildResult(state, context, -1);
    }

    const spawnEnv: NodeJS.ProcessEnv = { ...process.env, ...(command.env || {}) };

    return new Promise<BackendResult>((resolve) => {
      let stdoutBuffer = "";
      let stderrBuffer = "";
      let settled = false;

      const child = spawn(command.bin, command.args, {
        cwd: command.cwd,
        env: spawnEnv,
        stdio: ["ignore", "pipe", "pipe"],
        // Agents inherit PATH-resolved binaries; do not open a shell.
      });
      this.process = child;

      const onAbort = () => {
        void this.cancelTask(context.taskId);
      };
      signal?.addEventListener("abort", onAbort, { once: true });

      const processLine = (line: string) => {
        if (!line.trim()) return;
        try {
          this.handleLine(line, context, sink);
        } catch {
          // A single malformed event must not kill the run; record it.
          sink.state.errors.push({
            id: crypto.randomUUID(),
            type: "unknown",
            message: `Skipped unparseable agent event: ${line.slice(0, 300)}`,
            phase: "execute",
            timestamp: Date.now(),
            recoverable: true,
          });
        }
      };

      child.stdout?.on("data", (chunk: Buffer) => {
        stdoutBuffer += chunk.toString("utf8");
        const lines = stdoutBuffer.split("\n");
        stdoutBuffer = lines.pop() || "";
        for (const line of lines) processLine(line);
      });

      child.stderr?.on("data", (chunk: Buffer) => {
        stderrBuffer = (stderrBuffer + chunk.toString("utf8")).slice(-16000);
      });

      const finish = (exitCode: number) => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener("abort", onAbort);
        if (this.killTimer) clearTimeout(this.killTimer);
        this.process = undefined;

        if (stdoutBuffer.trim()) processLine(stdoutBuffer);

        // Determine outcome. Success requires BOTH a clean exit and the
        // agent's own terminal success signal (when the format provides one).
        const failureText = [state.failureMessage, stderrBuffer.trim()].filter(Boolean).join("\n");
        const inspected = !state.failureMessage ? this.inspectFailureText(failureText) : null;
        if (inspected && !state.errors.some((e) => e.message === inspected.message)) {
          sink.error(inspected.message, { recoverable: false, authFailure: inspected.authFailure });
        }

        if (state.cancelled || signal?.aborted) {
          state.cancelled = true;
          sink.emit("task_cancelled", {});
        } else if (state.receivedTerminalSuccess && exitCode === 0 && !state.failureMessage) {
          sink.emit("task_completed", { summary: state.summary });
        } else {
          const message = state.failureMessage || inspected?.message || (exitCode === 0 ? `${this.provider} finished without reporting a successful result.` : `${this.provider} exited with code ${exitCode}${stderrBuffer ? `: ${stderrBuffer.trim().slice(-500)}` : ""}`);
          if (!state.errors.some((e) => e.message === message)) {
            sink.error(message, { recoverable: false, authFailure: state.authFailure });
          }
          sink.emit("task_failed", { error: message, exitCode });
        }

        resolve(this.buildResult(state, context, exitCode));
      };

      child.on("close", (code) => finish(code ?? -1));
      child.on("error", (error) => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener("abort", onAbort);
        this.process = undefined;
        sink.error(error.message, { recoverable: false });
        sink.emit("task_failed", { error: error.message });
        resolve(this.buildResult(state, context, -1));
      });
    });
  }

  async cancelTask(taskId: string): Promise<void> {
    if (!this.process || this.currentTaskId !== taskId) return;
    const child = this.process;
    try {
      child.kill("SIGTERM");
    } catch {
      // Already exited.
    }
    this.killTimer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        // Already exited.
      }
    }, 3000);
    this.killTimer.unref?.();
  }

  async switchBackend(newBackend: IBackend, context: TaskContext): Promise<{ transferableContext: Record<string, unknown>; lostContext: string[] }> {
    const lostContext = this.supportsResume
      ? [`${this.provider} maintains its own internal session state that cannot be transferred to ${newBackend.provider}.`, "Tool call history and per-file context held by the previous agent are not portable."]
      : [`${this.provider} does not expose resumable session state for transfer.`, "Tool call history and per-file context held by the previous agent are not portable."];

    return {
      transferableContext: {
        conversation: context.conversation,
        observations: context.previousObservations,
        errors: context.previousErrors,
        userPrompt: context.userPrompt,
        project: context.project,
        externalSessionId: context.sessionRef?.id,
      },
      lostContext,
    };
  }

  // ── helpers for subclasses ───────────────────────────────────────────

  /** Build the shared task prompt (project context + continuation context). */
  protected buildTaskPrompt(context: TaskContext): string {
    const lines: string[] = [];
    lines.push("You are Lasso, an agentic AI coding assistant embedded in this live project.");
    lines.push("");
    lines.push("Instructions:");
    lines.push("1. Understand user intent:");
    lines.push("   - If the user is greeting you, asking a question, seeking advice, feedback, explanations, or having a conversation (and NOT asking you to edit or write code): answer conversationally and concisely. Do NOT edit files or run build/modification commands.");
    lines.push("   - If the user asks to build, modify, fix, refactor, add, style, or remove code/files: perform the necessary edits directly on the project.");
    lines.push("   - If the request is ambiguous, provide a helpful answer and ask for clarification before editing files.");
    lines.push("2. All file changes will be captured as a diff, reviewed by the user, and only applied if approved.");
    lines.push("3. Do not commit, push, or perform operations outside this project directory.");
    lines.push("");

    // Retry/continuation replies ("try again", "continue", …) must resume
    // the previous request instead of being treated as a literal task —
    // otherwise the agent greps for words like "again".
    const normalizedPrompt = context.userPrompt
      .trim()
      .replace(/[.!]+$/, "")
      .toLowerCase();
    const isContinuation =
      /^(continue|proceed|go on|go ahead|keep going|yes|yep|yup|sure|ok|okay|alright|do it|carry on|resume|next|try again|again|retry|re-try|do it again|run again|run it again|one more time|same again)$/.test(normalizedPrompt) ||
      /^(try|do|run|go)\s+(it\s+|that\s+)?again$|^one more time$|^retry(\s+it)?$/i.test(normalizedPrompt);
    if (isContinuation) {
      const priorUserMessages = context.conversation.filter((m) => m.role === "user" && m.content.trim() && m.content.trim() !== context.userPrompt.trim());
      const prior = priorUserMessages[priorUserMessages.length - 1];
      if (prior) {
        lines.push(`The user is continuing/retrying. Resume this previous request: ${prior.content}`);
        lines.push("");
      }
    }

    lines.push(`User request: ${context.userPrompt}`);
    lines.push("");
    lines.push("Project context:");
    lines.push(`- Path: ${this.config.projectPath}`);
    lines.push(`- Framework: ${context.project.framework || "unknown"}`);
    lines.push(`- TypeScript: ${context.project.hasTypeScript ? "yes" : "no"}`);
    lines.push(`- React: ${context.project.hasReact ? "yes" : "no"}`);

    if (context.selection) {
      lines.push("");
      lines.push("Selected element:");
      if (context.selection.element) {
        lines.push(`- Tag: ${context.selection.element.tag}`);
        if (context.selection.element.text) lines.push(`- Text: ${context.selection.element.text}`);
      }
      if (context.selection.route) lines.push(`- Route: ${context.selection.route}`);
    }

    if (context.conversation.length > 1) {
      lines.push("");
      lines.push("Conversation so far:");
      for (const msg of context.conversation.slice(-6)) {
        lines.push(`${msg.role}: ${msg.content}`);
      }
    }

    if (context.previousObservations.length > 0) {
      lines.push("");
      lines.push("Previous observations:");
      for (const obs of context.previousObservations.slice(-5)) {
        lines.push(`- ${obs.type}: ${obs.summary}`);
      }
    }

    if (context.previousErrors.length > 0) {
      lines.push("");
      lines.push("Errors from previous attempts (fix these):");
      for (const err of context.previousErrors.slice(-5)) {
        lines.push(`- [${err.type}] ${err.message}`);
      }
    }

    lines.push("");
    lines.push("Notes:");
    lines.push("- Your file changes will be captured as a diff, reviewed by the user, and only applied if approved.");
    lines.push("- Do not commit, push, or perform operations outside this project directory.");
    return lines.join("\n");
  }

  /** Resume reference from Lasso's canonical session state (if any). */
  protected resumeSessionId(context: TaskContext): string | undefined {
    return context.sessionRef?.id;
  }

  /** Convert an absolute path reported by the agent to a project-relative one. */
  protected relPath(absoluteOrRelative: string): string {
    if (!path.isAbsolute(absoluteOrRelative)) return absoluteOrRelative;
    const rel = path.relative(this.config.projectPath, absoluteOrRelative);
    if (!rel || rel.startsWith("..")) return absoluteOrRelative;
    return rel;
  }

  private buildResult(state: AgentRunState, context: TaskContext, exitCode: number): BackendResult {
    const cancelled = state.cancelled;
    const success = !cancelled && state.receivedTerminalSuccess && exitCode === 0 && !state.failureMessage;

    const observations: Observation[] = [
      {
        id: crypto.randomUUID(),
        type: "tool",
        summary: `${this.provider} ${cancelled ? "was cancelled" : success ? "completed the task" : "failed the task"} (${state.tools.length} tool call${state.tools.length === 1 ? "" : "s"})`,
        data: {
          provider: this.provider,
          model: this.modelId || undefined,
          tools: state.tools,
          exitCode,
        },
        timestamp: Date.now(),
        phase: "execute",
      },
    ];

    if (state.summary) {
      state.conversation.push({ role: "assistant", content: state.summary, timestamp: Date.now() });
    }

    return {
      success,
      status: cancelled ? "cancelled" : success ? "completed" : "failed",
      summary: state.summary || (cancelled ? "Task cancelled" : success ? `${this.provider} completed the task` : state.failureMessage || `${this.provider} failed`),
      // File changes are authoritative from WorkspaceGuard (orchestrator-side diff),
      // not from the agent's own claims.
      fileChanges: [],
      actions: [] as AgentAction[],
      observations,
      errors: state.errors,
      conversation: state.conversation,
      metadata: {
        provider: this.provider,
        model: this.modelId || undefined,
        exitCode,
        externalSessionId: state.sessionId,
        resumable: Boolean(state.sessionId) && this.supportsResume,
        tools: state.tools,
      },
    };
  }
}
