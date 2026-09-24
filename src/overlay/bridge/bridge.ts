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
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const overlayScript = Array.from(document.scripts).find((script) => script.src.includes("/__lasso/overlay.js"));
    const bridgePort = overlayScript ? new URL(overlayScript.src, window.location.href).searchParams.get("bridgePort") || "3056" : "3056";
    state.bridgeSocket = new WebSocket(`${protocol}//localhost:${bridgePort}`);

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
          changes?: PendingChange[];
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

        if (message.type === "agent_status" && message.status && message.message) {
          setAgentStatus(message.status, message.message);
          setDragCardStatus(message.status, message.message);
          if (message.status === "review" && message.changes?.length) {
            state.pendingChanges = message.changes;
            state.changesHistory.push({
              summary: message.message,
              changes: message.changes,
              createdAt: new Date().toISOString(),
            });
            showReview(message.changes, message.message);
          }
        }

        if (message.type === "assistant_message" && message.message) {
          appendChat("assistant", message.message);
          resetAgentState();
        }

        if (message.type === "applied" || message.type === "undone") {
          appendChat("assistant", message.message || "Done.");
          releaseHeldLock();
          if (state.collabSocket?.connected && state.collabJoined) {
            collabEmit("collab:action", {
              sessionId: state.collabProjectId,
              status: "idle",
              elementId: state.selected ? elementKey(state.selected) : undefined,
              summary:
                message.message ||
                (message.type === "undone" ? "Undid the last change" : "Applied the change"),
            });
          }
          closeReview();
          resetDrag(false);
          state.pendingChanges = [];
        }
      } catch {
        console.warn("[lasso] Invalid bridge message");
      }
    });
  } catch {
    state.bridgeSocket = null;
  }
}
