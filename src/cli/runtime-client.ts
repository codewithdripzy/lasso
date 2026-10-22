/**
 * Lasso Runtime Client
 *
 * Client for the hosted-model agentic runtime. The server orchestrates the
 * agent loop and calls the model, but never touches the local filesystem:
 * workspace tools arrive as `tool_call` events and are executed HERE, in the
 * CLI, against the real project directory. The CLI also owns the
 * WorkspaceGuard (snapshot → diff → rollback → review → approval).
 */

import crypto from "node:crypto";
import {
  WorkspaceGuard,
  ActionExecutor,
  VerificationEngine,
  type FileChange,
  type ToolCallRequest,
  type ToolCallResultPayload,
} from "../runtime/index.js";

export type RuntimeProvider =
  | "anthropic"
  | "openai"
  | "google"
  | "nvidia"
  | "ollama"
  | "claude_code"
  | "opencode"
  | "codex_cli"
  | "cursor";

export interface RuntimeSessionInput {
  userPrompt: string;
  /** Conversation-only requests must not enter the coding/tool workflow. */
  mode?: "conversation" | "task";
  project: {
    projectId: string;
    framework?: string;
    hasTypeScript?: boolean;
    hasReact?: boolean;
    hasNext?: boolean;
    hasVite?: boolean;
    files?: string[];
    currentRoute?: string;
  };
  model: {
    provider: RuntimeProvider;
    id: string;
    name?: string;
  };
  selection?: {
    element?: {
      tag?: string;
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
  };
  conversationUid?: string;
  /**
   * Prior turns of the same conversation. Follow-up prompts must carry
   * history here — a session created with only userPrompt gives the agent
   * no idea what was asked or done before.
   */
  conversation?: Array<{ role: "user" | "assistant" | "system"; content: string; timestamp?: number }>;
  backendConfig?: {
    type: "hosted_model" | "local_agent";
    provider: "claude_code" | "opencode" | "codex_cli" | "cursor";
    modelId?: string;
    projectPath?: string;
  };
}

export type BrowserContextProvider = (action: { id: string; type: "browser_check"; data?: Record<string, unknown> }) => Promise<unknown>;

export interface RuntimeSession {
  id: string;
  phase: "understand" | "inspect" | "plan" | "execute" | "verify" | "recover" | "complete";
  status: "running" | "waiting" | "completed" | "failed" | "cancelled";
  iteration: number;
  userPrompt: string;
  conversation: Array<{
    id: string;
    role: "user" | "assistant" | "system" | "tool";
    content: string;
    timestamp: number;
    metadata?: Record<string, unknown>;
  }>;
  observations: Array<{
    id: string;
    type: string;
    summary: string;
    data?: unknown;
    timestamp: number;
    phase?: string;
    actionId?: string;
  }>;
  actions: Array<{
    id: string;
    type: string;
    data: Record<string, unknown>;
  }>;
  completedActions: Array<{
    id: string;
    type: string;
    data: Record<string, unknown>;
  }>;
  errors: Array<{
    id: string;
    type: string;
    message: string;
    phase: string;
    actionId?: string;
    timestamp: number;
    recoverable: boolean;
  }>;
  plan?: {
    id: string;
    goal: string;
    steps: Array<{
      id: string;
      description: string;
      status: string;
      actionCount?: number;
    }>;
    estimatedActions?: number;
  };
  selection?: RuntimeSessionInput["selection"];
  project: RuntimeSessionInput["project"];
  model: RuntimeSessionInput["model"];
  conversationUid?: string;
  createdAt: Date;
  updatedAt: Date;
  /** Runtime-owned metadata: pendingChanges, backendConfig, backendSessionId, … */
  metadata?: Record<string, unknown>;
}

/** Result of post-apply verification (typecheck/build via VerificationEngine). */
export interface SessionVerificationResult {
  passed: boolean;
  errors: Array<{ id: string; type: string; message: string; phase: string; timestamp: number; recoverable: boolean }>;
  observations: Array<{ id: string; type: string; summary: string; timestamp: number }>;
  command?: string;
  requiresFix: boolean;
}

/**
 * The session surface shared by RuntimeClient (hosted, via Lasso server) and
 * LocalRuntime (local coding agents, executed in this process).
 */
export interface RuntimeFacade {
  createSession(input: RuntimeSessionInput): Promise<RuntimeSession>;
  runSession(
    sessionId: string,
    projectPath: string,
    onEvent: RuntimeEventHandler,
    signal?: AbortSignal,
    opts?: { providerApiKey?: string; browserContextProvider?: BrowserContextProvider }
  ): Promise<void>;
  getSession(sessionId: string): Promise<RuntimeSession>;
  verifySession(sessionId: string, projectPath: string): Promise<SessionVerificationResult>;
  switchModel(
    sessionId: string,
    model: { provider: string; id: string; name?: string },
    apiKey?: string,
    backendConfig?: RuntimeSessionInput["backendConfig"]
  ): Promise<void>;
  cancelSession(sessionId: string): Promise<void>;
}

export type RuntimeEvent =
  | { type: "agent_started"; sessionId: string; data: {}; timestamp: number }
  | { type: "agent_reasoning"; sessionId: string; data: { summary: string; raw?: string }; timestamp: number }
  | { type: "phase_changed"; sessionId: string; data: { from: string; to: string }; timestamp: number }
  | { type: "tool_started"; sessionId: string; data: { actionType: string; label?: string }; timestamp: number }
  | { type: "tool_completed"; sessionId: string; data: { actionType: string; label?: string; success: boolean; error?: string }; timestamp: number }
  | { type: "tool_call"; sessionId: string; data: ToolCallRequest; timestamp: number }
  | { type: "observation"; sessionId: string; data: { observationType: string; summary: string }; timestamp: number }
  | { type: "verification_started"; sessionId: string; data: { verificationType: string }; timestamp: number }
  | { type: "verification_completed"; sessionId: string; data: { verificationType: string; success: boolean }; timestamp: number }
  | { type: "waiting_for_user"; sessionId: string; data: { question: string }; timestamp: number }
  | { type: "error"; sessionId: string; data: Record<string, unknown>; timestamp: number }
  | { type: "model_changed"; sessionId: string; data: { from: any; to: any }; timestamp: number }
  | { type: "agent_completed"; sessionId: string; data: Record<string, unknown>; timestamp: number }
  | { type: "agent_cancelled"; sessionId: string; data: Record<string, unknown>; timestamp: number }
  | { type: "agent_failed"; sessionId: string; data: Record<string, unknown>; timestamp: number }
  | { type: "file_changed"; sessionId: string; data: Record<string, unknown>; timestamp: number }
  | { type: "started"; sessionId: string }
  | { type: "completed"; sessionId: string };

export type RuntimeEventHandler = (event: RuntimeEvent) => void | Promise<void>;

export class RuntimeClient {
  private serverUrl: string;
  private apiKey?: string;
  /**
   * Review payloads computed locally from the WorkspaceGuard diff, keyed by
   * sessionId. Merged into getSession() so the bridge's review flow sees the
   * authoritative pendingChanges without the server ever touching the FS.
   */
  private localReviewCache = new Map<string, Array<{
    filePath: string;
    oldString: string;
    newString: string;
    operation: "created" | "modified" | "deleted";
  }>>();

  constructor(serverUrl: string, apiKey?: string) {
    this.serverUrl = serverUrl;
    this.apiKey = apiKey;
  }

  /**
   * Create a new runtime session
   */
  async createSession(input: RuntimeSessionInput): Promise<RuntimeSession> {
    const response = await fetch(`${this.serverUrl}/api/v1/agent-runtime/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.apiKey && { "Authorization": `Bearer ${this.apiKey}` }),
      },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      throw new Error(`Failed to create session: ${response.statusText}`);
    }

    const data = await response.json();
    return data as RuntimeSession;
  }

  /**
   * Get a session by ID. Locally computed review changes (WorkspaceGuard
   * diff from the last run) are merged into metadata.pendingChanges.
   */
  async getSession(sessionId: string): Promise<RuntimeSession> {
    const response = await fetch(`${this.serverUrl}/api/v1/agent-runtime/sessions/${sessionId}`, {
      headers: {
        ...(this.apiKey && { "Authorization": `Bearer ${this.apiKey}` }),
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get session: ${response.statusText}`);
    }

    const data = await response.json() as RuntimeSession;
    const local = this.localReviewCache.get(sessionId);
    if (local && local.length > 0) {
      data.metadata = { ...(data.metadata || {}), pendingChanges: local };
    }
    return data;
  }

  /**
   * Run a session with SSE event streaming.
   *
   * Hosted-model flow (server orchestrates, CLI executes):
   *   1. Capture the WorkspaceGuard BEFORE the run (CLI owns the snapshot).
   *   2. Stream events from the server. `tool_call` events are executed
   *      locally (ActionExecutor / VerificationEngine) and the result is
   *      posted back to the server so the model loop can continue.
   *   3. On agent_completed: diff the workspace, roll it back, and cache the
   *      changes for the review panel. Only user approval re-applies them.
   */
  async runSession(
    sessionId: string,
    projectPath: string,
    onEvent: RuntimeEventHandler,
    signal?: AbortSignal,
    opts?: { providerApiKey?: string; browserContextProvider?: BrowserContextProvider }
  ): Promise<void> {
    // CLI-side snapshot: nothing the agent does is left on disk before review.
    let guard: WorkspaceGuard | null = null;
    try {
      guard = await WorkspaceGuard.capture(projectPath);
    } catch (error) {
      console.error("WorkspaceGuard capture failed:", error);
    }

    const executor = new ActionExecutor(projectPath, opts?.browserContextProvider);
    const verifier = new VerificationEngine(projectPath);

    const finalizeGuard = async () => {
      if (!guard) return;
      try {
        const changes = guard.diff();
        const applyable = changes.filter((c) => !c.binary);
        const pending = applyable.map((change) => ({
          filePath: change.filePath,
          oldString: change.operation === "created" ? "" : change.oldContent ?? "",
          newString: change.operation === "deleted" ? "" : change.newContent ?? "",
          operation: change.operation,
        }));
        this.localReviewCache.set(sessionId, pending);
      } catch (error) {
        console.error("WorkspaceGuard diff failed:", error);
      } finally {
        // Always restore BEFORE the review flow runs — it captures originals
        // from disk for the undo snapshot, so the workspace must be back to
        // its pre-run state by the time agent_completed is delivered.
        try {
          await guard.restore();
        } catch (error) {
          console.error("WorkspaceGuard restore failed:", error);
        }
      }
    };

    const handleToolCall = async (request: ToolCallRequest) => {
      const result = await this.executeToolCallLocally(request, executor, verifier);
      await this.postToolResult(sessionId, result);
    };

    const response = await fetch(`${this.serverUrl}/api/v1/agent-runtime/sessions/${sessionId}/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.apiKey && { "Authorization": `Bearer ${this.apiKey}` }),
      },
      // providerApiKey is the user's own model-provider key (BYOK): the
      // server calls the hosted model with it and never stores it.
      body: JSON.stringify({ projectPath, apiKey: opts?.providerApiKey }),
      signal,
    });

    if (!response.ok) {
      throw new Error(`Failed to run session: ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("No response body");
    }

    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.trim() || !line.startsWith("data: ")) continue;

          const data = line.slice(6);
          if (data === "[DONE]") continue;

          try {
            const event = JSON.parse(data) as RuntimeEvent;

            if (event.type === "tool_call") {
              // Execute locally and answer the server — never forwarded raw.
              await handleToolCall(event.data);
              continue;
            }

            if (event.type === "agent_completed") {
              // Diff + rollback BEFORE the review flow reads the session.
              await finalizeGuard();
            }

            await onEvent(event);
          } catch (error) {
            console.error("Failed to parse SSE event:", error);
          }
        }
      }
    } finally {
      reader.releaseLock();
      // Safety net: if the stream died mid-run, still restore the workspace.
      if (guard) {
        guard.restore().catch(() => {});
      }
    }
  }

  /** Execute a tool_call request locally against the real project. */
  private async executeToolCallLocally(
    request: ToolCallRequest,
    executor: ActionExecutor,
    verifier: VerificationEngine
  ): Promise<ToolCallResultPayload> {
    try {
      if (request.kind === "verify") {
        const results = await verifier.verifyAll((request.verify?.phase as any) || "verify");
        return {
          callId: request.callId,
          success: verifier.allPassed(results),
          observations: verifier.getObservations(results),
          errors: verifier.getErrors(results),
        };
      }

      if (!request.action) {
        return { callId: request.callId, success: false, error: "tool_call missing action" };
      }

      const result = await executor.execute(request.action);
      return {
        callId: request.callId,
        success: result.success,
        output: result.output,
        error: result.error,
        observations: result.observation
          ? [{
              id: crypto.randomUUID(),
              type: result.observation.type as import("../runtime/index.js").ObservationType,
              summary: result.observation.summary,
              data: result.observation.data,
              timestamp: Date.now(),
              phase: "execute",
              actionId: request.action.id,
            }]
          : undefined,
      };
    } catch (error) {
      return {
        callId: request.callId,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /** Post a tool result back to the server (resolves its pending request). */
  private async postToolResult(sessionId: string, result: ToolCallResultPayload): Promise<void> {
    try {
      const response = await fetch(
        `${this.serverUrl}/api/v1/agent-runtime/sessions/${sessionId}/tool-results`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(this.apiKey && { "Authorization": `Bearer ${this.apiKey}` }),
          },
          body: JSON.stringify(result),
        }
      );
      if (!response.ok) {
        console.error(`Failed to post tool result: ${response.statusText}`);
      }
    } catch (error) {
      console.error("Failed to post tool result:", error);
    }
  }

  /**
   * Cancel a running session
   */
  async cancelSession(sessionId: string): Promise<void> {
    const response = await fetch(`${this.serverUrl}/api/v1/agent-runtime/sessions/${sessionId}/cancel`, {
      method: "POST",
      headers: {
        ...(this.apiKey && { "Authorization": `Bearer ${this.apiKey}` }),
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to cancel session: ${response.statusText}`);
    }
  }

  /**
   * Switch model/backend for a session
   */
  async switchModel(
    sessionId: string,
    model: { provider: string; id: string; name?: string },
    apiKey?: string,
    backendConfig?: RuntimeSessionInput["backendConfig"]
  ): Promise<void> {
    const response = await fetch(`${this.serverUrl}/api/v1/agent-runtime/sessions/${sessionId}/model`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.apiKey && { "Authorization": `Bearer ${this.apiKey}` }),
      },
      body: JSON.stringify({ ...model, apiKey, backendConfig }),
    });

    if (!response.ok) {
      throw new Error(`Failed to switch model: ${response.statusText}`);
    }
  }

  /**
   * Verify the workspace for a session (after reviewed changes were applied).
   *
   * Hosted sessions verify LOCALLY (the server cannot run typecheck/build
   * against a filesystem it does not have). The results are also persisted
   * on the server session so a corrective re-run has them in context.
   */
  async verifySession(
    sessionId: string,
    projectPath: string
  ): Promise<SessionVerificationResult> {
    const engine = new VerificationEngine(projectPath);
    const results = await engine.verifyAll("verify");
    const passed = engine.allPassed(results);
    const errors = engine.getErrors(results);
    const observations = engine.getObservations(results);

    // Persist on the server session (best-effort — corrective context).
    try {
      await fetch(`${this.serverUrl}/api/v1/agent-runtime/sessions/${sessionId}/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.apiKey && { "Authorization": `Bearer ${this.apiKey}` }),
        },
        body: JSON.stringify({ projectPath, localResults: { passed, errors, observations } }),
      });
    } catch {
      // Non-fatal: the local result is still returned to the caller.
    }

    return {
      passed,
      errors,
      observations,
      requiresFix: !passed,
    };
  }

  /**
   * List available backends from the server (hosted providers + local agents).
   */
  async listBackends(projectPath?: string): Promise<{
    backends: Array<{
      provider: string;
      type: string;
      available: boolean;
      authenticated: boolean;
      installed?: boolean;
      version?: string;
      error?: string;
      fixInstructions?: string;
      models?: Array<{ id: string; label: string }>;
    }>;
  }> {
    const url = `${this.serverUrl}/api/v1/agent-runtime/backends${projectPath ? `?projectPath=${encodeURIComponent(projectPath)}` : ""}`;
    const response = await fetch(url, {
      headers: {
        ...(this.apiKey && { "Authorization": `Bearer ${this.apiKey}` }),
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to list backends: ${response.statusText}`);
    }

    return (await response.json()) as { backends: any[] };
  }

  /**
   * Delete a session
   */
  async deleteSession(sessionId: string): Promise<void> {
    const response = await fetch(`${this.serverUrl}/api/v1/agent-runtime/sessions/${sessionId}`, {
      method: "DELETE",
      headers: {
        ...(this.apiKey && { "Authorization": `Bearer ${this.apiKey}` }),
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to delete session: ${response.statusText}`);
    }
  }
}
