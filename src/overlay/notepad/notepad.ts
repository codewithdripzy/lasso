import { getDOM } from "../dom";
import { collabEmit } from "../collab/socket";
import { startVoiceRecording, stopVoiceRecording, cancelVoiceRecording, isRecordingVoice } from "../audio/transcribe";


const STORAGE_KEY = "lasso:notepad";

function loadNote(): string {
  try { return window.localStorage.getItem(STORAGE_KEY) || ""; } catch { return ""; }
}

function saveNote(text: string): void {
  if (collabEmit("note:save", { body: text }, (response) => {
    if (!response.ok) saveNoteLocally(text);
  })) return;
  saveNoteLocally(text);
}

function saveNoteLocally(text: string): void {
  try { window.localStorage.setItem(STORAGE_KEY, text); } catch {}
}

function renderMarkdown(raw: string): string {
  // Escape HTML first
  let t = raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Fenced code blocks
  t = t.replace(/```([\s\S]*?)```/g, (_, code) =>
    `<pre class="lasso-np-pre"><code>${code.trim()}</code></pre>`
  );
  // Headers
  t = t.replace(/^### (.+)$/gm, '<h3 class="lasso-np-h">$1</h3>');
  t = t.replace(/^## (.+)$/gm, '<h2 class="lasso-np-h">$1</h2>');
  t = t.replace(/^# (.+)$/gm, '<h1 class="lasso-np-h">$1</h1>');
  // Horizontal rule
  t = t.replace(/^---$/gm, '<hr class="lasso-np-hr" />');
  // Blockquote
  t = t.replace(/^&gt; (.+)$/gm, '<blockquote class="lasso-np-blockquote">$1</blockquote>');
  // Checked box
  t = t.replace(/^- \[x\] (.+)$/gm,
    '<div class="lasso-np-check done"><span class="lasso-np-check-box">✓</span><del>$1</del></div>');
  // Unchecked box
  t = t.replace(/^- \[ \] (.+)$/gm,
    '<div class="lasso-np-check"><span class="lasso-np-check-box">○</span>$1</div>');
  // Bullet list items
  t = t.replace(/^[-*] (.+)$/gm, '<li class="lasso-np-li">$1</li>');
  // Inline: bold+italic
  t = t.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  // Inline: bold
  t = t.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // Inline: italic
  t = t.replace(/\*(.+?)\*/g, "<em>$1</em>");
  // Inline: strikethrough
  t = t.replace(/~~(.+?)~~/g, "<del>$1</del>");
  // Inline: code
  t = t.replace(/`(.+?)`/g, '<code class="lasso-np-code">$1</code>');
  // Links
  t = t.replace(/\[(.+?)\]\((.+?)\)/g,
    '<a href="$2" target="_blank" rel="noopener" class="lasso-np-link">$1</a>');
  // Double newlines → paragraph
  t = t.replace(/\n\n/g, "</p><p class=\"lasso-np-p\">");
  // Single newlines
  t = t.replace(/\n/g, "<br>");

  return `<p class="lasso-np-p">${t}</p>`;
}

let notepadPanelEl: HTMLDivElement | null = null;
let saveTimer: number | null = null;
let isPreviewMode = false;

export function buildNotepadPanel(): HTMLDivElement {
  const dom = getDOM();
  const initialContent = loadNote();

  const el = document.createElement("div");
  el.className = "lasso-notepad-panel";
  el.hidden = true;
  el.innerHTML = `
    <div class="lasso-notepad-header">
      <div class="lasso-notepad-title-row">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
        </svg>
        <span class="lasso-notepad-title">Notepad</span>
      </div>
      <div class="lasso-notepad-actions">
        <button class="lasso-notepad-voice" type="button" aria-label="Voice typing" title="Click to dictate (speech-to-text)">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="2" width="6" height="12" rx="3"/>
            <path d="M5 10v2a7 7 0 0 0 14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="22"/>
            <line x1="8" y1="22" x2="16" y2="22"/>
          </svg>
        </button>
        <button class="lasso-notepad-preview-toggle" type="button" title="Preview markdown">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
          Preview
        </button>
        <button class="lasso-notepad-copy" type="button" aria-label="Copy" title="Copy text">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
        </button>
        <button class="lasso-notepad-close" type="button" aria-label="Close Notepad">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
    </div>

    <div class="lasso-notepad-body">
      <textarea
        class="lasso-notepad-textarea"
        placeholder="Notes with **markdown** support…\n\n# Heading  **bold**  *italic*  \`code\`\n- lists  [links](url)  - [x] tasks"
        spellcheck="false"
      ></textarea>
      <div class="lasso-notepad-preview" hidden></div>
    </div>

    <div class="lasso-notepad-footer">
      <span class="lasso-notepad-status">Autosaved</span>
      <span class="lasso-notepad-count">0 chars</span>
    </div>
  `;

  dom.shadow.appendChild(el);
  notepadPanelEl = el;

  const closeBtn = el.querySelector<HTMLButtonElement>(".lasso-notepad-close")!;
  const copyBtn = el.querySelector<HTMLButtonElement>(".lasso-notepad-copy")!;
  const voiceBtn = el.querySelector<HTMLButtonElement>(".lasso-notepad-voice")!;
  const previewToggle = el.querySelector<HTMLButtonElement>(".lasso-notepad-preview-toggle")!;
  const textarea = el.querySelector<HTMLTextAreaElement>(".lasso-notepad-textarea")!;
  const preview = el.querySelector<HTMLDivElement>(".lasso-notepad-preview")!;
  const countEl = el.querySelector<HTMLSpanElement>(".lasso-notepad-count")!;
  const statusEl = el.querySelector<HTMLSpanElement>(".lasso-notepad-status")!;

  textarea.value = initialContent;
  collabEmit("note:get", {}, (response) => {
    if (response.ok && typeof response.body === "string") {
      if (!response.body && initialContent) {
        saveNote(initialContent);
        return;
      }
      textarea.value = response.body;
      updateCounts(response.body.length, countEl);
    }
  });
  updateCounts(initialContent.length, countEl);

  closeBtn.addEventListener("click", () => {
    // Stop any in-progress voice recording when closing
    if (isRecordingVoice()) cancelVoiceRecording();
    toggleNotepadPanel(false);
  });

  // ── Voice typing ──────────────────────────────────────────────────────────
  voiceBtn.addEventListener("click", async () => {
    if (isRecordingVoice()) {
      // Second click → stop and transcribe
      voiceBtn.classList.remove("recording");
      voiceBtn.classList.add("transcribing");
      voiceBtn.title = "Transcribing…";
      statusEl.textContent = "Transcribing…";
      try {
        const result = await stopVoiceRecording();
        if (result.text) {
          // Insert at current cursor position
          const start = textarea.selectionStart ?? textarea.value.length;
          const end = textarea.selectionEnd ?? start;
          const before = textarea.value.slice(0, start);
          const after = textarea.value.slice(end);
          // Add a space separator if needed
          const sep = before.length && !before.endsWith(" ") && !before.endsWith("\n") ? " " : "";
          textarea.value = before + sep + result.text + after;
          // Restore cursor after inserted text
          const cursor = start + sep.length + result.text.length;
          textarea.setSelectionRange(cursor, cursor);
          textarea.dispatchEvent(new Event("input"));
          textarea.focus();
          statusEl.textContent = "Transcribed";
          window.setTimeout(() => { statusEl.textContent = "Autosaved"; }, 2000);
        } else {
          statusEl.textContent = "No speech detected";
          window.setTimeout(() => { statusEl.textContent = "Autosaved"; }, 1500);
        }
      } catch (err: any) {
        statusEl.textContent = err?.message || "Transcription failed";
        window.setTimeout(() => { statusEl.textContent = "Autosaved"; }, 2500);
      } finally {
        voiceBtn.classList.remove("transcribing");
        voiceBtn.title = "Click to dictate (speech-to-text)";
      }
    } else {
      // First click → start recording
      try {
        await startVoiceRecording();
        voiceBtn.classList.add("recording");
        voiceBtn.title = "Recording… click again to stop & transcribe";
        statusEl.textContent = "Listening…";
      } catch (err: any) {
        statusEl.textContent = err?.message || "Microphone access denied";
        window.setTimeout(() => { statusEl.textContent = "Autosaved"; }, 3000);
      }
    }
  });

  previewToggle.addEventListener("click", () => {
    isPreviewMode = !isPreviewMode;
    if (isPreviewMode) {
      preview.innerHTML = renderMarkdown(textarea.value);
      preview.hidden = false;
      textarea.hidden = true;
      previewToggle.classList.add("active");
      previewToggle.title = "Edit";
    } else {
      preview.hidden = true;
      textarea.hidden = false;
      previewToggle.classList.remove("active");
      previewToggle.title = "Preview markdown";
      textarea.focus();
    }
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
      const text = textarea.value;
      if (
        typeof navigator !== "undefined" &&
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === "function" &&
        window.isSecureContext
      ) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for non-secure contexts
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.cssText = "position:fixed;top:-9999px;left:-9999px;opacity:0";
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand("copy"); } finally { ta.remove(); }
      }
      statusEl.textContent = "Copied!";
      setTimeout(() => { statusEl.textContent = "Autosaved"; }, 1500);
    } catch {
      statusEl.textContent = "Copy failed";
    }
  });

  return el;
}

export function setNoteFromServer(text: string): void {
  const textarea = notepadPanelEl?.querySelector<HTMLTextAreaElement>(".lasso-notepad-textarea");
  const count = notepadPanelEl?.querySelector<HTMLSpanElement>(".lasso-notepad-count");
  if (!textarea) return;
  textarea.value = text;
  if (count) updateCounts(text.length, count);
}

function updateCounts(length: number, countEl: HTMLSpanElement): void {
  countEl.textContent = `${length} char${length === 1 ? "" : "s"}`;
}

export function toggleNotepadPanel(force?: boolean): void {
  if (!notepadPanelEl) return;
  const next = force !== undefined ? force : notepadPanelEl.hidden;
  notepadPanelEl.hidden = !next;
  if (next) {
    notepadPanelEl.classList.add("visible");
    if (!isPreviewMode) notepadPanelEl.querySelector<HTMLTextAreaElement>(".lasso-notepad-textarea")?.focus();
  } else {
    notepadPanelEl.classList.remove("visible");
  }
}
