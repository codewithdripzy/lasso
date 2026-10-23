/**
 * OpenCode Adapter
 *
 * Adapter for the OpenCode CLI (`opencode run`), an open-source local coding agent.
 *
 * Invocation: opencode run --format json -m <provider/model> [--session <ses_...>] <message>
 * with cwd set to the project path. Output is a raw JSON event stream
 * (step_start / tool_use / text / step_finish) normalized into BackendEvents.
 *
 * File changes are not trusted from the agent's report — the orchestrator's
 * WorkspaceGuard diffs the project after the run and restores it before review.
 *
 * Reference: https://opencode.ai/docs/cli
 */

import { promisify } from "node:util";
import { LocalAgentAdapter, LocalAgentConfig, CommandSpec, EventSink } from "./local-agent-adapter";
import { BackendCapabilities, TaskContext } from "../backend-interface";
import { isOpenCodeHeadlessRestrictedModel } from "../../cli/backends";

const execFileAsync = promisify(require("node:child_process").execFile);

interface OpenCodeConfig extends LocalAgentConfig {
  provider: "opencode";
}

interface OpenCodeEvent {
  type?: string;
  sessionID?: string;
  error?: unknown;
  part?: {
    type?: string;
    tool?: string;
    text?: string;
    reason?: string;
    state?: {
      status?: "pending" | "running" | "completed" | "error";
      input?: Record<string, unknown>;
      output?: unknown;
      error?: unknown;
    };
  };
}

const FILE_INPUT_KEYS = ["filePath", "file_path", "path", "filename"];

export class OpenCodeAdapter extends LocalAgentAdapter {
  readonly provider = "opencode" as const;

  constructor(config: OpenCodeConfig) {
    super({ ...config, type: "local_agent", provider: "opencode" });
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
    return "opencode";
  }

  protected get installInstructions(): string {
    return "Install OpenCode: npm install -g opencode-ai (or https://opencode.ai/docs). Then authenticate with 'opencode auth login'.";
  }

  protected get versionArgs(): string[] {
    return ["--version"];
  }

  protected get supportsResume(): boolean {
    return true;
  }

  protected async checkAuthentication(): Promise<{ authenticated: boolean; error?: string; fixInstructions?: string }> {
    try {
      const { stdout, stderr } = (await execFileAsync("opencode", ["providers", "list"], {
        timeout: 12000,
        windowsHide: true,
      })) as { stdout: string; stderr: string };
      const text = `${stdout}\n${stderr}`.replace(/\u001b\[[0-9;]*m/g, "").replace(/\u001b\][^\u0007]*\u0007/g, "");

      // The credentials section lists a "●" bullet per configured credential.
      const credentialsStart = text.indexOf("Credentials");
      const environmentStart = text.indexOf("Environment");
      if (credentialsStart >= 0) {
        const section = text.slice(credentialsStart, environmentStart > credentialsStart ? environmentStart : undefined);
        if (!section.includes("●")) {
          return {
            authenticated: false,
            error: "OpenCode has no stored credentials.",
            fixInstructions: "Run 'opencode auth login' or set a provider API key (e.g. OPENCODE / OPENAI / ANTHROPIC keys).",
          };
        }
      }
      return { authenticated: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        authenticated: false,
        error: `Could not verify OpenCode authentication: ${message}`,
        fixInstructions: "Run 'opencode providers list' manually and configure credentials with 'opencode auth login'.",
      };
    }
  }

  protected buildCommand(context: TaskContext): CommandSpec {
    if (this.modelId && isOpenCodeHeadlessRestrictedModel(this.modelId)) {
      throw new Error(`OpenCode model ${this.modelId} is restricted to OpenCode's own app and cannot run through Lasso. Choose a non-free OpenCode model or configure another provider.`);
    }
    const resumeId = this.resumeSessionId(context);
    const args = ["run", "--format", "json"];
    if (this.modelId) args.push("-m", this.modelId);
    if (resumeId) args.push("--session", resumeId);
    args.push(this.buildTaskPrompt(context));

    const env = context.mode === "conversation" ? { OPENCODE_PERMISSION: JSON.stringify({ "*": "deny" }) } : undefined;
    return { bin: "opencode", args, cwd: (this.config as OpenCodeConfig).projectPath, env };
  }

  protected handleLine(line: string, context: TaskContext, sink: EventSink): boolean {
    let event: OpenCodeEvent;
    try {
      event = JSON.parse(line) as OpenCodeEvent;
    } catch {
      return false;
    }

    if (event.sessionID) sink.state.sessionId = event.sessionID;

    switch (event.type) {
      case "step_start": {
        sink.progress("OpenCode is working…");
        return true;
      }

      case "tool_use": {
        const part = event.part || {};
        const toolName = part.tool || "tool";
        const status = part.state?.status;
        const input = part.state?.input || {};

        if (status === "pending" || status === "running") {
          sink.toolStarted(toolName, this.describeInput(toolName, input));
        } else if (status === "completed") {
          sink.toolCompleted(toolName, true, this.describeInput(toolName, input));
          this.reportFileOperation(toolName, input, sink);
        } else if (status === "error") {
          sink.toolCompleted(toolName, false, this.describeInput(toolName, input));
          const errText = this.describeError(part.state?.error) || `${toolName} failed`;
          sink.error(errText, { recoverable: true });
        }
        return true;
      }

      case "text": {
        const text = event.part?.text;
        if (text) sink.progress(text);
        return true;
      }

      case "step_finish": {
        // A finished step marks the turn as complete; the exit code decides success.
        sink.state.receivedTerminalSuccess = true;
        return true;
      }

      case "error": {
        const message = this.describeError(event.error) || "OpenCode reported an error";
        sink.state.failureMessage = message;
        sink.error(message, { recoverable: false });
        return true;
      }

      default:
        return true;
    }
  }

  private describeInput(toolName: string, input: Record<string, unknown>): string | undefined {
    if (typeof input.command === "string") return input.command.slice(0, 200);
    const key = FILE_INPUT_KEYS.find((k) => typeof input[k] === "string");
    if (key) return String(input[key]);
    if (typeof input.pattern === "string") return input.pattern;
    return undefined;
  }

  private describeError(error: unknown): string | undefined {
    if (!error) return undefined;
    if (typeof error === "string") return error;
    if (typeof error === "object") {
      const e = error as Record<string, unknown>;
      const nested = [e.message, (e.data as Record<string, unknown> | undefined)?.message, (e.data as Record<string, unknown> | undefined)?.error, (e.cause as Record<string, unknown> | undefined)?.message].find((item): item is string => typeof item === "string" && item.trim().length > 0);
      if (nested) return nested;
      try {
        const serialized = JSON.stringify(error).slice(0, 800);
        return typeof e.name === "string" ? `${e.name}: ${serialized}` : serialized;
      } catch {
        return typeof e.name === "string" ? e.name : undefined;
      }
    }
    return String(error);
  }

  private reportFileOperation(toolName: string, input: Record<string, unknown>, sink: EventSink): void {
    const key = FILE_INPUT_KEYS.find((k) => typeof input[k] === "string");
    if (!key) return;
    const rel = this.relPath(String(input[key]));
    const normalized = toolName.toLowerCase();

    if (normalized.includes("write")) {
      // Guard diff decides create vs modify.
      sink.fileChange("modified", rel);
    } else if (normalized.includes("edit") || normalized.includes("patch")) {
      sink.fileChange("modified", rel);
    } else if (normalized.includes("remove") || normalized.includes("delete")) {
      sink.fileChange("deleted", rel);
    }
  }

  protected inspectFailureText(text: string): { message: string; authFailure?: boolean } | null {
    if (!text) return null;
    if (/not logged in|authentication required|invalid api key|401|unauthorized/i.test(text)) {
      return { message: "OpenCode authentication failed.", authFailure: true };
    }
    if (/rate limit|usage limit|quota exceeded/i.test(text)) {
      return { message: "OpenCode provider rate limit or quota exceeded.", authFailure: true };
    }
    return null;
  }
}
