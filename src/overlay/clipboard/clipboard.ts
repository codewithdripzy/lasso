import { getDOM } from "../dom";
import { state } from "../state";
import { collabEmit } from "../collab/socket";
import type { CollabClipboardItem } from "../types";

let panel: HTMLDivElement | null = null;
let items: CollabClipboardItem[] = [];
let scope: "private" | "shared" = "private";

export function buildClipboardPanel(): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "lasso-clipboard-panel";
  el.hidden = true;
  el.innerHTML = `
    <div class="lasso-clipboard-header">
      <div><span class="lasso-clipboard-title">Clipboard</span><span class="lasso-clipboard-subtitle">Saved snippets and references</span></div>
      <button class="lasso-clipboard-close" type="button" aria-label="Close clipboard">×</button>
    </div>
    <div class="lasso-clipboard-tabs" role="tablist">
      <button class="lasso-clipboard-tab active" data-scope="private" type="button">Private</button>
      <button class="lasso-clipboard-tab" data-scope="shared" type="button">Shared</button>
    </div>
    <div class="lasso-clipboard-compose">
      <div class="lasso-clipboard-compose-row">
        <select class="lasso-clipboard-type" aria-label="Clipboard item type"><option value="text">Text</option><option value="url">URL</option><option value="code">Code</option><option value="json">JSON</option><option value="image">Image</option></select>
        <input class="lasso-clipboard-label" type="text" placeholder="Label (optional)" />
      </div>
      <textarea class="lasso-clipboard-input" rows="3" placeholder="Paste or type something to save…"></textarea>
      <div class="lasso-clipboard-compose-actions"><button class="lasso-clipboard-read" type="button">Read system clipboard</button><button class="lasso-clipboard-add" type="button">Save item</button></div>
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
      const text = await navigator.clipboard.readText();
      const input = el.querySelector<HTMLTextAreaElement>(".lasso-clipboard-input")!;
      input.value = text;
      if (!el.querySelector<HTMLInputElement>(".lasso-clipboard-label")!.value) input.focus();
    } catch { setStatus("Clipboard permission denied"); }
  });
  el.querySelector<HTMLButtonElement>(".lasso-clipboard-add")!.addEventListener("click", () => {
    const content = el.querySelector<HTMLTextAreaElement>(".lasso-clipboard-input")!.value;
    const type = el.querySelector<HTMLSelectElement>(".lasso-clipboard-type")!.value as CollabClipboardItem["type"];
    const label = el.querySelector<HTMLInputElement>(".lasso-clipboard-label")!.value || type;
    if (!content.trim()) return setStatus("Add some content first");
    if (scope === "shared" && (!state.collabJoined || !state.collabProjectId)) return setStatus("Join a session to use Shared");
    collabEmit("clipboard:add", { scope, type, label, content, sessionId: state.collabProjectId }, (response) => {
      if (!response.ok) return setStatus(response.error || "Unable to save item");
      if (response.item) upsertClipboardItem(response.item as CollabClipboardItem);
      el.querySelector<HTMLTextAreaElement>(".lasso-clipboard-input")!.value = "";
      el.querySelector<HTMLInputElement>(".lasso-clipboard-label")!.value = "";
      setStatus("Saved");
    });
  });
  render();
  requestItems();
  return el;
}

function requestItems() {
  if (scope === "shared" && (!state.collabJoined || !state.collabProjectId)) { render(); return; }
  collabEmit("clipboard:list", { scope, sessionId: state.collabProjectId }, (response) => {
    if (response.ok) { items = (response.items || []) as CollabClipboardItem[]; render(); }
    else setStatus(response.error || "Unable to load clipboard");
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

function render() {
  const list = panel?.querySelector<HTMLDivElement>(".lasso-clipboard-list");
  if (!list) return;
  const visible = items.filter((item) => item.scope === scope);
  list.innerHTML = visible.length ? visible.map((item) => `<div class="lasso-clipboard-item" data-id="${escapeAttr(item.uid)}"><div class="lasso-clipboard-item-meta"><span class="lasso-clipboard-item-label">${escapeHtml(item.label)}</span><span class="lasso-clipboard-item-type">${item.type}</span></div><div class="lasso-clipboard-item-content">${escapeHtml(item.content).slice(0, 260)}</div><div class="lasso-clipboard-item-actions"><button class="lasso-clipboard-copy-item" type="button">Copy</button><button class="lasso-clipboard-delete-item" type="button">Delete</button></div></div>`).join("") : `<div class="lasso-clipboard-empty">${scope === "shared" && !state.collabJoined ? "Join a collaboration session to share items." : "No saved items yet."}</div>`;
  list.querySelectorAll<HTMLDivElement>(".lasso-clipboard-item").forEach((row) => {
    const item = visible.find((candidate) => candidate.uid === row.dataset.id);
    if (!item) return;
    row.querySelector<HTMLButtonElement>(".lasso-clipboard-copy-item")!.addEventListener("click", async () => { try { await navigator.clipboard.writeText(item.content); setStatus("Copied"); } catch { setStatus("Copy failed"); } });
    row.querySelector<HTMLButtonElement>(".lasso-clipboard-delete-item")!.addEventListener("click", () => {
      collabEmit("clipboard:remove", { scope, itemId: item.uid, sessionId: state.collabProjectId }, (response) => { if (response.ok) removeClipboardItem(item.uid); else setStatus(response.error || "Unable to delete item"); });
    });
  });
}

function setStatus(message: string) {
  const title = panel?.querySelector<HTMLSpanElement>(".lasso-clipboard-subtitle");
  if (!title) return;
  const previous = title.textContent;
  title.textContent = message;
  window.setTimeout(() => { if (title.textContent === message) title.textContent = previous || "Saved snippets and references"; }, 1600);
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
