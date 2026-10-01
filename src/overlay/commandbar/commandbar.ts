import { state } from "../state";
import { getDOM } from "../dom";
import { LASSO_ICON_DATA_URL } from "../icons/lasso";
import { startVoiceRecording, stopVoiceRecording, isRecordingVoice } from "../audio/transcribe";
import { showActivity } from "../collab/presence";

let commandBarEl: HTMLDivElement | null = null;
let commandInput: HTMLTextAreaElement | null = null;
let commandBackdrop: HTMLDivElement | null = null;
let commandSubmit: HTMLButtonElement | null = null;
let commandVoice: HTMLButtonElement | null = null;
let commandClose: HTMLButtonElement | null = null;
let isOpen = false;

export function buildCommandBar(): void {
  const dom = getDOM();

  const backdrop = document.createElement("div");
  backdrop.className = "lasso-command-backdrop";
  backdrop.hidden = true;
  backdrop.innerHTML = ``;
  dom.shadow.appendChild(backdrop);
  commandBackdrop = backdrop;

  const el = document.createElement("div");
  el.className = "lasso-command-bar";
  el.hidden = true;
  el.innerHTML = `
    <div class="lasso-command-card">
      <div class="lasso-command-header">
        <div class="lasso-command-brand">
          <img class="lasso-command-brand-logo" src="${LASSO_ICON_DATA_URL}" alt="Lasso" />
          <span class="lasso-command-brand-title">What do you want to build?</span>
        </div>
        <button class="lasso-command-close" type="button" aria-label="Close">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <div class="lasso-command-body">
        <textarea 
          class="lasso-command-input" 
          placeholder="Describe what you want to build...&#10;&#10;Examples:&#10;• Build a settings page with profile, notifications and security sections&#10;• Add authentication with login and signup&#10;• Create a dashboard with customer table and analytics"
          rows="3"
        ></textarea>
        
        <div class="lasso-command-actions">
          <div class="lasso-command-icon-group">
            <button class="lasso-command-voice" type="button" aria-label="Voice input" title="Voice input (speech-to-text)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="3" width="6" height="11" rx="3"/>
                <path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8"/>
              </svg>
            </button>
          </div>

          <button class="lasso-command-submit primary" type="button" aria-label="Build">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
            <span>Build</span>
          </button>
        </div>

        <div class="lasso-command-shortcuts">
          <span class="lasso-command-shortcut">
            <kbd>⌘</kbd><kbd>K</kbd>
            <span>Open command bar</span>
          </span>
          <span class="lasso-command-shortcut">
            <kbd>⌘</kbd><kbd>↵</kbd>
            <span>Submit</span>
          </span>
          <span class="lasso-command-shortcut">
            <kbd>Esc</kbd>
            <span>Close</span>
          </span>
        </div>
      </div>
    </div>
  `;
  dom.shadow.appendChild(el);
  commandBarEl = el;

  commandInput = el.querySelector<HTMLTextAreaElement>(".lasso-command-input")!;
  commandSubmit = el.querySelector<HTMLButtonElement>(".lasso-command-submit")!;
  commandVoice = el.querySelector<HTMLButtonElement>(".lasso-command-voice")!;
  commandClose = el.querySelector<HTMLButtonElement>(".lasso-command-close")!;

  // Close on backdrop click
  backdrop.addEventListener("click", closeCommandBar);

  // Close button
  commandClose.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    closeCommandBar();
  });

  // Voice input
  commandVoice.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (isRecordingVoice()) {
      commandVoice.classList.remove("recording");
      commandVoice.classList.add("transcribing");
      commandVoice.title = "Transcribing…";

      try {
        const result = await stopVoiceRecording();
        if (result.text && commandInput) {
          const prev = commandInput.value.trim();
          commandInput.value = prev ? `${prev} ${result.text}` : result.text;
          commandInput.focus();
          autoResizeTextarea(commandInput);
          showActivity("Transcribed", "#81c995");
        } else {
          showActivity("No speech detected.", "#fdd663");
        }
      } catch (err: any) {
        showActivity(err?.message || "Transcription failed", "#f28b82");
      } finally {
        commandVoice.classList.remove("transcribing");
        commandVoice.title = "Voice input";
      }
    } else {
      try {
        await startVoiceRecording();
        commandVoice.classList.add("recording");
        commandVoice.title = "Recording… Click again to stop";
        showActivity("Listening… speak now", "#ea4335");
      } catch (err: any) {
        showActivity(err?.message || "Microphone access denied", "#f28b82");
      }
    }
  });

  // Submit on ⌘+Enter
  commandInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      handleSubmit();
    }
  });

  // Submit button
  commandSubmit.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    handleSubmit();
  });

  // Auto-resize textarea
  commandInput.addEventListener("input", () => {
    if (commandInput) autoResizeTextarea(commandInput);
  });

  // Close on Escape
  commandInput.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeCommandBar();
    }
  });
}

function autoResizeTextarea(textarea: HTMLTextAreaElement): void {
  textarea.style.height = "auto";
  textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
}

export function openCommandBar(): void {
  if (!commandBarEl || !commandBackdrop) return;
  
  commandBarEl.hidden = false;
  commandBackdrop.hidden = false;
  isOpen = true;
  
  if (commandInput) {
    commandInput.value = "";
    commandInput.focus();
    autoResizeTextarea(commandInput);
  }
}

export function closeCommandBar(): void {
  if (!commandBarEl || !commandBackdrop) return;
  
  commandBarEl.hidden = true;
  commandBackdrop.hidden = true;
  isOpen = false;
  
  if (commandInput) {
    commandInput.value = "";
  }
}

export function isCommandBarOpen(): boolean {
  return isOpen;
}

async function handleSubmit(): void {
  if (!commandInput) return;
  
  const prompt = commandInput.value.trim();
  if (!prompt) return;
  
  closeCommandBar();
  
  // Emit the one-shot request to the bridge
  if (state.bridgeSocket?.readyState === WebSocket.OPEN) {
    state.bridgeSocket.send(JSON.stringify({
      type: "oneshot",
      prompt,
      scope: "project",
    }));
  }
}
