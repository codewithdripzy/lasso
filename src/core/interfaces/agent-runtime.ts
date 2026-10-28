/**
 * Lasso Agentic Runtime - Core Type Definitions
 *
 * This file defines all the core contracts for the Lasso-owned agentic runtime.
 * The model is an interchangeable intelligence provider; Lasso owns the loop.
 */

// ============================================================================
// Phase 1: Agent Phases
// ============================================================================

export type AgentPhase = "understand" | "inspect" | "plan" | "execute" | "verify" | "recover" | "complete";

export type AgentStatus = "running" | "waiting" | "completed" | "failed" | "cancelled";

// ============================================================================
// Phase 1: Session State (in-memory, DB stores simplified version)
// ============================================================================

export interface LassoAgentSession {
  id: string;

  phase: AgentPhase;

  status: AgentStatus;

  iteration: number;

  userPrompt: string;

  conversation: AgentMessage[];

  observations: Observation[];

  /** Compact task memory derived from the session's tool results. */
  workingContext?: TaskWorkingContext;

  actions: AgentAction[];

  completedActions: AgentAction[];

  errors: AgentError[];

  plan?: AgentPlan;

  selection?: SelectionContext;

  project: ProjectContext;

  model: ModelMetadata;

  createdAt: Date;

  updatedAt: Date;

  conversationUid?: string; // Link to AgentConversation for persistence

  metadata?: Record<string, unknown>; // Provider-specific metadata
}

// ============================================================================
// Phase 1: Conversation Messages
// ============================================================================

export interface AgentMessage {
  id: string;

  role: "user" | "assistant" | "system" | "tool";

  content: string;

  timestamp: number;

  metadata?: Record<string, unknown>;
}

// ============================================================================
// Phase 1: Context Types
// ============================================================================

export interface SelectionContext {
  element?: {
    tag: string;
    text?: string;
    source?: string;
    attributes?: Record<string, string>;
  };

  viewport?: {
    width: number;
    height: number;
    scrollY?: number;
    scrollHeight?: number;
  };

  route?: string;

  screenshot?: string;
}

export interface ProjectContext {
  projectId: string;

  framework?: string;

  hasTypeScript: boolean;

  hasTailwind: boolean;

  hasReact: boolean;

  hasNext: boolean;

  hasVite: boolean;

  files: string[];

  dependencies?: string[];

  devDependencies?: string[];

  currentRoute?: string;

  sourceHints?: Record<string, string>;

  pageContext?: {
    route?: string;
    title?: string;
    viewport?: { width: number; height: number; scrollY?: number; scrollHeight?: number };
    domSummary?: {
      headings?: Array<{ level: number; text: string }>;
      sections?: Array<{ name: string; textPreview: string }>;
      buttons?: string[];
      links?: string[];
      visibleTextSnippet?: string;
    };
    runtimeErrors?: string[];
    selectedElement?: SelectionContext["element"];
    screenshot?: string;
  };
}

// ============================================================================
// Phase 1: Plans
// ============================================================================

export interface AgentPlan {
  id: string;

  goal: string;

  steps: PlanStep[];

  estimatedActions?: number;

  createdAt: Date;
}

export interface PlanStep {
  id: string;

  description: string;

  status: "pending" | "in_progress" | "completed" | "failed";

  actionCount?: number;
}

// ============================================================================
// Phase 1: Observations
// ============================================================================

export type ObservationType = "file" | "search" | "command" | "browser" | "build" | "runtime" | "error" | "verification" | "tool";

export interface Observation {
  id: string;

  type: ObservationType;

  summary: string;

  data?: unknown;

  timestamp: number;

  phase?: AgentPhase;

  actionId?: string;
}

// ============================================================================
// Phase 1: Actions
// ============================================================================

export type AgentAction = ReadFileAction | SearchCodeAction | InspectProjectAction | EditFileAction | CreateFileAction | DeleteFileAction | RunCommandAction | BrowserCheckAction;

export interface BaseAction {
  id: string;
  data: Record<string, unknown>;
}

export interface ReadFileAction extends BaseAction {
  type: "read_file";
}

export interface SearchCodeAction extends BaseAction {
  type: "search_code";
}

export interface InspectProjectAction extends BaseAction {
  type: "inspect_project";
}

export interface EditFileAction extends BaseAction {
  type: "edit_file";
}

export interface CreateFileAction extends BaseAction {
  type: "create_file";
}

export interface DeleteFileAction extends BaseAction {
  type: "delete_file";
}

export interface RunCommandAction extends BaseAction {
  type: "run_command";
}

export interface BrowserCheckAction extends BaseAction {
  type: "browser_check";
}

// ============================================================================
// Phase 1: Errors
// ============================================================================

export interface AgentError {
  id: string;

  type: "validation" | "execution" | "verification" | "timeout" | "permission" | "unknown";

  message: string;

  phase: AgentPhase;

  actionId?: string;

  timestamp: number;

  details?: Record<string, unknown>;

  recoverable: boolean;
}

// ============================================================================
// Phase 1: Model Metadata
// ============================================================================

export interface ModelMetadata {
  provider:
    | "anthropic"
    | "openai"
    | "google"
    | "nvidia"
    | "ollama"
    // Local coding agents (backend-driven sessions)
    | "claude_code"
    | "opencode"
    | "codex_cli"
    | "cursor"
    | "antigravity";

  id: string;

  name?: string;
}

// ============================================================================
// Phase 1: Canonical Context (sent to model)
// ============================================================================

export interface LassoAgentContext {
  session: {
    id: string;
    phase: AgentPhase;
    iteration: number;
  };

  userPrompt: string;

  conversation: AgentMessage[];

  selection?: SelectionContext;

  project: ProjectContext;

  observations: Observation[];

  previousActions: AgentAction[];

  errors: AgentError[];

  currentPlan?: AgentPlan;

  availableTools: ToolDefinition[];

  constraints: AgentConstraints;
}

export interface TaskWorkingContext {
  goal: string;
  phase: AgentPhase;
  discoveredFiles: string[];
  searches: string[];
  findings: string[];
  completedActions: string[];
  nextStep: string;
}

export interface ToolDefinition {
  name: string;

  description: string;

  allowedPhases: AgentPhase[];

  parameters?: Record<string, unknown>;
}

export interface AgentConstraints {
  maxActionsPerTurn: number;

  allowedPhases: AgentPhase[];

  maxFileSize?: number;

  allowedCommands?: string[];

  forbiddenPaths?: string[];

  safetyLevel?: "strict" | "standard" | "permissive";
}

// ============================================================================
// Phase 1: Model Response Contract
// ============================================================================

export interface LassoModelResponse {
  status: "continue" | "waiting" | "complete" | "failed";

  reasoning: {
    summary: string;
    /** Raw model thoughts / extended reasoning, when the provider exposes it. */
    raw?: string;
  };

  decision: {
    type: "respond" | "inspect" | "plan" | "execute" | "verify" | "recover" | "ask_user";
    goal: string;
  };

  actions: AgentAction[];

  /** Direct conversational answer when no project work is requested. */
  reply?: string;

  expectedOutcome?: string;
}

// ============================================================================
// Phase 1: Events (streamed to UI)
// ============================================================================

export type AgentEventType =
  | "agent_started"
  | "agent_reasoning"
  | "agent_completed"
  | "agent_failed"
  | "agent_cancelled"
  | "phase_changed"
  | "tool_started"
  | "tool_completed"
  | "tool_call"
  | "observation"
  | "plan_created"
  | "file_changed"
  | "verification_started"
  | "verification_completed"
  | "error"
  | "model_changed"
  | "waiting_for_user";

export interface AgentEvent {
  type: AgentEventType;

  sessionId: string;

  timestamp: number;

  data?: Record<string, unknown>;
}

export interface AgentReasoningEvent extends AgentEvent {
  type: "agent_reasoning";

  data: {
    summary: string;
    decision?: string;
    /** Raw model thoughts for UI detail display. */
    raw?: string;
  };
}

export interface PhaseChangedEvent extends AgentEvent {
  type: "phase_changed";

  data: {
    from: AgentPhase;
    to: AgentPhase;
    reason?: string;
  };
}

export interface ToolStartedEvent extends AgentEvent {
  type: "tool_started";

  data: {
    actionType: string;
    target?: string;
  };
}

export interface ToolCompletedEvent extends AgentEvent {
  type: "tool_completed";

  data: {
    actionType: string;
    target?: string;
    success: boolean;
    duration?: number;
  };
}

/**
 * Emitted by the server when the hosted model requests a workspace tool.
 * The local CLI executes the tool and posts the result back to
 * `POST /sessions/:sessionId/tool-results` (see tool-protocol.ts).
 */
export interface ToolCallEvent extends AgentEvent {
  type: "tool_call";

  data: {
    callId: string;
    kind: "action" | "verify";
    action?: AgentAction;
    verify?: { phase?: string };
  };
}

export interface ObservationEvent extends AgentEvent {
  type: "observation";

  data: {
    observationType: ObservationType;
    summary: string;
    details?: unknown;
  };
}

export interface VerificationStartedEvent extends AgentEvent {
  type: "verification_started";

  data: {
    verificationType: "typecheck" | "build" | "runtime" | "browser";
  };
}

export interface VerificationCompletedEvent extends AgentEvent {
  type: "verification_completed";

  data: {
    verificationType: "typecheck" | "build" | "runtime" | "browser";
    success: boolean;
    duration?: number;
    errors?: string[];
  };
}

export interface ErrorEvent extends AgentEvent {
  type: "error";

  data: {
    errorType: string;
    message: string;
    phase: AgentPhase;
    recoverable: boolean;
  };
}

export interface ModelChangedEvent extends AgentEvent {
  type: "model_changed";

  data: {
    from: ModelMetadata;
    to: ModelMetadata;
  };
}

export interface WaitingForUserEvent extends AgentEvent {
  type: "waiting_for_user";

  data: {
    question?: string;
    options?: string[];
    kind?: "input" | "single_select" | "multiselect";
  };
}
