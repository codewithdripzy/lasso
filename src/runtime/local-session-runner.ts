/**
 * LocalSessionRunner — the shared Mode-B workflow for local coding agents.
 *
 * Encodes the non-negotiable local-agent lifecycle exactly once:
 *   backend.executeTask (agent owns its internal loop)
 *   → guard.diff (authoritative change detection)
 *   → review normalization (pendingChanges contract)
 *   → keep edits present while the user reviews them
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
    let keepWorkspaceChangesForReview = false;
    let terminalEvent: AgentEvent | undefined;
    const emitTerminal = (event: AgentEvent) => {
      if (this.options.deferTerminalEvent) terminalEvent = event;
      else emit(event);
    };
    try {
      const result = await backend.executeTask(
        context,
        (event) => {
          // The runner emits the authoritative completion only after it has
          // collected the workspace diff and prepared the review decision.
          // Forwarding the backend's raw task_completed here ends the UI early.
          if (event.type === "task_completed") return;
          emit(toAgentEvent(sessionId, event));
        },
        signal
      );

      // Capture the authoritative diff and freeze the current file hashes for
      // safe accept/reject handling. The edits stay in the project during review.
      const review = await this.finalizeReview(this.options.keepEditsForReview === true);
      keepWorkspaceChangesForReview = this.options.keepEditsForReview === true && review.changes.length > 0;

      const externalSessionId = (result.metadata as Record<string, unknown> | undefined)?.externalSessionId;
      const metadata: Record<string, unknown> = {
        backendProvider: backend.provider,
        backendModel: backend.modelId,
        ...(typeof externalSessionId === "string" ? { backendSessionId: externalSessionId } : {}),
      };

      let status: LocalSessionOutcome["status"];
      if (review.changes.length > 0) {
        // Changes await user approval and remain in the working tree.
        status = "waiting";
        emitTerminal({
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
        emitTerminal({
          type: "error",
          sessionId,
          timestamp: Date.now(),
          data: { error: result.summary || `${backend.provider} failed without producing changes` },
        });
      } else {
        status = "completed";
        emitTerminal({
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
      emitTerminal({
        type: "error",
        sessionId,
        timestamp: Date.now(),
        data: { error: message },
      });
    } finally {
      // Keep reviewable edits on disk until the user accepts or rejects them.
      if (!keepWorkspaceChangesForReview) await this.restoreGuard();
    }

    if (this.options.deferTerminalEvent) outcome.terminalEvent = terminalEvent;
    return outcome;
  }

  /** Diff and emit review data while preserving the proposed workspace edits. */
  private async finalizeReview(preserveWorkspaceEdits: boolean): Promise<ReturnType<typeof diffToReview>> {
    const rawChanges = this.options.guard.diffForReview();
    if (!preserveWorkspaceEdits) await this.restoreGuard();
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
