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
  let agentRunning = false;

  function setAgentStatus(status: "thinking" | "working" | "review" | "error", message: string) {
    if (!agentStatusElement || !agentStatusMessage) return;
    agentStatusElement.hidden = false;
    agentStatusElement.dataset.status = status;
    agentStatusMessage.textContent = message;
    agentRunning = status === "thinking" || status === "working";
    promptInput.disabled = agentRunning;
    sendButton.disabled = agentRunning;
    sendButton.querySelector("span")!.textContent = status === "review" ? "Review" : status === "error" ? "Retry" : "Send";
  }

  function connectBridge() {
    try {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      bridgeSocket = new WebSocket(`${protocol}//localhost:3056`);
      bridgeSocket.addEventListener("open", () => bridgeSocket?.send(JSON.stringify({ type: "hello", from: "overlay" })));
      bridgeSocket.addEventListener("message", (event) => {
        try {
          const message = JSON.parse(event.data as string) as { type?: string; apiKeyConfigured?: boolean; status?: "thinking" | "working" | "review" | "error"; message?: string };
          if (message.type === "config") apiKeyConfigured = Boolean(message.apiKeyConfigured);
          if (message.type === "agent_status" && message.status && message.message) setAgentStatus(message.status, message.message);
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

  const MODELS = [
    { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
    { id: "claude-opus-4-1", label: "Claude Opus 4.1" },
    { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
    { id: "gpt-4o", label: "GPT-4o" },
    { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  ] as const;

  let selectedModel: { id: string; label: string } =
    MODELS[0];

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
      border-radius: 13px;

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
      border-radius: 8px;

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
    }

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

    .lasso-agent-status {
      display: flex;
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
    .lasso-agent-status[data-status="review"] { background: #ecfdf3; color: #188038; }
    .lasso-agent-status[data-status="error"] { background: #fef2f2; color: #b3261e; }
    .lasso-agent-status-dot { width: 7px; height: 7px; flex-shrink: 0; border-radius: 50%; background: #6366f1; animation: lasso-agent-pulse 1.2s ease-in-out infinite; }
    [data-status="review"] .lasso-agent-status-dot { background: #188038; animation: none; }
    [data-status="error"] .lasso-agent-status-dot { background: #b3261e; animation: none; }
    @keyframes lasso-agent-pulse { 50% { opacity: .35; transform: scale(.75); } }

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

    <div class="lasso-status">
      <span class="lasso-dot"></span>
      <span>Click an element</span>
    </div>
  `;

  shadow.appendChild(toolbar);

  const selectBtn =
    toolbar.querySelector<HTMLButtonElement>(
      ".lasso-select-btn"
    )!;

  const selectText =
    toolbar.querySelector<HTMLSpanElement>(
      ".lasso-select-text"
    )!;

  const status =
    toolbar.querySelector<HTMLDivElement>(
      ".lasso-status"
    )!;

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

      <span class="lasso-prompt-element"></span>

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

    <textarea
      class="lasso-prompt-input"
      placeholder="Ask Anything about your performance"
      rows="1"
    ></textarea>

    <div class="lasso-agent-status" hidden aria-live="polite">
      <span class="lasso-agent-status-dot"></span>
      <span class="lasso-agent-status-message"></span>
    </div>

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

  const promptInput =
    prompt.querySelector<HTMLTextAreaElement>(
      ".lasso-prompt-input"
    )!;

  const promptElement =
    prompt.querySelector<HTMLSpanElement>(
      ".lasso-prompt-element"
    )!;

  const sendButton =
    prompt.querySelector<HTMLButtonElement>(
      ".lasso-prompt-send"
    )!;

  const promptClose =
    prompt.querySelector<HTMLButtonElement>(
      ".lasso-prompt-close"
    )!;

  agentStatusElement = prompt.querySelector<HTMLDivElement>(".lasso-agent-status")!;
  agentStatusMessage = prompt.querySelector<HTMLSpanElement>(".lasso-agent-status-message")!;
  connectBridge();

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

  for (const model of MODELS) {
    const item =
      document.createElement("button");

    item.type = "button";
    item.className =
      "lasso-prompt-model-item";
    item.dataset.model = model.id;

    item.innerHTML = `
      <span>${model.label}</span>
      <svg
        class="lasso-prompt-model-check"
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M20 6L9 17l-5-5"/>
      </svg>
    `;

    modelMenu.appendChild(item);
  }

  function syncModelMenu() {
    modelName.textContent =
      selectedModel.label;

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

    status.classList.toggle(
      "visible",
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
    (event) => {
      event.preventDefault();
      event.stopPropagation();

      if (!selected) return;

      const instruction =
        promptInput.value.trim();

      if (!instruction) {
        promptInput.focus();
        return;
      }

      if (!apiKeyConfigured) {
        setAgentStatus("error", "Set VITE_LASSO_API_KEY or NEXT_LASSO_API_KEY before sending an edit.");
        return;
      }

      if (!bridgeSocket || bridgeSocket.readyState !== WebSocket.OPEN) {
        setAgentStatus("error", "The Lasso agent bridge is not connected. Start Lasso with your dev server and try again.");
        return;
      }

      setAgentStatus("thinking", "Starting the Lasso agent…");
      bridgeSocket.send(JSON.stringify({
        type: "edit",
        instruction,
        model: selectedModel.id,
        element: {
          tag: selected.tagName.toLowerCase(),
          group: getElementGroup(selected),
          label: getElementLabel(selected),
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

      positionPrompt(
        selected
      );
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
