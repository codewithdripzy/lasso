import { state } from "../state";
import { getDOM } from "../dom";
import { setCommentMode } from "../toolbar/toolbar";
import { collabEmit } from "../collab/socket";
import { showActivity } from "../collab/presence";
import { upsertComment, renderCommentPins, updateCommentsBadge } from "./pins";
import type { CollabComment } from "../types";

let pinComposeEl: HTMLDivElement | null = null;

export function buildPinCompose(): HTMLDivElement {
  const dom = getDOM();
  const el = document.createElement("div");
  el.className = "lasso-pin-compose";
  el.hidden = true;
  el.innerHTML = `
    <div class="lasso-pin-compose-head">
      <span class="lasso-pin-compose-name"></span>
    </div>
    <textarea placeholder="Add a comment…" maxlength="2000" rows="3"></textarea>
    <div class="lasso-pin-compose-actions">
      <button class="lasso-pin-cancel" type="button">Cancel</button>
      <button class="lasso-pin-post" type="button">Post</button>
    </div>
  `;

  dom.shadow.appendChild(el);
  pinComposeEl = el;

  const cancelBtn = el.querySelector<HTMLButtonElement>(".lasso-pin-cancel")!;
  const postBtn = el.querySelector<HTMLButtonElement>(".lasso-pin-post")!;
  const textarea = el.querySelector<HTMLTextAreaElement>("textarea")!;

  cancelBtn.addEventListener("click", () => {
    closePinCompose();
    setCommentMode(false);
  });

  postBtn.addEventListener("click", () => {
    const body = textarea.value.trim();
    if (!body || !state.pendingPinPosition) return;

    const payload: Record<string, unknown> = {
      sessionId: state.collabProjectId || "local",
      body,
      meta: {
        position: {
          left: state.pendingPinPosition.left,
          top: state.pendingPinPosition.top,
          space: "document",
        },
      },
    };

    if (state.collabJoined && state.collabProjectId) {
      collabEmit("comments:add", payload, (res) => {
        if (!res.ok) {
          showActivity(res.error || "Could not post comment.", "#f28b82");
        }
      });
    } else {
      // Offline: store locally so pins appear immediately
      const localComment: CollabComment = {
        uid: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        sessionId: "local",
        body,
        status: "OPEN",
        author: {
          id: state.myUser?.id || "me",
          name: state.myUser?.name || "You",
          photo: state.myUser?.photo || "",
        },
        createdAt: new Date().toISOString(),
        meta: {
          position: {
            left: state.pendingPinPosition.left,
            top: state.pendingPinPosition.top,
            space: "document",
          },
        },
      };
      upsertComment(localComment);
      renderCommentPins();
      updateCommentsBadge();
    }

    closePinCompose();
    setCommentMode(false);
  });

  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      postBtn.click();
    }
    if (e.key === "Escape") {
      closePinCompose();
      setCommentMode(false);
    }
  });

  return el;
}

export function openPinCompose(x: number, y: number) {
  if (!pinComposeEl) return;
  state.pendingPinPosition = { left: x + window.scrollX, top: y + window.scrollY };
  const userName = state.myUser?.name || "You";
  const nameEl = pinComposeEl.querySelector<HTMLSpanElement>(".lasso-pin-compose-name");
  if (nameEl) nameEl.textContent = userName;

  const w = 260;
  const gap = 12;
  let left = x + gap;
  if (left + w > window.innerWidth - 12) left = x - w - gap;
  let top = y - 10;
  if (top + 220 > window.innerHeight - 12) top = window.innerHeight - 232;
  if (top < 12) top = 12;

  pinComposeEl.style.left = `${Math.max(12, left)}px`;
  pinComposeEl.style.top = `${top}px`;
  pinComposeEl.hidden = false;
  requestAnimationFrame(() => pinComposeEl?.classList.add("visible"));
  pinComposeEl.querySelector("textarea")?.focus();
}

export function closePinCompose() {
  if (!pinComposeEl) return;
  pinComposeEl.classList.remove("visible");
  setTimeout(() => {
    if (pinComposeEl) pinComposeEl.hidden = true;
  }, 170);
  state.pendingPinPosition = null;
  const ta = pinComposeEl.querySelector<HTMLTextAreaElement>("textarea");
  if (ta) ta.value = "";
}

export function isPinComposeOpen(): boolean {
  return pinComposeEl ? !pinComposeEl.hidden : false;
}
