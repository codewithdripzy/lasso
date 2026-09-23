import { state, userNameColor, initials } from "../state";
import { getDOM } from "../dom";
import { openPinThread, closePinThread, renderPinThread, repositionPinThread } from "./thread";
import { collabEmit } from "../collab/socket";
import type { CollabComment, CommentThread } from "../types";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function isCommentAuthor(thread: CommentThread): boolean {
  if (!thread?.root) return false;
  const authorId = thread.root.author?.id;
  const myId = state.myUser?.id;

  if (myId && authorId === myId) return true;
  if (authorId === "me") return true;
  if (state.myUser?.name && thread.root.author?.name && thread.root.author.name === state.myUser.name) return true;
  if (!state.collabJoined && (!authorId || authorId === "me")) return true;
  return false;
}

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
    const authorName = escapeHtml(thread.root.author?.name || "Anonymous");
    const rawBody = (thread.root.body || "").trim();
    const bodyPreview = escapeHtml(rawBody.length > 36 ? rawBody.slice(0, 36) + "…" : rawBody);
    const isNearRight = pinLeft > window.innerWidth - 240;

    pin.innerHTML = `
      <span class="lasso-pin-avatar" style="background:${authorColor}">${authorInitials}</span>
      ${replyCount ? `<span class="lasso-comment-pin-count">${replyCount + 1}</span>` : ""}
      <span class="lasso-pin-tooltip${isNearRight ? " near-right" : ""}">
        <span class="lasso-pin-tooltip-author">${authorName}</span>
        ${bodyPreview ? `<span class="lasso-pin-tooltip-body">${bodyPreview}</span>` : ""}
      </span>
    `;
    const isOwner = isCommentAuthor(thread);
    pin.title = `${thread.root.author?.name || "Anonymous"}: ${thread.root.body || "View comment"}${isOwner ? " (drag to move)" : ""}`;
    pin.style.left = `${pinLeft}px`;
    pin.style.top = `${pinTop}px`;

    if (isOwner) {
      pin.classList.add("movable");
      let isDragging = false;
      let startX = 0;
      let startY = 0;
      let initialLeft = pinLeft;
      let initialTop = pinTop;
      let currentLeft = pinLeft;
      let currentTop = pinTop;
      let dragDistance = 0;

      const onPointerMove = (e: PointerEvent) => {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        dragDistance = Math.hypot(dx, dy);

        if (!isDragging && dragDistance > 3) {
          isDragging = true;
          pin.classList.add("dragging");
          try {
            pin.setPointerCapture(e.pointerId);
          } catch {
            // pointer capture fallback
          }
        }

        if (isDragging) {
          currentLeft = Math.max(8, Math.min(window.innerWidth - 42, initialLeft + dx));
          currentTop = Math.max(8, Math.min(window.innerHeight - 42, initialTop + dy));
          pin.style.left = `${currentLeft}px`;
          pin.style.top = `${currentTop}px`;

          if (state.openThreadUid === thread.root.uid) {
            repositionPinThread(currentLeft + 34, currentTop);
          }
        }
      };

      const onPointerUp = (e: PointerEvent) => {
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("pointercancel", onPointerUp);

        if (isDragging) {
          try {
            if (pin.hasPointerCapture(e.pointerId)) {
              pin.releasePointerCapture(e.pointerId);
            }
          } catch {
            // ignore
          }
          pin.classList.remove("dragging");

          const docLeft = currentLeft + 17 + window.scrollX;
          const docTop = currentTop + 17 + window.scrollY;

          const newPosition = {
            left: docLeft,
            top: docTop,
            width: 0,
            height: 0,
            space: "document" as const,
          };

          if (!thread.root.meta) thread.root.meta = {};
          thread.root.meta.position = newPosition;

          if (state.collabJoined && state.collabProjectId) {
            collabEmit("comments:move", {
              sessionId: state.collabProjectId,
              commentId: thread.root.uid,
              position: newPosition,
            });
          }

          setTimeout(() => {
            isDragging = false;
          }, 50);
        }
      };

      pin.addEventListener("pointerdown", (e: PointerEvent) => {
        if (e.button !== 0) return;
        startX = e.clientX;
        startY = e.clientY;
        const rect = pin.getBoundingClientRect();
        initialLeft = rect.left;
        initialTop = rect.top;
        currentLeft = rect.left;
        currentTop = rect.top;
        dragDistance = 0;
        isDragging = false;

        window.addEventListener("pointermove", onPointerMove);
        window.addEventListener("pointerup", onPointerUp);
        window.addEventListener("pointercancel", onPointerUp);
      });

      pin.addEventListener("click", (event) => {
        if (isDragging || dragDistance > 3) {
          event.stopPropagation();
          event.preventDefault();
          return;
        }
        event.stopPropagation();
        const rect = pin.getBoundingClientRect();
        if (state.openThreadUid === thread.root.uid) {
          closePinThread();
        } else {
          openPinThread(thread.root.uid, rect.right, rect.top);
        }
      });
    } else {
      pin.addEventListener("click", (event) => {
        event.stopPropagation();
        const rect = pin.getBoundingClientRect();
        if (state.openThreadUid === thread.root.uid) {
          closePinThread();
        } else {
          openPinThread(thread.root.uid, rect.right, rect.top);
        }
      });
    }

    dom.commentPins.appendChild(pin);
  });
}

export function renderComments() {
  renderCommentPins();
  if (state.openThreadUid) renderPinThread();
  updateCommentsBadge();
}
