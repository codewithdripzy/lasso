import { getDOM } from "../dom";

const STORAGE_KEY = "lasso:notepad";

function loadNote(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function saveNote(text: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, text);
  } catch {
    // Storage may be unavailable
  }
}

let notepadPanelEl: HTMLDivElement | null = null;
let saveTimer: number | null = null;

export function buildNotepadPanel(): HTMLDivElement {
  const dom = getDOM();
  const initialContent = loadNote();

  const el = document.createElement("div");
  el.className = "lasso-notepad-panel";
  el.hidden = true;
  el.innerHTML = `
    <div class="lasso-notepad-header">
      <div class="lasso-notepad-title-row">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
          <polyline points="10 9 9 9 8 9"/>
        </svg>
        <span class="lasso-notepad-title">Notepad</span>
      </div>
      <div class="lasso-notepad-actions">
        <button class="lasso-notepad-copy" type="button" aria-label="Copy note" title="Copy text">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
        </button>
        <button class="lasso-notepad-close" type="button" aria-label="Close Notepad">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
    </div>

    <textarea class="lasso-notepad-textarea" placeholder="Paste snippets, design thoughts, or instructions here…" spellcheck="false"></textarea>

    <div class="lasso-notepad-footer">
      <span class="lasso-notepad-status">Autosaved</span>
      <span class="lasso-notepad-count">0 characters</span>
    </div>
  `;

  dom.shadow.appendChild(el);
  notepadPanelEl = el;

  const closeBtn = el.querySelector<HTMLButtonElement>(".lasso-notepad-close")!;
  const copyBtn = el.querySelector<HTMLButtonElement>(".lasso-notepad-copy")!;
  const textarea = el.querySelector<HTMLTextAreaElement>(".lasso-notepad-textarea")!;
  const countEl = el.querySelector<HTMLSpanElement>(".lasso-notepad-count")!;
  const statusEl = el.querySelector<HTMLSpanElement>(".lasso-notepad-status")!;

  textarea.value = initialContent;
  updateCounts(initialContent.length, countEl);

  closeBtn.addEventListener("click", () => {
    toggleNotepadPanel(false);
  });

  textarea.addEventListener("input", () => {
    const text = textarea.value;
    updateCounts(text.length, countEl);
    statusEl.textContent = "Saving…";

    if (saveTimer) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      saveNote(text);
      statusEl.textContent = "Autosaved";
    }, 400);
  });

  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(textarea.value);
      statusEl.textContent = "Copied to clipboard!";
      setTimeout(() => {
        statusEl.textContent = "Autosaved";
      }, 1500);
    } catch {
      statusEl.textContent = "Copy failed";
    }
  });

  return el;
}

function updateCounts(length: number, countEl: HTMLSpanElement): void {
  countEl.textContent = `${length} character${length === 1 ? "" : "s"}`;
}

export function toggleNotepadPanel(force?: boolean): void {
  if (!notepadPanelEl) return;
  const isHidden = notepadPanelEl.hidden;
  const next = force !== undefined ? force : isHidden;
  notepadPanelEl.hidden = !next;
  if (next) {
    notepadPanelEl.classList.add("visible");
    notepadPanelEl.querySelector<HTMLTextAreaElement>(".lasso-notepad-textarea")?.focus();
  } else {
    notepadPanelEl.classList.remove("visible");
  }
}
