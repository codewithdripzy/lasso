import { state, rememberModel } from "../state";
import { getDOM } from "../dom";
import { LASSO_ICON_DATA_URL } from "../icons/lasso";
import { startVoiceRecording, stopVoiceRecording, isRecordingVoice } from "../audio/transcribe";
import { showActivity } from "../collab/presence";
import { providerIcon, buildModelMenuContent } from "../prompt/prompt";
import { setSelectMode } from "../toolbar/select";
import type { PendingChange } from "../types";

export interface SourceChange {
  filePath: string;
  oldString: string;
  newString: string;
}

export interface CommandThinkingStep {
  title: string;
  detail?: string;
  status: "running" | "completed" | "failed";
}

export interface CommandMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  thinking?: {
    steps: CommandThinkingStep[];
    durationSeconds: number;
    completed: boolean;
    expanded: boolean;
  };
  changes?: SourceChange[];
  changesApplied?: boolean;
  changesUndone?: boolean;
  showDiff?: boolean;
  error?: string;
  isStreaming?: boolean;
}

let commandBarEl: HTMLDivElement | null = null;
let commandInput: HTMLTextAreaElement | null = null;
let commandSubmit: HTMLButtonElement | null = null;
let commandVoice: HTMLButtonElement | null = null;
let commandClose: HTMLButtonElement | null = null;
let commandNewChat: HTMLButtonElement | null = null;
let commandModelBtn: HTMLButtonElement | null = null;
let commandModelMenu: HTMLDivElement | null = null;
let commandModelIcon: HTMLSpanElement | null = null;
let commandModelLabel: HTMLSpanElement | null = null;
let commandMessagesEl: HTMLDivElement | null = null;
let commandEmptyEl: HTMLDivElement | null = null;

let isOneShotMode = false;
let commandMessages: CommandMessage[] = [];
let activeTaskId: string | null = null;
let activeThinkingInterval: any = null;
let activeStartTime = 0;

// Persistent conversation tracking
let activeConversationId: string | null = null;
let conversationList: Array<{ id: string; title: string; scope: string; updatedAt: string }> = [];

/** Derive the API base URL from the collab config or fall back to same-origin */
function getApiBase(): string {
  const collabUrl = state.collab?.apiUrl || "";
  if (collabUrl) return collabUrl;
  // Same-origin fallback (overlay is injected into the user's app)
  return `${location.protocol}//${location.host}/api/v1`;
}

/** Best-effort fetch with auth cookie (credentials: include) */
async function apiFetch(path: string, options: RequestInit = {}): Promise<any | null> {
  try {
    const base = getApiBase();
    const res = await fetch(`${base}${path}`, {
      ...options,
      credentials: "include",
      headers: {
        "content-type": "application/json",
        ...(options.headers || {}),
      },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/**
 * Create a new server-side conversation for the current project.
 * Silently no-ops if the project is not registered or user is not authed.
 */
async function createServerConversation(scope: "private" | "team" = "private"): Promise<string | null> {
  const projectId = state.collab?.projectId || state.collabProjectId;
  if (!projectId) return null;

  const data = await apiFetch("/agent/conversations", {
    method: "POST",
    body: JSON.stringify({ projectId, scope, title: "New Session" }),
  });
  return data?.conversation?.id || null;
}

/** Fetch conversation list for the sidebar/history. */
async function loadConversationList(): Promise<void> {
  const projectId = state.collab?.projectId || state.collabProjectId;
  if (!projectId) return;

  const data = await apiFetch(`/agent/conversations?projectId=${encodeURIComponent(projectId)}`);
  if (data?.conversations) {
    conversationList = data.conversations;
  }
}

function getUserGreetingName(): string {
  if (state.myUser?.name) {
    const first = state.myUser.name.trim().split(/\s+/)[0];
    if (first) return first;
  }
  return "there";
}

function updateEmptyStateUserName(): void {
  const nameEl = commandBarEl?.querySelector<HTMLSpanElement>(".lasso-command-user-name");
  if (nameEl) {
    nameEl.textContent = getUserGreetingName();
  }
}

export function isCommandBarTaskId(taskId?: string): boolean {
  if (!taskId) return false;
  return taskId === activeTaskId || taskId.startsWith("oneshot-") || commandMessages.some((m) => m.id === taskId);
}

export function buildCommandBar(): void {
  const dom = getDOM();

  const el = document.createElement("div");
  el.className = "lasso-command-sidebar";
  el.hidden = true;
  el.innerHTML = `
    <div class="lasso-command-sidebar-header">
      <div class="lasso-command-brand">
        <img class="lasso-command-brand-logo" src="${LASSO_ICON_DATA_URL}" alt="Lasso" />
        <span class="lasso-command-brand-title">Build with AI</span>
      </div>
      <div class="lasso-command-header-actions">
        <button class="lasso-command-new-chat" type="button" aria-label="New chat" title="New session">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 5v14M5 12h14"/>
          </svg>
        </button>
        <button class="lasso-command-close" type="button" aria-label="Close">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
    </div>

    <div class="lasso-command-body">
      <div class="lasso-command-empty">
        <img class="lasso-command-empty-logo" src="${LASSO_ICON_DATA_URL}" alt="Lasso" />
        <div class="lasso-command-empty-text">
          Hi <span class="lasso-command-user-name">${getUserGreetingName()}</span>,<br />What would you like to build today?
        </div>
      </div>
      <div class="lasso-command-messages" hidden></div>
    </div>

    <div class="lasso-command-input-composite">
      <textarea
        class="lasso-command-input"
        placeholder="Describe what you want to build…"
        rows="3"
      ></textarea>
      <div class="lasso-command-input-toolbar">
        <div class="lasso-command-model-select">
          <button class="lasso-command-model-btn" type="button" aria-label="Select model">
            <span class="lasso-command-model-icon"></span>
            <span class="lasso-command-model-label"></span>
            <svg class="lasso-command-model-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </button>
          <div class="lasso-command-model-menu lasso-prompt-model-menu" hidden></div>
        </div>
        <div class="lasso-command-input-actions">
          <button class="lasso-command-voice" type="button" aria-label="Voice input" title="Voice input (speech-to-text)">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="3" width="6" height="11" rx="3"/>
              <path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8"/>
            </svg>
          </button>
          <button class="lasso-command-submit primary" type="button" aria-label="Build">
            <span class="lasso-command-submit-label">Build</span>
            <svg class="lasso-command-submit-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </button>
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
  commandNewChat = el.querySelector<HTMLButtonElement>(".lasso-command-new-chat")!;
  commandModelBtn = el.querySelector<HTMLButtonElement>(".lasso-command-model-btn")!;
  commandModelMenu = el.querySelector<HTMLDivElement>(".lasso-command-model-menu")!;
  commandModelIcon = el.querySelector<HTMLSpanElement>(".lasso-command-model-icon")!;
  commandModelLabel = el.querySelector<HTMLSpanElement>(".lasso-command-model-label")!;
  commandMessagesEl = el.querySelector<HTMLDivElement>(".lasso-command-messages")!;
  commandEmptyEl = el.querySelector<HTMLDivElement>(".lasso-command-empty")!;

  // Model selector button
  commandModelBtn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (commandModelMenu) commandModelMenu.hidden = !commandModelMenu.hidden;
  });

  // Model menu click handling (filters + items)
  commandModelMenu.addEventListener("click", (event) => {
    event.stopPropagation();
    const filter = (event.target as HTMLElement).closest<HTMLButtonElement>(".lasso-model-filter");
    if (filter?.dataset.providerFilter) {
      state.modelFilter = filter.dataset.providerFilter as typeof state.modelFilter;
      populateModelMenu();
      return;
    }

    const item = (event.target as HTMLElement).closest<HTMLButtonElement>(".lasso-prompt-model-item");
    if (!item || item.classList.contains("locked")) return;

    const found = state.MODELS.find((m) => m.id === item.dataset.model);
    if (!found) return;

    state.selectedModel = found;
    rememberModel(found);
    if (commandModelIcon && commandModelLabel) {
      commandModelIcon.innerHTML = providerIcon(found.provider, true);
      commandModelLabel.textContent = found.label;
    }
    populateModelMenu();
    if (commandModelMenu) commandModelMenu.hidden = true;
  });

  // Close model menu on outside click
  document.addEventListener("click", (event) => {
    if (!commandModelMenu || commandModelMenu.hidden) return;
    const path = event.composedPath ? event.composedPath() : [];
    if (path.includes(commandModelBtn!) || path.includes(commandModelMenu)) return;
    const target = event.target as Node;
    if (commandModelBtn?.contains(target) || commandModelMenu?.contains(target)) return;
    commandModelMenu.hidden = true;
  });

  // Close button
  commandClose.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    closeCommandBar();
  });

  // New Chat button
  commandNewChat.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    startNewSession();
  });

  // Voice input
  commandVoice.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    const btn = commandVoice;
    if (!btn) return;

    if (isRecordingVoice()) {
      btn.classList.remove("recording");
      btn.classList.add("transcribing");
      btn.title = "Transcribing…";

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
        btn.classList.remove("transcribing");
        btn.title = "Voice input";
      }
    } else {
      try {
        await startVoiceRecording();
        btn.classList.add("recording");
        btn.title = "Recording… Click again to stop";
        showActivity("Listening… speak now", "#ea4335");
      } catch (err: any) {
        showActivity(err?.message || "Microphone access denied", "#f28b82");
      }
    }
  });

  // Submit on ⌘+Enter or Enter without Shift
  commandInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
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

  // Click delegation for messages (thought toggles, apply/undo, diff toggles)
  commandMessagesEl.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;

    // Toggle thinking expansion
    const thoughtToggle = target.closest<HTMLButtonElement>(".lasso-command-thought-toggle");
    if (thoughtToggle) {
      const msgId = thoughtToggle.closest<HTMLElement>(".lasso-command-msg")?.dataset.msgId;
      const msg = commandMessages.find((m) => m.id === msgId);
      if (msg && msg.thinking) {
        msg.thinking.expanded = !msg.thinking.expanded;
        renderMessages();
      }
      return;
    }

    // Toggle diff visibility
    const diffToggle = target.closest<HTMLButtonElement>(".lasso-command-toggle-diff");
    if (diffToggle) {
      const msgId = diffToggle.closest<HTMLElement>(".lasso-command-msg")?.dataset.msgId;
      const msg = commandMessages.find((m) => m.id === msgId);
      if (msg) {
        msg.showDiff = !msg.showDiff;
        renderMessages();
      }
      return;
    }

    // Apply changes
    const applyBtn = target.closest<HTMLButtonElement>(".lasso-command-apply-btn");
    if (applyBtn) {
      const msgId = applyBtn.closest<HTMLElement>(".lasso-command-msg")?.dataset.msgId;
      const msg = commandMessages.find((m) => m.id === msgId);
      if (msg && msg.changes?.length && state.bridgeSocket?.readyState === WebSocket.OPEN) {
        applyBtn.disabled = true;
        applyBtn.textContent = "Applying…";
        state.bridgeSocket.send(
          JSON.stringify({
            type: "apply",
            taskId: msg.id,
            changes: msg.changes,
          })
        );
      }
      return;
    }

    // Undo changes
    const undoBtn = target.closest<HTMLButtonElement>(".lasso-command-undo-btn");
    if (undoBtn) {
      const msgId = undoBtn.closest<HTMLElement>(".lasso-command-msg")?.dataset.msgId;
      const msg = commandMessages.find((m) => m.id === msgId);
      if (msg && state.bridgeSocket?.readyState === WebSocket.OPEN) {
        undoBtn.disabled = true;
        undoBtn.textContent = "Reverting…";
        state.bridgeSocket.send(
          JSON.stringify({
            type: "undo",
            taskId: msg.id,
          })
        );
      }
      return;
    }
  });
}

function autoResizeTextarea(textarea: HTMLTextAreaElement): void {
  textarea.style.height = "auto";
  textarea.style.height = `${Math.min(textarea.scrollHeight, 220)}px`;
}

export function openCommandBar(): void {
  if (!commandBarEl) return;

  if (state.selectMode) {
    setSelectMode(false);
  }

  commandBarEl.hidden = false;
  isOneShotMode = true;

  getDOM().shadow.querySelector<HTMLButtonElement>(".command-tool")?.classList.add("active");

  if (commandInput) {
    commandInput.focus();
    autoResizeTextarea(commandInput);
  }

  // Update model button with current selection
  if (commandModelIcon && commandModelLabel && state.selectedModel) {
    commandModelIcon.innerHTML = providerIcon(state.selectedModel.provider, true);
    commandModelLabel.textContent = state.selectedModel.label;
  }

  updateEmptyStateUserName();
  populateModelMenu();
  renderMessages();

  // Load existing conversations for the current project (non-blocking)
  loadConversationList();
}

export function closeCommandBar(): void {
  if (!commandBarEl) return;

  commandBarEl.hidden = true;
  isOneShotMode = false;

  getDOM().shadow.querySelector<HTMLButtonElement>(".command-tool")?.classList.remove("active");
}

export function isCommandBarOpen(): boolean {
  return isOneShotMode;
}

export function populateModelMenu(): void {
  if (!commandModelMenu) return;
  buildModelMenuContent(commandModelMenu, populateModelMenu);
}

function startNewSession(): void {
  if (activeThinkingInterval) {
    clearInterval(activeThinkingInterval);
    activeThinkingInterval = null;
  }
  // Stop any active task but DO NOT clear the current conversation.
  // Instead, create a brand-new conversation context.
  activeTaskId = null;
  activeConversationId = null; // will be re-created on next submit
  commandMessages = [];
  if (commandInput) {
    commandInput.value = "";
    autoResizeTextarea(commandInput);
  }
  updateSubmitButton(false);
  renderMessages();
  // Eagerly create the new server conversation in the background
  createServerConversation().then((id) => {
    if (id) activeConversationId = id;
    loadConversationList();
  });
}

function updateSubmitButton(isWorking: boolean): void {
  if (!commandSubmit) return;
  const label = commandSubmit.querySelector(".lasso-command-submit-label");
  const arrow = commandSubmit.querySelector(".lasso-command-submit-arrow");

  if (isWorking) {
    commandSubmit.classList.add("working");
    if (label) label.textContent = "Stop";
    if (arrow) {
      arrow.innerHTML = `<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>`;
    }
  } else {
    commandSubmit.classList.remove("working");
    if (label) label.textContent = "Build";
    if (arrow) {
      arrow.innerHTML = `<path d="M5 12h14M12 5l7 7-7 7"/>`;
    }
  }
}

async function handleSubmit(): Promise<void> {
  if (!commandInput) return;

  // If agent is actively running and user clicks "Stop", abort the task
  if (activeTaskId) {
    if (state.bridgeSocket?.readyState === WebSocket.OPEN) {
      state.bridgeSocket.send(
        JSON.stringify({
          type: "abort",
          taskId: activeTaskId,
        })
      );
    }
    const currentMsg = commandMessages.find((m) => m.id === activeTaskId);
    if (currentMsg && currentMsg.thinking) {
      currentMsg.thinking.completed = true;
      currentMsg.thinking.expanded = false;
      currentMsg.content = currentMsg.content || "Agent stopped.";
      currentMsg.isStreaming = false;
    }
    if (activeThinkingInterval) {
      clearInterval(activeThinkingInterval);
      activeThinkingInterval = null;
    }
    activeTaskId = null;
    updateSubmitButton(false);
    renderMessages();
    return;
  }

  const prompt = commandInput.value.trim();
  if (!prompt) return;

  commandInput.value = "";
  autoResizeTextarea(commandInput);

  // Append user message
  const userMsgId = `user-${Date.now()}`;
  commandMessages.push({
    id: userMsgId,
    role: "user",
    content: prompt,
    timestamp: Date.now(),
  });

  const taskId = `oneshot-${Date.now()}`;
  activeTaskId = taskId;
  activeStartTime = Date.now();

  // Append initial assistant message with thinking widget
  commandMessages.push({
    id: taskId,
    role: "assistant",
    content: "",
    timestamp: Date.now(),
    thinking: {
      steps: [{ title: "Planning your request...", status: "running" }],
      durationSeconds: 0,
      completed: false,
      expanded: true, // visible while working
    },
    isStreaming: true,
  });

  updateSubmitButton(true);
  renderMessages();
  scrollToBottom();

  // Active thinking timer counter
  if (activeThinkingInterval) clearInterval(activeThinkingInterval);
  activeThinkingInterval = setInterval(() => {
    const activeMsg = commandMessages.find((m) => m.id === taskId);
    if (activeMsg && activeMsg.thinking && !activeMsg.thinking.completed) {
      activeMsg.thinking.durationSeconds = Math.max(1, Math.round((Date.now() - activeStartTime) / 1000));
      updateActiveTimerDisplay(activeMsg.thinking.durationSeconds);
    }
  }, 1000);

  // Ensure we have a server-side conversation (create lazily on first message)
  if (!activeConversationId) {
    createServerConversation().then((id) => {
      if (id) activeConversationId = id;
    });
  }

  // Send request to bridge
  if (state.bridgeSocket?.readyState === WebSocket.OPEN) {
    state.bridgeSocket.send(
      JSON.stringify({
        type: "oneshot",
        prompt,
        taskId,
        conversationId: activeConversationId || undefined,
        scope: "project",
        model: state.selectedModel.id,
        provider: state.selectedModel.provider,
        messages: commandMessages
          .filter((m) => m.content && !m.error)
          .map((m) => ({ role: m.role, content: m.content })),
      })
    );
  }
}

function updateActiveTimerDisplay(seconds: number): void {
  const timerEl = commandBarEl?.querySelector<HTMLElement>(".lasso-command-active-timer");
  if (timerEl) {
    timerEl.textContent = formatDuration(seconds);
  }
}

export function handleCommandBarAgentStatus(message: any): void {
  const taskId = message.taskId;
  let targetMsg = commandMessages.find((m) => m.id === taskId);
  if (!targetMsg) {
    // If not found, use latest assistant message
    targetMsg = [...commandMessages].reverse().find((m) => m.role === "assistant");
  }
  if (!targetMsg) return;

  if (message.status === "thinking" || message.status === "working") {
    if (!targetMsg.thinking) {
      targetMsg.thinking = {
        steps: [],
        durationSeconds: Math.max(1, Math.round((Date.now() - activeStartTime) / 1000)),
        completed: false,
        expanded: true,
      };
    }

    // Mark previous running steps as completed
    for (const step of targetMsg.thinking.steps) {
      if (step.status === "running") step.status = "completed";
    }

    targetMsg.thinking.steps.push({
      title: message.message,
      detail: message.detail,
      status: "running",
    });

    renderMessages();
    scrollToBottom();
  } else if (message.status === "review" || message.status === "complete") {
    if (activeThinkingInterval) {
      clearInterval(activeThinkingInterval);
      activeThinkingInterval = null;
    }

    if (targetMsg.thinking) {
      for (const step of targetMsg.thinking.steps) {
        step.status = "completed";
      }
      targetMsg.thinking.completed = true;
      // Requirement: it collapses once thinking is done so user can choose to expand later!
      targetMsg.thinking.expanded = false;

      if (message.totalThinkingTimeMs) {
        targetMsg.thinking.durationSeconds = Math.max(1, Math.round(message.totalThinkingTimeMs / 1000));
      } else {
        targetMsg.thinking.durationSeconds = Math.max(1, Math.round((Date.now() - activeStartTime) / 1000));
      }

      // If server returned detailed thinking steps, append them
      if (Array.isArray(message.thinking) && message.thinking.length) {
        targetMsg.thinking.steps = message.thinking.map((s: any) => ({
          title: s.title || "Completed step",
          detail: s.detail,
          status: "completed",
        }));
      }
    }

    targetMsg.content = message.message || "Changes are ready for review.";
    if (Array.isArray(message.changes) && message.changes.length) {
      targetMsg.changes = message.changes;
    }
    targetMsg.isStreaming = false;
    activeTaskId = null;
    updateSubmitButton(false);

    // Persist the completed assistant message to the server conversation (non-blocking)
    if (activeConversationId) {
      const convId = activeConversationId;
      const userMsg = [...commandMessages].reverse().find((m) => m.role === "user");
      // Save user prompt + assistant reply via the /messages endpoint
      if (userMsg) {
        apiFetch(`/agent/conversations/${convId}/messages`, {
          method: "POST",
          body: JSON.stringify({
            prompt: userMsg.content,
            model: { id: state.selectedModel.id, provider: state.selectedModel.provider },
          }),
        }).catch(() => {/* non-critical */});
      }
    }

    renderMessages();
    scrollToBottom();
  } else if (message.status === "error" || message.status === "stopped") {
    if (activeThinkingInterval) {
      clearInterval(activeThinkingInterval);
      activeThinkingInterval = null;
    }

    if (targetMsg.thinking) {
      targetMsg.thinking.completed = true;
      targetMsg.thinking.expanded = false;
      targetMsg.thinking.durationSeconds = Math.max(1, Math.round((Date.now() - activeStartTime) / 1000));
    }

    targetMsg.error = message.message || "An error occurred during execution.";
    targetMsg.isStreaming = false;
    activeTaskId = null;
    updateSubmitButton(false);

    renderMessages();
    scrollToBottom();
  }
}

export function handleCommandBarAction(message: any): void {
  const taskId = message.taskId;
  const targetMsg = commandMessages.find((m) => m.id === taskId);
  if (!targetMsg) return;

  if (message.type === "applied") {
    targetMsg.changesApplied = true;
    targetMsg.changesUndone = false;
    renderMessages();
  } else if (message.type === "undone") {
    targetMsg.changesUndone = true;
    targetMsg.changesApplied = false;
    renderMessages();
  }
}

export function handleCommandBarPrompt(message: any): void {
  // Can be used if agent asks permission or input
  if (message.prompt?.question) {
    const targetMsg = [...commandMessages].reverse().find((m) => m.role === "assistant");
    if (targetMsg) {
      targetMsg.content += `\n\n**${message.prompt.question}**`;
      renderMessages();
    }
  }
}

function renderMessages(): void {
  if (!commandMessagesEl || !commandEmptyEl) return;

  if (commandMessages.length === 0) {
    commandEmptyEl.hidden = false;
    commandMessagesEl.hidden = true;
    commandMessagesEl.innerHTML = "";
    return;
  }

  commandEmptyEl.hidden = true;
  commandMessagesEl.hidden = false;

  let html = "";
  for (const msg of commandMessages) {
    if (msg.role === "user") {
      html += `
        <div class="lasso-command-msg user" data-msg-id="${msg.id}">
          <div class="lasso-command-msg-bubble">${escapeHtml(msg.content)}</div>
        </div>
      `;
    } else {
      html += `
        <div class="lasso-command-msg assistant" data-msg-id="${msg.id}">
          ${renderThinking(msg)}
          ${msg.content ? `<div class="lasso-command-msg-text">${formatText(msg.content)}</div>` : ""}
          ${renderChanges(msg)}
          ${msg.error ? `<div class="lasso-command-msg-error"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> ${escapeHtml(msg.error)}</div>` : ""}
        </div>
      `;
    }
  }

  commandMessagesEl.innerHTML = html;
}

function renderThinking(msg: CommandMessage): string {
  if (!msg.thinking) return "";
  const { steps, durationSeconds, completed, expanded } = msg.thinking;

  if (!completed) {
    // Live thinking process
    return `
      <div class="lasso-command-thinking-active">
        <div class="lasso-command-thinking-header">
          <div class="lasso-command-thinking-pulse">
            <span class="lasso-command-pulse-ring"></span>
            <span class="lasso-command-pulse-dot"></span>
          </div>
          <span class="lasso-command-thinking-title">Thinking…</span>
          <span class="lasso-command-active-timer">${formatDuration(durationSeconds)}</span>
        </div>
        <div class="lasso-command-thinking-steps">
          ${steps
            .map(
              (step) => `
            <div class="lasso-command-thinking-step ${step.status}">
              <span class="lasso-step-status-icon">${step.status === "completed" ? "✓" : "•"}</span>
              <div class="lasso-step-content">
                <div class="lasso-step-name">${escapeHtml(step.title)}</div>
                ${step.detail ? `<div class="lasso-step-detail">${escapeHtml(step.detail)}</div>` : ""}
              </div>
            </div>
          `
            )
            .join("")}
        </div>
      </div>
    `;
  }

  // Thinking completed: collapsible widget showing "Thought for 30s >"
  return `
    <div class="lasso-command-thought-wrapper">
      <button class="lasso-command-thought-toggle ${expanded ? "expanded" : ""}" type="button" aria-expanded="${expanded}">
        <div class="lasso-command-thought-left">
          <svg class="lasso-command-thought-sparkle" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z"/>
          </svg>
          <span class="lasso-command-thought-label">Thought for ${durationSeconds || 1}s</span>
        </div>
        <svg class="lasso-command-thought-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 18l6-6-6-6"/>
        </svg>
      </button>
      <div class="lasso-command-thinking-steps" ${expanded ? "" : "hidden"}>
        ${steps
          .map(
            (step) => `
          <div class="lasso-command-thinking-step completed">
            <span class="lasso-step-status-icon">✓</span>
            <div class="lasso-step-content">
              <div class="lasso-step-name">${escapeHtml(step.title)}</div>
              ${step.detail ? `<div class="lasso-step-detail">${escapeHtml(step.detail)}</div>` : ""}
            </div>
          </div>
        `
          )
          .join("")}
      </div>
    </div>
  `;
}

function renderChanges(msg: CommandMessage): string {
  if (!msg.changes || !msg.changes.length) return "";
  const changes = msg.changes;
  const isApplied = msg.changesApplied;
  const isUndone = msg.changesUndone;
  const showDiff = msg.showDiff;

  return `
    <div class="lasso-command-changes-card">
      <div class="lasso-command-changes-header">
        <div class="lasso-command-changes-title">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          <span>${changes.length} file${changes.length === 1 ? "" : "s"} modified</span>
        </div>
        <button class="lasso-command-toggle-diff" type="button">
          ${showDiff ? "Hide diff" : "View diff"}
        </button>
      </div>

      <div class="lasso-command-files-list">
        ${changes
          .map(
            (c) => `
          <div class="lasso-command-file-row">
            <span class="lasso-command-file-badge ${c.oldString ? "modified" : "added"}">${c.oldString ? "M" : "+"}</span>
            <span class="lasso-command-file-name" title="${c.filePath}">${escapeHtml(c.filePath)}</span>
          </div>
        `
          )
          .join("")}
      </div>

      ${showDiff ? renderDiffPreview(changes) : ""}

      <div class="lasso-command-changes-footer">
        ${
          isApplied
            ? `
          <div class="lasso-command-status-applied">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            <span>Changes applied</span>
          </div>
          <button class="lasso-command-undo-btn secondary" type="button">Undo</button>
        `
            : isUndone
            ? `
          <div class="lasso-command-status-undone">
            <span>Changes reverted</span>
          </div>
          <button class="lasso-command-apply-btn primary" type="button">Re-apply</button>
        `
            : `
          <button class="lasso-command-apply-btn primary" type="button">
            <span>Keep Changes</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          </button>
          <button class="lasso-command-undo-btn secondary" type="button">Discard</button>
        `
        }
      </div>
    </div>
  `;
}

function renderDiffPreview(changes: SourceChange[]): string {
  return `
    <div class="lasso-command-diff-container">
      ${changes
        .map(
          (c) => `
        <div class="lasso-command-diff-file">
          <div class="lasso-command-diff-file-header">${escapeHtml(c.filePath)}</div>
          <pre class="lasso-command-diff-content">${c.oldString ? `<span class="lasso-diff-del">- ${escapeHtml(c.oldString.slice(0, 300))}</span>\n` : ""}<span class="lasso-diff-add">+ ${escapeHtml(c.newString.slice(0, 300))}</span></pre>
        </div>
      `
        )
        .join("")}
    </div>
  `;
}

function scrollToBottom(): void {
  if (commandBarEl) {
    const body = commandBarEl.querySelector(".lasso-command-body");
    if (body) {
      setTimeout(() => {
        body.scrollTop = body.scrollHeight;
      }, 30);
    }
  }
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `0:${seconds < 10 ? "0" : ""}${seconds}`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatText(text: string): string {
  // Light markdown: code blocks, bold, newlines
  let formatted = escapeHtml(text);
  formatted = formatted.replace(/`([^`]+)`/g, "<code>$1</code>");
  formatted = formatted.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  formatted = formatted.replace(/\n\n/g, "</p><p>");
  formatted = formatted.replace(/\n/g, "<br/>");
  return `<p>${formatted}</p>`;
}
