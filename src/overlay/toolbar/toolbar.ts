import { state } from "../state";
import { getDOM } from "../dom";
import { setPreviewMode, setSelectMode } from "./select";
import { closePinCompose } from "../comments/compose";
import { closePinThread } from "../comments/thread";
import { toggleVoice, leaveVoice, setVoiceMuted } from "../collab/voice";
import { toggleGitPanel } from "../git/git";
import { toggleTodoPanel } from "../todo/todo";
import { toggleNotepadPanel } from "../notepad/notepad";
import { toggleClipboardPanel } from "../clipboard/clipboard";

export function setCommentMode(active: boolean) {
  state.commentMode = active;
  if (active) state.previewMode = false;
  const dom = getDOM();
  const commentBtn = dom.shadow.querySelector<HTMLButtonElement>(".comment-tool");
  const previewBtn = dom.shadow.querySelector<HTMLButtonElement>(".preview-tool");
  if (commentBtn) {
    commentBtn.classList.toggle("active", active);
  }
  if (previewBtn) previewBtn.classList.toggle("active", state.previewMode);

  if (active) {
    setSelectMode(false);
    document.documentElement.style.cursor = "default";
  } else {
    document.documentElement.style.cursor = state.selectMode ? "default" : "";
  }
}

export function buildToolbar(): { toolbar: HTMLDivElement; voiceBar: HTMLDivElement } {
  const dom = getDOM();

  // Floating toolbar
  const toolbar = document.createElement("div");
  toolbar.className = "lasso-toolbar";
  toolbar.innerHTML = `
    <button class="lasso-tool-btn select-tool" type="button" aria-label="Select element" title="Select">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M4 4l7.07 17 2.51-7.39L21 11.07 4 4z"/>
      </svg>
      <span class="lasso-tool-label">Select</span>
    </button>

    <button class="lasso-tool-btn preview-tool" type="button" aria-label="Preview app" title="Preview app">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9"/>
        <path d="m10 8 6 4-6 4V8z" fill="currentColor" stroke="none"/>
      </svg>
      <span class="lasso-tool-label">Preview</span>
    </button>

    <button class="lasso-tool-btn comment-tool" type="button" aria-label="Drop a comment pin" title="Comment">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 0 1-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
        <path d="M8 12h.01M12 12h.01M16 12h.01"/>
      </svg>
      <span class="lasso-tool-label">Comment</span>
      <i class="lasso-comments-badge"></i>
    </button>

    <div class="lasso-tb-sep"></div>

    <button class="lasso-tool-btn git-tool" type="button" aria-label="Git actions" title="Git workspace">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="6" cy="6" r="3"/>
        <circle cx="6" cy="18" r="3"/>
        <circle cx="18" cy="6" r="3"/>
        <path d="M6 9v6"/>
        <path d="M18 9a9 9 0 0 1-9 9"/>
      </svg>
      <i class="lasso-git-badge" style="display:none;"></i>
    </button>

    <button class="lasso-tool-btn todo-tool" type="button" aria-label="Todo checklist" title="Tasks & Todo">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M9 11l3 3L22 4"/>
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
      </svg>
    </button>

    <button class="lasso-tool-btn notepad-tool" type="button" aria-label="Notepad" title="Scratchpad & Notes">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8l-5-5z"/>
        <path d="M15 3v5h5"/>
        <path d="M7 13h10M7 17h6"/>
      </svg>
    </button>

    <button class="lasso-tool-btn clipboard-tool" type="button" aria-label="Clipboard" title="Clipboard">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="8" y="8" width="12" height="12" rx="2"/>
        <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>
      </svg>
    </button>

    <button class="lasso-tool-btn voice-tool" type="button" aria-label="Voice chat" title="Voice chat">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="9" y="2" width="6" height="12" rx="3"/>
        <path d="M5 10v2a7 7 0 0 0 14 0v-2"/>
        <line x1="12" y1="19" x2="12" y2="22"/>
        <line x1="8" y1="22" x2="16" y2="22"/>
      </svg>
    </button>

    <div class="lasso-presence" style="display: none;">
      <div class="lasso-presence-avatars"></div>
      <span class="lasso-presence-count"></span>
    </div>

    <div class="lasso-tb-sep"></div>

    <button class="lasso-toolbar-dismiss" type="button" aria-label="Hide Lasso toolbar" title="Hide toolbar">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M18 6L6 18M6 6l12 12"/>
      </svg>
    </button>
  `;

  // Reopen trigger button
  const toolbarReopen = document.createElement("button");
  toolbarReopen.className = "lasso-toolbar-reopen";
  toolbarReopen.type = "button";
  toolbarReopen.setAttribute("aria-label", "Show Lasso toolbar");
  toolbarReopen.title = "Show Lasso toolbar";
  toolbarReopen.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M4 4l7.07 17 2.51-7.39L21 11.07 4 4z"/>
    </svg>
  `;

  // Discord-style floating voice bar
  const voiceBar = document.createElement("div");
  voiceBar.className = "lasso-voice-bar";
  voiceBar.innerHTML = `
    <span class="lasso-voice-bar-dot"></span>
    <span class="lasso-voice-bar-label">Voice connected</span>
    <span class="lasso-voice-bar-sep"></span>
    <button class="lasso-voice-bar-btn mute-toggle" type="button" aria-label="Toggle mute" title="Mute / Unmute">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <rect x="9" y="2" width="6" height="12" rx="3"/>
        <path d="M5 10v2a7 7 0 0 0 14 0v-2"/>
        <line x1="12" y1="19" x2="12" y2="22"/>
        <line x1="8" y1="22" x2="16" y2="22"/>
      </svg>
    </button>
    <button class="lasso-voice-bar-btn disconnect" type="button" aria-label="Leave voice" title="Disconnect voice">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"/>
        <line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>
  `;

  dom.shadow.append(toolbar, toolbarReopen, voiceBar);

  // Wire buttons
  const selectBtn = toolbar.querySelector<HTMLButtonElement>(".select-tool")!;
  const previewBtn = toolbar.querySelector<HTMLButtonElement>(".preview-tool")!;
  const commentBtn = toolbar.querySelector<HTMLButtonElement>(".comment-tool")!;
  const gitBtn = toolbar.querySelector<HTMLButtonElement>(".git-tool")!;
  const todoBtn = toolbar.querySelector<HTMLButtonElement>(".todo-tool")!;
  const notepadBtn = toolbar.querySelector<HTMLButtonElement>(".notepad-tool")!;
  const clipboardBtn = toolbar.querySelector<HTMLButtonElement>(".clipboard-tool")!;
  const voiceBtn = toolbar.querySelector<HTMLButtonElement>(".voice-tool")!;
  const dismissBtn = toolbar.querySelector<HTMLButtonElement>(".lasso-toolbar-dismiss")!;

  selectBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectMode(!state.selectMode);
  });

  previewBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    setPreviewMode(!state.previewMode);
  });

  commentBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    setCommentMode(!state.commentMode);
    closePinThread();
    closePinCompose();
  });

  gitBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleGitPanel();
  });

  todoBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleTodoPanel();
  });

  notepadBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleNotepadPanel();
  });

  clipboardBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleClipboardPanel();
  });

  voiceBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleVoice();
  });

  voiceBtn.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    if (state.voiceOn) setVoiceMuted(!state.voiceMuted);
  });

  dismissBtn.addEventListener("click", () => {
    toolbar.classList.add("dismissed");
    toolbarReopen.classList.add("visible");
  });

  toolbarReopen.addEventListener("click", () => {
    toolbar.classList.remove("dismissed");
    toolbarReopen.classList.remove("visible");
  });

  voiceBar.querySelector<HTMLButtonElement>(".mute-toggle")!.addEventListener("click", () => {
    if (state.voiceOn) setVoiceMuted(!state.voiceMuted);
  });

  voiceBar.querySelector<HTMLButtonElement>(".disconnect")!.addEventListener("click", () => {
    leaveVoice();
  });

  return { toolbar, voiceBar };
}
