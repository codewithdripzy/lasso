import { state } from "../state";
import { getDOM } from "../dom";
import { setCommentMode } from "../toolbar/toolbar";
import { collabEmit } from "../collab/socket";
import { showActivity } from "../collab/presence";
import { upsertComment, renderCommentPins, updateCommentsBadge } from "./pins";
import type { CollabComment } from "../types";

let pinComposeEl: HTMLDivElement | null = null;
let pendingAttachment: { name: string; dataUrl: string; type: string } | null = null;

export const POPULAR_GIFS = [
  { label: "Ship it", url: "https://media.giphy.com/media/3oKIPnAiaMCws8nOsE/giphy.gif" },
  { label: "LGTM", url: "https://media.giphy.com/media/111ebonMs90YLu/giphy.gif" },
  { label: "Fire", url: "https://media.giphy.com/media/nrXif9YExW9EI/giphy.gif" },
  { label: "Mind Blown", url: "https://media.giphy.com/media/26ufdipQqU2lhNA4g/giphy.gif" },
  { label: "Thinking", url: "https://media.giphy.com/media/d3mlE7uhX8KFgEmY/giphy.gif" },
  { label: "Confused", url: "https://media.giphy.com/media/g01ZnwAUvutuK8GIQn/giphy.gif" },
];

// Static team tags for @mention
export const STATIC_TAGS = ["team", "design", "frontend", "backend", "product", "everyone"];

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
      <span class="lasso-pin-compose-hint">⌘↵ to post</span>
    </div>

    <div class="lasso-pin-input-wrap">
      <textarea placeholder="Add a comment… type @ to mention or pick a tag" maxlength="2000" rows="3"></textarea>
      <div class="lasso-pin-tag-menu" hidden></div>

      <div class="lasso-pin-quick-tags">
        <button type="button" class="lasso-pin-qtag" data-tag="#bug">#bug</button>
        <button type="button" class="lasso-pin-qtag" data-tag="#ui">#ui</button>
        <button type="button" class="lasso-pin-qtag" data-tag="#copy">#copy</button>
        <button type="button" class="lasso-pin-qtag" data-tag="#design">#design</button>
        <button type="button" class="lasso-pin-qtag" data-tag="#feature">#feature</button>
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

        <button class="lasso-pin-cancel" type="button">Cancel</button>
        <button class="lasso-pin-post" type="button">Post</button>
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
  `;

  dom.shadow.appendChild(el);
  pinComposeEl = el;

  const cancelBtn = el.querySelector<HTMLButtonElement>(".lasso-pin-cancel")!;
  const postBtn = el.querySelector<HTMLButtonElement>(".lasso-pin-post")!;
  const textarea = el.querySelector<HTMLTextAreaElement>("textarea")!;
  const fileInput = el.querySelector<HTMLInputElement>("input[type='file']")!;
  const gifBtn = el.querySelector<HTMLButtonElement>(".gif-picker-toggle")!;
  const mentionBtn = el.querySelector<HTMLButtonElement>(".mention-btn")!;
  const gifPicker = el.querySelector<HTMLDivElement>(".lasso-pin-gif-picker")!;
  const gifClose = el.querySelector<HTMLButtonElement>(".lasso-pin-gif-close")!;
  const attachmentPreview = el.querySelector<HTMLDivElement>(".lasso-pin-attachment-preview")!;
  const removeAttachmentBtn = el.querySelector<HTMLButtonElement>(".lasso-pin-attachment-remove")!;
  const tagMenu = el.querySelector<HTMLDivElement>(".lasso-pin-tag-menu")!;

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
      pendingAttachment = { name: file.name, dataUrl: reader.result as string, type: file.type };
      showAttachmentPreview(pendingAttachment, attachmentPreview);
    };
    reader.readAsDataURL(file);
    fileInput.value = "";
  });

  // Paste image / GIF support
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
            pendingAttachment = { name: file.name || "pasted-image.png", dataUrl: reader.result as string, type: file.type };
            showAttachmentPreview(pendingAttachment, attachmentPreview);
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
    tagMenu.hidden = true;
  });

  gifClose.addEventListener("click", () => { gifPicker.hidden = true; });

  gifPicker.addEventListener("click", (e) => {
    const target = (e.target as HTMLElement).closest<HTMLButtonElement>(".lasso-pin-gif-item");
    if (!target?.dataset.url) return;
    pendingAttachment = { name: `${target.textContent || "GIF"}.gif`, dataUrl: target.dataset.url, type: "image/gif" };
    showAttachmentPreview(pendingAttachment, attachmentPreview);
    gifPicker.hidden = true;
  });

  // @ mention button
  mentionBtn.addEventListener("click", () => {
    const pos = textarea.selectionStart ?? textarea.value.length;
    textarea.value = textarea.value.slice(0, pos) + "@" + textarea.value.slice(pos);
    textarea.setSelectionRange(pos + 1, pos + 1);
    textarea.focus();
    handleMentionInput(textarea, tagMenu);
  });

  // @mention detection
  textarea.addEventListener("input", () => {
    handleMentionInput(textarea, tagMenu);
  });

  textarea.addEventListener("keydown", (e) => {
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
      postBtn.click();
    }
    if (e.key === "Escape" && tagMenu.hidden) {
      closePinCompose();
      setCommentMode(false);
    }
  });

  postBtn.addEventListener("click", () => {
    let body = textarea.value.trim();
    if (!body && !pendingAttachment) return;
    if (!state.pendingPinPosition) return;

    if (pendingAttachment) {
      body = body
        ? `${body}\n\n![${pendingAttachment.name}](${pendingAttachment.dataUrl})`
        : `![${pendingAttachment.name}](${pendingAttachment.dataUrl})`;
    }

    const payload: Record<string, unknown> = {
      sessionId: state.collabProjectId || "local",
      body,
      meta: {
        position: { left: state.pendingPinPosition.left, top: state.pendingPinPosition.top, space: "document" },
      },
    };

    if (state.collabJoined && state.collabProjectId) {
      collabEmit("comments:add", payload, (res) => {
        if (!res.ok) showActivity(res.error || "Could not post comment.", "#f28b82");
      });
    } else {
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
          position: { left: state.pendingPinPosition.left, top: state.pendingPinPosition.top, space: "document" },
        },
      };
      upsertComment(localComment);
      renderCommentPins();
      updateCommentsBadge();
    }

    closePinCompose();
    setCommentMode(false);
  });

  // Quick tag chips
  el.querySelectorAll<HTMLButtonElement>(".lasso-pin-qtag").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tag = btn.dataset.tag;
      if (!tag) return;
      if (!textarea.value.includes(tag)) {
        textarea.value = textarea.value.trim() ? `${textarea.value.trim()} ${tag} ` : `${tag} `;
      }
      textarea.focus();
    });
  });

  return el;
}


export function showAttachmentPreview(att: { name: string; dataUrl: string }, container: HTMLDivElement) {
  container.hidden = false;
  const nameEl = container.querySelector<HTMLSpanElement>(".lasso-pin-attachment-name")!;
  const thumbEl = container.querySelector<HTMLDivElement>(".lasso-pin-attachment-thumb")!;
  nameEl.textContent = att.name;
  thumbEl.innerHTML = `<img src="${att.dataUrl}" alt="${att.name}" />`;
}

export function handleMentionInput(textarea: HTMLTextAreaElement, tagMenu: HTMLDivElement) {
  const val = textarea.value;
  const pos = textarea.selectionStart ?? val.length;
  const beforeCursor = val.slice(0, pos);
  const atMatch = beforeCursor.match(/@(\w*)$/);

  if (!atMatch) {
    tagMenu.hidden = true;
    return;
  }

  const query = atMatch[1].toLowerCase();

  // Get users from presence state
  const presenceUsers: Array<{ label: string; type: "user"; color: string }> = [];
  try {
    const presence = (state as any).presence;
    if (presence?.forEach) {
      presence.forEach((u: any) => {
        if (u?.name && (!query || u.name.toLowerCase().startsWith(query))) {
          presenceUsers.push({ label: u.name, type: "user", color: "#6ea0ff" });
        }
      });
    }
  } catch {
    // presence not available
  }

  const filteredStatic = (!query ? STATIC_TAGS : STATIC_TAGS.filter((t) => t.startsWith(query))).map(
    (t) => ({ label: t, type: "tag" as const, color: "#94a3b8" })
  );

  const suggestions = [...presenceUsers, ...filteredStatic].slice(0, 6);

  if (suggestions.length === 0) {
    tagMenu.hidden = true;
    return;
  }

  tagMenu.hidden = false;
  tagMenu.innerHTML = "";

  for (const sug of suggestions) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "lasso-pin-tag-item";
    const initial = sug.type === "user" ? sug.label[0].toUpperCase() : "#";
    btn.innerHTML = `
      <span class="lasso-pin-tag-badge" style="background:${sug.color}22;color:${sug.color};">${initial}</span>
      <span class="lasso-pin-tag-label">@${sug.label}</span>
      <span class="lasso-pin-tag-type">${sug.type}</span>
    `;
    btn.addEventListener("mousedown", (e) => {
      e.preventDefault(); // prevent textarea blur
      const currentVal = textarea.value;
      const currentPos = textarea.selectionStart ?? currentVal.length;
      const before = currentVal.slice(0, currentPos);
      const newBefore = before.replace(/@\w*$/, `@${sug.label} `);
      textarea.value = newBefore + currentVal.slice(currentPos);
      const newPos = newBefore.length;
      textarea.setSelectionRange(newPos, newPos);
      tagMenu.hidden = true;
      textarea.focus();
    });
    tagMenu.appendChild(btn);
  }
}

export function navigateTagMenu(tagMenu: HTMLDivElement, direction: 1 | -1) {
  const items = Array.from(tagMenu.querySelectorAll<HTMLButtonElement>(".lasso-pin-tag-item"));
  const currentFocused = tagMenu.querySelector<HTMLButtonElement>(".lasso-pin-tag-item.focused");
  const currentIdx = currentFocused ? items.indexOf(currentFocused) : -1;
  if (currentFocused) currentFocused.classList.remove("focused");
  const nextIdx = Math.max(0, Math.min(items.length - 1, currentIdx + direction));
  items[nextIdx]?.classList.add("focused");
  items[nextIdx]?.scrollIntoView({ block: "nearest" });
}

export function openPinCompose(x: number, y: number) {
  if (!pinComposeEl) return;
  state.pendingPinPosition = { left: x + window.scrollX, top: y + window.scrollY };
  const userName = state.myUser?.name || "You";
  const nameEl = pinComposeEl.querySelector<HTMLSpanElement>(".lasso-pin-compose-name");
  const avatarEl = pinComposeEl.querySelector<HTMLSpanElement>(".lasso-pin-compose-avatar");
  if (nameEl) nameEl.textContent = userName;
  if (avatarEl) avatarEl.textContent = userName.slice(0, 1).toUpperCase();

  const w = 300;
  const gap = 12;
  let left = x + gap;
  if (left + w > window.innerWidth - 12) left = x - w - gap;
  let top = y - 10;
  if (top + 360 > window.innerHeight - 12) top = window.innerHeight - 372;
  if (top < 12) top = 12;

  pinComposeEl.style.left = `${Math.max(12, left)}px`;
  pinComposeEl.style.top = `${top}px`;
  pinComposeEl.hidden = false;
  requestAnimationFrame(() => pinComposeEl?.classList.add("visible"));
  pinComposeEl.querySelector("textarea")?.focus();
}

export function closePinCompose() {
  if (!pinComposeEl) return;
  const tagMenu = pinComposeEl.querySelector<HTMLDivElement>(".lasso-pin-tag-menu");
  if (tagMenu) tagMenu.hidden = true;
  pinComposeEl.classList.remove("visible");
  setTimeout(() => { if (pinComposeEl) pinComposeEl.hidden = true; }, 170);
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
