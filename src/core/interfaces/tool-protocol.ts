/**
 * Tool-call protocol for hosted-model agent runs.
 *
 * The server orchestrates the agent loop and calls the hosted model, but it
 * never touches the user's filesystem. When the model requests a workspace
 * action (read/edit/run/verify/...), the server emits a `tool_call` event over
 * the runtime event channel (SSE). The local CLI executes the tool against
 * the real project directory and posts the result back to
 * `POST /sessions/:sessionId/tool-results`, where the orchestrator feeds it
 * back into the model loop.
 */
import type { AgentAction, AgentError, Observation } from "./agent-runtime";

/** A tool execution request from the server to the local CLI. */
export interface ToolCallRequest {
  /** Unique id correlating the request with its result. */
  callId: string;
  sessionId: string;
  /** `action` = workspace tool; `verify` = run the verification engine. */
  kind: "action" | "verify";
  /** Present when kind === "action". */
  action?: AgentAction;
  /** Present when kind === "verify". */
  verify?: { phase?: string };
}

/** The CLI's response to a tool_call, posted back to the server. */
export interface ToolCallResultPayload {
  callId: string;
  success: boolean;
  output?: unknown;
  error?: string;
  /** Observations to feed back into the model's context. */
  observations?: Observation[];
  /** Errors to record on the session (e.g. verification failures). */
  errors?: AgentError[];
}

/** Default per-tool timeouts (ms). run_command is long-running by nature. */
export const TOOL_CALL_TIMEOUT_MS: Record<string, number> = {
  run_command: 180_000,
  verify: 300_000,
  default: 120_000,
};

export function toolCallTimeoutMs(tool: string): number {
  return TOOL_CALL_TIMEOUT_MS[tool] ?? TOOL_CALL_TIMEOUT_MS.default;
}
