import { getDOM } from "../dom";
import { state } from "../state";
import { collabEmit } from "../collab/socket";
import type { CollabClipboardItem } from "../types";

/**
 * Safely read text from the system clipboard.
 * Falls back to window.prompt() when the Clipboard API is unavailable
 * (e.g., non-secure HTTP contexts).
 */
async function safeClipboardRead(): Promise<string> {
  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard &&
    typeof navigator.clipboard.readText === "function" &&
    window.isSecureContext
  ) {
    return navigator.clipboard.readText();
  }
  // Fallback: prompt the user to paste manually
  const text = window.prompt("Paste your text here (clipboard access unavailable on non-HTTPS pages):");
  return text ?? "";
}

/**
 * Safely write text to the system clipboard.
 * Falls back to execCommand('copy') when the Clipboard API is unavailable.
 */
async function safeClipboardWrite(text: string): Promise<void> {
  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === "function" &&
    window.isSecureContext
  ) {
    await navigator.clipboard.writeText(text);
    return;
  }
  // Fallback: use a temporary textarea + execCommand
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.cssText = "position:fixed;top:-9999px;left:-9999px;opacity:0";
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
  } finally {
    ta.remove();
  }
}

let panel: HTMLDivElement | null = null;
let items: CollabClipboardItem[] = [];
let scope: "private" | "shared" = "private";

const PRIVATE_STORAGE_KEY = "lasso:clipboard:private";

const TYPE_ICONS: Record<string, string> = {
  text: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 6.1H3"/><path d="M21 12.1H3"/><path d="M15.1 18H3"/></svg>`,
  url:  `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
  code: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,
  json: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3a2 2 0 0 0-2 2"/><path d="M19 3a2 2 0 0 1 2 2"/><path d="M21 19a2 2 0 0 1-2 2"/><path d="M5 21a2 2 0 0 1-2-2"/><path d="M9 3h1"/><path d="M9 21h1"/><path d="M14 3h1"/><path d="M14 21h1"/><path d="M3 9v1"/><path d="M21 9v1"/><path d="M3 14v1"/><path d="M21 14v1"/></svg>`,
  image:`<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>`,
};

const TYPE_COLORS: Record<string, string> = {
  text:  "var(--lo-text-3)",
  url:   "#60a5fa",
  code:  "#a78bfa",
  json:  "#34d399",
  image: "#fb923c",
};

export function buildClipboardPanel(): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "lasso-clipboard-panel";
  el.hidden = true;
  el.innerHTML = `
    <div class="lasso-clipboard-header">
      <div class="lasso-clipboard-header-left">
        <span class="lasso-clipboard-title">Clipboard</span>
        <span class="lasso-clipboard-subtitle">Saved snippets &amp; references</span>
      </div>
      <button class="lasso-clipboard-close" type="button" aria-label="Close clipboard">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>
    </div>
    <div class="lasso-clipboard-tabs" role="tablist">
      <button class="lasso-clipboard-tab active" data-scope="private" type="button">Private</button>
      <button class="lasso-clipboard-tab" data-scope="shared" type="button">Shared</button>
    </div>
    <div class="lasso-clipboard-compose">
      <div class="lasso-clipboard-compose-top">
        <select class="lasso-clipboard-type" aria-label="Clipboard item type">
          <option value="text">Text</option>
          <option value="url">URL</option>
          <option value="code">Code</option>
          <option value="json">JSON</option>
          <option value="image">Image</option>
        </select>
        <input class="lasso-clipboard-label" type="text" placeholder="Label (optional)" />
      </div>
      <textarea class="lasso-clipboard-input" rows="3" placeholder="Paste or type something to save…"></textarea>
      <div class="lasso-clipboard-compose-actions">
        <button class="lasso-clipboard-read" type="button">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/></svg>
          Read clipboard
        </button>
        <button class="lasso-clipboard-add" type="button">Save</button>
      </div>
    </div>
    <div class="lasso-clipboard-list"></div>
  `;
  getDOM().shadow.appendChild(el);
  panel = el;

  el.querySelector<HTMLButtonElement>(".lasso-clipboard-close")!.addEventListener("click", () => toggleClipboardPanel(false));
  el.querySelectorAll<HTMLButtonElement>(".lasso-clipboard-tab").forEach((button) => {
    button.addEventListener("click", () => {
      scope = button.dataset.scope === "shared" ? "shared" : "private";
      el.querySelectorAll(".lasso-clipboard-tab").forEach((tab) => tab.classList.toggle("active", tab === button));
      requestItems();
    });
  });
  el.querySelector<HTMLButtonElement>(".lasso-clipboard-read")!.addEventListener("click", async () => {
    try {
      const text = await safeClipboardRead();
      if (text) {
        const input = el.querySelector<HTMLTextAreaElement>(".lasso-clipboard-input")!;
        input.value = text;
        if (!el.querySelector<HTMLInputElement>(".lasso-clipboard-label")!.value) input.focus();
      }
    } catch { setStatus("Clipboard permission denied"); }
  });
  el.querySelector<HTMLButtonElement>(".lasso-clipboard-add")!.addEventListener("click", () => {
    const content = el.querySelector<HTMLTextAreaElement>(".lasso-clipboard-input")!.value;
    const type = el.querySelector<HTMLSelectElement>(".lasso-clipboard-type")!.value as CollabClipboardItem["type"];
    const label = el.querySelector<HTMLInputElement>(".lasso-clipboard-label")!.value || type;
    if (!content.trim()) return setStatus("Add some content first");
    if (scope === "shared" && (!state.collabJoined || !state.collabProjectId)) return setStatus("Join a session to use Shared");

    if (scope === "private") {
      const newItem: CollabClipboardItem = {
        uid: `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        scope: "private",
        type,
        label,
        content,
        createdAt: new Date().toISOString(),
      };
      items.unshift(newItem);
      savePrivateItems();
      el.querySelector<HTMLTextAreaElement>(".lasso-clipboard-input")!.value = "";
      el.querySelector<HTMLInputElement>(".lasso-clipboard-label")!.value = "";
      render();
      setStatus("Saved ✓");
      return;
    }

    collabEmit("clipboard:add", { scope, type, label, content, sessionId: state.collabProjectId }, (response) => {
      if (!response.ok) return setStatus(response.error || "Unable to save item");
      if (response.item) upsertClipboardItem(response.item as CollabClipboardItem);
      el.querySelector<HTMLTextAreaElement>(".lasso-clipboard-input")!.value = "";
      el.querySelector<HTMLInputElement>(".lasso-clipboard-label")!.value = "";
      setStatus("Saved ✓");
    });
  });
  render();
  requestItems();
  return el;
}

function loadPrivateItems(): CollabClipboardItem[] {
  try {
    const raw = window.localStorage.getItem(PRIVATE_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CollabClipboardItem[]) : [];
  } catch { return []; }
}

function savePrivateItems(): void {
  try {
    const privateItems = items.filter((item) => item.scope === "private");
    window.localStorage.setItem(PRIVATE_STORAGE_KEY, JSON.stringify(privateItems));
  } catch {}
}

function requestItems() {
  if (scope === "private") {
    const privateItems = loadPrivateItems();
    items = [...privateItems, ...items.filter((item) => item.scope === "shared")];
    render();
    return;
  }
  if (!state.collabJoined || !state.collabProjectId) { render(); return; }
  collabEmit("clipboard:list", { scope, sessionId: state.collabProjectId }, (response) => {
    if (response.ok) {
      const shared = (response.items || []) as CollabClipboardItem[];
      items = [...items.filter((item) => item.scope === "private"), ...shared];
      render();
    } else setStatus(response.error || "Unable to load clipboard");
  });
}

export function upsertClipboardItem(item: CollabClipboardItem) {
  const index = items.findIndex((candidate) => candidate.uid === item.uid);
  if (index === -1) items.unshift(item); else items[index] = item;
  render();
}

export function removeClipboardItem(uid: string) {
  items = items.filter((item) => item.uid !== uid);
  render();
}

function typeIcon(type: string) {
  return TYPE_ICONS[type] ?? TYPE_ICONS.text;
}

function typeColor(type: string) {
  return TYPE_COLORS[type] ?? TYPE_COLORS.text;
}

function render() {
  const list = panel?.querySelector<HTMLDivElement>(".lasso-clipboard-list");
  if (!list) return;
  const visible = items.filter((item) => item.scope === scope);
  if (!visible.length) {
    list.innerHTML = `<div class="lasso-clipboard-empty">${scope === "shared" && !state.collabJoined ? "Join a collaboration session to share items." : "No saved items yet."}</div>`;
    return;
  }
  list.innerHTML = visible.map((item) => {
    const color = typeColor(item.type);
    const icon = typeIcon(item.type);
    const preview = escapeHtml(item.content).slice(0, 220);
    const isMono = item.type === "code" || item.type === "json";
    return `
      <div class="lasso-clipboard-item" data-id="${escapeAttr(item.uid)}">
        <div class="lasso-clipboard-item-header">
          <span class="lasso-clipboard-item-type-chip" style="--chip-color:${color}">${icon}<span>${item.type}</span></span>
          <span class="lasso-clipboard-item-label">${escapeHtml(item.label)}</span>
        </div>
        <div class="lasso-clipboard-item-content ${isMono ? "mono" : ""}">${preview}${item.content.length > 220 ? '<span class="lasso-clipboard-fade"></span>' : ""}</div>
        <div class="lasso-clipboard-item-footer">
          <button class="lasso-clipboard-copy-item" type="button">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
            Copy
          </button>
          <button class="lasso-clipboard-delete-item" type="button">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
            Delete
          </button>
        </div>
      </div>`;
  }).join("");
  list.querySelectorAll<HTMLDivElement>(".lasso-clipboard-item").forEach((row) => {
    const item = visible.find((candidate) => candidate.uid === row.dataset.id);
    if (!item) return;
    const copyBtn = row.querySelector<HTMLButtonElement>(".lasso-clipboard-copy-item")!;
    copyBtn.addEventListener("click", async () => {
      try {
        await safeClipboardWrite(item.content);
        copyBtn.textContent = "Copied!";
        window.setTimeout(() => { copyBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg> Copy`; }, 1400);
      } catch { setStatus("Copy failed — check clipboard permissions"); }
    });
    row.querySelector<HTMLButtonElement>(".lasso-clipboard-delete-item")!.addEventListener("click", () => {
      row.classList.add("removing");
      window.setTimeout(() => {
        if (item.scope === "private") {
          removeClipboardItem(item.uid);
          savePrivateItems();
          return;
        }
        collabEmit("clipboard:remove", { scope, itemId: item.uid, sessionId: state.collabProjectId }, (response) => {
          if (response.ok) removeClipboardItem(item.uid);
          else { row.classList.remove("removing"); setStatus(response.error || "Unable to delete item"); }
        });
      }, 180);
    });
  });
}

function setStatus(message: string) {
  const sub = panel?.querySelector<HTMLSpanElement>(".lasso-clipboard-subtitle");
  if (!sub) return;
  const previous = sub.textContent;
  sub.textContent = message;
  window.setTimeout(() => { if (sub.textContent === message) sub.textContent = previous || "Saved snippets & references"; }, 1800);
}

export function toggleClipboardPanel(force?: boolean) {
  if (!panel) return;
  const next = force === undefined ? Boolean(panel.hidden) : force;
  panel.hidden = !next;
  panel.classList.toggle("visible", next);
  if (next) requestItems();
}

function escapeHtml(value: string) { return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] || char); }
function escapeAttr(value: string) { return escapeHtml(value); }
