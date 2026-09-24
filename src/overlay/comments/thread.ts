import { state, userNameColor, initials, timeAgo } from "../state";
import { getDOM } from "../dom";
import { collabEmit } from "../collab/socket";
import { showActivity } from "../collab/presence";
import { upsertComment, renderCommentPins } from "./pins";
import { POPULAR_GIFS, showAttachmentPreview, handleMentionInput, navigateTagMenu } from "./compose";
import type { CollabComment } from "../types";

let pinThreadEl: HTMLDivElement | null = null;
let pendingReplyAttachment: { name: string; dataUrl: string; type: string } | null = null;

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
      <div class="lasso-pin-input-wrap">
        <textarea placeholder="Write a reply… type @ to mention" maxlength="2000" rows="2"></textarea>
        <div class="lasso-pin-tag-menu" hidden></div>

        <div class="lasso-pin-quick-tags">
          <button type="button" class="lasso-pin-qtag" data-tag="#bug">#bug</button>
          <button type="button" class="lasso-pin-qtag" data-tag="#ui">#ui</button>
          <button type="button" class="lasso-pin-qtag" data-tag="#copy">#copy</button>
          <button type="button" class="lasso-pin-qtag" data-tag="#design">#design</button>
        </div>

        <div class="lasso-pin-input-toolbar">
          <label class="lasso-pin-itool-btn" title="Attach file">
            <input type="file" accept="image/*,.gif,.png,.jpg,.jpeg,.svg,.pdf" hidden />
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
            </svg>
          </label>

          <button class="lasso-pin-itool-btn gif-picker-toggle" type="button" title="Add GIF" aria-label="Insert GIF">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="3" width="20" height="18" rx="3"/>
              <path d="M7 9h2v6H7zM11 9h4M13 12h2M11 15h4"/>
            </svg>
          </button>

          <button class="lasso-pin-itool-btn mention-btn" type="button" title="Mention someone" aria-label="@mention">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="4"/>
              <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94"/>
            </svg>
          </button>

          <span class="lasso-pin-input-spacer"></span>

          <span class="lasso-pin-reply-hint">⌘↵</span>
          <button class="lasso-pin-reply-post" type="button">Reply</button>
        </div>
      </div>

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
    </div>
  `;

  dom.shadow.appendChild(el);
  pinThreadEl = el;

  const closeBtn = el.querySelector<HTMLButtonElement>(".lasso-pin-thread-close")!;
  const resolveBtn = el.querySelector<HTMLButtonElement>(".lasso-pin-resolve")!;
  const chipBtn = el.querySelector<HTMLButtonElement>(".lasso-pin-thread-chip")!;
  const replyPostBtn = el.querySelector<HTMLButtonElement>(".lasso-pin-reply-post")!;
  const replyTa = el.querySelector<HTMLTextAreaElement>(".lasso-pin-thread-reply-area textarea")!;
  const fileInput = el.querySelector<HTMLInputElement>("input[type='file']")!;
  const gifBtn = el.querySelector<HTMLButtonElement>(".gif-picker-toggle")!;
  const mentionBtn = el.querySelector<HTMLButtonElement>(".mention-btn")!;
  const gifPicker = el.querySelector<HTMLDivElement>(".lasso-pin-gif-picker")!;
  const gifClose = el.querySelector<HTMLButtonElement>(".lasso-pin-gif-close")!;
  const attachmentPreview = el.querySelector<HTMLDivElement>(".lasso-pin-attachment-preview")!;
  const removeAttachmentBtn = el.querySelector<HTMLButtonElement>(".lasso-pin-attachment-remove")!;
  const tagMenu = el.querySelector<HTMLDivElement>(".lasso-pin-tag-menu")!;

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

  // File upload handling
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      pendingReplyAttachment = { name: file.name, dataUrl: reader.result as string, type: file.type };
      showAttachmentPreview(pendingReplyAttachment, attachmentPreview);
    };
    reader.readAsDataURL(file);
    fileInput.value = "";
  });

  // Paste image / GIF support
  replyTa.addEventListener("paste", (e) => {
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
            pendingReplyAttachment = { name: file.name || "pasted-image.png", dataUrl: reader.result as string, type: file.type };
            showAttachmentPreview(pendingReplyAttachment, attachmentPreview);
          };
          reader.readAsDataURL(file);
          return;
        }
      }
    }
  });

  removeAttachmentBtn.addEventListener("click", () => {
    pendingReplyAttachment = null;
    attachmentPreview.hidden = true;
  });

  // Quick tag chips
  el.querySelectorAll<HTMLButtonElement>(".lasso-pin-qtag").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tag = btn.dataset.tag;
      if (!tag) return;
      if (!replyTa.value.includes(tag)) {
        replyTa.value = replyTa.value.trim() ? `${replyTa.value.trim()} ${tag} ` : `${tag} `;
      }
      replyTa.focus();
    });
  });

  // GIF Picker
  gifBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    gifPicker.hidden = !gifPicker.hidden;
    tagMenu.hidden = true;
  });

  gifClose.addEventListener("click", () => { gifPicker.hidden = true; });

  gifPicker.addEventListener("click", (e) => {
    const target = (e.target as HTMLElement).closest<HTMLButtonElement>(".lasso-pin-gif-item");
    if (!target?.dataset.url) return;
    pendingReplyAttachment = { name: `${target.textContent || "GIF"}.gif`, dataUrl: target.dataset.url, type: "image/gif" };
    showAttachmentPreview(pendingReplyAttachment, attachmentPreview);
    gifPicker.hidden = true;
  });

  // @ mention button
  mentionBtn.addEventListener("click", () => {
    const pos = replyTa.selectionStart ?? replyTa.value.length;
    replyTa.value = replyTa.value.slice(0, pos) + "@" + replyTa.value.slice(pos);
    replyTa.setSelectionRange(pos + 1, pos + 1);
    replyTa.focus();
    handleMentionInput(replyTa, tagMenu);
  });

  // @mention detection
  replyTa.addEventListener("input", () => {
    handleMentionInput(replyTa, tagMenu);
  });

  replyTa.addEventListener("keydown", (e) => {
    if (!tagMenu.hidden) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        navigateTagMenu(tagMenu, e.key === "ArrowDown" ? 1 : -1);
        return;
      }
      if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
        const focused = tagMenu.querySelector<HTMLButtonElement>(".lasso-pin-tag-item.focused");
        if (focused) {
          e.preventDefault();
          focused.click();
          return;
        }
      }
      if (e.key === "Escape") {
        tagMenu.hidden = true;
        return;
      }
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      replyPostBtn.click();
    }
    if (e.key === "Escape" && tagMenu.hidden) {
      closePinThread();
    }
  });

  replyPostBtn.addEventListener("click", () => {
    if (!state.openThreadUid) return;
    let body = replyTa.value.trim();
    if (!body && !pendingReplyAttachment) return;

    if (pendingReplyAttachment) {
      body = body
        ? `${body}\n\n![${pendingReplyAttachment.name}](${pendingReplyAttachment.dataUrl})`
        : `![${pendingReplyAttachment.name}](${pendingReplyAttachment.dataUrl})`;
    }

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
    pendingReplyAttachment = null;
    attachmentPreview.hidden = true;
    renderPinThread();
    renderCommentPins();
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
