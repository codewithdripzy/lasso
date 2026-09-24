import html2canvas from "html2canvas";
import anthropicIcon from "@iconify-icons/logos/anthropic-icon";
import googleIcon from "@iconify-icons/logos/google-icon";
import openaiIcon from "@iconify-icons/logos/openai-icon";
import terminalIcon from "@iconify-icons/logos/terminal";

import { state, rememberModel } from "../state";
import { getDOM } from "../dom";
import { getElementGroup, getElementLabel, getSourceHint, elementKey, setSelectMode, updateSelectedVisual } from "../toolbar/select";
import { acquireOwnership, releaseHeldLock, updateLockChip } from "../collab/locks";
import { collabEmit, sendPresenceUpdate } from "../collab/socket";
import { renderRemoteBoxes } from "../collab/presence";
import { renderComments } from "../comments/pins";
import { LASSO_ICON_DATA_URL } from "../icons/lasso";
import type { ModelOption, PendingChange, ScreenshotContext } from "../types";

let promptEl: HTMLDivElement | null = null;
let promptInput: HTMLTextAreaElement | null = null;
let promptElement: HTMLSpanElement | null = null;
let sendButton: HTMLButtonElement | null = null;
let stopButton: HTMLButtonElement | null = null;
let promptClose: HTMLButtonElement | null = null;
let agentStatusElement: HTMLDivElement | null = null;
let agentStatusMessage: HTMLSpanElement | null = null;
let agentLogElement: HTMLDivElement | null = null;
let reviewPanel: HTMLDivElement | null = null;

let modelBtn: HTMLButtonElement | null = null;
let modelName: HTMLSpanElement | null = null;
let modelMenu: HTMLDivElement | null = null;
const openCliGroups = new Set<string>();

const providerLabels: Record<ModelOption["provider"], string> = {
  google: "Google",
  openai: "OpenAI",
  anthropic: "Anthropic",
  ollama: "Local",
  cli: "CLI",
};

const providerIcons = {
  google: googleIcon,
  openai: openaiIcon,
  anthropic: anthropicIcon,
  ollama: terminalIcon,
  cli: terminalIcon,
};

function providerIcon(provider: ModelOption["provider"], active = false): string {
  const icon = providerIcons[provider];
  return `<span class="${active ? "lasso-model-active-icon" : "lasso-model-item-icon"} provider-${provider}" aria-hidden="true"><svg viewBox="0 0 ${icon.width} ${icon.height}" xmlns="http://www.w3.org/2000/svg" focusable="false">${icon.body}</svg></span>`;
}

export function buildPrompt(): { prompt: HTMLDivElement; review: HTMLDivElement } {
  const dom = getDOM();

  const el = document.createElement("div");
  el.className = "lasso-prompt";
  el.innerHTML = `
    <div class="lasso-prompt-card">
      <div class="lasso-prompt-top">
        <div class="lasso-prompt-brand">
          <img class="lasso-prompt-brand-logo" src="${LASSO_ICON_DATA_URL}" alt="Lasso" />
          <span class="lasso-prompt-brand-title">Ask Lasso</span>
        </div>

        <span class="lasso-prompt-element">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16v14H4z"/><path d="M8 9h8M8 13h5"/></svg>
          <span class="lasso-prompt-element-name"></span>
        </span>

        <button class="lasso-prompt-close" type="button" aria-label="Cancel">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <div class="lasso-chat-thread" aria-live="polite"></div>

      <div class="lasso-agent-status" hidden aria-live="polite">
        <div class="lasso-agent-terminal-header">
          <div class="lasso-agent-terminal-dots">
            <span class="lasso-dot-red"></span>
            <span class="lasso-dot-yellow"></span>
            <span class="lasso-dot-green"></span>
          </div>
          <span class="lasso-agent-status-kicker">lasso-agent</span>
          <span class="lasso-agent-status-badge">active</span>
        </div>
        <div class="lasso-agent-status-line">
          <span class="lasso-agent-terminal-prompt">❯</span>
          <span class="lasso-agent-status-message"></span>
          <span class="lasso-agent-cursor"></span>
        </div>
        <div class="lasso-agent-log" aria-label="Agent activity"></div>
      </div>

      <textarea class="lasso-prompt-input" placeholder="Ask anything about this element…" rows="1"></textarea>

      <div class="lasso-prompt-actions">
        <div class="lasso-prompt-icon-group">
          <button class="lasso-prompt-upload" type="button" aria-label="Upload screenshot" title="Screenshot included">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <path d="M17 8l-5-5-5 5"/>
              <path d="M12 3v12"/>
            </svg>
          </button>

          <button class="lasso-prompt-voice" type="button" disabled aria-label="Voice mode coming soon" title="Voice mode coming soon">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8"/></svg>
          </button>

          <div class="lasso-prompt-model-wrap">
            <button class="lasso-prompt-model" type="button" aria-label="Choose model">
              <span class="lasso-prompt-model-name"></span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M6 9l6 6 6-6"/>
              </svg>
            </button>
            <div class="lasso-prompt-model-menu" hidden></div>
          </div>
        </div>

        <div class="lasso-prompt-icon-group">
          <button class="lasso-prompt-stop" type="button" hidden aria-label="Stop agent">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
          </button>
          <button class="lasso-prompt-send" type="button" aria-label="Send edit request">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
            <span>Send</span>
          </button>
        </div>
      </div>
    </div>
  `;

  dom.shadow.appendChild(el);
  promptEl = el;

  promptInput = el.querySelector<HTMLTextAreaElement>(".lasso-prompt-input")!;
  promptElement = el.querySelector<HTMLSpanElement>(".lasso-prompt-element-name")!;
  sendButton = el.querySelector<HTMLButtonElement>(".lasso-prompt-send")!;
  stopButton = el.querySelector<HTMLButtonElement>(".lasso-prompt-stop")!;
  promptClose = el.querySelector<HTMLButtonElement>(".lasso-prompt-close")!;
  agentStatusElement = el.querySelector<HTMLDivElement>(".lasso-agent-status")!;
  agentStatusMessage = el.querySelector<HTMLSpanElement>(".lasso-agent-status-message")!;
  agentLogElement = el.querySelector<HTMLDivElement>(".lasso-agent-log")!;
  modelBtn = el.querySelector<HTMLButtonElement>(".lasso-prompt-model")!;
  modelName = el.querySelector<HTMLSpanElement>(".lasso-prompt-model-name")!;
  modelMenu = el.querySelector<HTMLDivElement>(".lasso-prompt-model-menu")!;

  // Review panel
  const rev = document.createElement("div");
  rev.className = "lasso-review";
  rev.hidden = true;
  rev.innerHTML = `
    <div class="lasso-review-header">
      <div>
        <h3 class="lasso-review-title">Review source changes</h3>
        <p class="lasso-review-subtitle">Nothing has been written yet. Inspect the focused diff before applying it.</p>
      </div>
      <button class="lasso-review-close" type="button" aria-label="Close review">×</button>
    </div>
    <div class="lasso-review-files"></div>
    <div class="lasso-review-actions">
      <button class="lasso-review-undo" type="button">Keep editing</button>
      <button class="lasso-review-apply primary" type="button">Apply changes</button>
    </div>
  `;
  dom.shadow.appendChild(rev);
  reviewPanel = rev;

  // Dragging prompt card
  const promptTop = el.querySelector<HTMLDivElement>(".lasso-prompt-top")!;
  let dragState: { startX: number; startY: number; left: number; top: number } | null = null;

  promptTop.addEventListener("pointerdown", (event) => {
    const target = event.target as HTMLElement;
    if (target.closest("button")) return;
    const rect = el.getBoundingClientRect();
    dragState = { startX: event.clientX, startY: event.clientY, left: rect.left, top: rect.top };
    state.promptDragged = true;
    promptTop.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  });

  promptTop.addEventListener("pointermove", (event) => {
    if (!dragState) return;
    const rect = el.getBoundingClientRect();
    const left = Math.max(12, Math.min(window.innerWidth - rect.width - 12, dragState.left + event.clientX - dragState.startX));
    const top = Math.max(12, Math.min(window.innerHeight - rect.height - 12, dragState.top + event.clientY - dragState.startY));
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  });

  const stopPromptDrag = () => { dragState = null; };
  promptTop.addEventListener("pointerup", stopPromptDrag);
  promptTop.addEventListener("pointercancel", stopPromptDrag);

  // Model Menu
  modelBtn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (modelMenu) modelMenu.hidden = !modelMenu.hidden;
  });

  modelMenu.addEventListener("click", (event) => {
    event.stopPropagation();
    const filter = (event.target as HTMLElement).closest<HTMLButtonElement>(".lasso-model-filter");
    if (filter?.dataset.providerFilter) {
      state.modelFilter = filter.dataset.providerFilter as typeof state.modelFilter;
      refreshModelMenu();
      return;
    }
    const item = (event.target as HTMLElement).closest<HTMLButtonElement>(".lasso-prompt-model-item");
    if (!item) return;

    const found = state.MODELS.find((m) => m.id === item.dataset.model);
    if (!found) return;

    state.selectedModel = found;
    rememberModel(found);
    syncModelMenu();
    if (modelMenu) modelMenu.hidden = true;
  });

  document.addEventListener("click", (event) => {
    if (!modelMenu || modelMenu.hidden) return;
    const path = event.composedPath ? event.composedPath() : [];
    if (path.includes(modelBtn!) || path.includes(modelMenu)) return;
    const target = event.target as Node;
    if (modelBtn?.contains(target) || modelMenu?.contains(target)) return;
    modelMenu.hidden = true;
  });

  refreshModelMenu();

  // Send action
  sendButton.addEventListener("click", handleSend);

  // Stop action
  stopButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (state.bridgeSocket?.readyState === WebSocket.OPEN) {
      state.bridgeSocket.send(JSON.stringify({ type: "stop" }));
    }
    appendChat("assistant", "Agent stopped.");
    resetAgentState();
  });

  // Close prompt
  promptClose.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    cancelPrompt(true);
  });

  // Keydown in input
  promptInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      sendButton?.click();
    }
  });

  // Review panel buttons
  rev.querySelector<HTMLButtonElement>(".lasso-review-close")!.addEventListener("click", closeReview);
  rev.querySelector<HTMLButtonElement>(".lasso-review-undo")!.addEventListener("click", () => {
    if (state.pendingChanges.length && rev.querySelector<HTMLButtonElement>(".lasso-review-apply")!.hidden) {
      if (state.bridgeSocket?.readyState === WebSocket.OPEN) {
        state.bridgeSocket.send(JSON.stringify({ type: "undo" }));
      }
      return;
    }
    closeReview();
    appendChat("assistant", "Kept as a proposal. Nothing was changed.");
  });

  rev.querySelector<HTMLButtonElement>(".lasso-review-apply")!.addEventListener("click", () => {
    if (!state.bridgeSocket || state.bridgeSocket.readyState !== WebSocket.OPEN || !state.pendingChanges.length) return;
    state.bridgeSocket.send(JSON.stringify({ type: "apply", changes: state.pendingChanges }));
    appendChat("assistant", "Applying the reviewed change…");
  });

  return { prompt: el, review: rev };
}

export function refreshModelMenu() {
  if (!modelMenu) return;
  const filters = document.createElement("div");
  filters.className = "lasso-model-filters";
  const providers = ["all", ...Array.from(new Set(state.MODELS.map((m) => m.provider)))];

  for (const provider of providers) {
    const filter = document.createElement("button");
    filter.type = "button";
    filter.className = `lasso-model-filter${state.modelFilter === provider ? " active" : ""}`;
    filter.dataset.providerFilter = provider;
    filter.textContent = provider === "all" ? "All" : providerLabels[provider as ModelOption["provider"]];
    filters.appendChild(filter);
  }

  const children: Node[] = [filters];
  const visibleProviders = state.modelFilter === "all" ? providers.slice(1) : [state.modelFilter];

  for (const provider of visibleProviders) {
    const models = state.MODELS.filter((m) => m.provider === provider);
    if (!models.length) continue;
    const group = document.createElement("div");
    group.className = "lasso-model-group";
    group.textContent = providerLabels[provider as ModelOption["provider"]];
    children.push(group);

    if (provider === "cli") {
      const cliGroups = new Map<string, ModelOption[]>();
      for (const model of models) {
        const key = model.id.split(":", 1)[0] || "cli";
        const groupModels = cliGroups.get(key) || [];
        groupModels.push(model);
        cliGroups.set(key, groupModels);
      }
      const selectedCliGroup = state.selectedModel.id.split(":", 1)[0];
      if (selectedCliGroup && !openCliGroups.size) openCliGroups.add(selectedCliGroup);
      for (const [cliKey, cliModels] of cliGroups) {
        const subGroup = document.createElement("div");
        subGroup.className = "lasso-cli-subgroup";
        const subHeader = document.createElement("button");
        subHeader.type = "button";
        subHeader.className = "lasso-cli-subgroup-header";
        subHeader.setAttribute("aria-expanded", String(openCliGroups.has(cliKey)));
        subHeader.innerHTML = `<span>${cliLabel(cliKey)}</span><span class="lasso-cli-subgroup-chevron">${openCliGroups.has(cliKey) ? "⌃" : "⌄"}</span>`;
        const subItems = document.createElement("div");
        subItems.className = "lasso-cli-subgroup-items";
        subItems.hidden = !openCliGroups.has(cliKey);
        subHeader.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (openCliGroups.has(cliKey)) openCliGroups.delete(cliKey);
          else openCliGroups.add(cliKey);
          refreshModelMenu();
        });
        subGroup.append(subHeader, subItems);
        children.push(subGroup);
        for (const model of cliModels) subItems.appendChild(modelItem(model));
      }
      continue;
    }

    for (const model of models) {
      children.push(modelItem(model));
    }
  }

  modelMenu.replaceChildren(...children);
  syncModelMenu();
}

function cliLabel(key: string): string {
  if (key === "claude-code") return "Claude Code";
  if (key === "codex") return "Codex";
  if (key === "opencode") return "OpenCode";
  return key;
}

function modelItem(model: ModelOption): HTMLButtonElement {
  const item = document.createElement("button");
  item.type = "button";
  item.className = "lasso-prompt-model-item";
  item.dataset.model = model.id;
  item.innerHTML = `${providerIcon(model.provider)}<span>${model.label}</span><svg class="lasso-prompt-model-check" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>`;
  return item;
}

export function syncModelMenu() {
  if (!modelName || !modelMenu) return;
  modelName.innerHTML = `${providerIcon(state.selectedModel.provider, true)}<span class="lasso-prompt-model-name-text">${state.selectedModel.label}</span>`;
  for (const item of modelMenu.querySelectorAll<HTMLButtonElement>(".lasso-prompt-model-item")) {
    item.classList.toggle("selected", item.dataset.model === state.selectedModel.id);
  }
}

export async function captureScreenshots(el: Element): Promise<ScreenshotContext> {
  const options = {
    backgroundColor: null,
    useCORS: true,
    logging: false,
    scale: Math.min(window.devicePixelRatio || 1, 1),
    ignoreElements: (node: Element) => node.id === "lasso-root" || Boolean(node.closest?.("#lasso-root")),
  };
  try {
    const [fullCanvas, elementCanvas] = await Promise.all([
      html2canvas(document.body, options),
      html2canvas(el as HTMLElement, options),
    ]);
    return {
      full: fullCanvas.toDataURL("image/jpeg", 0.72),
      element: elementCanvas.toDataURL("image/jpeg", 0.82),
    };
  } catch (error) {
    console.warn("[lasso] screenshot capture unavailable", error);
    return {};
  }
}

export function appendChat(role: "user" | "assistant" | "error", text: string) {
  const thread = promptEl?.querySelector<HTMLDivElement>(".lasso-chat-thread");
  if (!thread || !text.trim()) return;
  const previous = thread.lastElementChild;
  if (previous?.textContent === text && previous.classList.contains(role)) return;

  state.chatHistory.push({
    role,
    content: text,
    createdAt: new Date().toISOString(),
    contextId: state.selectionId || undefined,
  });

  const item = document.createElement("div");
  item.className = `lasso-chat-message ${role}`;
  item.textContent = text;
  thread.appendChild(item);
  while (thread.children.length > 6) thread.firstElementChild?.remove();
  thread.scrollTop = thread.scrollHeight;
}

export function setAgentStatus(status: "thinking" | "working" | "review" | "error" | "stopped", message: string) {
  if (!agentStatusElement || !agentStatusMessage || !sendButton) return;

  // Deduplicate: skip no-op updates when already showing the same status+message
  if (
    agentStatusElement.dataset.status === status &&
    agentStatusMessage.textContent === message &&
    (status === "thinking" || status === "working")
  ) return;

  agentStatusElement.hidden = status === "review" || status === "error" || status === "stopped";
  agentStatusElement.dataset.status = status;
  agentStatusMessage.textContent = message;

  const badgeEl = agentStatusElement.querySelector<HTMLSpanElement>(".lasso-agent-status-badge");
  if (badgeEl) {
    badgeEl.textContent = status === "thinking" ? "thinking" : status === "working" ? "executing" : status;
    badgeEl.className = `lasso-agent-status-badge ${status}`;
  }

  state.agentRunning = status === "thinking" || status === "working";

  if (state.agentRunning && agentLogElement) {
    const line = document.createElement("div");
    line.className = "lasso-agent-log-line";
    line.innerHTML = `<span class="lasso-agent-log-prefix">›</span> <span class="lasso-agent-log-text">${escapeHtml(message)}</span>`;
    agentLogElement.replaceChildren(line);
  }

  sendButton.classList.toggle("loading", state.agentRunning);
  if (stopButton) stopButton.hidden = !state.agentRunning;
  if (promptInput) promptInput.disabled = state.agentRunning;
  sendButton.disabled = state.agentRunning;

  const label = sendButton.querySelector("span");
  if (label) {
    label.textContent = status === "review" ? "Review" : status === "error" ? "Retry" : state.agentRunning ? "" : "Send";
  }
  sendButton.setAttribute("aria-label", state.agentRunning ? "Agent is working" : status === "error" ? "Retry request" : "Send request");
  sendButton.dataset.state = status === "error" ? "retry" : state.agentRunning ? "working" : status;

  if (status === "review" || status === "error" || status === "stopped") {
    appendChat(status === "error" ? "error" : "assistant", message);
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

export function resetAgentState() {
  state.agentRunning = false;
  if (agentStatusElement) {
    agentStatusElement.hidden = true;
    agentStatusElement.dataset.status = "idle";
  }
  if (agentLogElement) agentLogElement.replaceChildren();
  if (sendButton) {
    sendButton.classList.remove("loading");
    sendButton.disabled = false;
    sendButton.dataset.state = "idle";
    const label = sendButton.querySelector("span");
    if (label) label.textContent = "Send";
    sendButton.setAttribute("aria-label", "Send request");
  }
  if (stopButton) stopButton.hidden = true;
  if (promptInput) promptInput.disabled = false;
}

export function showReview(changes: PendingChange[], summary: string) {
  if (!reviewPanel) return;
  const subtitle = reviewPanel.querySelector<HTMLParagraphElement>(".lasso-review-subtitle");
  const files = reviewPanel.querySelector<HTMLDivElement>(".lasso-review-files");
  if (!subtitle || !files) return;

  subtitle.textContent = `${summary} ${changes.length} file${changes.length === 1 ? "" : "s"} proposed.`;
  files.replaceChildren(
    ...changes.map((change) => {
      const file = document.createElement("div");
      file.className = "lasso-review-file";
      const name = document.createElement("div");
      name.className = "lasso-review-file-name";
      name.textContent = change.filePath;
      const code = document.createElement("div");
      code.className = "lasso-review-code";
      const oldCode = document.createElement("pre");
      oldCode.className = "lasso-review-old";
      oldCode.textContent = `- ${change.oldString}`;
      const newCode = document.createElement("pre");
      newCode.className = "lasso-review-new";
      newCode.textContent = `+ ${change.newString}`;
      code.append(oldCode, newCode);
      file.append(name, code);
      return file;
    })
  );

  reviewPanel.hidden = false;
  const left = Math.max(12, (window.innerWidth - Math.min(520, window.innerWidth - 24)) / 2);
  const top = Math.max(12, (window.innerHeight - Math.min(620, window.innerHeight - 24)) / 2);
  reviewPanel.style.left = `${left}px`;
  reviewPanel.style.top = `${top}px`;
}

export function closeReview() {
  if (reviewPanel) reviewPanel.hidden = true;
  resetAgentState();
}

export function positionPrompt(el: Element) {
  if (!promptEl) return;
  const rect = el.getBoundingClientRect();
  const promptWidth = 360;
  const promptHeight = 200;
  const gap = 12;

  let left = rect.right + gap;
  let top = rect.top;

  if (left + promptWidth > window.innerWidth - 12) {
    left = rect.left - promptWidth - gap;
  }
  if (left < 12) {
    left = Math.max(12, rect.left);
    top = rect.bottom + gap;
  }
  if (top + promptHeight > window.innerHeight - 12) {
    top = rect.bottom - promptHeight;
  }

  left = Math.max(12, Math.min(left, window.innerWidth - promptWidth - 12));
  top = Math.max(12, Math.min(top, window.innerHeight - promptHeight - 12));

  promptEl.style.left = `${left}px`;
  promptEl.style.top = `${top}px`;
}

export function cancelPrompt(reenter: boolean) {
  if (!promptEl) return;
  promptEl.classList.remove("visible");
  if (promptInput) promptInput.value = "";

  sendPresenceUpdate({ selection: null });
  if (state.heldLockElement) releaseHeldLock();
  updateLockChip();
  renderRemoteBoxes();
  renderComments();

  state.selected = null;
  getDOM().selectedBox.style.display = "none";
  getDOM().label.style.display = "none";

  if (reenter) {
    setSelectMode(true);
  }
}

export async function handleSend(event: MouseEvent) {
  event.preventDefault();
  event.stopPropagation();
  if (!state.selected || !promptInput || !sendButton) return;

  const instruction =
    promptInput.value.trim() ||
    (sendButton.dataset.state === "retry" ? state.lastInstruction : "");

  if (!instruction) {
    promptInput.focus();
    return;
  }

  const isQuestion = /^(hi|hello|hey|thanks|thank you|what|why|how|when|where|who|which|is|are|does|do|can|could|would|should|tell me|explain|describe)\b/i.test(instruction) || /\?$/.test(instruction);
  const isExplicitEdit = /\b(change|edit|update|make|add|remove|delete|fix|replace|turn|convert|style|restyle|move|rename|implement|build|create|increase|decrease|hide|show|align|resize|set|enable|disable)\b/i.test(instruction);
  const wantsAnswer = isQuestion && !(/\b(can|could|would|please)\s+you\s+(change|edit|update|add|fix|make)\b/i.test(instruction)) || (!isExplicitEdit && !isQuestion);

  if (!state.bridgeSocket || state.bridgeSocket.readyState !== WebSocket.OPEN) {
    setAgentStatus(
      "error",
      "The Lasso agent bridge is not connected. Start Lasso with your dev server and try again."
    );
    return;
  }

  if (!wantsAnswer) {
    const ownershipGranted = await acquireOwnership(state.selected);
    if (!ownershipGranted) return;
  }

  if (!wantsAnswer && state.collabSocket?.connected && state.collabJoined) {
    collabEmit("collab:action", {
      sessionId: state.collabProjectId,
      status: "preparing",
      elementId: elementKey(state.selected),
      summary: `Edits for ${instruction.slice(0, 80)}`,
    });
  }

  appendChat("user", instruction);
  setAgentStatus("thinking", "Thinking…");
  state.lastInstruction = instruction;
  promptInput.value = "";

  const rect = state.selected.getBoundingClientRect();
  const computed = getComputedStyle(state.selected);
  const attributes = Object.fromEntries(
    Array.from(state.selected.attributes).map((attr) => [attr.name, attr.value])
  );
  const screenshots = await state.screenshotPromise;

  state.bridgeSocket.send(
    JSON.stringify({
      type: wantsAnswer ? "ask" : "edit",
      question: wantsAnswer ? instruction : undefined,
      instruction,
      messages: state.chatHistory,
      changesHistory: state.changesHistory,
      model: state.selectedModel.id,
      provider: state.selectedModel.provider,
      context: {
        selectionId: state.selectionId,
        position: {
          top: rect.top,
          left: rect.left,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
          scrollX: window.scrollX,
          scrollY: window.scrollY,
        },
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          devicePixelRatio: window.devicePixelRatio,
          url: window.location.href,
          title: document.title,
        },
        runtimeErrors: state.runtimeErrors,
        styles: {
          display: computed.display,
          position: computed.position,
          color: computed.color,
          backgroundColor: computed.backgroundColor,
          fontSize: computed.fontSize,
          lineHeight: computed.lineHeight,
        },
        attributes,
        screenshots,
      },
      element: {
        tag: state.selected.tagName.toLowerCase(),
        group: getElementGroup(state.selected),
        label: getElementLabel(state.selected),
        html: state.selected.outerHTML.slice(0, 6000),
        sourceHint:
          state.selected.getAttribute("data-source") ||
          state.selected.getAttribute("data-lasso-source") ||
          getSourceHint(state.selected),
      },
    })
  );
}

export function openPromptForSelected(selected: Element) {
  if (!promptEl || !promptElement) return;
  promptElement.textContent = getElementLabel(selected);
  positionPrompt(selected);
  promptEl.classList.add("visible");
  setSelectMode(false);
  requestAnimationFrame(() => {
    promptInput?.focus();
  });
}

export function isPromptOpen(): boolean {
  return promptEl ? promptEl.classList.contains("visible") : false;
}
