import html2canvas from "html2canvas";
import anthropicIcon from "@iconify-icons/logos/anthropic-icon";
import googleIcon from "@iconify-icons/logos/google-icon";
import openaiIcon from "@iconify-icons/logos/openai-icon";
import terminalIcon from "@iconify-icons/logos/terminal";

console.log("[lasso] overlay loaded");

function init() {
  // Prevent duplicate initialization
  if (document.getElementById("lasso-root")) {
    console.log("[lasso] already initialized");
    return;
  }

  let selectMode = false;
  let hovered: Element | null = null;
  let selected: Element | null = null;
  let bridgeSocket: WebSocket | null = null;
  let apiKeyConfigured = false;
  let agentStatusElement: HTMLDivElement | null = null;
  let agentStatusMessage: HTMLSpanElement | null = null;
  let agentLogElement: HTMLDivElement | null = null;
  let agentRunning = false;
  type PendingChange = { filePath: string; oldString: string; newString: string };
  let pendingChanges: PendingChange[] = [];
  let reviewPanel: HTMLDivElement | null = null;
  type ChatMessage = { role: "user" | "assistant" | "error"; content: string; createdAt: string; contextId?: string };
  type ScreenshotContext = { full?: string; element?: string };
  let chatHistory: ChatMessage[] = [];
  let changesHistory: Array<{ summary: string; changes: PendingChange[]; createdAt: string }> = [];
  let selectionId = "";
  let screenshotPromise: Promise<ScreenshotContext> = Promise.resolve({});
  let runtimeErrors: string[] = [];
  let promptDragged = false;
  let lastInstruction = "";
  type ModelOption = { id: string; label: string; provider: "anthropic" | "openai" | "google" | "ollama" };
  let refreshModelMenu = () => {};
  let modelFilter: "all" | ModelOption["provider"] = "all";
  const modelSessionKey = "lasso:selected-model";

  function storedModelId() {
    try {
      return window.sessionStorage.getItem(modelSessionKey);
    } catch {
      return null;
    }
  }

  function rememberModel(model: ModelOption) {
    try {
      window.sessionStorage.setItem(modelSessionKey, model.id);
    } catch {
      // Storage can be disabled by browser privacy settings.
    }
  }

  function setAgentStatus(status: "thinking" | "working" | "review" | "error" | "stopped", message: string) {
    if (!agentStatusElement || !agentStatusMessage) return;
    agentStatusElement.hidden = status === "review" || status === "error" || status === "stopped";
    agentStatusElement.dataset.status = status;
    agentStatusMessage.textContent = message;
    agentRunning = status === "thinking" || status === "working";
    if (agentRunning && agentLogElement && agentLogElement.lastElementChild?.textContent !== message) {
      const line = document.createElement("div");
      line.textContent = `› ${message}`;
      agentLogElement.appendChild(line);
      while (agentLogElement.children.length > 4) agentLogElement.firstElementChild?.remove();
    }
    sendButton.classList.toggle("loading", agentRunning);
    if (stopButton) stopButton.hidden = !agentRunning;
    promptInput.disabled = agentRunning;
    sendButton.disabled = agentRunning;
    sendButton.querySelector("span")!.textContent = status === "review" ? "Review" : status === "error" ? "Retry" : agentRunning ? "Working" : "Send";
    sendButton.dataset.state = status === "error" ? "retry" : agentRunning ? "working" : status;
    if (status === "review" || status === "error" || status === "stopped") appendChat(status === "error" ? "error" : "assistant", message);
  }

  function resetAgentState() {
    agentRunning = false;
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
    }
    if (stopButton) stopButton.hidden = true;
    if (promptInput) promptInput.disabled = false;
  }

  function connectBridge() {
    try {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      bridgeSocket = new WebSocket(`${protocol}//localhost:3056`);
      bridgeSocket.addEventListener("open", () => bridgeSocket?.send(JSON.stringify({ type: "hello", from: "overlay" })));
      bridgeSocket.addEventListener("message", (event) => {
        try {
          const message = JSON.parse(event.data as string) as { type?: string; apiKeyConfigured?: boolean; agentConfigured?: boolean; models?: ModelOption[]; git?: GitState; error?: string; status?: "thinking" | "working" | "review" | "error" | "stopped"; message?: string; changes?: PendingChange[] };
          if (message.type === "config") apiKeyConfigured = Boolean(message.apiKeyConfigured);
          if (message.type === "config" && message.models?.length) {
            MODELS = message.models;
            selectedModel = MODELS.find((model) => model.id === storedModelId()) || MODELS[0];
            rememberModel(selectedModel);
            refreshModelMenu();
          }
          if (message.type === "git_state" && message.git) renderGitState(message.git);
          if (message.type === "git_result") {
            gitMessage.textContent = message.error || message.message || "Git action complete.";
            if (!message.error && bridgeSocket?.readyState === WebSocket.OPEN) bridgeSocket.send(JSON.stringify({ type: "git_status" }));
          }
          if (message.type === "agent_status" && message.status && message.message) {
            setAgentStatus(message.status, message.message);
            if (message.status === "review" && message.changes?.length) {
              pendingChanges = message.changes;
              changesHistory.push({ summary: message.message, changes: message.changes, createdAt: new Date().toISOString() });
              showReview(message.changes, message.message);
            }
          }
          if (message.type === "applied" || message.type === "undone") {
            appendChat("assistant", message.message || "Done.");
            if (message.type === "undone") {
              closeReview();
              pendingChanges = [];
            } else {
              closeReview();
              pendingChanges = [];
            }
          }
        } catch {
          console.warn("[lasso] Invalid bridge message");
        }
      });
    } catch {
      bridgeSocket = null;
    }
  }

  // ============================================================
  // MODELS
  // ============================================================

  let MODELS: ModelOption[] = [
    { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash", provider: "google" },
    { id: "gemini-3.7-flash", label: "Gemini 3.7 Flash", provider: "google" },
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", provider: "google" },
    { id: "gpt-4.1-mini", label: "GPT-4.1 mini", provider: "openai" },
  ];

  let selectedModel: ModelOption =
    MODELS.find((model) => model.id === storedModelId()) || MODELS[0];

  // ============================================================
  // ELEMENT GROUPS
  // ============================================================

  const GROUPS = {
    layout: {
      color: "#3b82f6",
      background: "rgba(59, 130, 246, 0.06)",
      label: "Layout",
    },

    text: {
      color: "#8b5cf6",
      background: "rgba(139, 92, 246, 0.06)",
      label: "Text",
    },

    interactive: {
      color: "#10b981",
      background: "rgba(16, 185, 129, 0.06)",
      label: "Interactive",
    },

    media: {
      color: "#f59e0b",
      background: "rgba(245, 158, 11, 0.06)",
      label: "Media",
    },

    component: {
      color: "#ec4899",
      background: "rgba(236, 72, 153, 0.06)",
      label: "Component",
    },

    default: {
      color: "#6366f1",
      background: "rgba(99, 102, 241, 0.05)",
      label: "Element",
    },
  } as const;

  type ElementGroup = keyof typeof GROUPS;

  function getElementGroup(el: Element): ElementGroup {
    const tag = el.tagName.toLowerCase();

    // Interactive elements
    if (
      [
        "button",
        "a",
        "input",
        "textarea",
        "select",
        "option",
        "summary",
      ].includes(tag)
    ) {
      return "interactive";
    }

    // Media elements
    if (
      [
        "img",
        "video",
        "audio",
        "canvas",
        "svg",
        "picture",
        "iframe",
      ].includes(tag)
    ) {
      return "media";
    }

    // Text elements
    if (
      [
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "p",
        "span",
        "label",
        "blockquote",
        "small",
        "strong",
        "em",
        "code",
        "pre",
      ].includes(tag)
    ) {
      return "text";
    }

    // Layout elements
    if (
      [
        "div",
        "section",
        "main",
        "header",
        "footer",
        "nav",
        "article",
        "aside",
        "form",
        "ul",
        "ol",
        "li",
      ].includes(tag)
    ) {
      return "layout";
    }

    return "default";
  }

  // ============================================================
  // LASSO ROOT
  // ============================================================

  const root = document.createElement("div");

  root.id = "lasso-root";

  Object.assign(root.style, {
    position: "fixed",
    inset: "0",
    width: "100vw",
    height: "100vh",
    zIndex: "2147483647",
    pointerEvents: "none",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif',
  });

  document.documentElement.appendChild(root);

  // Shadow DOM isolates Lasso's styles from the user's website.
  const shadow = root.attachShadow({ mode: "open" });

  // ============================================================
  // STYLES
  // ============================================================

  const style = document.createElement("style");

  style.textContent = `
    * {
      box-sizing: border-box;
    }

    /* ==========================================================
       TOOLBAR
       ========================================================== */

    .lasso-toolbar {
      position: fixed;
      right: 20px;
      bottom: 20px;

      display: flex;
      align-items: center;
      gap: 6px;

      min-height: 44px;
      padding: 5px 7px;

      background: rgba(18, 18, 20, 0.96);

      border: 1px solid rgba(255, 255, 255, 0.10);
      border-radius: 999px;

      color: #fff;

      box-shadow:
        0 16px 40px rgba(0, 0, 0, 0.25),
        0 4px 12px rgba(0, 0, 0, 0.16);

      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);

      pointer-events: auto;

      user-select: none;
    }

    .lasso-select-btn {
      height: 34px;

      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;

      padding: 0 11px;

      border: 0;
      border-radius: 999px;

      background: transparent;
      color: #d1d5db;

      font-family: inherit;
      font-size: 13px;
      font-weight: 600;

      cursor: pointer;

      transition:
        background 120ms ease,
        color 120ms ease,
        transform 120ms ease;
    }

    .lasso-select-btn:hover {
      background: rgba(255, 255, 255, 0.08);
      color: #fff;
    }

    .lasso-select-btn:active {
      transform: scale(0.97);
    }

    .lasso-select-btn.active {
      background: rgba(99, 102, 241, 0.16);
      color: #a5b4fc;
    }

    .lasso-ask-btn {
      height: 34px;
      display: inline-flex;
      align-items: center;
      gap: 7px;
      padding: 0 13px;
      border: 1px solid rgba(255,255,255,.12);
      border-radius: 999px;
      background: #fff;
      color: #111827;
      font: 600 12px/1 inherit;
      cursor: pointer;
      transition: transform 120ms ease, background 120ms ease;
    }
    .lasso-git-btn {
      height: 34px;
      display: inline-flex;
      align-items: center;
      gap: 7px;
      padding: 0 12px;
      border: 1px solid rgba(255,255,255,.12);
      border-radius: 999px;
      background: rgba(255,255,255,.08);
      color: #dbeafe;
      font: 600 12px/1 inherit;
      cursor: pointer;
      transition: background 120ms ease, transform 120ms ease;
    }
    .lasso-git-btn:hover { background: rgba(255,255,255,.15); transform: translateY(-1px); }
    .lasso-git-panel { position: fixed; right: 20px; bottom: 76px; width: 310px; padding: 14px; border: 1px solid rgba(15,23,42,.1); border-radius: 16px; background: #fff; color: #0f172a; box-shadow: 0 20px 50px rgba(15,23,42,.2); pointer-events: auto; }
    .lasso-git-panel[hidden] { display: none; }
    .lasso-git-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
    .lasso-git-title { margin: 0; font-size: 13px; font-weight: 700; }
    .lasso-git-state { margin: 4px 0 0; color: #64748b; font-size: 11px; line-height: 1.4; }
    .lasso-git-close { border: 0; background: transparent; color: #94a3b8; font-size: 18px; cursor: pointer; }
    .lasso-git-branch { margin-bottom: 10px; padding: 8px 9px; border-radius: 8px; background: #f8fafc; color: #475569; font: 11px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace; }
    .lasso-git-actions { display: grid; gap: 7px; }
    .lasso-git-actions button { min-height: 32px; border: 1px solid #dbe2ea; border-radius: 8px; background: #fff; color: #334155; font: 600 11px/1 inherit; cursor: pointer; }
    .lasso-git-actions button.primary { border-color: #111827; background: #111827; color: #fff; }
    .lasso-git-actions button:disabled { cursor: not-allowed; opacity: .45; }
    .lasso-git-commit { width: 100%; min-height: 34px; margin-bottom: 7px; padding: 0 9px; border: 1px solid #dbe2ea; border-radius: 8px; outline: none; font: 12px/1 inherit; }
    .lasso-git-message { margin: 9px 0 0; color: #64748b; font-size: 10px; line-height: 1.4; }

    .lasso-icon {
      width: 16px;
      height: 16px;
      flex-shrink: 0;
    }

    .lasso-status {
      display: none;
      align-items: center;
      gap: 7px;

      padding: 0 7px 0 3px;

      color: #9ca3af;

      font-size: 11px;
      font-weight: 500;

      white-space: nowrap;
    }

    .lasso-status.visible {
      display: flex;
    }

    .lasso-dot {
      width: 6px;
      height: 6px;

      border-radius: 999px;

      background: #818cf8;

      box-shadow:
        0 0 0 3px rgba(99, 102, 241, 0.13);
    }

    /* ==========================================================
       HOVER / SELECTION BOX
       ========================================================== */

    .lasso-box {
      position: fixed;

      display: none;

      border-radius: 3px;

      pointer-events: none;

      transition:
        left 50ms ease,
        top 50ms ease,
        width 50ms ease,
        height 50ms ease;
    }

    .lasso-box.hover {
      border-width: 1px;
      border-style: solid;
    }

    .lasso-box.selected {
      border-width: 2px;
      border-style: solid;
    }

    /* ==========================================================
       ELEMENT LABEL
       ========================================================== */

    .lasso-label {
      position: fixed;

      display: none;
      align-items: center;

      height: 23px;

      padding: 0 8px;

      border-radius: 6px;

      color: #fff;

      font-size: 10px;
      font-weight: 600;

      line-height: 23px;

      white-space: nowrap;

      box-shadow:
        0 4px 12px rgba(0, 0, 0, 0.16);

      pointer-events: none;

      user-select: none;
    }

    /* ==========================================================
       PROMPT
       ========================================================== */

    @property --lasso-angle {
      syntax: "<angle>";
      initial-value: 0deg;
      inherits: false;
    }

    /* Thin wrapper that owns the spinning conic gradient ring.
       It paints BEHIND the static white card, so the browser only
       repaints the small ring, not the big fixed layer. */
    .lasso-prompt {
      position: fixed;

      width: 360px;

      display: none;

      padding: 1.5px;

      border-radius: 24px;

      background:
        conic-gradient(
          from var(--lasso-angle, 0deg),
          #f472b6,
          #a855f7 25%,
          #60a5fa 50%,
          #a855f7 75%,
          #f472b6
        );

      box-shadow:
        0 0 0 1px rgba(139, 92, 246, 0.05),
        0 0 22px rgba(168, 85, 247, 0.14),
        0 0 44px rgba(96, 165, 250, 0.09),
        0 24px 60px rgba(15, 23, 42, 0.12),
        0 8px 20px rgba(15, 23, 42, 0.06);

      pointer-events: auto;

      animation: lasso-prompt-rotate 5s linear infinite;
    }

    .lasso-prompt.visible {
      display: block;
    }

    /* Static white card on top of the spinning ring. */
    .lasso-prompt-card {
      display: flex;
      flex-direction: column;

      padding: 18px 18px 14px;

      font-family: "Google Sans", "Google Sans Text", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;

      background: #ffffff;

      border-radius: 22.5px;

      animation: lasso-prompt-in 130ms ease-out;
    }

    @keyframes lasso-prompt-in {
      from {
        opacity: 0;
        transform: translateY(-5px) scale(0.98);
      }

      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }

    @keyframes lasso-prompt-rotate {
      to {
        --lasso-angle: 360deg;
      }
    }

    .lasso-prompt-top {
      display: flex;
      align-items: center;
      gap: 8px;

      margin-bottom: 10px;
      cursor: grab;
      touch-action: none;
    }
    .lasso-prompt-top:active { cursor: grabbing; }

    .lasso-prompt-ai {
      width: 24px;
      height: 24px;

      display: flex;
      align-items: center;
      justify-content: center;

      flex-shrink: 0;
    }

    .lasso-prompt-model-wrap {
      position: relative;
    }

    .lasso-prompt-model {
      height: 26px;

      display: flex;
      align-items: center;
      gap: 5px;

      padding: 0 8px;

      border: 1px solid rgba(15, 23, 42, 0.07);
      border-radius: 999px;

      background: rgba(15, 23, 42, 0.04);
      color: #374151;

      font-family: inherit;
      font-size: 11px;
      font-weight: 600;

      cursor: pointer;

      transition:
        background 120ms ease,
        border-color 120ms ease;
    }

    .lasso-prompt-model:hover {
      background: rgba(15, 23, 42, 0.07);
      border-color: rgba(15, 23, 42, 0.12);
    }

    .lasso-prompt-model-menu {
      position: absolute;

      top: calc(100% + 6px);
      left: 0;

      min-width: 180px;

      padding: 4px;

      background: #ffffff;

      border: 1px solid rgba(15, 23, 42, 0.08);
      border-radius: 12px;

      box-shadow:
        0 16px 40px rgba(15, 23, 42, 0.14),
        0 4px 12px rgba(15, 23, 42, 0.08);

      z-index: 20;
    }

    .lasso-prompt-model-menu[hidden] {
      display: none;
    }
    .lasso-model-filters { display: flex; gap: 4px; padding: 4px; border-bottom: 1px solid #eef2f7; }
    .lasso-model-filter { border: 0; border-radius: 7px; padding: 5px 7px; background: transparent; color: #64748b; font: 600 10px/1 inherit; cursor: pointer; }
    .lasso-model-filter:hover, .lasso-model-filter.active { background: #eef2ff; color: #4f46e5; }
    .lasso-model-group { padding: 7px 9px 3px; color: #94a3b8; font-size: 9px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
    .lasso-model-item-icon, .lasso-model-active-icon { display: inline-flex; width: 16px; height: 16px; align-items: center; justify-content: center; flex-shrink: 0; border-radius: 5px; overflow: hidden; }
    .lasso-model-item-icon svg, .lasso-model-active-icon svg { display: block; width: 100%; height: 100%; }
    .lasso-model-active-icon { width: 14px; height: 14px; margin-right: 5px; vertical-align: -2px; }
    .provider-google { background: #e8f0fe; color: #4285f4; }
    .provider-openai { background: #e7f8f0; color: #16835b; }
    .provider-anthropic { background: #fff0e6; color: #c2410c; }
    .provider-ollama { background: #eef2f7; color: #475569; }

    .lasso-prompt-model-item {
      width: 100%;

      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;

      padding: 7px 9px;

      border: 0;
      border-radius: 8px;

      background: transparent;
      color: #374151;

      font-family: inherit;
      font-size: 12px;
      font-weight: 500;
      text-align: left;

      cursor: pointer;

      transition: background 120ms ease;
    }

    .lasso-prompt-model-item:hover {
      background: rgba(15, 23, 42, 0.05);
    }

    .lasso-prompt-model-item .lasso-prompt-model-check {
      flex-shrink: 0;

      color: #6366f1;

      opacity: 0;
    }

    .lasso-prompt-model-item.selected
      .lasso-prompt-model-check {
      opacity: 1;
    }

    .lasso-prompt-element {
      min-width: 0;

      margin-left: auto;

      overflow: hidden;

      color: #9ca3af;

      font-size: 11px;
      font-weight: 500;

      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .lasso-prompt-element { display: inline-flex; align-items: center; gap: 5px; }
    .lasso-prompt-element svg { width: 13px; height: 13px; flex-shrink: 0; color: #6366f1; }

    .lasso-prompt-close {
      width: 26px;
      height: 26px;

      display: flex;
      align-items: center;
      justify-content: center;

      flex-shrink: 0;

      border: 0;
      border-radius: 8px;

      background: transparent;
      color: #9ca3af;

      cursor: pointer;

      transition:
        background 120ms ease,
        color 120ms ease;
    }

    .lasso-prompt-close:hover {
      background: rgba(15, 23, 42, 0.06);
      color: #111827;
    }

    .lasso-prompt-input {
      width: 100%;

      min-height: 64px;
      max-height: 140px;

      padding: 2px 2px 10px;

      resize: none;

      border: 0;
      outline: none;

      background: transparent;
      color: #111827;

      font-family: inherit;
      font-size: 14px;
      line-height: 22px;
    }

    .lasso-prompt-input::placeholder {
      color: #9ca3af;
    }

    .lasso-chat-thread {
      display: flex;
      flex-direction: column;
      gap: 7px;
      max-height: 118px;
      overflow: auto;
      margin: -2px 0 10px;
      padding-right: 2px;
    }
    .lasso-chat-message {
      max-width: 92%;
      padding: 8px 10px;
      border-radius: 10px;
      color: #475569;
      background: #f4f6fa;
      font-size: 11px;
      line-height: 1.45;
    }
    .lasso-chat-message.user { align-self: flex-end; color: #fff; background: #111827; }
    .lasso-chat-message.error { color: #b3261e; background: #fef2f2; }
    .lasso-review {
      position: fixed;
      width: min(520px, calc(100vw - 24px));
      max-height: min(620px, calc(100vh - 24px));
      overflow: auto;
      padding: 18px;
      border: 1px solid #e2e8f0;
      border-radius: 18px;
      background: #fff;
      color: #0f172a;
      box-shadow: 0 24px 70px rgba(15, 23, 42, .22), 0 2px 8px rgba(15, 23, 42, .08);
      pointer-events: auto;
      font-family: inherit;
    }
    .lasso-review[hidden] { display: none; }
    .lasso-review-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 14px; }
    .lasso-review-title { margin: 0; font-size: 15px; font-weight: 700; }
    .lasso-review-subtitle { margin: 4px 0 0; color: #64748b; font-size: 11px; line-height: 1.4; }
    .lasso-review-file { margin-top: 10px; overflow: hidden; border: 1px solid #e2e8f0; border-radius: 10px; }
    .lasso-review-file-name { padding: 8px 10px; background: #f8fafc; color: #475569; font: 600 11px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; }
    .lasso-review-code { display: grid; grid-template-columns: 1fr 1fr; min-width: 0; }
    .lasso-review-code pre { min-width: 0; margin: 0; padding: 10px; overflow: auto; font: 10px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; word-break: break-word; }
    .lasso-review-old { color: #991b1b; background: #fff7f7; }
    .lasso-review-new { color: #166534; background: #f3fff6; }
    .lasso-review-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
    .lasso-review-actions button { min-height: 34px; padding: 0 13px; border: 1px solid #dbe2ea; border-radius: 9px; background: #fff; color: #475569; font: 600 12px/1 inherit; cursor: pointer; }
    .lasso-review-actions .primary { border-color: #111827; background: #111827; color: #fff; }
    .lasso-review-actions button:hover { transform: translateY(-1px); }

    .lasso-agent-status {
      display: grid;
      grid-template-columns: 7px auto 1fr;
      align-items: center;
      gap: 8px;
      margin: 0 0 10px;
      padding: 9px 10px;
      border-radius: 9px;
      background: #f5f7fb;
      color: #64748b;
      font-size: 11px;
      line-height: 1.35;
    }

    .lasso-agent-status[hidden] { display: none; }
    .lasso-agent-status-kicker { color: #94a3b8; font-size: 10px; font-weight: 700; letter-spacing: .02em; white-space: nowrap; }
    .lasso-agent-status-message { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .lasso-agent-log { grid-column: 1 / -1; display: grid; gap: 3px; margin: 2px 0 0 17px; color: #64748b; font: 10px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; }
    .lasso-agent-log div { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .lasso-agent-status[data-status="review"] { background: #ecfdf3; color: #188038; }
    .lasso-agent-status[data-status="error"] { background: #fef2f2; color: #b3261e; }
    .lasso-agent-status-dot { width: 7px; height: 7px; flex-shrink: 0; border-radius: 50%; background: #6366f1; animation: lasso-agent-pulse 1.2s ease-in-out infinite; }
    .lasso-agent-status[data-status="thinking"] .lasso-agent-status-dot,
    .lasso-agent-status[data-status="working"] .lasso-agent-status-dot { width: 10px; height: 10px; border: 2px solid #c7d2fe; border-top-color: #6366f1; background: transparent; animation: lasso-agent-spin .8s linear infinite; }
    [data-status="review"] .lasso-agent-status-dot { background: #188038; animation: none; }
    [data-status="error"] .lasso-agent-status-dot { background: #b3261e; animation: none; }
    @keyframes lasso-agent-pulse { 50% { opacity: .35; transform: scale(.75); } }
    @keyframes lasso-agent-spin { to { transform: rotate(360deg); } }

    .lasso-prompt-actions {
      display: flex;
      align-items: center;
      justify-content: space-between;

      gap: 8px;

      padding-top: 12px;
    }

    .lasso-prompt-upload {
      width: 34px;
      height: 34px;

      display: flex;
      align-items: center;
      justify-content: center;

      border: 1px solid rgba(15, 23, 42, 0.10);
      border-radius: 10px;

      background: #ffffff;
      color: #64748b;

      cursor: pointer;

      transition:
        background 120ms ease,
        border-color 120ms ease,
        color 120ms ease;
    }

    .lasso-prompt-upload:hover {
      background: #f8fafc;
      border-color: rgba(15, 23, 42, 0.18);
      color: #334155;
    }
    .lasso-prompt-voice { width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; border: 1px solid rgba(15,23,42,.1); border-radius: 10px; background: #f8fafc; color: #94a3b8; cursor: not-allowed; opacity: .72; }
    .lasso-prompt-voice:hover::after { content: "Coming soon"; position: absolute; transform: translateY(-38px); padding: 5px 7px; border-radius: 6px; background: #0f172a; color: #fff; font-size: 10px; white-space: nowrap; }
    .lasso-prompt-stop { width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; border: 1px solid #fecaca; border-radius: 10px; background: #fff5f5; color: #b91c1c; cursor: pointer; }
    .lasso-prompt-stop[hidden] { display: none; }
    .lasso-prompt-stop:hover { background: #fee2e2; }

    .lasso-prompt-send {
      height: 34px;

      display: flex;
      align-items: center;
      justify-content: center;
      gap: 7px;

      padding: 0 16px;

      border: 0;
      border-radius: 10px;

      background: #0f172a;
      color: #ffffff;

      font-family: inherit;
      font-size: 13px;
      font-weight: 600;

      cursor: pointer;

      transition:
        background 120ms ease,
        transform 120ms ease;
    }

    .lasso-prompt-send:hover {
      background: #1e293b;
    }

    .lasso-prompt-send:active {
      transform: scale(0.96);
    }
    .lasso-prompt-send.loading { min-width: 92px; cursor: wait; opacity: .9; }
    .lasso-prompt-send.loading svg { display: none; }
    .lasso-prompt-send.loading::before { content: ""; width: 13px; height: 13px; border: 2px solid rgba(255,255,255,.45); border-top-color: #fff; border-radius: 50%; animation: lasso-agent-spin .7s linear infinite; }
  `;

  shadow.appendChild(style);

  // ============================================================
  // TOOLBAR
  // ============================================================

  const toolbar = document.createElement("div");

  toolbar.className = "lasso-toolbar";

  toolbar.innerHTML = `
    <button
      class="lasso-select-btn"
      type="button"
      aria-label="Select an element"
    >
      <svg
        class="lasso-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M5 3l14 8-6 2-3 7-5-17z"/>
      </svg>

      <span class="lasso-select-text">
        Lasso Mode
      </span>
    </button>

    <button class="lasso-git-btn" type="button" aria-label="Git project actions">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="m9 7-5 5 5 5"/><path d="m15 7 5 5-5 5"/><path d="m14 4-4 16"/>
      </svg>
      <span>Git</span>
    </button>
  `;

  shadow.appendChild(toolbar);

  type GitState = { isRepo: boolean; branch?: string; status?: string[]; hasChanges?: boolean; hasRemote?: boolean; remote?: string };
  let gitState: GitState = { isRepo: false };
  const gitPanel = document.createElement("div");
  gitPanel.className = "lasso-git-panel";
  gitPanel.hidden = true;
  gitPanel.innerHTML = `
    <div class="lasso-git-head"><div><p class="lasso-git-title">Git workspace</p><p class="lasso-git-state"></p></div><button class="lasso-git-close" type="button" aria-label="Close Git actions">×</button></div>
    <div class="lasso-git-branch"></div>
    <input class="lasso-git-commit" type="text" placeholder="Commit message" />
    <div class="lasso-git-actions"><button class="lasso-git-init" type="button">Initialize repository</button><button class="lasso-git-commit-btn primary" type="button">Commit changes</button><button class="lasso-git-push" type="button">Push changes</button></div>
    <p class="lasso-git-message" aria-live="polite"></p>
  `;
  shadow.appendChild(gitPanel);

  const selectBtn =
    toolbar.querySelector<HTMLButtonElement>(
      ".lasso-select-btn"
    )!;

  const selectText =
    toolbar.querySelector<HTMLSpanElement>(
      ".lasso-select-text"
    )!;

  const gitBtn = toolbar.querySelector<HTMLButtonElement>(".lasso-git-btn")!;
  const gitStateText = gitPanel.querySelector<HTMLParagraphElement>(".lasso-git-state")!;
  const gitBranchText = gitPanel.querySelector<HTMLDivElement>(".lasso-git-branch")!;
  const gitCommitInput = gitPanel.querySelector<HTMLInputElement>(".lasso-git-commit")!;
  const gitMessage = gitPanel.querySelector<HTMLParagraphElement>(".lasso-git-message")!;

  function renderGitState(next: GitState) {
    gitState = next;
    gitStateText.textContent = !next.isRepo ? "This project is not initialized yet." : next.hasChanges ? `${next.status?.length || 0} change${next.status?.length === 1 ? "" : "s"} ready to commit.` : "Working tree clean.";
    gitBranchText.textContent = next.isRepo ? `Branch: ${next.branch || "detached HEAD"}${next.hasRemote ? " · remote connected" : " · no remote"}` : "No Git repository";
    gitPanel.querySelector<HTMLButtonElement>(".lasso-git-init")!.hidden = next.isRepo;
    gitPanel.querySelector<HTMLButtonElement>(".lasso-git-commit-btn")!.disabled = !next.isRepo || !next.hasChanges;
    gitPanel.querySelector<HTMLButtonElement>(".lasso-git-push")!.disabled = !next.isRepo || !next.hasRemote;
  }

  gitBtn.addEventListener("click", () => {
    gitPanel.hidden = !gitPanel.hidden;
    if (!gitPanel.hidden && bridgeSocket?.readyState === WebSocket.OPEN) bridgeSocket.send(JSON.stringify({ type: "git_status" }));
  });
  gitPanel.querySelector<HTMLButtonElement>(".lasso-git-close")!.addEventListener("click", () => { gitPanel.hidden = true; });
  gitPanel.querySelector<HTMLButtonElement>(".lasso-git-init")!.addEventListener("click", () => bridgeSocket?.send(JSON.stringify({ type: "git_init" })));
  gitPanel.querySelector<HTMLButtonElement>(".lasso-git-commit-btn")!.addEventListener("click", () => bridgeSocket?.send(JSON.stringify({ type: "git_commit", message: gitCommitInput.value })));
  gitPanel.querySelector<HTMLButtonElement>(".lasso-git-push")!.addEventListener("click", () => bridgeSocket?.send(JSON.stringify({ type: "git_push" })));

  // ============================================================
  // VISUAL OVERLAYS
  // ============================================================

  const hoverBox = document.createElement("div");

  hoverBox.className = "lasso-box hover";

  const selectedBox = document.createElement("div");

  selectedBox.className = "lasso-box selected";

  const label = document.createElement("div");

  label.className = "lasso-label";

  shadow.appendChild(hoverBox);
  shadow.appendChild(selectedBox);
  shadow.appendChild(label);

  // ============================================================
  // PROMPT
  // ============================================================

  const prompt = document.createElement("div");

  prompt.className = "lasso-prompt";

  prompt.innerHTML = `
    <div class="lasso-prompt-card">
    <div class="lasso-prompt-top">

      <div class="lasso-prompt-ai">
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="url(#lasso-ai-grad)"
        >
          <defs>
            <linearGradient
              id="lasso-ai-grad"
              x1="0"
              y1="0"
              x2="1"
              y2="1"
            >
              <stop offset="0" stop-color="#c084fc"/>
              <stop offset="0.55" stop-color="#818cf8"/>
              <stop offset="1" stop-color="#60a5fa"/>
            </linearGradient>
          </defs>
          <path
            d="M12 2l1.9 5.9 5.9 1.9-5.9 1.9L12 17.6l-1.9-5.9L4.2 9.8l5.9-1.9L12 2z"
          />
        </svg>
      </div>

      <div class="lasso-prompt-model-wrap">

        <button
          class="lasso-prompt-model"
          type="button"
          aria-label="Choose model"
        >
          <span class="lasso-prompt-model-name">Claude Sonnet 4.5</span>
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </button>

        <div class="lasso-prompt-model-menu" hidden></div>
      </div>

      <span class="lasso-prompt-element">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16v14H4z"/><path d="M8 9h8M8 13h5"/></svg>
        <span class="lasso-prompt-element-name"></span>
      </span>

      <button
        class="lasso-prompt-close"
        type="button"
        aria-label="Cancel"
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M18 6L6 18"/>
          <path d="M6 6l12 12"/>
        </svg>
      </button>
    </div>

    <div class="lasso-chat-thread" aria-live="polite"></div>

    <div class="lasso-agent-status" hidden aria-live="polite">
      <span class="lasso-agent-status-dot"></span>
      <span class="lasso-agent-status-kicker">Lasso agent</span>
      <span class="lasso-agent-status-message"></span>
      <div class="lasso-agent-log" aria-label="Agent activity"></div>
    </div>

    <textarea
      class="lasso-prompt-input"
      placeholder="Ask Anything about your performance"
      rows="1"
    ></textarea>

    <div class="lasso-prompt-actions">

      <button
        class="lasso-prompt-upload"
        type="button"
        aria-label="Upload"
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <path d="M17 8l-5-5-5 5"/>
          <path d="M12 3v12"/>
        </svg>
      </button>

      <button class="lasso-prompt-voice" type="button" disabled aria-label="Voice mode coming soon" title="Voice mode coming soon">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8"/></svg>
      </button>

      <button class="lasso-prompt-stop" type="button" hidden aria-label="Stop agent">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
      </button>

      <button
        class="lasso-prompt-send"
        type="button"
        aria-label="Send edit request"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M7 7h10v10"/>
          <path d="M7 17L17 7"/>
        </svg>
        <span>Send</span>
      </button>
    </div>
    </div>
  `;

  shadow.appendChild(prompt);

  reviewPanel = document.createElement("div");
  reviewPanel.className = "lasso-review";
  reviewPanel.hidden = true;
  reviewPanel.innerHTML = `
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
  shadow.appendChild(reviewPanel);

  function appendChat(role: "user" | "assistant" | "error", text: string) {
    const thread = prompt?.querySelector<HTMLDivElement>(".lasso-chat-thread");
    if (!thread || !text.trim()) return;
    const previous = thread.lastElementChild;
    if (previous?.textContent === text && previous.classList.contains(role)) return;
    chatHistory.push({ role, content: text, createdAt: new Date().toISOString(), contextId: selectionId || undefined });
    const item = document.createElement("div");
    item.className = `lasso-chat-message ${role}`;
    item.textContent = text;
    thread.appendChild(item);
    while (thread.children.length > 6) thread.firstElementChild?.remove();
    thread.scrollTop = thread.scrollHeight;
  }

  function closeReview() {
    if (reviewPanel) reviewPanel.hidden = true;
    resetAgentState();
  }

  function showReview(changes: PendingChange[], summary: string) {
    if (!reviewPanel) return;
    const subtitle = reviewPanel.querySelector<HTMLParagraphElement>(".lasso-review-subtitle");
    const files = reviewPanel.querySelector<HTMLDivElement>(".lasso-review-files");
    if (!subtitle || !files) return;
    subtitle.textContent = `${summary} ${changes.length} file${changes.length === 1 ? "" : "s"} proposed.`;
    files.replaceChildren(...changes.map((change) => {
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
    }));
    reviewPanel.hidden = false;
    const left = Math.max(12, (window.innerWidth - Math.min(520, window.innerWidth - 24)) / 2);
    const top = Math.max(12, (window.innerHeight - Math.min(620, window.innerHeight - 24)) / 2);
    reviewPanel.style.left = `${left}px`;
    reviewPanel.style.top = `${top}px`;
  }

  const promptInput =
    prompt.querySelector<HTMLTextAreaElement>(
      ".lasso-prompt-input"
    )!;

  const promptElement =
    prompt.querySelector<HTMLSpanElement>(
      ".lasso-prompt-element-name"
    )!;

  const sendButton =
    prompt.querySelector<HTMLButtonElement>(
      ".lasso-prompt-send"
    )!;

  const stopButton = prompt.querySelector<HTMLButtonElement>(".lasso-prompt-stop")!;

  const promptClose =
    prompt.querySelector<HTMLButtonElement>(
      ".lasso-prompt-close"
    )!;

  const promptTop = prompt.querySelector<HTMLDivElement>(".lasso-prompt-top")!;
  let dragState: { startX: number; startY: number; left: number; top: number } | null = null;
  promptTop.addEventListener("pointerdown", (event) => {
    const target = event.target as HTMLElement;
    if (target.closest("button")) return;
    const rect = prompt.getBoundingClientRect();
    dragState = { startX: event.clientX, startY: event.clientY, left: rect.left, top: rect.top };
    promptDragged = true;
    promptTop.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  });
  promptTop.addEventListener("pointermove", (event) => {
    if (!dragState) return;
    const rect = prompt.getBoundingClientRect();
    const left = Math.max(12, Math.min(window.innerWidth - rect.width - 12, dragState.left + event.clientX - dragState.startX));
    const top = Math.max(12, Math.min(window.innerHeight - rect.height - 12, dragState.top + event.clientY - dragState.startY));
    prompt.style.left = `${left}px`;
    prompt.style.top = `${top}px`;
  });
  const stopPromptDrag = () => { dragState = null; };
  promptTop.addEventListener("pointerup", stopPromptDrag);
  promptTop.addEventListener("pointercancel", stopPromptDrag);

  agentStatusElement = prompt.querySelector<HTMLDivElement>(".lasso-agent-status")!;
  agentStatusMessage = prompt.querySelector<HTMLSpanElement>(".lasso-agent-status-message")!;
  agentLogElement = prompt.querySelector<HTMLDivElement>(".lasso-agent-log")!;
  stopButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (bridgeSocket?.readyState === WebSocket.OPEN) bridgeSocket.send(JSON.stringify({ type: "stop" }));
    appendChat("assistant", "Agent stopped.");
    resetAgentState();
  });
  connectBridge();

  function reportRuntimeError(details: string) {
    const clean = details.slice(0, 1200);
    if (!clean || runtimeErrors.includes(clean)) return;
    runtimeErrors = [...runtimeErrors.slice(-4), clean];
    if (bridgeSocket?.readyState === WebSocket.OPEN) {
      bridgeSocket.send(JSON.stringify({ type: "runtime_error", selectionId, details: clean }));
    }
  }

  window.addEventListener("error", (event) => {
    reportRuntimeError(`${event.message || "Runtime error"}${event.filename ? ` · ${event.filename}:${event.lineno}` : ""}`);
  });
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason instanceof Error ? event.reason.message : String(event.reason || "Unhandled promise rejection");
    reportRuntimeError(reason);
  });

  reviewPanel!.querySelector<HTMLButtonElement>(".lasso-review-close")!.addEventListener("click", closeReview);
  reviewPanel!.querySelector<HTMLButtonElement>(".lasso-review-undo")!.addEventListener("click", () => {
    if (pendingChanges.length && reviewPanel!.querySelector<HTMLButtonElement>(".lasso-review-apply")!.hidden) {
      if (bridgeSocket?.readyState === WebSocket.OPEN) bridgeSocket.send(JSON.stringify({ type: "undo" }));
      return;
    }
    closeReview();
    appendChat("assistant", "Kept as a proposal. Nothing was changed.");
  });
  reviewPanel!.querySelector<HTMLButtonElement>(".lasso-review-apply")!.addEventListener("click", () => {
    if (!bridgeSocket || bridgeSocket.readyState !== WebSocket.OPEN || !pendingChanges.length) return;
    bridgeSocket.send(JSON.stringify({ type: "apply", changes: pendingChanges }));
    appendChat("assistant", "Applying the reviewed change…");
  });

  const modelBtn =
    prompt.querySelector<HTMLButtonElement>(
      ".lasso-prompt-model"
    )!;

  const modelName =
    prompt.querySelector<HTMLSpanElement>(
      ".lasso-prompt-model-name"
    )!;

  const modelMenu =
    prompt.querySelector<HTMLDivElement>(
      ".lasso-prompt-model-menu"
    )!;

  // ============================================================
  // MODEL SELECTION
  // ============================================================

  const providerLabels: Record<ModelOption["provider"], string> = { google: "Google", openai: "OpenAI", anthropic: "Anthropic", ollama: "Local" };
  const providerIcons = { google: googleIcon, openai: openaiIcon, anthropic: anthropicIcon, ollama: terminalIcon };
  const providerIcon = (provider: ModelOption["provider"], active = false) => {
    const icon = providerIcons[provider];
    return `<span class="${active ? "lasso-model-active-icon" : "lasso-model-item-icon"} provider-${provider}" aria-hidden="true"><svg viewBox="0 0 ${icon.width} ${icon.height}" xmlns="http://www.w3.org/2000/svg" focusable="false">${icon.body}</svg></span>`;
  };

  refreshModelMenu = () => {
    const filters = document.createElement("div");
    filters.className = "lasso-model-filters";
    const providers = ["all", ...Array.from(new Set(MODELS.map((model) => model.provider)))];
    for (const provider of providers) {
      const filter = document.createElement("button");
      filter.type = "button";
      filter.className = `lasso-model-filter${modelFilter === provider ? " active" : ""}`;
      filter.dataset.providerFilter = provider;
      filter.textContent = provider === "all" ? "All" : providerLabels[provider as ModelOption["provider"]];
      filters.appendChild(filter);
    }
    const children: Node[] = [filters];
    const visibleProviders = modelFilter === "all" ? providers.slice(1) : [modelFilter];
    for (const provider of visibleProviders) {
      const models = MODELS.filter((model) => model.provider === provider);
      if (!models.length) continue;
      const group = document.createElement("div");
      group.className = "lasso-model-group";
      group.textContent = providerLabels[provider as ModelOption["provider"]];
      children.push(group);
      for (const model of models) {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "lasso-prompt-model-item";
        item.dataset.model = model.id;
        item.innerHTML = `${providerIcon(model.provider)}<span>${model.label}</span><svg class="lasso-prompt-model-check" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>`;
        children.push(item);
      }
    }
    modelMenu.replaceChildren(...children);
    syncModelMenu();
  };
  refreshModelMenu();

  function syncModelMenu() {
    modelName.innerHTML = `${providerIcon(selectedModel.provider, true)}${selectedModel.label}`;

    for (const item of modelMenu.querySelectorAll<
      HTMLButtonElement
    >(".lasso-prompt-model-item")) {
      item.classList.toggle(
        "selected",
        item.dataset.model ===
          selectedModel.id
      );
    }
  }

  modelBtn.addEventListener(
    "click",
    (event) => {
      event.preventDefault();
      event.stopPropagation();

      modelMenu.hidden = !modelMenu.hidden;
    }
  );

  modelMenu.addEventListener(
    "click",
    (event) => {
      const filter = (event.target as HTMLElement).closest<HTMLButtonElement>(".lasso-model-filter");
      if (filter?.dataset.providerFilter) {
        modelFilter = filter.dataset.providerFilter as typeof modelFilter;
        refreshModelMenu();
        return;
      }
      const item = (
        event.target as HTMLElement
      ).closest<HTMLButtonElement>(
        ".lasso-prompt-model-item"
      );

      if (!item) return;

      const found = MODELS.find(
        (model) =>
          model.id ===
          item.dataset.model
      );

      if (!found) return;

      selectedModel = found;
      rememberModel(found);

      syncModelMenu();

      modelMenu.hidden = true;
    }
  );

  document.addEventListener(
    "click",
    (event) => {
      if (modelMenu.hidden) return;

      const target =
        event.target as Node;

      if (
        modelBtn.contains(target) ||
        modelMenu.contains(target)
      ) {
        return;
      }

      modelMenu.hidden = true;
    }
  );

  syncModelMenu();

  // ============================================================
  // HELPERS
  // ============================================================

  function isLassoElement(
    el: Element | null
  ): boolean {
    if (!el) return false;

    return (
      el === root ||
      root.contains(el) ||
      shadow.host.contains(el) ||
      el.getRootNode() === shadow
    );
  }

  function getTargetElement(
    target: EventTarget | null
  ): Element | null {
    if (!(target instanceof Element)) {
      return null;
    }

    if (isLassoElement(target)) {
      return null;
    }

    return target;
  }

  function getElementLabel(
    el: Element
  ): string {
    const tag = el.tagName.toLowerCase();

    if (el.id) {
      return `${tag}#${el.id}`;
    }

    if (
      typeof el.className === "string" &&
      el.className.trim()
    ) {
      const firstClass = el.className
        .trim()
        .split(/\s+/)[0];

      if (firstClass) {
        return `${tag}.${firstClass}`;
      }
    }

    return `<${tag}>`;
  }

  function getSourceHint(el: Element): string | undefined {
    for (const key of Object.keys(el)) {
      if (!key.startsWith("__reactFiber") && !key.startsWith("__reactInternalInstance")) continue;
      let fiber: any = (el as any)[key];
      for (let depth = 0; fiber && depth < 12; depth += 1, fiber = fiber.return) {
        const source = fiber?._debugSource;
        if (source?.fileName) return `${source.fileName}:${source.lineNumber || 1}`;
      }
    }
    return undefined;
  }

  async function captureScreenshots(el: Element): Promise<ScreenshotContext> {
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

  function positionBox(
    box: HTMLElement,
    el: Element | null
  ) {
    if (!el) {
      box.style.display = "none";
      return;
    }

    const rect = el.getBoundingClientRect();

    if (
      rect.width === 0 ||
      rect.height === 0
    ) {
      box.style.display = "none";
      return;
    }

    box.style.display = "block";

    box.style.left = `${rect.left}px`;
    box.style.top = `${rect.top}px`;
    box.style.width = `${rect.width}px`;
    box.style.height = `${rect.height}px`;
  }

  // ============================================================
  // HOVER
  // ============================================================

  function updateHoverVisual(
    el: Element | null
  ) {
    if (!el) {
      hoverBox.style.display = "none";
      label.style.display = "none";
      return;
    }

    const rect = el.getBoundingClientRect();

    if (
      rect.width === 0 ||
      rect.height === 0
    ) {
      hoverBox.style.display = "none";
      label.style.display = "none";
      return;
    }

    const group = getElementGroup(el);
    const config = GROUPS[group];

    // Box
    hoverBox.style.display = "block";

    hoverBox.style.left = `${rect.left}px`;
    hoverBox.style.top = `${rect.top}px`;
    hoverBox.style.width = `${rect.width}px`;
    hoverBox.style.height = `${rect.height}px`;

    hoverBox.style.borderColor = config.color;
    hoverBox.style.background = config.background;

    // Label
    label.textContent =
      `${config.label} · ${getElementLabel(el)}`;

    label.style.background = config.color;

    let labelTop = rect.top - 29;

    if (labelTop < 6) {
      labelTop = rect.bottom + 6;
    }

    let labelLeft = rect.left;

    labelLeft = Math.max(
      6,
      Math.min(
        labelLeft,
        window.innerWidth - 190
      )
    );

    label.style.left = `${labelLeft}px`;
    label.style.top = `${labelTop}px`;
    label.style.display = "flex";
  }

  function setHovered(
    el: Element | null
  ) {
    if (hovered === el) return;

    hovered = el;

    updateHoverVisual(hovered);
  }

  // ============================================================
  // SELECTED VISUAL
  // ============================================================

  function updateSelectedVisual() {
    if (!selected) {
      selectedBox.style.display = "none";
      return;
    }

    const group = getElementGroup(selected);
    const config = GROUPS[group];

    positionBox(
      selectedBox,
      selected
    );

    selectedBox.style.borderColor =
      config.color;

    selectedBox.style.background =
      config.background;
  }

  // ============================================================
  // PROMPT POSITION
  // ============================================================

  function positionPrompt(
    el: Element
  ) {
    const rect = el.getBoundingClientRect();

    const promptWidth = 360;
    const promptHeight = 200;
    const gap = 12;

    let left = rect.right + gap;
    let top = rect.top;

    // Right side doesn't fit.
    if (
      left + promptWidth >
      window.innerWidth - 12
    ) {
      left =
        rect.left -
        promptWidth -
        gap;
    }

    // Left side doesn't fit.
    if (left < 12) {
      left = Math.max(
        12,
        rect.left
      );

      top =
        rect.bottom +
        gap;
    }

    // Bottom doesn't fit.
    if (
      top + promptHeight >
      window.innerHeight - 12
    ) {
      top =
        rect.bottom -
        promptHeight;
    }

    // Final viewport clamp.
    left = Math.max(
      12,
      Math.min(
        left,
        window.innerWidth -
          promptWidth -
          12
      )
    );

    top = Math.max(
      12,
      Math.min(
        top,
        window.innerHeight -
          promptHeight -
          12
      )
    );

    prompt.style.left = `${left}px`;
    prompt.style.top = `${top}px`;
  }

  // ============================================================
  // SELECT MODE
  // ============================================================

  function setSelectMode(
    active: boolean
  ) {
    selectMode = active;

    selectBtn.classList.toggle(
      "active",
      active
    );

    selectText.textContent =
      active
        ? "Lasso Mode ✓"
        : "Lasso Mode";

    document.documentElement.style.cursor =
      active
        ? "crosshair"
        : "";

    if (!active) {
      setHovered(null);
    }
  }

  selectBtn.addEventListener(
    "click",
    (event) => {
      event.preventDefault();
      event.stopPropagation();

      const next =
        !selectMode;

      // Starting a fresh selection session:
      // drop any open prompt and prior pick.
      if (next) {
        cancelPrompt(false);

        setSelectMode(true);

        return;
      }

      setSelectMode(false);
    }
  );

  // ============================================================
  // HOVER DETECTION
  //
  // Capture phase lets us reliably inspect the real element
  // underneath the cursor.
  // ============================================================

  document.addEventListener(
    "mousemove",
    (event) => {
      if (!selectMode) return;

      const target =
        event.target;

      if (
        !(target instanceof Element)
      ) {
        return;
      }

      if (
        isLassoElement(target)
      ) {
        return;
      }

      setHovered(target);
    },
    true
  );

  // ============================================================
  // SELECTION
  //
  // Capture phase + preventDefault prevents the actual website
  // from activating links, buttons, forms, etc.
  // ============================================================

  document.addEventListener(
    "click",
    (event) => {
      if (!selectMode) {
        return;
      }

      const target =
        getTargetElement(
          event.target
        );

      if (!target) {
        return;
      }

      // Stop the website's click behavior.
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      selected = target;
      promptDragged = false;
      lastInstruction = "";
      selectionId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      chatHistory = [];
      changesHistory = [];
      screenshotPromise = captureScreenshots(selected);

      console.log(
        "[lasso] selected:",
        selected
      );

      // Hide hover state.
      hoverBox.style.display =
        "none";

      // Selected state.
      updateSelectedVisual();

      // Selected element label.
      const group =
        getElementGroup(
          selected
        );

      const config =
        GROUPS[group];

      label.textContent =
        `${config.label} · ${getElementLabel(selected)}`;

      label.style.background =
        config.color;

      const selectedRect =
        selected.getBoundingClientRect();

      label.style.left =
        `${Math.max(
          6,
          selectedRect.left
        )}px`;

      label.style.top =
        `${Math.max(
          6,
          selectedRect.top - 29
        )}px`;

      label.style.display =
        "flex";

      // Prompt metadata.
      promptElement.textContent =
        getElementLabel(
          selected
        );

      // Prompt position.
      positionPrompt(
        selected
      );

      // Show prompt.
      prompt.classList.add(
        "visible"
      );

      // Exit selection mode.
      setSelectMode(false);

      // Focus prompt.
      requestAnimationFrame(() => {
        promptInput.focus();
      });
    },
    true
  );

  // ============================================================
  // PROMPT SEND
  // ============================================================

  sendButton.addEventListener(
    "click",
    async (event) => {
      event.preventDefault();
      event.stopPropagation();

      if (!selected) return;

      const instruction =
        promptInput.value.trim() || (sendButton.dataset.state === "retry" ? lastInstruction : "");

      if (!instruction) {
        promptInput.focus();
        return;
      }

      if (!bridgeSocket || bridgeSocket.readyState !== WebSocket.OPEN) {
        setAgentStatus("error", "The Lasso agent bridge is not connected. Start Lasso with your dev server and try again.");
        return;
      }

      appendChat("user", instruction);
      setAgentStatus("thinking", "Starting the Lasso agent…");
      lastInstruction = instruction;
      promptInput.value = "";
      const rect = selected.getBoundingClientRect();
      const computed = getComputedStyle(selected);
      const attributes = Object.fromEntries(Array.from(selected.attributes).map((attribute) => [attribute.name, attribute.value]));
      const screenshots = await screenshotPromise;
      bridgeSocket.send(JSON.stringify({
        type: "edit",
        instruction,
        messages: chatHistory,
        changesHistory,
        model: selectedModel.id,
        provider: selectedModel.provider,
        context: {
          selectionId,
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
          runtimeErrors,
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
          tag: selected.tagName.toLowerCase(),
          group: getElementGroup(selected),
          label: getElementLabel(selected),
          html: selected.outerHTML.slice(0, 6000),
          sourceHint: selected.getAttribute("data-source") || selected.getAttribute("data-lasso-source") || getSourceHint(selected),
        },
      }));
    }
  );

  // ============================================================
  // CMD/CTRL + ENTER
  // ============================================================

  promptInput.addEventListener(
    "keydown",
    (event) => {
      if (
        event.key === "Enter" &&
        (event.metaKey ||
          event.ctrlKey)
      ) {
        event.preventDefault();

        sendButton.click();
      }
    }
  );

  // ============================================================
  // CANCEL
  // ============================================================

  function cancelPrompt(
    reenter: boolean
  ) {
    prompt.classList.remove(
      "visible"
    );

    promptInput.value = "";

      selected = null;

    selectedBox.style.display =
      "none";

    if (reenter) {
      setSelectMode(true);
    }
  }

  promptClose.addEventListener(
    "click",
    (event) => {
      event.preventDefault();
      event.stopPropagation();

      cancelPrompt(true);
    }
  );

  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Escape") {
        return;
      }

      if (
        prompt.classList.contains(
          "visible"
        )
      ) {
        // Cancel the current edit and let
        // the user pick a different element.
        cancelPrompt(true);

        return;
      }

      // Cancel an active selection session.
      if (selectMode) {
        setSelectMode(false);
      }
    }
  );

  // ============================================================
  // KEEP OVERLAYS ALIGNED
  // ============================================================

  function updatePositions() {
    if (
      selectMode &&
      hovered
    ) {
      updateHoverVisual(
        hovered
      );
    }

    if (selected) {
      updateSelectedVisual();

      if (!promptDragged) {
        positionPrompt(selected);
      }
    }
  }

  window.addEventListener(
    "scroll",
    updatePositions,
    true
  );

  window.addEventListener(
    "resize",
    updatePositions
  );

  // ============================================================
  // INITIAL STATE
  // ============================================================

  setSelectMode(false);

  console.log(
    "[lasso] ready"
  );
}

// ============================================================
// INITIALIZE
// ============================================================

if (
  document.readyState ===
  "loading"
) {
  document.addEventListener(
    "DOMContentLoaded",
    init
  );
} else {
  init();
}
