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
      <button class="lasso-pin-thread-chip open" type="button" aria-label="Toggle status" title="Click to toggle status">
        <span class="lasso-pin-chip-dot"></span>
        <span class="lasso-pin-chip-label">In progress</span>
      </button>
      <div class="lasso-pin-thread-head-actions">
        <button class="lasso-pin-resolve" type="button">Resolve</button>
        <button class="lasso-pin-thread-close" type="button" aria-label="Close">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
    </div>
    <div class="lasso-pin-thread-msgs"></div>
    <div class="lasso-pin-thread-reply-area">
      <textarea placeholder="Write a reply…" maxlength="2000" rows="2"></textarea>
      <div class="lasso-pin-thread-footer">
        <span class="lasso-pin-reply-hint">Cmd+Enter to send</span>
        <button class="lasso-pin-reply-post" type="button">Reply</button>
      </div>
    </div>
  `;

  dom.shadow.appendChild(el);
  pinThreadEl = el;

  const closeBtn = el.querySelector<HTMLButtonElement>(".lasso-pin-thread-close")!;
  const resolveBtn = el.querySelector<HTMLButtonElement>(".lasso-pin-resolve")!;
  const chipBtn = el.querySelector<HTMLButtonElement>(".lasso-pin-thread-chip")!;
  const replyPostBtn = el.querySelector<HTMLButtonElement>(".lasso-pin-reply-post")!;
  const replyTa = el.querySelector<HTMLTextAreaElement>(".lasso-pin-thread-reply-area textarea")!;

  closeBtn.addEventListener("click", closePinThread);

  const toggleStatus = () => {
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
  };

  resolveBtn.addEventListener("click", toggleStatus);
  chipBtn.addEventListener("click", toggleStatus);

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
  const w = 310;
  const gap = 14;
  let left = anchorX + gap;
  if (left + w > window.innerWidth - 12) left = anchorX - w - gap;
  let top = anchorY - 20;
  if (top + 380 > window.innerHeight - 12) top = window.innerHeight - 392;
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

function renderMessageBody(text: string): string {
  // Check if body contains markdown image ![alt](url)
  const imgRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let hasImage = false;
  const replaced = text.replace(imgRegex, (_, alt, url) => {
    hasImage = true;
    return `<div class="lasso-pin-msg-image"><img src="${escapeAttr(url)}" alt="${escapeAttr(alt)}" /></div>`;
  });
  if (hasImage) {
    return replaced;
  }
  return escapeHtml(text);
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function escapeAttr(text: string): string {
  return text.replace(/"/g, "&quot;");
}

export function renderPinThread() {
  if (!pinThreadEl || !state.openThreadUid) return;
  const thread = state.commentThreads.get(state.openThreadUid);
  if (!thread) {
    closePinThread();
    return;
  }

  const msgs = pinThreadEl.querySelector<HTMLDivElement>(".lasso-pin-thread-msgs");
  const chipBtn = pinThreadEl.querySelector<HTMLButtonElement>(".lasso-pin-thread-chip");
  const chipLabel = pinThreadEl.querySelector<HTMLSpanElement>(".lasso-pin-chip-label");
  const resolveBtn = pinThreadEl.querySelector<HTMLButtonElement>(".lasso-pin-resolve");
  if (!msgs || !chipBtn || !chipLabel || !resolveBtn) return;

  msgs.innerHTML = "";
  const isResolved = thread.root.status === "RESOLVED";

  chipLabel.textContent = isResolved ? "Completed" : "In progress";
  chipBtn.className = `lasso-pin-thread-chip ${isResolved ? "resolved" : "open"}`;
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
    body.innerHTML = renderMessageBody(msg.body);

    el.append(row, body);
    msgs.appendChild(el);
  }

  msgs.scrollTop = msgs.scrollHeight;
}

export function isPinThreadOpen(): boolean {
  return pinThreadEl ? !pinThreadEl.hidden : false;
}
