import { state, userNameColor, initials } from "../state";
import { getDOM } from "../dom";
import { openPinThread, closePinThread, renderPinThread } from "./thread";
import type { CollabComment, CommentThread } from "../types";

export function upsertComment(comment: CollabComment) {
  if (!comment?.uid) return;
  if (comment.parentId) {
    const thread = state.commentThreads.get(comment.parentId);
    if (thread) {
      const index = thread.replies.findIndex((reply) => reply.uid === comment.uid);
      if (index >= 0) thread.replies[index] = comment;
      else thread.replies.push(comment);
    } else {
      state.commentThreads.set(comment.parentId, {
        root: {
          uid: comment.parentId,
          sessionId: comment.sessionId,
          status: "OPEN",
          body: "",
          author: { id: "", name: "…", photo: "" },
          createdAt: "",
        },
        replies: [comment],
      });
    }
  } else {
    const existing = state.commentThreads.get(comment.uid)?.replies || [];
    state.commentThreads.set(comment.uid, { root: comment, replies: existing });
  }
}

export function removeCommentUid(uid: string) {
  state.commentThreads.delete(uid);
  for (const thread of state.commentThreads.values()) {
    thread.replies = thread.replies.filter((reply) => reply.uid !== uid);
  }
}

export function indexComments(comments: unknown[]) {
  state.commentThreads.clear();
  for (const raw of comments) {
    upsertComment(raw as CollabComment);
  }
}

export function threadsInScope(): CommentThread[] {
  return [...state.commentThreads.values()];
}

export function updateCommentsBadge() {
  const dom = getDOM();
  const badge = dom.shadow.querySelector<HTMLElement>(".lasso-comments-badge");
  if (!badge) return;
  const openCount = threadsInScope().filter((t) => t.root.status === "OPEN").length;
  badge.classList.toggle("visible", openCount > 0);
  badge.textContent = String(openCount);
}

export function commentPosition(thread: CommentThread): { left: number; top: number; width?: number; height?: number } | null {
  const saved = thread.root.meta?.position;
  if (saved) {
    return saved.space === "document"
      ? { ...saved, left: saved.left - window.scrollX, top: saved.top - window.scrollY }
      : saved;
  }
  if (thread.root.elementId) {
    const element = state.elementRegistry.get(thread.root.elementId);
    if (element) {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    }
  }
  return null;
}

export function renderCommentPins() {
  const dom = getDOM();
  dom.commentPins.replaceChildren();
  const threads = [...state.commentThreads.values()];

  threads.forEach((thread) => {
    const position = commentPosition(thread);
    if (!position) return;

    const pinLeft = position.left + (position.width || 0) * 0.5 - 17;
    const pinTop = position.top - 17;

    if (
      pinLeft < -32 ||
      pinLeft > window.innerWidth + 32 ||
      pinTop < -32 ||
      pinTop > window.innerHeight + 32
    ) {
      return;
    }

    const pin = document.createElement("button");
    pin.type = "button";
    const isResolved = thread.root.status === "RESOLVED";
    const isOpen = state.openThreadUid === thread.root.uid;
    pin.className = `lasso-comment-pin${isResolved ? " resolved" : ""}${isOpen ? " active" : ""}`;
    pin.dataset.commentUid = thread.root.uid;

    const authorColor = userNameColor(thread.root.author?.id || "");
    const authorInitials = initials(thread.root.author?.name || "");
    const replyCount = thread.replies.length;

    pin.innerHTML = `
      <span class="lasso-pin-avatar" style="background:${authorColor}">${authorInitials}</span>
      ${replyCount ? `<span class="lasso-comment-pin-count">${replyCount + 1}</span>` : ""}
    `;
    pin.title = `${thread.root.author?.name || "Anonymous"}: ${thread.root.body || "View comment"}`;
    pin.style.left = `${pinLeft}px`;
    pin.style.top = `${pinTop}px`;

    pin.addEventListener("click", (event) => {
      event.stopPropagation();
      const rect = pin.getBoundingClientRect();
      if (state.openThreadUid === thread.root.uid) {
        closePinThread();
      } else {
        openPinThread(thread.root.uid, rect.right, rect.top);
      }
    });

    dom.commentPins.appendChild(pin);
  });
}

export function renderComments() {
  renderCommentPins();
  if (state.openThreadUid) renderPinThread();
  updateCommentsBadge();
}
