import { state } from "../state";
import { getDOM } from "../dom";
import { setCommentMode } from "../toolbar/toolbar";
import { collabEmit } from "../collab/socket";
import { showActivity } from "../collab/presence";
import { upsertComment, renderCommentPins, updateCommentsBadge } from "./pins";
import type { CollabComment } from "../types";

let pinComposeEl: HTMLDivElement | null = null;
let pendingAttachment: { name: string; dataUrl: string; type: string } | null = null;

const POPULAR_GIFS = [
  { label: "Ship it", url: "https://media.giphy.com/media/3oKIPnAiaMCws8nOsE/giphy.gif" },
  { label: "LGTM", url: "https://media.giphy.com/media/111ebonMs90YLu/giphy.gif" },
  { label: "Fire", url: "https://media.giphy.com/media/nrXif9YExW9EI/giphy.gif" },
  { label: "Mind Blown", url: "https://media.giphy.com/media/26ufdipQqU2lhNA4g/giphy.gif" },
  { label: "Thinking", url: "https://media.giphy.com/media/d3mlE7uhX8KFgEmY/giphy.gif" },
  { label: "Confused", url: "https://media.giphy.com/media/g01ZnwAUvutuK8GIQn/giphy.gif" },
];

export function buildPinCompose(): HTMLDivElement {
  const dom = getDOM();
  const el = document.createElement("div");
  el.className = "lasso-pin-compose";
  el.hidden = true;
  el.innerHTML = `
    <div class="lasso-pin-compose-head">
      <div class="lasso-pin-compose-user">
        <span class="lasso-pin-compose-avatar">Y</span>
        <span class="lasso-pin-compose-name">You</span>
      </div>
      <span class="lasso-pin-compose-hint">Esc to cancel</span>
    </div>

    <textarea placeholder="Leave feedback or ask a teammate…" maxlength="2000" rows="3"></textarea>

    <div class="lasso-pin-attachment-preview" hidden>
      <div class="lasso-pin-attachment-thumb"></div>
      <span class="lasso-pin-attachment-name"></span>
      <button class="lasso-pin-attachment-remove" type="button" aria-label="Remove attachment">×</button>
    </div>

    <div class="lasso-pin-gif-picker" hidden>
      <div class="lasso-pin-gif-header">
        <span>Quick GIFs</span>
        <button class="lasso-pin-gif-close" type="button">×</button>
      </div>
      <div class="lasso-pin-gif-grid">
        ${POPULAR_GIFS.map((g) => `<button type="button" class="lasso-pin-gif-item" data-url="${g.url}">${g.label}</button>`).join("")}
      </div>
    </div>

    <div class="lasso-pin-compose-footer">
      <div class="lasso-pin-compose-tools">
        <label class="lasso-pin-tool-btn" title="Attach file or screenshot">
          <input type="file" accept="image/*,.gif,.png,.jpg,.jpeg,.svg,.pdf" hidden />
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
          </svg>
        </label>
        <button class="lasso-pin-tool-btn gif-picker-toggle" type="button" title="Add GIF" aria-label="Insert GIF">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="3" width="20" height="18" rx="3"/>
            <path d="M7 9h2v6H7zM11 9h4M13 12h2M11 15h4"/>
          </svg>
        </button>
      </div>

      <div class="lasso-pin-compose-actions">
        <button class="lasso-pin-cancel" type="button">Cancel</button>
        <button class="lasso-pin-post" type="button">Post</button>
      </div>
    </div>
  `;

  dom.shadow.appendChild(el);
  pinComposeEl = el;

  const cancelBtn = el.querySelector<HTMLButtonElement>(".lasso-pin-cancel")!;
  const postBtn = el.querySelector<HTMLButtonElement>(".lasso-pin-post")!;
  const textarea = el.querySelector<HTMLTextAreaElement>("textarea")!;
  const fileInput = el.querySelector<HTMLInputElement>("input[type='file']")!;
  const gifBtn = el.querySelector<HTMLButtonElement>(".gif-picker-toggle")!;
  const gifPicker = el.querySelector<HTMLDivElement>(".lasso-pin-gif-picker")!;
  const gifClose = el.querySelector<HTMLButtonElement>(".lasso-pin-gif-close")!;
  const attachmentPreview = el.querySelector<HTMLDivElement>(".lasso-pin-attachment-preview")!;
  const removeAttachmentBtn = el.querySelector<HTMLButtonElement>(".lasso-pin-attachment-remove")!;

  cancelBtn.addEventListener("click", () => {
    closePinCompose();
    setCommentMode(false);
  });

  // File upload handling
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      pendingAttachment = {
        name: file.name,
        dataUrl: reader.result as string,
        type: file.type,
      };
      showAttachmentPreview(pendingAttachment);
    };
    reader.readAsDataURL(file);
    fileInput.value = "";
  });

  // Paste image / GIF support directly into textarea
  textarea.addEventListener("paste", (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item?.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          const reader = new FileReader();
          reader.onload = () => {
            pendingAttachment = {
              name: file.name || "pasted-image.png",
              dataUrl: reader.result as string,
              type: file.type,
            };
            showAttachmentPreview(pendingAttachment);
          };
          reader.readAsDataURL(file);
          return;
        }
      }
    }
  });

  removeAttachmentBtn.addEventListener("click", () => {
    pendingAttachment = null;
    attachmentPreview.hidden = true;
  });

  // GIF Picker
  gifBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    gifPicker.hidden = !gifPicker.hidden;
  });

  gifClose.addEventListener("click", () => {
    gifPicker.hidden = true;
  });

  gifPicker.addEventListener("click", (e) => {
    const target = (e.target as HTMLElement).closest<HTMLButtonElement>(".lasso-pin-gif-item");
    if (!target?.dataset.url) return;
    pendingAttachment = {
      name: `${target.textContent || "GIF"}.gif`,
      dataUrl: target.dataset.url,
      type: "image/gif",
    };
    showAttachmentPreview(pendingAttachment);
    gifPicker.hidden = true;
  });

  function showAttachmentPreview(att: { name: string; dataUrl: string }) {
    attachmentPreview.hidden = false;
    const nameEl = attachmentPreview.querySelector<HTMLSpanElement>(".lasso-pin-attachment-name")!;
    const thumbEl = attachmentPreview.querySelector<HTMLDivElement>(".lasso-pin-attachment-thumb")!;
    nameEl.textContent = att.name;
    thumbEl.innerHTML = `<img src="${att.dataUrl}" alt="${att.name}" />`;
  }

  postBtn.addEventListener("click", () => {
    let body = textarea.value.trim();
    if (!body && !pendingAttachment) return;
    if (!state.pendingPinPosition) return;

    if (pendingAttachment) {
      body = body ? `${body}\n\n![${pendingAttachment.name}](${pendingAttachment.dataUrl})` : `![${pendingAttachment.name}](${pendingAttachment.dataUrl})`;
    }

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
  const avatarEl = pinComposeEl.querySelector<HTMLSpanElement>(".lasso-pin-compose-avatar");
  if (nameEl) nameEl.textContent = userName;
  if (avatarEl) avatarEl.textContent = userName.slice(0, 1).toUpperCase();

  const w = 290;
  const gap = 12;
  let left = x + gap;
  if (left + w > window.innerWidth - 12) left = x - w - gap;
  let top = y - 10;
  if (top + 280 > window.innerHeight - 12) top = window.innerHeight - 292;
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
  pendingAttachment = null;
  const ta = pinComposeEl.querySelector<HTMLTextAreaElement>("textarea");
  if (ta) ta.value = "";
  const prev = pinComposeEl.querySelector<HTMLDivElement>(".lasso-pin-attachment-preview");
  if (prev) prev.hidden = true;
  const gifPicker = pinComposeEl.querySelector<HTMLDivElement>(".lasso-pin-gif-picker");
  if (gifPicker) gifPicker.hidden = true;
}

export function isPinComposeOpen(): boolean {
  return pinComposeEl ? !pinComposeEl.hidden : false;
}
