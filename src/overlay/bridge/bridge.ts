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
  showAgentPrompt,
} from "../prompt/prompt";
import { setDragCardStatus, resetDrag } from "../drag/drag";
import { elementKey } from "../toolbar/select";
import { notifyAgent } from "../notifications";
import { getAgentTask, recordTaskActivity, recordTaskChangeHistory, updateAgentTask } from "../tasks/tasks";
import {
  handleCommandBarAgentStatus,
  handleCommandBarAction,
  handleCommandBarPrompt,
  isCommandBarTaskId,
  updateEmptyStateUserName,
  populateModelMenu,
} from "../commandbar/commandbar";
import type { GitState, ModelOption, PendingChange } from "../types";

export function reportRuntimeError(details: string, notifyBridge = true) {
  const clean = details.slice(0, 1200);
  if (!clean || state.runtimeErrors.includes(clean)) return;
  state.runtimeErrors = [...state.runtimeErrors.slice(-4), clean];
  if (notifyBridge && state.bridgeSocket?.readyState === WebSocket.OPEN) {
    state.bridgeSocket.send(
      JSON.stringify({ type: "runtime_error", selectionId: state.selectionId, details: clean })
    );
  }
}

function formatConsoleArg(arg: unknown): string {
  if (typeof arg === "string") return arg;
  if (arg instanceof Error) return arg.stack || arg.message;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

let errorListenersInstalled = false;

export function initErrorListeners() {
  if (errorListenersInstalled) return;
  errorListenersInstalled = true;

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

  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    originalConsoleError.apply(console, args);
    try {
      const details = args.map(formatConsoleArg).join(" ").replace(/\s+/g, " ").trim();
      if (details && !details.includes("[lasso]")) reportRuntimeError(`console.error · ${details}`, false);
    } catch {}
  };
}

export function send(message: any) {
  if (state.bridgeSocket?.readyState === WebSocket.OPEN) {
    state.bridgeSocket.send(JSON.stringify(message));
  }
}

export const bridge = {
  send,
  connect: connectBridge,
};

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
          prompt?: { message: string; kind: "permission" | "input"; options?: string[] };
          path?: string;
          entries?: Array<{ name: string; path: string; type: "directory" | "file" }>;
          project?: string;
          collab?: { projectId?: string; realtimeUrl?: string; name?: string; version?: string; workspaceId?: string; token?: string; apiKey?: string; plan?: string; configuredProviders?: string[] };
          user?: { name?: string; email?: string } | null;
        };

        if (message.type === "config") {
          state.apiKeyConfigured = Boolean(message.apiKeyConfigured);
          if (message.collab) {
            state.collab = message.collab as any;
            if (message.collab.projectId) {
              state.collabProjectId = message.collab.projectId;
            }
          }
          if (message.user?.name) {
            state.myUser = {
              id: state.myUser?.id || "me",
              name: message.user.name,
              photo: state.myUser?.photo || "",
            };
            try {
              localStorage.setItem("lasso:user:name", message.user.name);
            } catch {}
            updateEmptyStateUserName();
          }
          if (message.collab?.projectId && message.collab.realtimeUrl && !state.collabSocket) {
            connectCollab(message.collab);
          }
        }

        if (message.type === "config" && message.models?.length) {
          state.MODELS = message.models;
          // If the currently selected model is locked, select the first unlocked model
          const currentLocked = state.selectedModel?.locked;
          if (currentLocked) {
            const firstUnlocked = state.MODELS.find((m) => !m.locked);
            if (firstUnlocked) {
              state.selectedModel = firstUnlocked;
              rememberModel(state.selectedModel);
            }
          } else {
            state.selectedModel =
              state.MODELS.find((m) => m.id === storedModelId()) || state.MODELS.find((m) => !m.locked) || state.MODELS[0];
            rememberModel(state.selectedModel);
          }
          refreshModelMenu();
          populateModelMenu();
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

        if (message.type === "agent_prompt" && message.taskId && message.prompt) {
          if (isCommandBarTaskId(message.taskId)) {
            handleCommandBarPrompt(message);
            return;
          }
          showAgentPrompt(message.taskId, message.prompt);
          return;
        }

        if (message.type === "page_folders") {
          window.dispatchEvent(
            new CustomEvent("lasso-page-folders", {
              detail: { path: message.path || ".", entries: message.entries || [], project: message.project, error: message.error },
            }),
          );
          return;
        }
        if (message.type === "page_created") {
          window.dispatchEvent(new CustomEvent("lasso-page-created", { detail: { path: message.path || "", error: message.error } }));
          return;
        }
        if (message.type === "page_folder_created") {
          window.dispatchEvent(new CustomEvent("lasso-page-folder-created", { detail: { path: message.path || "", error: message.error } }));
          return;
        }

        if (message.type === "agent_status" && message.status && message.message) {
          const taskId = message.taskId;
          if (isCommandBarTaskId(taskId)) {
            handleCommandBarAgentStatus(message);
            return;
          }
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
          if (isCommandBarTaskId(taskId)) {
            handleCommandBarAgentStatus({ taskId, status: "complete", message: message.message });
            return;
          }
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
          if (isCommandBarTaskId(taskId)) {
            handleCommandBarAction(message);
            return;
          }
          const task = taskId ? getAgentTask(taskId) : undefined;
          if (task) {
            updateAgentTask(task.id, { status: "complete", message: message.message || "Done.", changes: [], pendingChanges: [] });
            recordTaskActivity(task.id, message.message || "Done.");
          }
          const isPromptTask = !taskId || taskId === state.promptTaskId;
          let result = message.message || "Done.";

          // Handle validation results
          if (message.type === "applied" && message.validation) {
            const { passed, errors, command } = message.validation;
            if (!passed && errors.length > 0) {
              result = `${message.message}\n\n⚠️ Build validation failed after running \`${command}\`:\n\n${errors.slice(0, 5).join("\n")}${errors.length > 5 ? `\n...and ${errors.length - 5} more errors` : ""}\n\nYou may need to manually fix these errors or undo the change.`;
            } else if (passed) {
              result = `${message.message}\n\n✅ Build validation passed.`;
            }
          }

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
