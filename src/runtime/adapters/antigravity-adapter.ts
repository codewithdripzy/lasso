/**
 * Google Antigravity CLI adapter.
 *
 * Uses the official headless NDJSON interface so Lasso can surface thinking,
 * tool activity, errors, and completion while Antigravity works in the project.
 */

import { LocalAgentAdapter, type LocalAgentConfig, type CommandSpec, type EventSink } from "./local-agent-adapter";
import type { BackendCapabilities, TaskContext } from "../backend-interface";

interface AntigravityConfig extends LocalAgentConfig {
  provider: "antigravity";
}

interface AntigravityStep {
  conversation_id?: string;
  step_type?: string;
  state?: string;
  text_delta?: string;
  tool_name?: string;
  tool_info?: {
    name?: string;
    parameters?: Record<string, unknown>;
    output?: string;
    error?: { message?: string; type?: string };
  };
}

interface AntigravityEvent {
  event?: "init" | "step_update" | "result";
  conversation_id?: string;
  step_update?: AntigravityStep;
  result?: {
    conversation_id?: string;
    status?: string;
    response?: string;
    error?: { message?: string } | string;
  };
}

const FILE_TOOLS = /write|edit|delete|file/i;

export class AntigravityAdapter extends LocalAgentAdapter {
  readonly provider = "antigravity" as const;

  constructor(config: AntigravityConfig) {
    super({ ...config, type: "local_agent", provider: "antigravity" });
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
    return "agy";
  }

  protected get installInstructions(): string {
    return "Install Antigravity CLI from https://antigravity.google/docs/install/, then run 'agy' and complete sign-in.";
  }

  protected get versionArgs(): string[] {
    return ["--version"];
  }

  protected get supportsResume(): boolean {
    return true;
  }

  protected async checkAuthentication(): Promise<{ authenticated: boolean; error?: string; fixInstructions?: string }> {
    try {
      await import("node:child_process").then(
        ({ execFile }) =>
          new Promise<void>((resolve, reject) => {
            execFile("agy", ["models"], { timeout: 15000, windowsHide: true }, (error) => (error ? reject(error) : resolve()));
          })
      );
      return { authenticated: true };
    } catch {
      return {
        authenticated: false,
        error: "Antigravity could not load its configured models.",
        fixInstructions: "Run 'agy' in a terminal and complete sign-in, then verify with 'agy models'.",
      };
    }
  }

  protected buildCommand(context: TaskContext): CommandSpec {
    const args = ["--output-format", "stream-json", "--print-timeout", "0", "--mode", context.mode === "conversation" ? "plan" : "accept-edits"];
    if (this.modelId) args.push("--model", this.modelId);

    const resumeId = this.resumeSessionId(context);
    if (resumeId) args.push("--conversation", resumeId);
    args.push("-p", this.buildTaskPrompt(context));

    return { bin: "agy", args, cwd: (this.config as AntigravityConfig).projectPath };
  }

  protected handleLine(line: string, _context: TaskContext, sink: EventSink): boolean {
    let event: AntigravityEvent;
    try {
      event = JSON.parse(line) as AntigravityEvent;
    } catch {
      return false;
    }

    if (event.event === "init") {
      const sessionId = event.conversation_id || event.result?.conversation_id;
      if (sessionId) sink.state.sessionId = sessionId;
      sink.progress("Antigravity session started");
      return true;
    }

    if (event.event === "step_update" && event.step_update) {
      this.handleStep(event.step_update, sink);
      return true;
    }

    if (event.event === "result" && event.result) {
      const result = event.result;
      if (result.conversation_id) sink.state.sessionId = result.conversation_id;
      if (result.status?.toUpperCase() === "SUCCESS") {
        sink.state.receivedTerminalSuccess = true;
        if (result.response) sink.state.summary = result.response;
      } else {
        const error = typeof result.error === "string" ? result.error : result.error?.message;
        sink.state.failureMessage = error || `Antigravity finished with status ${result.status || "unknown"}.`;
        sink.error(sink.state.failureMessage, { recoverable: false });
      }
      return true;
    }

    return true;
  }

  private handleStep(step: AntigravityStep, sink: EventSink): void {
    if (step.conversation_id) sink.state.sessionId = step.conversation_id;

    if (step.step_type === "agent_response" && step.text_delta?.trim()) {
      sink.progress(step.text_delta.trim());
      return;
    }

    if (step.step_type !== "tool" || !step.tool_info) return;
    const toolName = step.tool_info.name || step.tool_name || "tool";
    const params = step.tool_info.parameters || {};
    const detail = Object.values(params).find((value): value is string => typeof value === "string");
    const description = detail?.slice(0, 240);

    if (step.state === "ACTIVE") {
      sink.toolStarted(toolName, description);
      return;
    }
    if (step.state !== "DONE") return;

    const failed = Boolean(step.tool_info.error);
    sink.toolCompleted(toolName, !failed, description);
    if (failed) sink.error(`${toolName} failed: ${step.tool_info.error?.message || "Antigravity reported a tool error."}`, { recoverable: true });

    if (FILE_TOOLS.test(toolName)) {
      const filePath = Object.entries(params).find(([key, value]) => /path|file/i.test(key) && typeof value === "string")?.[1];
      if (typeof filePath === "string") {
        const relativePath = this.relPath(filePath);
        const normalizedName = toolName.toLowerCase();
        sink.fileChange(/delete|remove/i.test(normalizedName) ? "deleted" : /create|write/i.test(normalizedName) ? "modified" : "modified", relativePath);
      }
    }
  }

  protected inspectFailureText(text: string): { message: string; authFailure?: boolean } | null {
    if (/unauthenticated|authentication required|sign in|login required|credential/i.test(text)) {
      return { message: "Antigravity authentication is required. Run 'agy' in a terminal and complete sign-in.", authFailure: true };
    }
    return null;
  }
}
