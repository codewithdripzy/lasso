/**
 * Lasso Backend Interface - Unified Abstraction for Agent Backends
 *
 * This file defines the common interface for all agent backends:
 * - Hosted model providers (Anthropic, OpenAI, Google, NVIDIA, Ollama)
 * - Local coding agents (Claude Code, OpenCode, Codex CLI, Cursor)
 *
 * The Lasso Runtime uses this interface to delegate task execution while maintaining
 * control over the overall workflow: Understand → Inspect → Plan → Execute → Verify → Recover → Complete
 */

import { AgentAction, Observation, AgentError, AgentPhase, ProjectContext, SelectionContext } from "./agent-runtime";

// Re-export types for convenience
export type { AgentAction, Observation, AgentError, AgentPhase, ProjectContext, SelectionContext } from "./agent-runtime";

// ============================================================================
// Backend Types
// ============================================================================

export type BackendType =
  | "hosted_model" // Anthropic, OpenAI, Google, NVIDIA, Ollama APIs
  | "local_agent"; // Claude Code, OpenCode, Codex CLI, Cursor, Antigravity

export type BackendProvider =
  // Hosted models
  | "anthropic"
  | "openai"
  | "google"
  | "nvidia"
  | "ollama"
  // Local agents
  | "claude_code"
  | "opencode"
  | "codex_cli"
  | "cursor"
  | "antigravity";

// ============================================================================
// Backend Capabilities
// ============================================================================

export interface BackendCapabilities {
  /**
   * Whether the backend can stream progress events in real-time
   */
  canStreamEvents: boolean;

  /**
   * Whether the backend can operate in an isolated workspace
   * (required for safe pre-review execution)
   */
  canIsolateWorkspace: boolean;

  /**
   * Whether the backend provides structured diff output
   * (vs. requiring post-execution diff generation)
   */
  providesStructuredDiffs: boolean;

  /**
   * Whether the backend supports session continuation across calls
   */
  supportsSessionContinuation: boolean;

  /**
   * Whether the backend can cancel running tasks
   */
  supportsCancellation: boolean;

  /**
   * Whether the backend has its own internal agentic loop
   * (if true, Lasso should not run a competing loop around it)
   */
  hasInternalLoop: boolean;

  /**
   * File operations the backend can perform directly
   */
  supportedFileOperations: "read" | "write" | "both" | "none";

  /**
   * Whether the backend can run shell commands
   */
  canRunCommands: boolean;

  /**
   * Authentication method
   */
  authMethod: "api_key" | "cli_session" | "none" | "oauth";

  /**
   * Maximum file size for operations (in bytes), if any
   */
  maxFileSize?: number;

  /**
   * Commands that are forbidden (if any)
   */
  forbiddenCommands?: string[];
}

// ============================================================================
// Backend Configuration
// ============================================================================

export interface BackendConfig {
  /**
   * Backend type
   */
  type: BackendType;

  /**
   * Provider identifier
   */
  provider: BackendProvider;

  /**
   * Model ID (for hosted models) or agent version (for local agents)
   */
  modelId?: string;

  /**
   * API key (for hosted models)
   */
  apiKey?: string;

  /**
   * Base URL (for hosted models like Ollama)
   */
  baseURL?: string;

  /**
   * Project path (for local agents)
   */
  projectPath?: string;

  /**
   * Additional provider-specific configuration
   */
  providerConfig?: Record<string, unknown>;
}

// ============================================================================
// Task Context
// ============================================================================

export interface TaskContext {
  /**
   * Unique task identifier
   */
  taskId: string;

  /**
   * User's prompt or instruction
   */
  userPrompt: string;

  /** Selected task-scoped skill instructions. */
  skills?: Array<{ name: string; description: string; content: string }>;

  /** Whether the backend should answer conversationally without project work. */
  mode?: "conversation" | "task";

  /**
   * Project context
   */
  project: ProjectContext;

  /**
   * Selection context (if user selected a UI element)
   */
  selection?: SelectionContext;

  /**
   * Conversation history
   */
  conversation: Array<{
    role: "user" | "assistant" | "system";
    content: string;
    timestamp: number;
  }>;

  /**
   * Previous observations (for context)
   */
  previousObservations: Observation[];

  /**
   * Previous errors (for recovery)
   */
  previousErrors: AgentError[];

  /**
   * Current phase in Lasso's workflow
   */
  currentPhase: AgentPhase;

  /**
   * Constraints (max actions, safety level, etc.)
   */
  constraints: {
    maxActions?: number;
    safetyLevel?: "strict" | "standard" | "permissive";
    allowedCommands?: string[];
    forbiddenPaths?: string[];
  };

  /**
   * Reference to the backend's own external session (e.g. Claude Code session id,
   * Codex thread id, OpenCode ses_ id) for continuation when supported.
   */
  sessionRef?: {
    id?: string;
  };
}

// ============================================================================
// Backend Events (normalized for all backends)
// ============================================================================

export type BackendEventType =
  "task_started" | "task_progress" | "tool_started" | "tool_completed" | "file_read" | "file_modified" | "file_created" | "file_deleted" | "diff_available" | "verification_started" | "verification_completed" | "error" | "waiting_for_user" | "task_completed" | "task_cancelled" | "task_failed";

export interface BackendEvent {
  type: BackendEventType;

  taskId: string;

  timestamp: number;

  data?: Record<string, unknown>;
}

// ============================================================================
// Backend Result
// ============================================================================

export interface BackendResult {
  /**
   * Whether the task completed successfully
   */
  success: boolean;

  /**
   * Final status
   */
  status: "completed" | "failed" | "cancelled" | "waiting";

  /**
   * Summary of what was done
   */
  summary: string;

  /**
   * File changes detected (normalized format)
   */
  fileChanges: Array<{
    filePath: string;
    operation: "created" | "modified" | "deleted";
    oldContent?: string;
    newContent?: string;
  }>;

  /**
   * Actions taken (normalized to Lasso's AgentAction format where possible)
   */
  actions: AgentAction[];

  /**
   * Observations collected
   */
  observations: Observation[];

  /**
   * Errors encountered
   */
  errors: AgentError[];

  /**
   * Final conversation state (for continuation)
   */
  conversation?: Array<{
    role: "user" | "assistant" | "system";
    content: string;
    timestamp: number;
  }>;

  /**
   * Provider-specific metadata
   */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Unified Backend Interface
// ============================================================================

export interface IBackend {
  /**
   * Unique backend identifier
   */
  id: string;

  /**
   * Backend type
   */
  type: BackendType;

  /**
   * Provider name
   */
  provider: BackendProvider;

  /**
   * Model/agent ID
   */
  modelId: string;

  /**
   * Get backend capabilities
   */
  getCapabilities(): BackendCapabilities;

  /**
   * Check if backend is available and properly configured
   *
   * Returns detailed availability info including any authentication issues
   */
  checkAvailability(): Promise<{
    available: boolean;
    installed: boolean;
    authenticated: boolean;
    version?: string;
    error?: string;
    fixInstructions?: string;
  }>;

  /**
   * Execute a task
   *
   * This is the main entry point for task execution.
   * The backend should:
   * 1. Start the task
   * 2. Stream progress events via the callback
   * 3. Return the final result
   *
   * For backends with internal loops (like Claude Code), this method
   * should delegate to the agent and monitor its execution.
   *
   * For hosted models, this method should integrate with the existing
   * ModelGateway and return structured responses.
   */
  executeTask(context: TaskContext, onEvent: (event: BackendEvent) => void, signal?: AbortSignal): Promise<BackendResult>;

  /**
   * Cancel a running task
   *
   * Only called if supportsCancellation is true
   */
  cancelTask(taskId: string): Promise<void>;

  /**
   * Switch to a different backend/model
   *
   * This is called when the user switches providers mid-session.
   * The backend should:
   * 1. Return any context that can be transferred
   * 2. Report what cannot be transferred (e.g., internal state)
   */
  switchBackend(
    newBackend: IBackend,
    context: TaskContext
  ): Promise<{
    transferableContext: Record<string, unknown>;
    lostContext: string[];
  }>;
}

// ============================================================================
// Capability Defaults
// ============================================================================

export const DEFAULT_LOCAL_CAPABILITIES: BackendCapabilities = {
  canStreamEvents: true,
  canIsolateWorkspace: false,
  providesStructuredDiffs: false,
  supportsSessionContinuation: true,
  supportsCancellation: true,
  hasInternalLoop: true,
  supportedFileOperations: "both",
  canRunCommands: true,
  authMethod: "cli_session",
};

export const DEFAULT_HOSTED_CAPABILITIES: BackendCapabilities = {
  canStreamEvents: true,
  canIsolateWorkspace: false,
  providesStructuredDiffs: false,
  supportsSessionContinuation: true,
  supportsCancellation: true,
  hasInternalLoop: false,
  supportedFileOperations: "both",
  canRunCommands: true,
  authMethod: "api_key",
};
