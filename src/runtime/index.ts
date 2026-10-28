/**
 * Lasso runtime core — shared by the server (hosted sessions, colocated
 * self-host) and the CLI LocalRuntime (local coding agents on the user's
 * machine). Single implementation of the review-first agent workflow.
 */

export * from "./agent-runtime";
export * from "./backend-interface";
export * from "./workspace-guard";
export * from "./verification-engine";
export * from "./agent-state-machine";
export * from "./event-mapper";
export * from "./review";
export * from "./local-session-runner";
export * from "./tool-protocol";
export { ActionExecutor, ActionExecutionResult } from "./action-executor";
export * from "./adapters/factory";
export { LocalAgentAdapter, EventSink, newRunState } from "./adapters/local-agent-adapter";
export type { LocalAgentConfig, CommandSpec, AgentRunState } from "./adapters/local-agent-adapter";
export { ClaudeCodeAdapter } from "./adapters/claude-code-adapter";
export { OpenCodeAdapter } from "./adapters/opencode-adapter";
export { CodexCLIAdapter } from "./adapters/codex-cli-adapter";
export { CursorAdapter } from "./adapters/cursor-adapter";
export { AntigravityAdapter } from "./adapters/antigravity-adapter";
