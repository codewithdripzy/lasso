/**
 * LocalRuntime — local coding agent execution on the user's machine.
 *
 * Implements the same session surface the CLI bridge uses for hosted
 * sessions (RuntimeClient), but runs Claude Code / OpenCode / Codex CLI /
 * Cursor Agent in THIS process: prompts, project context, and source code
 * never travel through Lasso's server. Session state is in-memory (per CLI
 * process) and the review-first workflow comes from the shared runtime core
 * (LocalSessionRunner + WorkspaceGuard + VerificationEngine).
 */

import crypto from "node:crypto";
import { WorkspaceGuard, VerificationEngine, LocalSessionRunner, createLocalAgentBackend, isLocalAgentConfig, IBackend, AgentEvent, BackendConfig } from "../runtime/index.js";
import type { RuntimeSession, RuntimeSessionInput, RuntimeEventHandler, SessionVerificationResult, RuntimeFacade } from "./runtime-client.js";

interface LocalSessionRecord {
  id: string;
  phase: RuntimeSession["phase"];
  status: RuntimeSession["status"];
  iteration: number;
  userPrompt: string;
  mode: RuntimeSessionInput["mode"];
  conversation: RuntimeSession["conversation"];
  observations: RuntimeSession["observations"];
  actions: RuntimeSession["actions"];
  completedActions: RuntimeSession["completedActions"];
  errors: RuntimeSession["errors"];
  selection?: RuntimeSessionInput["selection"];
  project: RuntimeSessionInput["project"];
  model: RuntimeSessionInput["model"];
  createdAt: Date;
  updatedAt: Date;
  metadata: Record<string, unknown>;
  backendConfig: BackendConfig & { type: "local_agent" };
  projectPath: string;
  input: RuntimeSessionInput;
  backend?: IBackend;
  running: boolean;
}

/**
 * Seed a session's conversation from the caller's history plus the current
 * user prompt. Skipping the history makes every follow-up a blank-slate run
 * ("try again" becomes a literal search instead of a retry).
 */
function seedConversation(input: RuntimeSessionInput, timestamp: number): LocalSessionRecord["conversation"] {
  const history = (input.conversation || []).map((msg) => ({
    id: crypto.randomUUID(),
    role: msg.role,
    content: msg.content,
    timestamp: msg.timestamp || timestamp,
  }));
  const last = history[history.length - 1];
  if (!last || last.role !== "user" || last.content !== input.userPrompt) {
    history.push({ id: crypto.randomUUID(), role: "user", content: input.userPrompt, timestamp });
  }
  return history;
}

export class LocalRuntime implements RuntimeFacade {
  private sessions = new Map<string, LocalSessionRecord>();
  private abortControllers = new Map<string, AbortController>();

  async createSession(input: RuntimeSessionInput): Promise<RuntimeSession> {
    const backendConfig = input.backendConfig;
    if (!isLocalAgentConfig(backendConfig)) {
      throw new Error("LocalRuntime only accepts local_agent backend configs");
    }
    if (!backendConfig.projectPath) {
      throw new Error("LocalRuntime requires backendConfig.projectPath");
    }

    const id = crypto.randomUUID();
    const now = new Date();
    const record: LocalSessionRecord = {
      id,
      phase: "execute",
      status: "running",
      iteration: 0,
      userPrompt: input.userPrompt,
      mode: input.mode || "task",
      conversation: seedConversation(input, now.getTime()),
      observations: [],
      actions: [],
      completedActions: [],
      errors: [],
      selection: input.selection,
      project: input.project,
      model: input.model,
      createdAt: now,
      updatedAt: now,
      metadata: { backendConfig },
      backendConfig: { ...backendConfig, type: "local_agent" },
      projectPath: backendConfig.projectPath,
      input,
      running: false,
    };
    this.sessions.set(id, record);
    return this.toSession(record);
  }

  async getSession(sessionId: string): Promise<RuntimeSession> {
    const record = this.sessions.get(sessionId);
    if (!record) throw new Error("Session not found");
    return this.toSession(record);
  }

  async runSession(
    sessionId: string,
    projectPath: string,
    onEvent: RuntimeEventHandler,
    signal?: AbortSignal,
    _opts?: { providerApiKey?: string; browserContextProvider?: (action: { id: string; type: "browser_check"; data?: Record<string, unknown> }) => Promise<unknown> } // local agents run in-process; no server/model key needed
  ): Promise<void> {
    const record = this.sessions.get(sessionId);
    if (!record) throw new Error("Session not found");
    if (record.running) throw new Error("Session is already running");

    record.running = true;
    record.status = "running";
    record.phase = "execute";
    record.updatedAt = new Date();

    const controller = new AbortController();
    this.abortControllers.set(sessionId, controller);
    const onOuterAbort = () => controller.abort();
    signal?.addEventListener("abort", onOuterAbort, { once: true });

    const emit = (event: AgentEvent) => {
      void onEvent(event as never);
    };

    try {
      // Fresh capture per run — corrective re-runs capture the post-apply state.
      const guard = await WorkspaceGuard.capture(projectPath);

      record.backend = record.backend || (await createLocalAgentBackend({ ...record.backendConfig, type: "local_agent", projectPath }));

      const previousErrors = (record.errors || []) as unknown as {
        id: string;
        type: "execution" | "permission" | "timeout" | "unknown" | "validation" | "verification";
        message: string;
        phase: "understand" | "inspect" | "plan" | "execute" | "verify" | "recover" | "complete";
        timestamp: number;
        recoverable: boolean;
      }[];

      const externalSessionId = typeof record.metadata.backendSessionId === "string" ? record.metadata.backendSessionId : undefined;

      const runner = new LocalSessionRunner({
        sessionId: record.id,
        backend: record.backend,
        guard,
        emit,
        phase: "execute",
      });

      const outcome = await runner.run(
        {
          taskId: record.id,
          userPrompt: record.userPrompt,
          mode: record.mode,
          project: {
            projectId: record.project.projectId || "local",
            framework: record.project.framework,
            hasTypeScript: Boolean(record.project.hasTypeScript),
            hasTailwind: false,
            hasReact: Boolean(record.project.hasReact),
            hasNext: Boolean(record.project.hasNext),
            hasVite: Boolean(record.project.hasVite),
            files: record.project.files || [],
          },
          selection: record.selection as never,
          conversation: record.conversation.map((msg) => ({
            role: msg.role as "user" | "assistant" | "system",
            content: msg.content,
            timestamp: msg.timestamp,
          })),
          // Carry prior observations so the agent knows what was already
          // searched/read instead of re-exploring the project every turn.
          previousObservations: record.observations as never,
          previousErrors,
          currentPhase: "execute",
          constraints: { safetyLevel: "standard" },
          sessionRef: externalSessionId ? { id: externalSessionId } : undefined,
        },
        controller.signal
      );

      // Persist review payload + normalized actions for the review flow.
      record.actions = outcome.actions as RuntimeSession["actions"];
      record.observations.push(
        ...outcome.observations.map((obs) => ({
          id: obs.id,
          type: String(obs.type),
          summary: obs.summary,
          data: obs.data,
          timestamp: obs.timestamp,
          phase: String(obs.phase),
        }))
      );
      record.errors = outcome.errors.map((err) => ({
        id: err.id,
        type: String(err.type),
        message: err.message,
        phase: String(err.phase),
        timestamp: err.timestamp,
        recoverable: err.recoverable,
      })) as RuntimeSession["errors"];

      if (outcome.conversation.length > 0) {
        record.conversation.push(
          ...outcome.conversation.map((msg) => ({
            id: crypto.randomUUID(),
            role: msg.role,
            content: msg.content,
            timestamp: msg.timestamp,
          }))
        );
      }

      record.metadata = {
        ...record.metadata,
        ...outcome.metadata,
        pendingChanges: outcome.changes,
        binaryChanges: outcome.binaryPaths,
      };

      record.status = outcome.status === "waiting" ? "waiting" : outcome.status === "completed" ? "completed" : "failed";
      record.phase = "complete";
      record.updatedAt = new Date();
    } catch (error) {
      record.status = "failed";
      record.errors = [
        ...record.errors,
        {
          id: crypto.randomUUID(),
          type: "execution",
          message: error instanceof Error ? error.message : "Local agent run failed",
          phase: "execute",
          timestamp: Date.now(),
          recoverable: false,
        },
      ];
      record.updatedAt = new Date();
      emit({
        type: "error",
        sessionId: record.id,
        timestamp: Date.now(),
        data: { error: error instanceof Error ? error.message : "Local agent run failed" },
      });
    } finally {
      signal?.removeEventListener("abort", onOuterAbort);
      this.abortControllers.delete(sessionId);
      record.running = false;
    }
  }

  async verifySession(sessionId: string, projectPath: string): Promise<SessionVerificationResult> {
    const record = this.sessions.get(sessionId);
    if (!record) throw new Error("Session not found");

    const engine = new VerificationEngine(projectPath);
    const results = await engine.verifyAll("verify");
    const observations = engine.getObservations(results);
    const errors = engine.getErrors(results);
    const passed = engine.allPassed(results);

    // Keep verification errors so a corrective re-run receives them as context.
    if (!passed) {
      record.errors = [
        ...record.errors,
        ...errors.map((err) => ({
          id: err.id,
          type: String(err.type),
          message: err.message,
          phase: String(err.phase),
          timestamp: err.timestamp,
          recoverable: err.recoverable,
        })),
      ] as RuntimeSession["errors"];
    }

    const command = results.map((r) => r.command).find((c) => typeof c === "string");

    return { passed, errors, observations, command, requiresFix: !passed };
  }

  async switchModel(sessionId: string, model: { provider: string; id: string; name?: string }, _apiKey?: string, backendConfig?: RuntimeSessionInput["backendConfig"]): Promise<void> {
    const record = this.sessions.get(sessionId);
    if (!record) throw new Error("Session not found");
    if (!isLocalAgentConfig(backendConfig)) {
      throw new Error("LocalRuntime.switchModel requires a local_agent backendConfig");
    }

    const nextBackend = await createLocalAgentBackend({ ...backendConfig, type: "local_agent" });

    if (record.backend) {
      await record.backend.switchBackend(nextBackend, {
        taskId: record.id,
        userPrompt: record.userPrompt,
        project: {
          projectId: record.project.projectId || "local",
          hasTypeScript: Boolean(record.project.hasTypeScript),
          hasTailwind: false,
          hasReact: Boolean(record.project.hasReact),
          hasNext: Boolean(record.project.hasNext),
          hasVite: Boolean(record.project.hasVite),
          files: record.project.files || [],
        },
        conversation: [],
        previousObservations: [],
        previousErrors: [],
        currentPhase: "execute",
        constraints: {},
        sessionRef: typeof record.metadata.backendSessionId === "string" ? { id: record.metadata.backendSessionId } : undefined,
      });
    }

    record.backend = nextBackend;
    record.backendConfig = { ...backendConfig, type: "local_agent" };
    record.model = { provider: model.provider as never, id: model.id, name: model.name };
    record.metadata = {
      ...record.metadata,
      backendConfig: record.backendConfig,
      backendModel: model.id,
    };
    // Switching agents drops the previous agent's external session: context
    // cannot be transferred across CLI agents.
    delete record.metadata.backendSessionId;
    record.updatedAt = new Date();
  }

  async cancelSession(sessionId: string): Promise<void> {
    const controller = this.abortControllers.get(sessionId);
    if (controller) controller.abort();
  }

  async deleteSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
    this.abortControllers.delete(sessionId);
  }

  private toSession(record: LocalSessionRecord): RuntimeSession {
    return {
      id: record.id,
      phase: record.phase,
      status: record.status,
      iteration: record.iteration,
      userPrompt: record.userPrompt,
      conversation: record.conversation,
      observations: record.observations,
      actions: record.actions,
      completedActions: record.completedActions,
      errors: record.errors,
      selection: record.selection,
      project: record.project,
      model: record.model,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      metadata: record.metadata,
    } as RuntimeSession;
  }
}

/** Process-wide local runtime (sessions live for the CLI bridge lifetime). */
let sharedLocalRuntime: LocalRuntime | undefined;

export function getLocalRuntime(): LocalRuntime {
  if (!sharedLocalRuntime) sharedLocalRuntime = new LocalRuntime();
  return sharedLocalRuntime;
}
