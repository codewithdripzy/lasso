import { io } from "socket.io-client";
import { state, userNameColor } from "../state";
import { getDOM } from "../dom";
import { currentSelectionPayload } from "../toolbar/select";
import { applyPresence, renderPresence, renderRemoteBoxes, showActivity, spotlightFor } from "./presence";
import { indexLocks, updateLockChip, releaseHeldLock } from "./locks";
import { handleOffer, handleAnswer, handleCandidate, closePeer } from "./voice";
import { upsertComment, removeCommentUid, renderComments, updateCommentsBadge } from "../comments/pins";
import type { CollabConfig, CollabLock, CollabComment, CollabTodo, CollabClipboardItem } from "../types";
import { replaceTodos, upsertTodo, removeTodo } from "../todo/todo";
import { setNoteFromServer } from "../notepad/notepad";
import { upsertClipboardItem, removeClipboardItem } from "../clipboard/clipboard";

export function readAuthToken(): string {
  for (const key of ["token", "lasso_token", "auth_token", "jwt"]) {
    const match = document.cookie.match(new RegExp(`(?:^|;)\\s*${key}\\s*=\\s*([^;]+)`));
    if (match) return decodeURIComponent(match[1]);
  }
  return "";
}

export function collabEmit(
  event: string,
  payload: Record<string, unknown>,
  ack?: (res: { ok: boolean; error?: string; [key: string]: unknown }) => void
) {
  if (!state.collabSocket?.connected) return false;
  if (ack) state.collabSocket.emit(event, payload, ack);
  else state.collabSocket.emit(event, payload);
  return true;
}

export function connectCollab(config: CollabConfig) {
  state.collab = config;
  state.collabProjectId = config.projectId || "";
  if (!state.collabProjectId || !config.realtimeUrl) return;
  if (state.collabSocket) state.collabSocket.disconnect();

  // First prioritize the user's Lasso tool authentication (CLI credentials / session token / API key)
  const toolToken = config.token || config.apiKey || "";
  const browserToken = readAuthToken();
  const token = toolToken || browserToken;

  if (toolToken) {
    console.log("[Lasso Collab] Authenticating socket via Lasso tool credentials");
  } else if (browserToken) {
    console.log("[Lasso Collab] Fallback: authenticating socket via browser cookie token");
  } else {
    console.log("[Lasso Collab] Connecting without token (cookie credentials only)");
  }

  state.collabSocket = io(config.realtimeUrl, {
    withCredentials: true,
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: 15,
    reconnectionDelay: 800,
    reconnectionDelayMax: 5000,
    auth: { token },
  });

  state.collabSocket.on("connect", () => {
    console.log("[Lasso Collab] Socket connected to collab server:", config.realtimeUrl, "socketId:", state.collabSocket?.id);
    if (state.collabProjectId) joinCollabSession();
    collabEmit("note:get", {}, (payload) => {
      if (payload.ok && typeof payload.body === "string") setNoteFromServer(payload.body);
    });
  });

  state.collabSocket.on("connect_error", (error) => {
    console.warn("[Lasso Collab] Socket connection error to collab server:", error?.message || error);
    state.collabJoined = false;
    const countEl = getDOM().shadow.querySelector<HTMLSpanElement>(".lasso-presence-count");
    if (countEl) countEl.textContent = state.collabProjectId ? "· offline" : "";
  });

  state.collabSocket.on("disconnect", (reason) => {
    console.log("[Lasso Collab] Socket disconnected from collab server:", reason);
    state.collabJoined = false;
    state.presenceUsers.clear();
    renderPresence();
    getDOM().remoteLayer.innerHTML = "";
    updateLockChip();
    showActivity("Realtime session disconnected", "#f28b82");
  });

  state.collabSocket.on("presence:changed", (payload: { sessionId?: string; users?: unknown[] }) => {
    if (payload.sessionId !== state.collabProjectId) return;
    applyPresence(payload.users || []);
  });

  state.collabSocket.on("lock:acquired", (payload: { sessionId?: string; lock?: CollabLock }) => {
    if (payload.sessionId !== state.collabProjectId || !payload.lock?.elementId) return;
    state.lockMap.set(payload.lock.elementId, payload.lock);
    updateLockChip();
  });

  state.collabSocket.on("lock:released", (payload: { sessionId?: string; elementId?: string }) => {
    if (payload.sessionId !== state.collabProjectId || !payload.elementId) return;
    state.lockMap.delete(payload.elementId);
    updateLockChip();
  });

  state.collabSocket.on("lock:extended", (payload: { sessionId?: string; lock?: CollabLock }) => {
    if (payload.sessionId !== state.collabProjectId || !payload.lock?.elementId) return;
    state.lockMap.set(payload.lock.elementId, payload.lock);
    updateLockChip();
  });

  state.collabSocket.on("comments:new", (payload: { sessionId?: string; comment?: CollabComment }) => {
    if (payload.sessionId !== state.collabProjectId || !payload.comment) return;
    upsertComment(payload.comment);
    renderComments();
    updateCommentsBadge();
  });

  state.collabSocket.on("comments:updated", (payload: { sessionId?: string; comment?: CollabComment }) => {
    if (payload.sessionId !== state.collabProjectId || !payload.comment) return;
    upsertComment(payload.comment);
    renderComments();
    updateCommentsBadge();
  });

  state.collabSocket.on("comments:removed", (payload: { sessionId?: string; commentId?: string }) => {
    if (payload.sessionId !== state.collabProjectId || !payload.commentId) return;
    removeCommentUid(payload.commentId);
    renderComments();
    updateCommentsBadge();
  });

  state.collabSocket.on("todos:new", (payload: { sessionId?: string; todo?: CollabTodo }) => {
    if (payload.sessionId !== state.collabProjectId || !payload.todo) return;
    upsertTodo(payload.todo);
  });

  state.collabSocket.on("todos:updated", (payload: { sessionId?: string; todo?: CollabTodo }) => {
    if (payload.sessionId !== state.collabProjectId || !payload.todo) return;
    upsertTodo(payload.todo);
  });

  state.collabSocket.on("todos:removed", (payload: { sessionId?: string; todoId?: string }) => {
    if (payload.sessionId !== state.collabProjectId || !payload.todoId) return;
    removeTodo(payload.todoId);
  });

  state.collabSocket.on("clipboard:new", (payload: { sessionId?: string; item?: CollabClipboardItem }) => {
    if (payload.sessionId !== state.collabProjectId || !payload.item) return;
    upsertClipboardItem(payload.item);
  });

  state.collabSocket.on("clipboard:removed", (payload: { sessionId?: string; itemId?: string }) => {
    if (payload.sessionId !== state.collabProjectId || !payload.itemId) return;
    removeClipboardItem(payload.itemId);
  });

  state.collabSocket.on(
    "collab:action",
    (payload: {
      sessionId?: string;
      user?: { id: string; name: string; photo: string };
      status?: string;
      summary?: string;
    }) => {
      if (payload.sessionId !== state.collabProjectId) return;
      const name = payload.user?.name || "A teammate";
      const status = payload.status || "";
      const text = payload.summary
        ? `${name} is ${status === "idle" ? "done" : status.replace(/e?$/, "ing")} — ${payload.summary.slice(0, 90)}`
        : `${name} ${status === "idle" ? "finished working" : `is ${status}`}`;
      showActivity(text, userNameColor(payload.user?.id || ""));
    }
  );

  state.collabSocket.on(
    "collab:spotlight",
    (payload: {
      sessionId?: string;
      elementId?: string;
      label?: string;
      by?: { id: string; name: string; photo: string };
    }) => {
      if (payload.sessionId !== state.collabProjectId || !payload.elementId) return;
      const el = state.elementRegistry.get(payload.elementId) || null;
      const by = payload.by || { id: "", name: "Teammate", photo: "" };
      spotlightFor(by, el, payload.label || "");
    }
  );

  state.collabSocket.on("voice:offer", (payload: { from?: string; description?: unknown }) =>
    handleOffer(payload)
  );
  state.collabSocket.on("voice:answer", (payload: { from?: string; description?: unknown }) =>
    handleAnswer(payload)
  );
  state.collabSocket.on("voice:candidate", (payload: { from?: string; candidate?: unknown }) =>
    handleCandidate(payload)
  );
  state.collabSocket.on("voice:peer_left", (payload: { socketId?: string }) =>
    closePeer(payload.socketId || "")
  );
}

export function joinCollabSession() {
  if (!state.collabSocket?.connected || !state.collabProjectId) return;
  const selection = currentSelectionPayload();
  collabEmit(
    "session:join",
    { sessionId: state.collabProjectId, selection },
    (payload) => {
      const countEl = getDOM().shadow.querySelector<HTMLSpanElement>(".lasso-presence-count");
      if (!payload.ok) {
        console.warn("[Lasso Collab] Session join failed for", state.collabProjectId, ":", payload.error);
        state.collabJoined = false;
        if (countEl) countEl.textContent = state.collabProjectId ? "· closed" : "";
        showActivity(
          payload.error ||
            "Could not join realtime session. Log in to your Lasso workspace and start Lasso to collaborate.",
          "#fdd663"
        );
        return;
      }
      console.log("[Lasso Collab] Joined realtime session:", state.collabProjectId, "as", payload.me);
      state.collabJoined = true;
      if (countEl) countEl.textContent = "";
      state.myUser = (payload.me as { id: string; name: string; photo: string }) || null;
      const snapshot = (payload.snapshot || {}) as {
        presence?: unknown[];
        locks?: unknown[];
        comments?: unknown[];
        todos?: unknown[];
      };
      applyPresence(snapshot.presence || []);
      indexLocks(snapshot.locks || []);
      for (const c of snapshot.comments || []) {
        upsertComment(c as CollabComment);
      }
      updateLockChip();
      replaceTodos((snapshot.todos || []) as CollabTodo[]);
      renderComments();
      updateCommentsBadge();
      startCollabHeartbeat();
    }
  );
}

export function startCollabHeartbeat() {
  if (state.collabHeartbeat) return;
  state.collabHeartbeat = window.setInterval(() => {
    if (!state.collabSocket?.connected || !state.collabJoined) return;
    collabEmit("presence:update", {
      sessionId: state.collabProjectId,
      state: "online",
      selection: currentSelectionPayload(),
    });
    if (state.heldLockElement) {
      collabEmit("lock:extend", {
        sessionId: state.collabProjectId,
        elementId: state.heldLockElement,
      });
    }
  }, 30_000);
}

export function sendPresenceUpdate(patch: { state?: "online" | "away"; selection?: unknown }) {
  if (!state.collabSocket?.connected || !state.collabJoined || !state.collabProjectId) return;
  collabEmit("presence:update", {
    sessionId: state.collabProjectId,
    state: patch.state || "online",
    selection: patch.selection !== undefined ? patch.selection : currentSelectionPayload(),
  });
}

export function initCursorTracking() {
  let lastEmit = 0;
  const THROTTLE_MS = 50; // ~20fps
  document.addEventListener("mousemove", (e) => {
    if (!state.collabSocket?.connected || !state.collabJoined || !state.collabProjectId) return;
    const now = Date.now();
    if (now - lastEmit < THROTTLE_MS) return;
    lastEmit = now;
    collabEmit("presence:update", {
      sessionId: state.collabProjectId,
      cursor: { x: e.clientX, y: e.clientY },
    });
  }, { passive: true });
}

export function initCollabPagehide() {
  window.addEventListener("pagehide", () => {
    if (state.collabHeartbeat) window.clearInterval(state.collabHeartbeat);
    if (state.collabSocket) {
      releaseHeldLock();
      state.collabSocket.disconnect();
    }
  });
}
