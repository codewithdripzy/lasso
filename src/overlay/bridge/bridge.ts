import { state, rememberModel, storedModelId } from "../state";
import { connectCollab, collabEmit } from "../collab/socket";
import { releaseHeldLock } from "../collab/locks";
import { renderGitState, setGitMessage, setGeneratedCommitMessage } from "../git/git";
import {
  setAgentStatus,
  appendChat,
  showReview,
  closeReview,
  resetAgentState,
  refreshModelMenu,
  syncModelMenu,
} from "../prompt/prompt";
import { setDragCardStatus, resetDrag } from "../drag/drag";
import { elementKey } from "../toolbar/select";
import { notifyAgent } from "../notifications";
import { getAgentTask, recordTaskActivity, recordTaskChangeHistory, updateAgentTask } from "../tasks/tasks";
import type { GitState, ModelOption, PendingChange } from "../types";

export function reportRuntimeError(details: string) {
  const clean = details.slice(0, 1200);
  if (!clean || state.runtimeErrors.includes(clean)) return;
  state.runtimeErrors = [...state.runtimeErrors.slice(-4), clean];
  if (state.bridgeSocket?.readyState === WebSocket.OPEN) {
    state.bridgeSocket.send(
      JSON.stringify({ type: "runtime_error", selectionId: state.selectionId, details: clean })
    );
  }
}

export function initErrorListeners() {
  window.addEventListener("error", (event) => {
    reportRuntimeError(
      `${event.message || "Runtime error"}${event.filename ? ` · ${event.filename}:${event.lineno}` : ""}`
    );
  });
  window.addEventListener("unhandledrejection", (event) => {
    const reason =
      event.reason instanceof Error
        ? event.reason.message
        : String(event.reason || "Unhandled promise rejection");
    reportRuntimeError(reason);
  });
}

export function connectBridge() {
  try {
    // The bridge is intentionally a loopback-only plain WebSocket server.
    // HTTPS Lasso pages can still connect to this trusted local endpoint;
    // using wss:// here would fail because the bridge does not terminate TLS.
    const protocol = "ws:";
    const overlayScript = Array.from(document.scripts).find((script) => script.src.includes("/__lasso/overlay.js"));
    const bridgePort = overlayScript ? new URL(overlayScript.src, window.location.href).searchParams.get("bridgePort") || "3056" : "3056";
    state.bridgeSocket = new WebSocket(`${protocol}//127.0.0.1:${bridgePort}`);

    state.bridgeSocket.addEventListener("open", () => {
      state.bridgeSocket?.send(JSON.stringify({ type: "hello", from: "overlay" }));
    });

    state.bridgeSocket.addEventListener("message", (event) => {
      try {
        const message = JSON.parse(event.data as string) as {
          type?: string;
          apiKeyConfigured?: boolean;
          agentConfigured?: boolean;
          models?: ModelOption[];
          git?: GitState;
          error?: string;
          status?: "thinking" | "working" | "review" | "error" | "stopped";
          message?: string;
          detail?: string;
          changes?: PendingChange[];
          taskId?: string;
          collab?: { projectId?: string; realtimeUrl?: string; name?: string; version?: string; workspaceId?: string; token?: string; apiKey?: string };
        };

        if (message.type === "config") {
          state.apiKeyConfigured = Boolean(message.apiKeyConfigured);
          if (message.collab?.projectId && message.collab.realtimeUrl && !state.collabSocket) {
            connectCollab(message.collab);
          }
        }

        if (message.type === "config" && message.models?.length) {
          state.MODELS = message.models;
          state.selectedModel =
            state.MODELS.find((m) => m.id === storedModelId()) || state.MODELS[0];
          rememberModel(state.selectedModel);
          refreshModelMenu();
        }

        if (message.type === "git_state" && message.git) {
          renderGitState(message.git);
        }

        if (message.type === "git_result") {
          setGitMessage(message.error || message.message || "Git action complete.");
          if (!message.error && state.bridgeSocket?.readyState === WebSocket.OPEN) {
            state.bridgeSocket.send(JSON.stringify({ type: "git_status" }));
          }
        }

        if (message.type === "git_commit_message") {
          setGeneratedCommitMessage(message.message || "", message.error);
        }

        if (message.type === "git_progress" && message.message) {
          setGitMessage(message.message);
        }

        if (message.type === "agent_status" && message.status && message.message) {
          const taskId = message.taskId;
          const task = taskId ? getAgentTask(taskId) : undefined;
          const taskStatus = message.status === "error" ? "error" : message.status === "stopped" ? "stopped" : message.status;
          if (task) {
            const patch: Parameters<typeof updateAgentTask>[1] = {
              status: taskStatus,
              message: message.message,
              detail: message.detail,
            };
            if (message.status === "review" && message.changes) {
              patch.changes = message.changes;
              patch.pendingChanges = message.changes;
              recordTaskChangeHistory(task.id, message.message, message.changes);
            }
            updateAgentTask(task.id, patch);
            recordTaskActivity(task.id, message.detail || message.message);
          }
          if (message.status === "review") {
            appendChat("assistant", message.message, taskId);
            if (message.changes?.length) void notifyAgent("Review requested", message.message);
          } else if (message.status === "error" || message.status === "stopped") {
            appendChat(message.status === "error" ? "error" : "assistant", message.message, taskId);
            if (task?.element) releaseHeldLock(elementKey(task.element));
            void notifyAgent(message.status === "error" ? "Agent error" : "Agent stopped", message.message);
          }
          if (taskId && taskId !== state.promptTaskId) return;

          setAgentStatus(message.status, message.message, message.detail, taskId, false);
          setDragCardStatus(message.status, message.message);
          if (message.status === "review" && message.changes?.length) {
            if (task) state.changesHistory = task.changesHistory.map((entry) => ({ ...entry, changes: entry.changes.map((change) => ({ ...change })) }));
            state.pendingChanges = [...message.changes];
            showReview(message.changes, message.message);
          }
        }

        if (message.type === "assistant_message" && message.message) {
          const taskId = message.taskId;
          const task = taskId ? getAgentTask(taskId) : undefined;
          if (task) {
            updateAgentTask(task.id, { status: "complete", message: "Complete", response: message.message });
            recordTaskActivity(task.id, "Agent complete");
          }
          appendChat("assistant", message.message, taskId);
          if (taskId && taskId !== state.promptTaskId) {
            void notifyAgent("Agent complete", message.message);
            return;
          }
          void notifyAgent("Agent complete", message.message);
          resetAgentState();
        }

        if (message.type === "applied" || message.type === "undone") {
          const taskId = message.taskId;
          const task = taskId ? getAgentTask(taskId) : undefined;
          if (task) {
            updateAgentTask(task.id, { status: "complete", message: message.message || "Done.", changes: [], pendingChanges: [] });
            recordTaskActivity(task.id, message.message || "Done.");
          }
          const isPromptTask = !taskId || taskId === state.promptTaskId;
          const result = message.message || "Done.";
          void notifyAgent(message.type === "applied" ? "Changes applied" : "Change undone", result);
          appendChat("assistant", result, taskId);
          if (task?.element) releaseHeldLock(elementKey(task.element));
          else if (isPromptTask && state.selected) releaseHeldLock(elementKey(state.selected));
          if (state.collabSocket?.connected && state.collabJoined) {
            collabEmit("collab:action", {
              sessionId: state.collabProjectId,
              status: "idle",
              elementId: task?.element ? elementKey(task.element) : state.selected ? elementKey(state.selected) : undefined,
              summary: result || (message.type === "undone" ? "Undid the last change" : "Applied the change"),
            });
          }
          if (isPromptTask) {
            closeReview();
            resetDrag(false);
            state.pendingChanges = [];
          }
        }
      } catch {
        console.warn("[lasso] Invalid bridge message");
      }
    });
  } catch {
    state.bridgeSocket = null;
  }
}
