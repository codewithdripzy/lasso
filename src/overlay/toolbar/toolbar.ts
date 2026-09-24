import { state } from "../state";
import { getDOM } from "../dom";
import { setSelectMode } from "./select";
import { closePinCompose } from "../comments/compose";
import { closePinThread } from "../comments/thread";
import { toggleVoice, leaveVoice, setVoiceMuted } from "../collab/voice";
import { toggleGitPanel } from "../git/git";
import { toggleTodoPanel } from "../todo/todo";
import { toggleNotepadPanel } from "../notepad/notepad";

export function setCommentMode(active: boolean) {
  state.commentMode = active;
  const dom = getDOM();
  const commentBtn = dom.shadow.querySelector<HTMLButtonElement>(".comment-tool");
  if (commentBtn) {
    commentBtn.classList.toggle("active", active);
  }

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
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M5 3l14 8-6 2-3 7-5-17z"/>
      </svg>
      <span class="lasso-tool-label">Select</span>
    </button>

    <button class="lasso-tool-btn comment-tool" type="button" aria-label="Drop a comment pin" title="Comment">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
      <span class="lasso-tool-label">Comment</span>
      <i class="lasso-comments-badge"></i>
    </button>

    <div class="lasso-tb-sep"></div>

    <button class="lasso-tool-btn git-tool" type="button" aria-label="Git actions" title="Git workspace">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <line x1="6" y1="3" x2="6" y2="15"/>
        <circle cx="18" cy="6" r="3"/>
        <circle cx="6" cy="18" r="3"/>
        <path d="M18 9a9 9 0 0 1-9 9"/>
      </svg>
    </button>

    <button class="lasso-tool-btn todo-tool" type="button" aria-label="Todo checklist" title="Tasks & Todo">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M9 11l3 3L22 4"/>
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
      </svg>
    </button>

    <button class="lasso-tool-btn notepad-tool" type="button" aria-label="Notepad" title="Scratchpad & Notes">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
      </svg>
    </button>

    <button class="lasso-tool-btn voice-tool" type="button" aria-label="Voice chat" title="Voice chat">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
        <line x1="12" y1="19" x2="12" y2="23"/>
        <line x1="8" y1="23" x2="16" y2="23"/>
      </svg>
    </button>

    <div class="lasso-presence" style="display: none;">
      <div class="lasso-presence-avatars"></div>
      <span class="lasso-presence-count"></span>
    </div>

    <div class="lasso-tb-sep"></div>

    <button class="lasso-toolbar-dismiss" type="button" aria-label="Hide Lasso toolbar" title="Hide toolbar">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
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
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M5 3l14 8-6 2-3 7-5-17z"/>
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
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8"/></svg>
    </button>
    <button class="lasso-voice-bar-btn disconnect" type="button" aria-label="Leave voice" title="Disconnect voice">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
  `;

  dom.shadow.append(toolbar, toolbarReopen, voiceBar);

  // Wire buttons
  const selectBtn = toolbar.querySelector<HTMLButtonElement>(".select-tool")!;
  const commentBtn = toolbar.querySelector<HTMLButtonElement>(".comment-tool")!;
  const gitBtn = toolbar.querySelector<HTMLButtonElement>(".git-tool")!;
  const todoBtn = toolbar.querySelector<HTMLButtonElement>(".todo-tool")!;
  const notepadBtn = toolbar.querySelector<HTMLButtonElement>(".notepad-tool")!;
  const voiceBtn = toolbar.querySelector<HTMLButtonElement>(".voice-tool")!;
  const dismissBtn = toolbar.querySelector<HTMLButtonElement>(".lasso-toolbar-dismiss")!;

  selectBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectMode(!state.selectMode);
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
