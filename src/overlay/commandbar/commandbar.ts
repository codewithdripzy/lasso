import { state, rememberModel } from "../state";
import { getDOM } from "../dom";
import { LASSO_ICON_DATA_URL } from "../icons/lasso";
import { startVoiceRecording, stopVoiceRecording, isRecordingVoice } from "../audio/transcribe";
import { showActivity } from "../collab/presence";
import { collabEmit } from "../collab/socket";
import { providerIcon, buildModelMenuContent } from "../prompt/prompt";
import { setSelectMode } from "../toolbar/select";
import type { PendingChange } from "../types";
import { BrowserIcon, CommandLineIcon, Delete02Icon, Edit01Icon, File01Icon, FileAddIcon, Folder01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { formatMessageText, getFileExtension, getPathBasename } from "../message-format";

type HugeiconsSvgNode = readonly (readonly [string, Readonly<Record<string, string | number>>])[];

const thinkingToolIcons: Record<string, HugeiconsSvgNode> = {
  inspect_project: Folder01Icon,
  search_code: Search01Icon,
  read_file: File01Icon,
  edit_file: Edit01Icon,
  create_file: FileAddIcon,
  delete_file: Delete02Icon,
  run_command: CommandLineIcon,
  browser_check: BrowserIcon,
};

export interface SourceChange {
  filePath: string;
  oldString: string;
  newString: string;
  operation?: "created" | "modified" | "deleted";
}

export interface CommandThinkingStep {
  title: string;
  detail?: string;
  status: "running" | "completed" | "failed";
}

export interface CommandTodoItem {
  file: string;
  action: "modify" | "create" | "delete";
  reason: string;
}

export interface CommandMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  thinking?: {
    steps: CommandThinkingStep[];
    durationSeconds: number;
    completed: boolean;
    expanded: boolean;
  };
  todo?: CommandTodoItem[];
  changes?: SourceChange[];
  liveChanges?: boolean;
  changesApplied?: boolean;
  changesUndone?: boolean;
  showDiff?: boolean;
  error?: string;
  editError?: string;
  isStreaming?: boolean;
  queued?: boolean;
  steering?: boolean;
  steered?: boolean;
  activeDiffFile?: string;
  rejectedFilePaths?: string[];
}

let commandBarEl: HTMLDivElement | null = null;
let commandInput: HTMLTextAreaElement | null = null;
let commandSubmit: HTMLButtonElement | null = null;
let commandVoice: HTMLButtonElement | null = null;
let commandClose: HTMLButtonElement | null = null;
let commandNewChat: HTMLButtonElement | null = null;
let commandHistoryBtn: HTMLButtonElement | null = null;
let commandHistoryPopover: HTMLDivElement | null = null;
let commandModelBtn: HTMLButtonElement | null = null;
let commandModelMenu: HTMLDivElement | null = null;
let commandModelIcon: HTMLSpanElement | null = null;
let commandModelLabel: HTMLSpanElement | null = null;
let commandMessagesEl: HTMLDivElement | null = null;
let commandEmptyEl: HTMLDivElement | null = null;
let reviewDiffModal: HTMLDivElement | null = null;

let isOneShotMode = false;
let commandMessages: CommandMessage[] = [];
let activeTaskId: string | null = null;
let editingMessageId: string | null = null;
let pendingEditedMessage: { messageId: string; prompt: string } | null = null;
let activeThinkingInterval: any = null;
let activeStartTime = 0;

// Persistent conversation tracking
let activeConversationId: string | null = null;
let conversationList: Array<{ id: string; title: string; scope: string; updatedAt: string }> = [];

/** Detects "try again", "retry", "do it again", "run again", etc. */
export function isRetryIntent(prompt: string): boolean {
  const p = prompt
    .trim()
    .toLowerCase()
    .replace(/[!?.]+$/, "");
  return /^(try\s+again|retry|re-?try|do\s+it\s+again|run\s+again|attempt\s+again|go\s+again|one\s+more\s+time|again)$/.test(p);
}

/** Derive the API base URL for Lasso main server */
function getApiBase(): string {
  let apiUrl = (state.collab?.serverUrl || state.collab?.apiUrl || "").replace(/\/+$/, "");
  if (apiUrl.includes("collab.lasso.byorello.space")) {
    apiUrl = apiUrl.replace("collab.lasso.byorello.space", "api.lasso.byorello.space");
  }
  if (!apiUrl) {
    apiUrl = "https://api.lasso.byorello.space";
  }
  return apiUrl.endsWith("/api/v1") ? apiUrl : `${apiUrl}/api/v1`;
}

/** Best-effort fetch with auth cookie and API key if available */
async function apiFetch(path: string, options: RequestInit = {}): Promise<any | null> {
  try {
    const base = path.startsWith("/agent/") && state.collab?.agentServerUrl ? `${state.collab.agentServerUrl.replace(/\/+$/, "")}/api/v1` : getApiBase();
    const apiKey = state.collab?.apiKey || "";
    const headers: Record<string, string> = {
      "content-type": "application/json",
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      ...((options.headers as Record<string, string>) || {}),
    };

    const res = await fetch(`${base}${path}`, {
      ...options,
      credentials: "include",
      headers,
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

function getStorageProjectKey(): string {
  const proj = state.collab?.projectId || state.collabProjectId || "default";
  return `lasso:sessions:${proj}`;
}

function saveLocalSession(): void {
  try {
    const projKey = getStorageProjectKey();
    if (!activeConversationId) {
      activeConversationId = `local-session-${Date.now()}`;
    }
    const sessionData = {
      id: activeConversationId,
      messages: commandMessages,
      updatedAt: new Date().toISOString(),
      title: commandMessages.find((m) => m.role === "user")?.content?.slice(0, 80) || "Untitled Session",
    };
    localStorage.setItem(`lasso:session:${activeConversationId}`, JSON.stringify(sessionData));

    // Update session list index
    const listRaw = localStorage.getItem(projKey);
    let list: Array<{ id: string; title: string; updatedAt: string }> = listRaw ? JSON.parse(listRaw) : [];
    list = list.filter((item) => item.id !== activeConversationId);
    list.unshift({
      id: activeConversationId,
      title: sessionData.title,
      updatedAt: sessionData.updatedAt,
    });
    localStorage.setItem(projKey, JSON.stringify(list.slice(0, 30)));
  } catch (err) {
    // Non-fatal if localStorage is restricted
  }
}

function loadLocalSession(convId: string): boolean {
  try {
    const raw = localStorage.getItem(`lasso:session:${convId}`);
    if (!raw) return false;
    const session = JSON.parse(raw);
    if (session && Array.isArray(session.messages)) {
      commandMessages = session.messages;
      activeConversationId = convId;
      renderMessages();
      scrollToBottom();
      return true;
    }
  } catch {}
  return false;
}

function restoreLatestSession(): void {
  try {
    const projKey = getStorageProjectKey();
    const listRaw = localStorage.getItem(projKey);
    if (!listRaw) return;
    const list: Array<{ id: string; title: string; updatedAt: string }> = JSON.parse(listRaw);
    if (list && list.length > 0 && !activeConversationId) {
      loadLocalSession(list[0].id);
    }
  } catch {}
}

/** Fetch conversation list for the sidebar/history. */
async function loadConversationList(): Promise<void> {
  const projectId = state.collab?.projectId || state.collabProjectId;

  // First load local sessions
  try {
    const projKey = getStorageProjectKey();
    const listRaw = localStorage.getItem(projKey);
    if (listRaw) {
      const localList: Array<{ id: string; title: string; updatedAt: string }> = JSON.parse(listRaw);
      conversationList = localList.map((item) => ({
        id: item.id,
        title: item.title,
        scope: "local",
        updatedAt: item.updatedAt,
      }));
    }
  } catch {}

  if (!projectId) return;

  const data = await apiFetch(`/agent/conversations?projectId=${encodeURIComponent(projectId)}`);
  if (data?.conversations && Array.isArray(data.conversations)) {
    // Merge server sessions with local, avoiding duplicates
    const serverIds = new Set(data.conversations.map((c: any) => c.id));
    const merged = [...data.conversations, ...conversationList.filter((local) => !serverIds.has(local.id))];
    conversationList = merged;
  }
}

function formatDateAgo(dateStr?: string): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function renderHistoryPopover(): void {
  if (!commandHistoryPopover) return;
  if (!conversationList || conversationList.length === 0) {
    commandHistoryPopover.innerHTML = `
      <div class="lasso-command-history-header">
        <span>Recent Sessions</span>
      </div>
      <div class="lasso-command-history-empty">No previous sessions found</div>
    `;
    return;
  }

  commandHistoryPopover.innerHTML = `
    <div class="lasso-command-history-header">
      <span>Recent Sessions (${conversationList.length})</span>
    </div>
    ${conversationList
      .map(
        (conv) => `
      <div class="lasso-command-history-item ${conv.id === activeConversationId ? "active" : ""}" data-conv-id="${escapeHtml(conv.id)}">
        <button class="lasso-command-history-load" type="button" title="Open session">
          <span class="lasso-command-history-title" title="${escapeHtml(conv.title || "Untitled Session")}">${escapeHtml(conv.title || "Untitled Session")}</span>
          <div class="lasso-command-history-meta">
            <span class="lasso-command-history-scope ${conv.scope || "private"}">${conv.scope || "private"}</span>
            <span>${formatDateAgo(conv.updatedAt)}</span>
          </div>
        </button>
        <button class="lasso-command-history-delete" type="button" title="Delete session" aria-label="Delete session">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></svg>
        </button>
      </div>
    `
      )
      .join("")}
  `;
}

async function deleteConversation(convId: string): Promise<void> {
  const conversation = conversationList.find((item) => item.id === convId);
  if (!conversation) return;

  // Server-backed sessions are deleted remotely. Local copies are removed
  // below as well, so the history cannot resurrect a deleted session.
  if (!convId.startsWith("local-session-")) {
    const deleted = await apiFetch(`/agent/conversations/${encodeURIComponent(convId)}`, { method: "DELETE" });
    if (!deleted?.success) return;
  }

  try {
    localStorage.removeItem(`lasso:session:${convId}`);
    const key = getStorageProjectKey();
    const list = JSON.parse(localStorage.getItem(key) || "[]") as Array<{ id: string }>;
    localStorage.setItem(key, JSON.stringify(list.filter((item) => item.id !== convId)));
  } catch {}

  conversationList = conversationList.filter((item) => item.id !== convId);
  if (activeConversationId === convId) {
    activeConversationId = null;
    commandMessages = [];
    renderMessages();
  }
  renderHistoryPopover();
}

async function switchConversation(convId: string): Promise<void> {
  if (pendingEditedMessage) return;
  if (activeThinkingInterval) {
    clearInterval(activeThinkingInterval);
    activeThinkingInterval = null;
  }
  activeTaskId = null;
  updateSubmitButton(false);
  activeConversationId = convId;
  if (commandHistoryPopover) commandHistoryPopover.hidden = true;
  commandHistoryBtn?.classList.remove("active");

  // Try local first
  if (loadLocalSession(convId)) {
    return;
  }

  const data = await apiFetch(`/agent/conversations/${convId}`);
  if (data?.conversation?.messages && Array.isArray(data.conversation.messages)) {
    commandMessages = data.conversation.messages.map((m: any, idx: number) => ({
      id: m.id || `msg-${idx}`,
      role: m.role || "user",
      content: m.content || "",
      timestamp: m.createdAt ? new Date(m.createdAt).getTime() : Date.now(),
      thinking: m.thinking
        ? {
            steps: Array.isArray(m.thinking) ? m.thinking : [],
            durationSeconds: m.thinkingDurationSeconds || 3,
            completed: true,
            expanded: false,
          }
        : undefined,
      changes: m.changes || undefined,
      changesApplied: m.changesApplied,
      error: m.error,
    }));
    saveLocalSession();
  } else {
    commandMessages = [];
  }

  renderMessages();
  scrollToBottom();
}

export interface SuggestionChip {
  icon: string;
  label: string;
  prompt: string;
}

export function getDynamicSuggestions(): SuggestionChip[] {
  const path = window.location.pathname.toLowerCase();
  const suggestions: SuggestionChip[] = [];

  const hasForms = Boolean(document.querySelector("form, input:not([type='hidden']), textarea"));
  const hasCards = Boolean(document.querySelector("[class*='card'], [class*='item'], [class*='product'], [class*='tile'], [class*='grid']"));
  const hasNav = Boolean(document.querySelector("nav, header, [class*='header'], [class*='navbar']"));

  if (path === "/" || path === "" || path.endsWith("/index.html")) {
    suggestions.push({
      icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z"/></svg>`,
      label: "Redesign the hero section",
      prompt: "Redesign the hero section to make it punchy and modern with glowing gradients, clean typography, and a clear call-to-action.",
    });
    suggestions.push({
      icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01"/></svg>`,
      label: "Review this landing page",
      prompt: "Review this landing page design, typography, spacing, and contrast, and give me specific recommendations to improve it.",
    });
    suggestions.push({
      icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`,
      label: "Add dark mode toggle",
      prompt: "Add a sleek dark/light mode toggle with smooth CSS transitions and remember the preference in localStorage.",
    });
    suggestions.push({
      icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>`,
      label: "Audit mobile responsiveness",
      prompt: "Inspect the layout and adjust the CSS so this page looks stunning and functions seamlessly on mobile screens.",
    });
  } else if (path.includes("pricing") || path.includes("plan")) {
    suggestions.push({
      icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>`,
      label: "Add billing cycle toggle",
      prompt: "Add a Monthly / Annual billing switch with an animated badge showing 'Save 20%' on annual billing.",
    });
    suggestions.push({
      icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z"/></svg>`,
      label: "Highlight popular tier",
      prompt: "Add a 'Most Popular' gradient ribbon and elevate the recommended pricing card with a subtle border glow.",
    });
    suggestions.push({
      icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01"/></svg>`,
      label: "Add FAQ accordion section",
      prompt: "Create an interactive FAQ accordion section below the pricing plans with smooth open/collapse animations.",
    });
  } else if (path.includes("login") || path.includes("auth") || path.includes("signup") || path.includes("register")) {
    suggestions.push({
      icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
      label: "Add social auth buttons",
      prompt: "Add polished 'Continue with Google' and 'Continue with GitHub' buttons with brand icons above the form.",
    });
    suggestions.push({
      icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
      label: "Add show password toggle",
      prompt: "Add a password visibility toggle icon inside the password field with smooth show/hide transitions.",
    });
    suggestions.push({
      icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
      label: "Add form validation",
      prompt: "Add instant inline client-side validation for email format and password strength requirements.",
    });
  } else if (path.includes("dashboard") || path.includes("admin") || path.includes("app")) {
    suggestions.push({
      icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>`,
      label: "Add KPI metric stat cards",
      prompt: "Add 4 responsive KPI stat cards with trend percentage indicators, icons, and sparkline previews.",
    });
    suggestions.push({
      icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`,
      label: "Create activity charts",
      prompt: "Create an interactive chart section displaying recent activity and metrics with daily/weekly filters.",
    });
    suggestions.push({
      icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
      label: "Add quick search & filter",
      prompt: "Add an instant search bar with filter chips to quickly find and filter table or dashboard items.",
    });
  }

  // Complementary contextual suggestions
  if (suggestions.length < 4) {
    if (hasForms && !suggestions.some((s) => s.label.toLowerCase().includes("validation"))) {
      suggestions.push({
        icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
        label: "Enhance form validation",
        prompt: "Add sleek inline validation and feedback messages with error states and focus animations.",
      });
    }
    if (hasNav && !suggestions.some((s) => s.label.toLowerCase().includes("navbar"))) {
      suggestions.push({
        icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/></svg>`,
        label: "Add sticky blur navbar",
        prompt: "Make the navigation bar sticky with a modern blurred glassmorphism backdrop on scroll.",
      });
    }
    if (hasCards && !suggestions.some((s) => s.label.toLowerCase().includes("card") || s.label.toLowerCase().includes("hover"))) {
      suggestions.push({
        icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z"/></svg>`,
        label: "Add micro-interactions to cards",
        prompt: "Add smooth hover lift effects, subtle border highlights, and interactive states to the cards.",
      });
    }
    suggestions.push({
      icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01"/></svg>`,
      label: "Explain this codebase",
      prompt: "Explain how this project is structured, what tech stack is used, and what key components exist.",
    });
  }

  return suggestions.slice(0, 4);
}

export function renderSuggestions(): void {
  if (!commandBarEl) return;
  const suggestionsContainer = commandBarEl.querySelector<HTMLElement>(".lasso-command-suggestions");
  if (!suggestionsContainer) return;

  const suggestions = getDynamicSuggestions();
  suggestionsContainer.innerHTML = suggestions
    .map(
      (s, index) => `
    <button class="lasso-command-suggestion-chip" type="button" data-index="${index}">
      <span class="lasso-command-suggestion-icon">${s.icon}</span>
      <span class="lasso-command-suggestion-label">${escapeHtml(s.label)}</span>
      <svg class="lasso-command-suggestion-arrow" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5 12h14M12 5l7 7-7 7"/>
      </svg>
    </button>
  `
    )
    .join("");
}

export function getUserGreetingName(): string {
  if (state.myUser?.name) {
    const first = state.myUser.name.trim().split(/\s+/)[0];
    if (first) return first;
  }
  try {
    const cached = localStorage.getItem("lasso:user:name");
    if (cached) {
      const first = cached.trim().split(/\s+/)[0];
      if (first) return first;
    }
  } catch {}
  return "there";
}

export function updateEmptyStateUserName(): void {
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
        <button class="lasso-command-history-btn" type="button" aria-label="Conversation history" title="Conversation history">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
        </button>
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
    <div class="lasso-command-history-popover" hidden></div>

    <div class="lasso-command-body">
      <div class="lasso-command-empty">
        <div class="lasso-command-empty-header">
          <img class="lasso-command-empty-logo" src="${LASSO_ICON_DATA_URL}" alt="Lasso" />
          <h2 class="lasso-command-empty-text">
            Hi <span class="lasso-command-user-name">${getUserGreetingName()}</span>,<br />What would you like to build today?
          </h2>
          <p class="lasso-command-empty-sub">Choose a suggestion below or describe what you want to build.</p>
        </div>
        <div class="lasso-command-suggestions"></div>
      </div>
      <div class="lasso-command-messages" hidden></div>
    </div>

    <div class="lasso-command-input-composite">
      <div class="lasso-command-live-review-tray" hidden></div>
      <textarea
        class="lasso-command-input"
        placeholder="Describe what you want to build…"
        rows="3"
      ></textarea>
      <div class="lasso-command-input-toolbar">
        <div class="lasso-command-model-select">
          <button class="lasso-command-model-btn" type="button" aria-label="Select model" aria-expanded="false" aria-haspopup="listbox">
            <span class="lasso-command-model-icon"></span>
            <span class="lasso-command-model-label"></span>
            <svg class="lasso-model-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
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

  reviewDiffModal = document.createElement("div");
  reviewDiffModal.className = "lasso-review-diff-backdrop";
  reviewDiffModal.hidden = true;
  reviewDiffModal.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    if (target === reviewDiffModal || target.closest(".lasso-review-diff-close")) closeReviewDiffModal();
  });
  reviewDiffModal.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeReviewDiffModal();
  });
  dom.shadow.appendChild(reviewDiffModal);

  commandInput = el.querySelector<HTMLTextAreaElement>(".lasso-command-input")!;
  commandSubmit = el.querySelector<HTMLButtonElement>(".lasso-command-submit")!;
  commandVoice = el.querySelector<HTMLButtonElement>(".lasso-command-voice")!;
  commandClose = el.querySelector<HTMLButtonElement>(".lasso-command-close")!;
  commandNewChat = el.querySelector<HTMLButtonElement>(".lasso-command-new-chat")!;
  commandHistoryBtn = el.querySelector<HTMLButtonElement>(".lasso-command-history-btn")!;
  commandHistoryPopover = el.querySelector<HTMLDivElement>(".lasso-command-history-popover")!;
  commandModelBtn = el.querySelector<HTMLButtonElement>(".lasso-command-model-btn")!;
  commandModelMenu = el.querySelector<HTMLDivElement>(".lasso-command-model-menu")!;
  commandModelIcon = el.querySelector<HTMLSpanElement>(".lasso-command-model-icon")!;
  commandModelLabel = el.querySelector<HTMLSpanElement>(".lasso-command-model-label")!;
  commandMessagesEl = el.querySelector<HTMLDivElement>(".lasso-command-messages")!;
  commandEmptyEl = el.querySelector<HTMLDivElement>(".lasso-command-empty")!;

  // Dynamic suggestion clicks
  const suggestionsContainer = el.querySelector<HTMLElement>(".lasso-command-suggestions");
  if (suggestionsContainer) {
    suggestionsContainer.addEventListener("click", (event) => {
      const chip = (event.target as HTMLElement).closest<HTMLButtonElement>(".lasso-command-suggestion-chip");
      if (!chip) return;
      const index = parseInt(chip.dataset.index || "-1", 10);
      const suggestions = getDynamicSuggestions();
      const item = suggestions[index];
      if (item && commandInput) {
        commandInput.value = item.prompt;
        autoResizeTextarea(commandInput);
        handleSubmit();
      }
    });
  }

  renderSuggestions();

  // Try to load authenticated user if not set yet
  if (!state.myUser?.name) {
    apiFetch("/auth/me")
      .then((res: any) => {
        if (res?.user?.name) {
          state.myUser = { id: res.user.id || "me", name: res.user.name, photo: res.user.photo || "" };
          try {
            localStorage.setItem("lasso:user:name", res.user.name);
          } catch {}
          updateEmptyStateUserName();
        }
      })
      .catch(() => {});
  }

  // History button
  commandHistoryBtn.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!commandHistoryPopover) return;
    const isHidden = commandHistoryPopover.hidden;
    if (isHidden) {
      setCommandModelMenuOpen(false);
      commandHistoryPopover.hidden = false;
      commandHistoryBtn?.classList.add("active");
      await loadConversationList();
      renderHistoryPopover();
    } else {
      commandHistoryPopover.hidden = true;
      commandHistoryBtn?.classList.remove("active");
    }
  });

  // History popover item click
  commandHistoryPopover.addEventListener("click", async (event) => {
    event.stopPropagation();
    const target = event.target as HTMLElement;
    const item = target.closest<HTMLElement>(".lasso-command-history-item");
    if (!item?.dataset.convId) return;

    if (target.closest(".lasso-command-history-delete")) {
      await deleteConversation(item.dataset.convId);
      return;
    }

    if (target.closest(".lasso-command-history-load")) {
      await switchConversation(item.dataset.convId);
    }
  });

  // Model selector button
  const setCommandModelMenuOpen = (open: boolean) => {
    if (!commandModelMenu || !commandModelBtn) return;
    commandModelMenu.hidden = !open;
    commandModelBtn.setAttribute("aria-expanded", String(open));
  };

  commandModelBtn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (commandHistoryPopover) {
      commandHistoryPopover.hidden = true;
      commandHistoryBtn?.classList.remove("active");
    }
    if (commandModelMenu) {
      const willOpen = commandModelMenu?.hidden === true;
      if (willOpen) {
        populateModelMenu();
      }
      setCommandModelMenuOpen(willOpen);
    }
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
    setCommandModelMenuOpen(false);
  });

  // Close menus/popovers on outside click
  document.addEventListener("click", (event) => {
    const path = event.composedPath ? event.composedPath() : [];
    const target = event.target as Node;

    if (commandModelMenu && !commandModelMenu.hidden) {
      if (!path.includes(commandModelBtn!) && !path.includes(commandModelMenu)) {
        if (!commandModelBtn?.contains(target) && !commandModelMenu?.contains(target)) {
          setCommandModelMenuOpen(false);
        }
      }
    }

    if (commandHistoryPopover && !commandHistoryPopover.hidden) {
      if (!path.includes(commandHistoryBtn!) && !path.includes(commandHistoryPopover)) {
        if (!commandHistoryBtn?.contains(target) && !commandHistoryPopover?.contains(target)) {
          commandHistoryPopover.hidden = true;
          commandHistoryBtn?.classList.remove("active");
        }
      }
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || commandModelMenu?.hidden !== false) return;
    setCommandModelMenuOpen(false);
    commandModelBtn?.focus();
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
  let initialVoiceText = "";
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
          const prev = initialVoiceText ? initialVoiceText.trim() : "";
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
        initialVoiceText = "";
      }
    } else {
      try {
        initialVoiceText = commandInput?.value.trim() || "";
        await startVoiceRecording((interimText) => {
          if (commandInput && interimText) {
            commandInput.value = initialVoiceText ? `${initialVoiceText} ${interimText}` : interimText;
            autoResizeTextarea(commandInput);
          }
        });
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

  // Delegate across the sidebar so controls in the live review tray also work.
  commandBarEl.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;

    const editableMessage = target.closest<HTMLButtonElement>(".lasso-command-editable-message");
    if (editableMessage) {
      if (activeTaskId || pendingEditedMessage) return;
      editingMessageId = editableMessage.closest<HTMLElement>(".lasso-command-msg")?.dataset.msgId || null;
      const message = commandMessages.find((item) => item.id === editingMessageId);
      if (message) message.editError = undefined;
      renderMessages();
      commandMessagesEl?.querySelector<HTMLTextAreaElement>(".lasso-command-edit-input")?.focus();
      return;
    }

    const cancelEdit = target.closest<HTMLButtonElement>(".lasso-command-edit-cancel");
    if (cancelEdit) {
      if (pendingEditedMessage) return;
      editingMessageId = null;
      renderMessages();
      return;
    }

    const sendEdited = target.closest<HTMLButtonElement>(".lasso-command-edit-send");
    if (sendEdited) {
      const messageId = sendEdited.closest<HTMLElement>(".lasso-command-msg")?.dataset.msgId;
      const editedPrompt = commandMessagesEl?.querySelector<HTMLTextAreaElement>(".lasso-command-edit-input")?.value.trim();
      if (messageId && editedPrompt) sendEditedMessage(messageId, editedPrompt, sendEdited);
      return;
    }

    // Toggle thinking expansion
    const thoughtToggle = target.closest<HTMLElement>(".lasso-command-thought-toggle, .lasso-command-thinking-header");
    if (thoughtToggle) {
      const msgId = thoughtToggle.closest<HTMLElement>(".lasso-command-msg")?.dataset.msgId;
      const msg = commandMessages.find((m) => m.id === msgId);
      if (msg && msg.thinking) {
        msg.thinking.expanded = !msg.thinking.expanded;
        renderMessages();
      }
      return;
    }

    // Inject a queued prompt into the active runtime's next conversation turn.
    const steerBtn = target.closest<HTMLButtonElement>(".lasso-command-steer-btn");
    if (steerBtn) {
      const msgId = steerBtn.closest<HTMLElement>(".lasso-command-msg")?.dataset.msgId;
      const msg = commandMessages.find((m) => m.id === msgId);
      if (msg?.queued && !msg.steering && activeTaskId && state.bridgeSocket?.readyState === WebSocket.OPEN) {
        steerBtn.disabled = true;
        steerBtn.textContent = "Steering…";
        msg.steering = true;
        state.bridgeSocket.send(JSON.stringify({ type: "steer", taskId: activeTaskId, queueId: msg.id, prompt: msg.content }));
        renderMessages();
      }
      return;
    }

    // Individual file inclusion/exclusion checkbox
    const fileCheck = target.closest<HTMLInputElement>(".lasso-command-file-check");
    if (fileCheck) {
      const msgId = fileCheck.closest<HTMLElement>(".lasso-command-msg")?.dataset.msgId;
      const filePath = fileCheck.dataset.filePath;
      const msg = commandMessages.find((m) => m.id === msgId);
      if (msg && filePath) {
        msg.rejectedFilePaths = msg.rejectedFilePaths || [];
        if (fileCheck.checked) {
          msg.rejectedFilePaths = msg.rejectedFilePaths.filter((p) => p !== filePath);
        } else {
          if (!msg.rejectedFilePaths.includes(filePath)) {
            msg.rejectedFilePaths.push(filePath);
          }
        }
        renderMessages();
      }
      return;
    }

    // View specific file diff
    const reviewFile = target.closest<HTMLButtonElement>(".lasso-review-tray-file");
    if (reviewFile) {
      const message = commandMessages.find((item) => item.id === reviewFile.dataset.taskId);
      const change = message?.changes?.find((item) => item.filePath === reviewFile.dataset.filePath);
      if (change) openReviewDiffModal(change);
      return;
    }

    const viewFileDiffBtn = target.closest<HTMLButtonElement>(".lasso-command-view-file-diff-btn");
    if (viewFileDiffBtn) {
      const msgId = viewFileDiffBtn.closest<HTMLElement>(".lasso-command-msg")?.dataset.msgId;
      const filePath = viewFileDiffBtn.dataset.filePath;
      const msg = commandMessages.find((m) => m.id === msgId);
      if (msg && filePath) {
        msg.activeDiffFile = filePath;
        msg.showDiff = true;
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

    // Apply changes (filtered to only approved files)
    const applyBtn = target.closest<HTMLButtonElement>(".lasso-command-apply-btn");
    if (applyBtn) {
      const msgId = applyBtn.closest<HTMLElement>("[data-msg-id]")?.dataset.msgId;
      const msg = commandMessages.find((m) => m.id === msgId);
      if (msg && msg.changes?.length && state.bridgeSocket?.readyState === WebSocket.OPEN) {
        const rejected = new Set(msg.rejectedFilePaths || []);
        const approvedChanges = msg.changes.filter((c) => !rejected.has(c.filePath));
        if (approvedChanges.length === 0) {
          alert("Please select at least one file to keep.");
          return;
        }
        applyBtn.disabled = true;
        applyBtn.textContent = "Accepting…";
        state.runtimeErrors = [];
        state.bridgeSocket.send(
          JSON.stringify({
            type: "apply",
            taskId: msg.id,
            changes: approvedChanges,
          })
        );
      }
      return;
    }

    // Undo changes
    const undoBtn = target.closest<HTMLButtonElement>(".lasso-command-undo-btn");
    if (undoBtn) {
      const msgId = undoBtn.closest<HTMLElement>("[data-msg-id]")?.dataset.msgId;
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

    // Continue with what agent has thought so far
    const continueBtn = target.closest<HTMLButtonElement>(".lasso-command-continue-btn");
    if (continueBtn) {
      const msgId = continueBtn.closest<HTMLElement>(".lasso-command-msg")?.dataset.msgId;
      continueWithThoughts(msgId);
      return;
    }

    // Retry failed message
    const retryBtn = target.closest<HTMLButtonElement>(".lasso-command-retry-btn");
    if (retryBtn) {
      const msgId = retryBtn.closest<HTMLElement>(".lasso-command-msg")?.dataset.msgId;
      retryLastFailedPrompt(msgId);
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
  renderSuggestions();
  populateModelMenu();

  if (commandMessages.length === 0) {
    restoreLatestSession();
  }

  renderMessages();

  // Load existing conversations for the current project (non-blocking)
  loadConversationList();
}

export function closeCommandBar(): void {
  if (!commandBarEl) return;

  commandBarEl.hidden = true;
  if (commandModelMenu) {
    commandModelMenu.hidden = true;
    commandModelBtn?.setAttribute("aria-expanded", "false");
  }
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
  if (pendingEditedMessage) return;
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
  renderSuggestions();
  renderMessages();
  void loadConversationList();
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

/** Retry the last failed user prompt, optionally scoped to a specific failed message id. */
function retryLastFailedPrompt(failedMsgId?: string): void {
  if (activeTaskId) return; // already running

  // Find the failed assistant message
  const failedMsg = failedMsgId ? commandMessages.find((m) => m.id === failedMsgId && m.error) : [...commandMessages].reverse().find((m) => m.role === "assistant" && m.error);
  if (!failedMsg) return;

  // Find the user message that preceded it
  const failedIndex = commandMessages.indexOf(failedMsg);
  const precedingUserMsg = [...commandMessages]
    .slice(0, failedIndex)
    .reverse()
    .find((m) => m.role === "user");
  if (!precedingUserMsg) return;

  const promptToRetry = precedingUserMsg.content;
  if (!promptToRetry) return;

  // Remove the failed assistant message — the user message stays in place
  commandMessages.splice(failedIndex, 1);

  // Re-run without re-appending the user message (it's already there)
  void runPrompt(promptToRetry, true);
}

/** Continue execution leveraging what the agent has thought and analyzed so far. */
function continueWithThoughts(msgId?: string): void {
  if (activeTaskId) return;

  const targetMsg = msgId ? commandMessages.find((m) => m.id === msgId) : [...commandMessages].reverse().find((m) => m.role === "assistant");
  if (!targetMsg) return;

  const targetIndex = commandMessages.indexOf(targetMsg);
  const precedingUserMsg = [...commandMessages]
    .slice(0, targetIndex)
    .reverse()
    .find((m) => m.role === "user");
  const originalPrompt = precedingUserMsg?.content || "";

  // Compile the thoughts generated so far
  const thoughtSummary = (targetMsg.thinking?.steps || []).map((s) => `- ${s.title}${s.detail ? `: ${s.detail}` : ""}`).join("\n");

  const continuationPrompt = thoughtSummary ? `Continue executing the previous task: "${originalPrompt}".\n\nHere is your prior analysis and plan:\n${thoughtSummary}\n\nPlease proceed directly with the implementation and code changes from this point.` : originalPrompt;

  // Clear the error state on the target message and continue
  targetMsg.error = undefined;
  saveLocalSession();

  void runPrompt(continuationPrompt);
}

async function handleSubmit(): Promise<void> {
  if (!commandInput) return;

  // If agent is actively running and user clicks "Stop", abort the task
  if (activeTaskId) {
    const queuedPrompt = commandInput.value.trim();
    if (queuedPrompt) {
      commandMessages.push({
        id: `queued-${Date.now()}`,
        role: "user",
        content: queuedPrompt,
        timestamp: Date.now(),
        queued: true,
      });
      commandInput.value = "";
      autoResizeTextarea(commandInput);
      renderMessages();
      scrollToBottom();
      return;
    }

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
    // Emit idle to unblock teammates
    collabEmit("collab:action", {
      sessionId: state.collabProjectId,
      status: "idle",
    });
    renderMessages();
    return;
  }

  const prompt = commandInput.value.trim();
  if (!prompt) return;

  // Detect retry intent ("try again", "retry", etc.) and re-run the last failed prompt
  if (isRetryIntent(prompt)) {
    const lastFailed = [...commandMessages].reverse().find((m) => m.role === "assistant" && m.error);
    if (lastFailed) {
      commandInput.value = "";
      autoResizeTextarea(commandInput);
      retryLastFailedPrompt();
      return;
    }
    // No failed message to retry — fall through and treat as a normal prompt
  }

  void runPrompt(prompt);

  // Clear input immediately after capture
  commandInput.value = "";
  autoResizeTextarea(commandInput);
}

async function runPrompt(prompt: string, skipUserMessage = false): Promise<void> {
  if (!skipUserMessage) {
    // Append user message to history
    const userMsgId = `user-${Date.now()}`;
    commandMessages.push({
      id: userMsgId,
      role: "user",
      content: prompt,
      timestamp: Date.now(),
    });
  }

  const taskId = `oneshot-${Date.now()}`;
  activeTaskId = taskId;
  activeStartTime = Date.now();

  // Append an assistant thinking widget without echoing the user's prompt.
  // The prompt is already visible in the user bubble above; repeating it here
  // makes the agent look like it is thinking aloud and is especially noisy for
  // short messages such as "Hi".
  const initialStepTitle = "Thinking…";

  commandMessages.push({
    id: taskId,
    role: "assistant",
    content: "",
    timestamp: Date.now(),
    thinking: {
      steps: [{ title: initialStepTitle, status: "running" }],
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

  // Let the agent determine whether this needs project work.
  collabEmit("collab:action", {
    sessionId: state.collabProjectId,
    status: "building",
    summary: prompt.slice(0, 120),
  });

  // Send request to bridge
  if (state.bridgeSocket?.readyState === WebSocket.OPEN) {
    state.bridgeSocket.send(
      JSON.stringify({
        type: "oneshot",
        taskId,
        scope: "project",
        model: state.selectedModel.id,
        provider: state.selectedModel.provider,
        conversationId: activeConversationId || undefined,
        // The conversation already includes the current user message. It is
        // the only prompt context sent to the runtime.
        conversation: commandMessages.filter((message) => Boolean(message.content) && !message.error).map((message) => ({ role: message.role, content: message.content, timestamp: message.timestamp })),
      })
    );
  } else {
    // Bridge not connected — surface error immediately
    if (activeThinkingInterval) {
      clearInterval(activeThinkingInterval);
      activeThinkingInterval = null;
    }
    const errMsg = commandMessages.find((m) => m.id === taskId);
    if (errMsg) {
      if (errMsg.thinking) {
        errMsg.thinking.completed = true;
        errMsg.thinking.expanded = false;
      }
      errMsg.error = "Agent not connected. Please start the Lasso CLI (lasso dev) and try again.";
      errMsg.isStreaming = false;
    }
    activeTaskId = null;
    updateSubmitButton(false);
    collabEmit("collab:action", { sessionId: state.collabProjectId, status: "idle" });
    renderMessages();
    scrollToBottom();
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
    if (Array.isArray(message.changes) && message.changes.length) {
      targetMsg.changes = message.changes;
      targetMsg.liveChanges = message.liveChanges === true;
      targetMsg.changesApplied = false;
      targetMsg.changesUndone = false;
    }
    if (!targetMsg.thinking) {
      targetMsg.thinking = {
        steps: [],
        durationSeconds: Math.max(1, Math.round((Date.now() - activeStartTime) / 1000)),
        completed: false,
        expanded: true,
      };
    }

    // Filter out redundant generic "Thinking…" step messages so Thinking… is not duplicated
    const stepTitle = (message.message || "").trim();
    if (stepTitle && stepTitle !== "Thinking…" && stepTitle !== "Thinking") {
      // Mark previous running steps as completed
      for (const step of targetMsg.thinking.steps) {
        if (step.status === "running") step.status = "completed";
      }

      targetMsg.thinking.steps.push({
        title: stepTitle,
        detail: message.detail,
        status: "running",
      });
    }

    renderMessages();
    scrollToBottom();
  } else if (message.status === "review" || message.status === "complete") {
    if (activeThinkingInterval) {
      clearInterval(activeThinkingInterval);
      activeThinkingInterval = null;
    }

    const hasChanges = Array.isArray(message.changes) && message.changes.length > 0;
    targetMsg.error = undefined;

    if (targetMsg.thinking) {
      for (const step of targetMsg.thinking.steps) {
        step.status = "completed";
      }
      targetMsg.thinking.completed = true;
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

    targetMsg.content = message.message || "";
    if (hasChanges) {
      targetMsg.changes = message.changes;
      targetMsg.liveChanges = false;
      targetMsg.todo = Array.isArray(message.todo) ? message.todo : undefined;
    } else {
      targetMsg.changes = undefined;
      targetMsg.todo = undefined;
    }
    targetMsg.isStreaming = false;
    activeTaskId = null;
    updateSubmitButton(false);

    // Unblock teammates — Build Mode is over
    collabEmit("collab:action", {
      sessionId: state.collabProjectId,
      status: "idle",
    });

    // Persist the completed assistant message to the server conversation (non-blocking)
    if (activeConversationId && !activeConversationId.startsWith("local-session-")) {
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
        }).catch(() => {
          /* non-critical */
        });
      }
    }

    saveLocalSession();
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

    // Unblock teammates — Build Mode is over
    collabEmit("collab:action", {
      sessionId: state.collabProjectId,
      status: "idle",
    });

    saveLocalSession();
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
    saveLocalSession();
    renderMessages();
  } else if (message.type === "undone") {
    targetMsg.changesUndone = true;
    targetMsg.changesApplied = false;
    saveLocalSession();
    renderMessages();
  }
}

export function handleCommandBarSteerResult(message: { taskId: string; queueId: string; success: boolean; error?: string }): void {
  const queued = commandMessages.find((msg) => msg.id === message.queueId);
  if (!queued) return;

  queued.steering = false;
  if (message.success) {
    queued.queued = false;
    queued.steered = true;
  } else {
    queued.error = message.error || "The agent could not accept this steering prompt.";
  }
  renderMessages();
}

export function handleCommandBarPrompt(message: any): void {
  const taskId = message.taskId;
  let targetMsg = commandMessages.find((m) => m.id === taskId);
  if (!targetMsg) {
    targetMsg = [...commandMessages].reverse().find((m) => m.role === "assistant");
  }
  if (!targetMsg) return;

  if (activeThinkingInterval) {
    clearInterval(activeThinkingInterval);
    activeThinkingInterval = null;
  }

  if (targetMsg.thinking) {
    for (const step of targetMsg.thinking.steps) {
      step.status = "completed";
    }
    targetMsg.thinking.completed = true;
    targetMsg.thinking.expanded = false;
  }

  const question = message.prompt?.question || message.message || "";
  targetMsg.content = question;
  targetMsg.isStreaming = false;
  activeTaskId = null;
  updateSubmitButton(false);

  // Unblock teammates — Build Mode is over
  collabEmit("collab:action", {
    sessionId: state.collabProjectId,
    status: "idle",
  });

  renderMessages();
  scrollToBottom();

  if (commandInput) {
    commandInput.focus();
  }
}

function renderMessages(): void {
  if (!commandMessagesEl || !commandEmptyEl) return;

  if (commandMessages.length === 0) {
    commandEmptyEl.hidden = false;
    commandEmptyEl.style.display = "flex";
    commandMessagesEl.hidden = true;
    commandMessagesEl.style.display = "none";
    commandMessagesEl.innerHTML = "";
    return;
  }

  commandEmptyEl.hidden = true;
  commandEmptyEl.style.display = "none";
  commandMessagesEl.hidden = false;
  commandMessagesEl.style.display = "flex";

  let html = "";
  for (const msg of commandMessages) {
    if (msg.role === "user") {
      html += `
        <div class="lasso-command-msg user" data-msg-id="${escapeHtml(msg.id)}">
          ${
            editingMessageId === msg.id
              ? `
            <div class="lasso-command-edit-form">
              <textarea class="lasso-command-edit-input" aria-label="Edit your message">${escapeHtml(msg.content)}</textarea>
              <div class="lasso-command-edit-warning">Sending from here reverts accepted file changes from later turns.</div>
              ${msg.editError ? `<div class="lasso-command-edit-error">${escapeHtml(msg.editError)}</div>` : ""}
              <div class="lasso-command-edit-actions">
                <button class="lasso-command-edit-cancel" type="button"${pendingEditedMessage ? " disabled" : ""}>Cancel</button>
                <button class="lasso-command-edit-send primary" type="button"${pendingEditedMessage ? " disabled" : ""}>${pendingEditedMessage?.messageId === msg.id ? "Reverting…" : "Update &amp; resend"}</button>
              </div>
            </div>
          `
              : msg.queued
                ? `<div class="lasso-command-msg-bubble">${escapeHtml(msg.content)}</div>`
                : `
            <button class="lasso-command-msg-bubble lasso-command-editable-message" type="button" title="Click to edit and resend this prompt"${activeTaskId || pendingEditedMessage ? " disabled" : ""}>
              <span>${escapeHtml(msg.content)}</span><span class="lasso-command-edit-hint" aria-hidden="true">Edit</span>
            </button>
          `
          }
          ${msg.queued ? `<button class="lasso-command-steer-btn" type="button"${msg.steering ? " disabled" : ""} style="margin-top: 6px; padding: 4px 9px; border: 1px solid rgba(96, 165, 250, 0.45); border-radius: 6px; background: rgba(59, 130, 246, 0.14); color: #bfdbfe; cursor: pointer;">${msg.steering ? "Steering…" : "Steer"}</button>` : msg.steered ? `<span class="lasso-command-steered-label" style="display: inline-block; margin-top: 6px; color: #93c5fd; font-size: 12px;">Steered into next turn</span>` : ""}
        </div>
      `;
    } else {
      html += `
        <div class="lasso-command-msg assistant" data-msg-id="${msg.id}">
          ${renderThinking(msg)}
          ${msg.content ? `<div class="lasso-command-msg-text">${formatMessageText(msg.content)}</div>` : ""}
          ${
            msg.error
              ? `
            <div class="lasso-command-msg-error">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              ${escapeHtml(msg.error)}
            </div>
            <div class="lasso-command-error-actions" style="display: flex; gap: 8px; margin-top: 6px; flex-wrap: wrap;">
              ${
                msg.thinking && msg.thinking.steps.length > 0
                  ? `
                <button class="lasso-command-continue-btn" type="button" title="Continue execution using the thoughts and analysis generated so far" style="display: inline-flex; align-items: center; gap: 5px; padding: 5px 10px; font-size: 12px; font-weight: 500; border-radius: 6px; background: rgba(59, 130, 246, 0.15); border: 1px solid rgba(59, 130, 246, 0.3); color: #93c5fd; cursor: pointer;">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  Continue with thoughts so far
                </button>
              `
                  : ""
              }
              <button class="lasso-command-retry-btn" type="button" title="Retry from start" style="display: inline-flex; align-items: center; gap: 5px; padding: 5px 10px; font-size: 12px; font-weight: 500; border-radius: 6px; background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.15); color: #e2e8f0; cursor: pointer;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                Retry
              </button>
            </div>
          `
              : ""
          }
        </div>
      `;
    }
  }

  commandMessagesEl.innerHTML = html;
  renderLiveReviewTray();
}

function renderLiveReviewTray(): void {
  const tray = commandBarEl?.querySelector<HTMLDivElement>(".lasso-command-live-review-tray");
  if (!tray) return;
  const message = [...commandMessages].reverse().find((item) => item.role === "assistant" && item.changes?.length && !item.changesApplied && !item.changesUndone);
  if (!message?.changes?.length) {
    tray.hidden = true;
    tray.innerHTML = "";
    return;
  }

  const files = message.changes.map((change) => {
    const extension = getFileExtension(change.filePath);
    return `<button class="lasso-review-tray-file" type="button" data-task-id="${escapeHtml(message.id)}" data-file-path="${escapeHtml(change.filePath)}" title="View diff for ${escapeHtml(change.filePath)}">
      <span class="lasso-review-tray-file-heading">
        <span class="lasso-command-file-extension ${extension.className}">${escapeHtml(extension.label)}</span>
        <span class="lasso-review-tray-file-name" title="${escapeHtml(change.filePath)}">${escapeHtml(getPathBasename(change.filePath))}</span>
        <span class="lasso-review-tray-open-icon" aria-hidden="true">↗</span>
      </span>
    </button>`;
  }).join("");

  tray.dataset.msgId = message.id;
  tray.hidden = false;
  tray.innerHTML = `<div class="lasso-review-tray-header">
      <strong>${message.liveChanges ? "Files changing" : "Changed files"}</strong>
      <span>${message.changes.length} file${message.changes.length === 1 ? "" : "s"}</span>
    </div>
    <div class="lasso-review-tray-files">${files}</div>
    <div class="lasso-review-tray-actions">
      <span>${message.liveChanges ? "Accepting or rejecting stops the agent." : "Accept or reject these edits."}</span>
      <div>
        <button class="lasso-command-undo-btn secondary" type="button">${message.liveChanges ? "Stop & reject" : "Reject"}</button>
        <button class="lasso-command-apply-btn primary" type="button">${message.liveChanges ? "Accept current" : "Accept changes"}</button>
      </div>
    </div>`;
}

function openReviewDiffModal(change: SourceChange): void {
  if (!reviewDiffModal) return;
  reviewDiffModal.innerHTML = `<section class="lasso-review-diff-modal" role="dialog" aria-modal="true" aria-label="Diff for ${escapeHtml(change.filePath)}">
    <header class="lasso-review-diff-modal-header">
      <div class="lasso-review-diff-modal-file">
        <span class="lasso-command-file-extension ${getFileExtension(change.filePath).className}">${escapeHtml(getFileExtension(change.filePath).label)}</span>
        <div><strong>${escapeHtml(getPathBasename(change.filePath))}</strong><span title="${escapeHtml(change.filePath)}">${escapeHtml(change.filePath)}</span></div>
      </div>
      <button class="lasso-review-diff-close" type="button" aria-label="Close diff" title="Close">×</button>
    </header>
    <div class="lasso-review-diff-modal-body"><pre class="lasso-command-diff-content">${renderLineDiff(change.oldString, change.newString)}</pre></div>
  </section>`;
  reviewDiffModal.hidden = false;
  reviewDiffModal.querySelector<HTMLButtonElement>(".lasso-review-diff-close")?.focus();
}

function closeReviewDiffModal(): void {
  if (!reviewDiffModal) return;
  reviewDiffModal.hidden = true;
  reviewDiffModal.replaceChildren();
}

function sendEditedMessage(messageId: string, prompt: string, button: HTMLButtonElement): void {
  if (!state.bridgeSocket || state.bridgeSocket.readyState !== WebSocket.OPEN) {
    const message = commandMessages.find((item) => item.id === messageId);
    if (message) message.editError = "Lasso is disconnected. Reconnect before resending this message.";
    renderMessages();
    return;
  }

  const index = commandMessages.findIndex((item) => item.id === messageId);
  if (index < 0) return;
  const appliedTaskIds = commandMessages
    .slice(index + 1)
    .filter((item) => item.role === "assistant" && item.id.startsWith("oneshot-") && item.changesApplied && !item.changesUndone)
    .map((item) => item.id);
  const pendingTaskIds = commandMessages
    .slice(index + 1)
    .filter((item) => item.role === "assistant" && item.id.startsWith("oneshot-") && Array.isArray(item.changes) && item.changes.length > 0 && !item.changesApplied && !item.changesUndone)
    .map((item) => item.id);
  pendingEditedMessage = { messageId, prompt };
  button.disabled = true;
  button.textContent = "Reverting…";
  state.bridgeSocket.send(JSON.stringify({ type: "rewind_conversation", targetMessageId: messageId, taskIds: appliedTaskIds, pendingTaskIds }));
}

export function handleCommandBarRewindResult(message: { targetMessageId: string; success: boolean; error?: string }): void {
  const pending = pendingEditedMessage;
  if (!pending || pending.messageId !== message.targetMessageId) return;
  const index = commandMessages.findIndex((item) => item.id === pending.messageId);
  if (index < 0) {
    pendingEditedMessage = null;
    editingMessageId = null;
    return;
  }

  if (!message.success) {
    const target = commandMessages[index];
    if (target) target.editError = message.error || "Could not rewind the project to this message.";
    pendingEditedMessage = null;
    renderMessages();
    return;
  }

  const editedPrompt = pending.prompt;
  commandMessages[index]!.content = editedPrompt;
  commandMessages = commandMessages.slice(0, index + 1);
  pendingEditedMessage = null;
  editingMessageId = null;
  // A corrected prompt starts a new branch; keep the old local session in history.
  activeConversationId = null;
  saveLocalSession();
  renderMessages();
  void runPrompt(editedPrompt, true);
}

function renderThinkingStepTitle(title: string): string {
  const separator = title.indexOf(":");
  const tool = separator === -1 ? title : title.slice(0, separator).trim();
  const icon = thinkingToolIcons[tool];
  if (!icon) return `<span>${escapeHtml(title)}</span>`;

  const detail = separator === -1 ? "" : title.slice(separator + 1).trim();
  const iconMarkup = icon
    .map(([tag, attributes]) => {
      const attrs = Object.entries(attributes)
        .filter(([key]) => key !== "key")
        .map(([key, value]) => {
          const name = key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
          const escaped = String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
          return `${name}="${escaped}"`;
        })
        .join(" ");
      return `<${tag} ${attrs} />`;
    })
    .join("");

  const label = detail || tool.replace(/_/g, " ");
  const accessibleToolName = escapeHtml(tool.replace(/_/g, " "));
  return `<span class="lasso-step-tool-icon" role="img" aria-label="${accessibleToolName}" title="${accessibleToolName}"><svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">${iconMarkup}</svg></span><span>${escapeHtml(label)}</span>`;
}

function renderThinking(msg: CommandMessage): string {
  if (!msg.thinking) return "";
  const { steps, durationSeconds, completed, expanded } = msg.thinking;

  if (!completed) {
    // Live thinking process
    return `
      <div class="lasso-command-thinking-active">
        <button class="lasso-command-thinking-header" type="button" aria-expanded="${expanded}">
          <div class="lasso-command-thinking-pulse">
            <span class="lasso-command-pulse-ring"></span>
            <span class="lasso-command-pulse-dot"></span>
          </div>
          <span class="lasso-command-thinking-title">Thinking…</span>
          <span class="lasso-command-active-timer">${formatDuration(durationSeconds)}</span>
          <svg class="lasso-command-thought-chevron ${expanded ? "expanded" : ""}" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 18l6-6-6-6"/>
          </svg>
        </button>
        <div class="lasso-command-thinking-steps" ${expanded ? "" : "hidden"}>
          ${steps
            .map(
              (step) => `
            <div class="lasso-command-thinking-step ${step.status}">
              ${
                step.status === "running"
                  ? `<span class="lasso-step-status-icon lasso-step-status-spinner" role="img" aria-label="In progress"><span class="lasso-step-spinner-ring"></span><span class="lasso-step-spinner-dot"></span></span>`
                  : `<span class="lasso-step-status-icon">${step.status === "failed" ? "×" : "✓"}</span>`
              }
              <div class="lasso-step-content">
                <div class="lasso-step-name">${renderThinkingStepTitle(step.title)}</div>
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
              <div class="lasso-step-name">${renderThinkingStepTitle(step.title)}</div>
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
  const showDiff = msg.showDiff !== false; // Default diff view visible on changes
  const rejected = new Set(msg.rejectedFilePaths || []);
  const activeFile = msg.activeDiffFile || changes[0]?.filePath;

  const scopeHtml =
    msg.todo && msg.todo.length
      ? `
    <div class="lasso-command-scope-list">
      ${msg.todo
        .map(
          (item) => `
        <div class="lasso-command-scope-item">
          <span class="lasso-command-scope-action ${item.action}">${item.action === "create" ? "+" : item.action === "delete" ? "−" : "~"}</span>
          <span class="lasso-command-scope-file">${escapeHtml(item.file)}</span>
          <span class="lasso-command-scope-reason">${escapeHtml(item.reason)}</span>
        </div>
      `
        )
        .join("")}
    </div>
  `
      : "";

  const approvedCount = changes.length - rejected.size;
  const totals = changes.reduce(
    (result, change) => {
      const stats = getLineDiff(change.oldString, change.newString);
      result.additions += stats.additions;
      result.deletions += stats.deletions;
      return result;
    },
    { additions: 0, deletions: 0 }
  );

  return `
    <div class="lasso-command-changes-card">
      <div class="lasso-command-changes-header">
        <div class="lasso-command-changes-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          <span>${msg.liveChanges ? "Live changes" : "Proposed changes"} (${approvedCount}/${changes.length} files selected)</span>
        </div>
        <div class="lasso-command-diff-stats" aria-label="${totals.additions} lines added, ${totals.deletions} lines removed">
          <span class="additions">+${totals.additions}</span><span class="deletions">−${totals.deletions}</span>
        </div>
        <button class="lasso-command-toggle-diff" type="button">
          ${showDiff ? "Hide diffs" : "Inspect diffs"}
        </button>
      </div>
      ${scopeHtml}

      <div class="lasso-command-files-list">
        ${changes
          .map((c) => {
            const isExcluded = rejected.has(c.filePath);
            const isSelected = activeFile === c.filePath;
            const stats = getLineDiff(c.oldString, c.newString);
            const extension = getFileExtension(c.filePath);
            return `
          <div class="lasso-command-file-row ${isSelected ? "selected" : ""} ${isExcluded ? "excluded" : ""}" data-file-path="${escapeHtml(c.filePath)}">
            <label class="lasso-command-file-checkbox-label" title="${isExcluded ? "Click to include file" : "Click to exclude file"}">
              <input type="checkbox" class="lasso-command-file-check" ${isExcluded ? "" : "checked"} data-file-path="${escapeHtml(c.filePath)}" />
            </label>
            <span class="lasso-command-file-badge ${c.oldString ? "modified" : "added"}">${c.oldString ? "M" : "+"}</span>
            <span class="lasso-command-file-extension ${extension.className}" aria-hidden="true">${escapeHtml(extension.label)}</span>
            <span class="lasso-command-file-name" title="${c.filePath}">${escapeHtml(c.filePath)}</span>
            <span class="lasso-command-file-stats"><span class="additions">+${stats.additions}</span><span class="deletions">−${stats.deletions}</span></span>
            <button class="lasso-command-view-file-diff-btn" type="button" data-file-path="${escapeHtml(c.filePath)}" title="View diff for this file">
              ${isSelected ? "Active" : "Inspect"}
            </button>
          </div>
        `;
          })
          .join("")}
      </div>

      ${showDiff ? renderDiffPreview(changes, activeFile, rejected) : ""}

      <div class="lasso-command-changes-footer">
        ${
          isApplied
            ? `
          <div class="lasso-command-status-applied">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            <span>Changes accepted</span>
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
          ${msg.liveChanges ? `<div class="lasso-command-live-review-note">Accepting or discarding will stop the agent and review its current edits.</div>` : ""}
          <button class="lasso-command-apply-btn primary" type="button">
            <span>${msg.liveChanges ? "Accept Current" : "Keep Selected"} (${approvedCount})</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          </button>
          <button class="lasso-command-undo-btn secondary" type="button">${msg.liveChanges ? "Stop & discard" : "Discard"}</button>
        `
        }
      </div>
    </div>
  `;
}

function renderDiffPreview(changes: SourceChange[], activeFilePath?: string, rejected?: Set<string>): string {
  // If activeFilePath is specified, highlight or show that file first, or show all
  const filtered = activeFilePath ? changes.filter((c) => c.filePath === activeFilePath) : changes;
  const listToRender = filtered.length > 0 ? filtered : changes;

  return `
    <div class="lasso-command-diff-container">
      ${listToRender
        .map((c) => {
          const stats = getLineDiff(c.oldString, c.newString);
          const extension = getFileExtension(c.filePath);
          return `
        <div class="lasso-command-diff-file ${rejected?.has(c.filePath) ? "excluded-diff" : ""}">
          <div class="lasso-command-diff-file-header">
            <span class="lasso-command-diff-file-name"><span class="lasso-command-file-extension ${extension.className}">${escapeHtml(extension.label)}</span>${escapeHtml(getPathBasename(c.filePath))}</span>
            <span class="lasso-command-file-stats"><span class="additions">+${stats.additions}</span><span class="deletions">−${stats.deletions}</span></span>
            ${rejected?.has(c.filePath) ? `<span style="color: #f87171; font-size: 11px; margin-left: 8px;">(Excluded from apply)</span>` : ""}
          </div>
          <pre class="lasso-command-diff-content">${renderLineDiff(c.oldString, c.newString)}</pre>
        </div>
      `;
        })
        .join("")}
    </div>
  `;
}

type DiffLine = { kind: "add" | "delete" | "context"; text: string };

/** Compute an LCS line diff, trimming identical edges and bounding large files. */
function getLineDiff(oldText: string, newText: string): { additions: number; deletions: number; lines: DiffLine[] } {
  const oldLines = oldText ? oldText.replace(/\r\n/g, "\n").split("\n") : [];
  const newLines = newText ? newText.replace(/\r\n/g, "\n").split("\n") : [];
  let prefix = 0;
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) prefix++;
  let suffix = 0;
  while (suffix < oldLines.length - prefix && suffix < newLines.length - prefix && oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]) suffix++;

  const oldMiddle = oldLines.slice(prefix, oldLines.length - suffix);
  const newMiddle = newLines.slice(prefix, newLines.length - suffix);
  let changed: DiffLine[];
  if (oldMiddle.length * newMiddle.length > 1_000_000) {
    changed = [...oldMiddle.map((text) => ({ kind: "delete" as const, text })), ...newMiddle.map((text) => ({ kind: "add" as const, text }))];
  } else {
    const lcs = Array.from({ length: oldMiddle.length + 1 }, () => new Uint32Array(newMiddle.length + 1));
    for (let i = oldMiddle.length - 1; i >= 0; i--) {
      for (let j = newMiddle.length - 1; j >= 0; j--) {
        lcs[i][j] = oldMiddle[i] === newMiddle[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
      }
    }
    changed = [];
    let i = 0;
    let j = 0;
    while (i < oldMiddle.length && j < newMiddle.length) {
      if (oldMiddle[i] === newMiddle[j]) {
        changed.push({ kind: "context", text: oldMiddle[i++] });
        j++;
      } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
        changed.push({ kind: "delete", text: oldMiddle[i++] });
      } else {
        changed.push({ kind: "add", text: newMiddle[j++] });
      }
    }
    while (i < oldMiddle.length) changed.push({ kind: "delete", text: oldMiddle[i++] });
    while (j < newMiddle.length) changed.push({ kind: "add", text: newMiddle[j++] });
  }

  const lines: DiffLine[] = [...oldLines.slice(0, prefix).map((text) => ({ kind: "context" as const, text })), ...changed, ...oldLines.slice(oldLines.length - suffix).map((text) => ({ kind: "context" as const, text }))];
  return {
    additions: lines.filter((line) => line.kind === "add").length,
    deletions: lines.filter((line) => line.kind === "delete").length,
    lines,
  };
}

function renderLineDiff(oldText: string, newText: string): string {
  const diff = getLineDiff(oldText, newText);
  const visible = diff.lines.length > 240 ? diff.lines.slice(0, 240) : diff.lines;
  if (!visible.length) return '<span class="lasso-diff-context">No textual changes</span>';
  const rendered = visible.map((line) => {
    const marker = line.kind === "add" ? "+" : line.kind === "delete" ? "−" : " ";
    const className = line.kind === "add" ? "lasso-diff-add" : line.kind === "delete" ? "lasso-diff-del" : "lasso-diff-context";
    return `<span class="${className}">${marker} ${escapeHtml(line.text) || " "}</span>`;
  });
  if (diff.lines.length > visible.length) rendered.push(`<span class="lasso-diff-context">… ${diff.lines.length - visible.length} more lines</span>`);
  return rendered.join("\n");
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
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
