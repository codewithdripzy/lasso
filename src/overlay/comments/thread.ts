import { state, userNameColor, initials, timeAgo } from "../state";
import { getDOM } from "../dom";
import { collabEmit } from "../collab/socket";
import { showActivity } from "../collab/presence";
import { upsertComment, renderCommentPins } from "./pins";
import type { CollabComment } from "../types";

let pinThreadEl: HTMLDivElement | null = null;

export function buildPinThread(): HTMLDivElement {
  const dom = getDOM();
  const el = document.createElement("div");
  el.className = "lasso-pin-thread";
  el.hidden = true;
  el.innerHTML = `
    <div class="lasso-pin-thread-head">
      <span class="lasso-pin-thread-status open">Open</span>
      <button class="lasso-pin-thread-close" type="button" aria-label="Close">×</button>
    </div>
    <div class="lasso-pin-thread-msgs"></div>
    <div class="lasso-pin-thread-reply-area">
      <textarea placeholder="Reply…" maxlength="2000" rows="2"></textarea>
      <div class="lasso-pin-thread-footer">
        <button class="lasso-pin-resolve" type="button">Resolve</button>
        <button class="lasso-pin-reply-post" type="button">Reply</button>
      </div>
    </div>
  `;

  dom.shadow.appendChild(el);
  pinThreadEl = el;

  const closeBtn = el.querySelector<HTMLButtonElement>(".lasso-pin-thread-close")!;
  const resolveBtn = el.querySelector<HTMLButtonElement>(".lasso-pin-resolve")!;
  const replyPostBtn = el.querySelector<HTMLButtonElement>(".lasso-pin-reply-post")!;
  const replyTa = el.querySelector<HTMLTextAreaElement>(".lasso-pin-thread-reply-area textarea")!;

  closeBtn.addEventListener("click", closePinThread);

  resolveBtn.addEventListener("click", () => {
    if (!state.openThreadUid) return;
    const thread = state.commentThreads.get(state.openThreadUid);
    if (!thread) return;
    const isNowResolved = thread.root.status === "RESOLVED";
    const nextStatus = isNowResolved ? "OPEN" : "RESOLVED";
    const event = isNowResolved ? "comments:reopen" : "comments:resolve";

    if (state.collabJoined && state.collabProjectId) {
      collabEmit(event, { sessionId: state.collabProjectId, commentId: state.openThreadUid });
    }
    thread.root.status = nextStatus;
    renderPinThread();
    renderCommentPins();
  });

  replyPostBtn.addEventListener("click", () => {
    if (!state.openThreadUid) return;
    const body = replyTa.value.trim();
    if (!body) return;

    const payload = {
      sessionId: state.collabProjectId || "local",
      body,
      parentId: state.openThreadUid,
    };

    if (state.collabJoined && state.collabProjectId) {
      collabEmit("comments:add", payload, (res) => {
        if (!res.ok) {
          showActivity(res.error || "Could not post reply.", "#f28b82");
        }
      });
    } else {
      const localReply: CollabComment = {
        uid: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        sessionId: "local",
        parentId: state.openThreadUid,
        body,
        status: "OPEN",
        author: {
          id: state.myUser?.id || "me",
          name: state.myUser?.name || "You",
          photo: state.myUser?.photo || "",
        },
        createdAt: new Date().toISOString(),
      };
      upsertComment(localReply);
    }

    replyTa.value = "";
    renderPinThread();
    renderCommentPins();
  });

  replyTa.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      replyPostBtn.click();
    }
    if (e.key === "Escape") {
      closePinThread();
    }
  });

  return el;
}

export function openPinThread(uid: string, anchorX: number, anchorY: number) {
  if (!pinThreadEl) return;
  state.openThreadUid = uid;
  renderPinThread();
  repositionPinThread(anchorX, anchorY);
  pinThreadEl.hidden = false;
  requestAnimationFrame(() => pinThreadEl?.classList.add("visible"));
}

export function repositionPinThread(anchorX: number, anchorY: number) {
  if (!pinThreadEl) return;
  const w = 290;
  const gap = 14;
  let left = anchorX + gap;
  if (left + w > window.innerWidth - 12) left = anchorX - w - gap;
  let top = anchorY - 20;
  if (top + 360 > window.innerHeight - 12) top = window.innerHeight - 372;
  if (top < 12) top = 12;

  pinThreadEl.style.left = `${Math.max(12, left)}px`;
  pinThreadEl.style.top = `${top}px`;
}

export function closePinThread() {
  if (!pinThreadEl) return;
  state.openThreadUid = null;
  pinThreadEl.classList.remove("visible");
  setTimeout(() => {
    if (pinThreadEl) pinThreadEl.hidden = true;
  }, 180);
}

export function renderPinThread() {
  if (!pinThreadEl || !state.openThreadUid) return;
  const thread = state.commentThreads.get(state.openThreadUid);
  if (!thread) {
    closePinThread();
    return;
  }

  const msgs = pinThreadEl.querySelector<HTMLDivElement>(".lasso-pin-thread-msgs");
  const statusEl = pinThreadEl.querySelector<HTMLSpanElement>(".lasso-pin-thread-status");
  const resolveBtn = pinThreadEl.querySelector<HTMLButtonElement>(".lasso-pin-resolve");
  if (!msgs || !statusEl || !resolveBtn) return;

  msgs.innerHTML = "";
  const isResolved = thread.root.status === "RESOLVED";
  statusEl.textContent = isResolved ? "Resolved" : "Open";
  statusEl.className = `lasso-pin-thread-status ${isResolved ? "resolved" : "open"}`;
  resolveBtn.textContent = isResolved ? "Reopen" : "Resolve";

  const allMessages = [thread.root, ...thread.replies];
  for (const msg of allMessages) {
    const el = document.createElement("div");
    el.className = "lasso-pin-thread-msg";

    const row = document.createElement("div");
    row.className = "lasso-pin-thread-msg-row";

    const av = document.createElement("div");
    av.className = "lasso-pin-thread-avatar";
    av.style.background = userNameColor(msg.author?.id || "");
    av.textContent = initials(msg.author?.name || "");

    const author = document.createElement("span");
    author.className = "lasso-pin-thread-author";
    author.textContent = msg.author?.name || "Unknown";

    const time = document.createElement("span");
    time.className = "lasso-pin-thread-time";
    time.textContent = timeAgo(msg.createdAt);

    row.append(av, author, time);

    const body = document.createElement("div");
    body.className = "lasso-pin-thread-body";
    body.textContent = msg.body;

    el.append(row, body);
    msgs.appendChild(el);
  }

  msgs.scrollTop = msgs.scrollHeight;
}

export function isPinThreadOpen(): boolean {
  return pinThreadEl ? !pinThreadEl.hidden : false;
}
