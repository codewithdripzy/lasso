/**
 * LocalSessionRunner — the shared Mode-B workflow for local coding agents.
 *
 * Encodes the non-negotiable local-agent lifecycle exactly once:
 *   backend.executeTask (agent owns its internal loop)
 *   → guard.diff (authoritative change detection)
 *   → review normalization (pendingChanges contract)
 *   → workspace rollback BEFORE review (finally safety net)
 *   → wire events (agent_completed / error) identical to the hosted SSE flow.
 *
 * Hosts (server orchestrator for colocated self-host, CLI LocalRuntime for
 * the npm CLI) provide: a pre-captured WorkspaceGuard, the backend instance,
 * the TaskContext, and an event sink. Persistence stays host-side.
 */

import crypto from "node:crypto";
import { IBackend, TaskContext } from "./backend-interface";
import { AgentEvent, AgentAction, AgentError, AgentPhase, Observation } from "./agent-runtime";
import { WorkspaceGuard } from "./workspace-guard";
import { PendingChange, diffToReview } from "./review";
import { toAgentEvent } from "./event-mapper";
import type { LocalSessionOutcome, LocalSessionRunnerOptions } from "../core/interfaces/session-runner";
export type { LocalSessionOutcome, LocalSessionRunnerOptions } from "../core/interfaces/session-runner";

export class LocalSessionRunner {
  private restored = false;

  constructor(private readonly options: LocalSessionRunnerOptions) {}

  async run(context: TaskContext, signal?: AbortSignal): Promise<LocalSessionOutcome> {
    const { sessionId, backend, guard, emit } = this.options;
    const phase = this.options.phase || "execute";

    let outcome: LocalSessionOutcome;
    try {
      const result = await backend.executeTask(context, (event) => emit(toAgentEvent(sessionId, event)), signal);

      // Authoritative diff against the captured state, then rollback so the
      // review happens against an untouched project.
      const review = await this.finalizeReview();

      const externalSessionId = (result.metadata as Record<string, unknown> | undefined)?.externalSessionId;
      const metadata: Record<string, unknown> = {
        backendProvider: backend.provider,
        backendModel: backend.modelId,
        ...(typeof externalSessionId === "string" ? { backendSessionId: externalSessionId } : {}),
      };

      let status: LocalSessionOutcome["status"];
      if (review.changes.length > 0) {
        // Changes await user approval — nothing has been applied.
        status = "waiting";
        emit({
          type: "agent_completed",
          sessionId,
          timestamp: Date.now(),
          data: {
            requiresReview: true,
            pendingChanges: review.changes.length,
            backend: backend.provider,
            success: result.success,
            summary: result.summary,
          },
        });
      } else if (!result.success) {
        status = "failed";
        emit({
          type: "error",
          sessionId,
          timestamp: Date.now(),
          data: { error: result.summary || `${backend.provider} failed without producing changes` },
        });
      } else {
        status = "completed";
        emit({
          type: "agent_completed",
          sessionId,
          timestamp: Date.now(),
          data: { requiresReview: false, summary: result.summary },
        });
      }

      if (review.binaryPaths.length > 0) {
        const observation: Observation = {
          id: crypto.randomUUID(),
          type: "file",
          summary: `${review.binaryPaths.length} binary file change${review.binaryPaths.length === 1 ? "" : "s"} detected (not reviewable as text)`,
          data: { binaryPaths: review.binaryPaths },
          timestamp: Date.now(),
          phase,
        };
        emit({ type: "observation", sessionId, timestamp: Date.now(), data: { summary: observation.summary } });
        outcome = {
          success: result.success,
          status,
          summary: result.summary,
          changes: review.changes,
          binaryPaths: review.binaryPaths,
          actions: review.actions,
          observations: [...result.observations, observation],
          errors: [...result.errors],
          conversation: result.conversation || [],
          externalSessionId: typeof externalSessionId === "string" ? externalSessionId : undefined,
          metadata,
        };
      } else {
        outcome = {
          success: result.success,
          status,
          summary: result.summary,
          changes: review.changes,
          binaryPaths: [],
          actions: review.actions,
          observations: [...result.observations],
          errors: [...result.errors],
          conversation: result.conversation || [],
          externalSessionId: typeof externalSessionId === "string" ? externalSessionId : undefined,
          metadata,
        };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Backend execution failed";
      await this.restoreGuard();
      outcome = {
        success: false,
        status: "failed",
        changes: [],
        binaryPaths: [],
        actions: [],
        observations: [],
        errors: [
          {
            id: crypto.randomUUID(),
            type: "execution",
            message,
            phase,
            timestamp: Date.now(),
            recoverable: false,
          },
        ],
        conversation: [],
        metadata: {},
      };
      emit({
        type: "error",
        sessionId,
        timestamp: Date.now(),
        data: { error: message },
      });
    } finally {
      // Safety net: never leave un-reviewed changes on disk, even when the
      // review path above already restored.
      await this.restoreGuard();
    }

    return outcome;
  }

  /** Diff + rollback in one step (restore happens before any review event). */
  private async finalizeReview(): Promise<ReturnType<typeof diffToReview>> {
    const rawChanges = this.options.guard.diff();
    await this.restoreGuard();
    const review = diffToReview(rawChanges);
    if (review.changes.length > 0) {
      this.options.emit({
        type: "file_changed",
        sessionId: this.options.sessionId,
        timestamp: Date.now(),
        data: { changes: review.changes },
      });
    }
    return review;
  }

  /** WorkspaceGuard.restore is single-use; flag guards the safety-net double call. */
  private async restoreGuard(): Promise<void> {
    if (this.restored) return;
    this.restored = true;
    try {
      await this.options.guard.restore();
    } catch (error) {
      console.error("WorkspaceGuard restore failed:", error);
    }
  }
}
