import { state } from "../state";
import { getDOM } from "../dom";
import type { GitState } from "../types";

let gitPanelEl: HTMLDivElement | null = null;
let msgTimer: number | null = null;

interface ParsedFile {
  code: string;
  badge: string;
  badgeClass: string;
  path: string;
  dir: string;
  name: string;
}

function parseGitStatus(lines: string[]): ParsedFile[] {
  return lines.map((line) => {
    const code = line.slice(0, 2).trim();
    const filePath = line.slice(2).trim();
    const parts = filePath.split("/");
    const name = parts.pop() || filePath;
    const dir = parts.length ? parts.join("/") + "/" : "";

    let badge = "M";
    let badgeClass = "mod";
    if (code.includes("A")) {
      badge = "A";
      badgeClass = "add";
    } else if (code.includes("D")) {
      badge = "D";
      badgeClass = "del";
    } else if (code.includes("R")) {
      badge = "R";
      badgeClass = "ren";
    } else if (code === "??" || code.includes("?")) {
      badge = "U";
      badgeClass = "unt";
    } else if (code.includes("M")) {
      badge = "M";
      badgeClass = "mod";
    }

    return { code, badge, badgeClass, path: filePath, dir, name };
  });
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function buildGitPanel(): HTMLDivElement {
  const dom = getDOM();
  const el = document.createElement("div");
  el.className = "lasso-git-panel";
  el.hidden = true;
  el.innerHTML = `
    <!-- Header -->
    <div class="lasso-git-head">
      <div class="lasso-git-title-row">
        <svg class="lasso-git-head-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="6" cy="6" r="3"/>
          <circle cx="6" cy="18" r="3"/>
          <circle cx="18" cy="6" r="3"/>
          <path d="M6 9v6"/>
          <path d="M18 9a9 9 0 0 1-9 9"/>
        </svg>
        <span class="lasso-git-title">Git Workspace</span>
      </div>

      <div class="lasso-git-head-actions">
        <button class="lasso-git-refresh-btn" type="button" aria-label="Refresh status" title="Refresh Git status">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
          </svg>
        </button>
        <button class="lasso-git-close" type="button" aria-label="Close Git panel" title="Close">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- Repository Meta / Branch & Remote -->
    <div class="lasso-git-meta">
      <div class="lasso-git-branch-pill">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="6" y1="3" x2="6" y2="15"/>
          <circle cx="18" cy="6" r="3"/>
          <circle cx="6" cy="18" r="3"/>
          <path d="M18 9a9 9 0 0 1-9 9"/>
        </svg>
        <span class="lasso-git-branch-name">Detecting…</span>
      </div>
      <div class="lasso-git-remote-pill">
        <span class="lasso-git-remote-dot"></span>
        <span class="lasso-git-remote-name">No remote</span>
      </div>
    </div>

    <!-- Uninitialized View -->
    <div class="lasso-git-uninit-view" hidden>
      <div class="lasso-git-uninit-box">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="9"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <p class="lasso-git-uninit-text">This project is not a Git repository yet.</p>
        <button class="lasso-git-init-btn" type="button">Initialize Git Repository</button>
      </div>
    </div>

    <!-- Repo view -->
    <div class="lasso-git-repo-view">
      <!-- Changed files section -->
      <div class="lasso-git-section-header">
        <span class="lasso-git-section-title">Changed Files</span>
        <span class="lasso-git-changes-badge">0</span>
      </div>

      <div class="lasso-git-files-list"></div>

      <!-- Commit section -->
      <div class="lasso-git-commit-box">
        <div class="lasso-git-prefix-chips">
          <button type="button" class="lasso-git-chip" data-prefix="feat: ">feat</button>
          <button type="button" class="lasso-git-chip" data-prefix="fix: ">fix</button>
          <button type="button" class="lasso-git-chip" data-prefix="refactor: ">refactor</button>
          <button type="button" class="lasso-git-chip" data-prefix="style: ">style</button>
          <button type="button" class="lasso-git-chip" data-prefix="chore: ">chore</button>
        </div>

        <div class="lasso-git-commit-input-wrap">
          <textarea
            class="lasso-git-commit-textarea"
            placeholder="Commit message (⌘↵ to commit)"
            rows="2"
            maxlength="200"
          ></textarea>
        </div>
      </div>

      <!-- Action buttons -->
      <div class="lasso-git-actions-row">
        <button class="lasso-git-commit-btn primary" type="button">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <line x1="3" y1="12" x2="9" y2="12"/>
            <line x1="15" y1="12" x2="21" y2="12"/>
          </svg>
          <span class="lasso-git-commit-btn-text">Commit changes</span>
        </button>

        <button class="lasso-git-push-btn" type="button" title="Push committed changes to remote">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 19V5M5 12l7-7 7 7"/>
          </svg>
          Push
        </button>
      </div>
    </div>

    <!-- Status message / toast -->
    <div class="lasso-git-message-box" hidden>
      <span class="lasso-git-message-text"></span>
      <button class="lasso-git-message-dismiss" type="button">×</button>
    </div>
  `;

  dom.shadow.appendChild(el);
  gitPanelEl = el;

  const closeBtn = el.querySelector<HTMLButtonElement>(".lasso-git-close")!;
  const refreshBtn = el.querySelector<HTMLButtonElement>(".lasso-git-refresh-btn")!;
  const initBtn = el.querySelector<HTMLButtonElement>(".lasso-git-init-btn")!;
  const commitBtn = el.querySelector<HTMLButtonElement>(".lasso-git-commit-btn")!;
  const pushBtn = el.querySelector<HTMLButtonElement>(".lasso-git-push-btn")!;
  const commitInput = el.querySelector<HTMLTextAreaElement>(".lasso-git-commit-textarea")!;
  const messageDismiss = el.querySelector<HTMLButtonElement>(".lasso-git-message-dismiss")!;

  closeBtn.addEventListener("click", () => toggleGitPanel(false));

  refreshBtn.addEventListener("click", () => {
    refreshBtn.classList.add("spinning");
    setTimeout(() => refreshBtn.classList.remove("spinning"), 600);
    if (state.bridgeSocket?.readyState === WebSocket.OPEN) {
      state.bridgeSocket.send(JSON.stringify({ type: "git_status" }));
    }
  });

  initBtn.addEventListener("click", () => {
    if (state.bridgeSocket?.readyState === WebSocket.OPEN) {
      setGitMessage("Initializing repository…");
      state.bridgeSocket.send(JSON.stringify({ type: "git_init" }));
    }
  });

  // Prefix chips
  el.querySelectorAll<HTMLButtonElement>(".lasso-git-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const prefix = chip.dataset.prefix || "";
      const current = commitInput.value;
      if (!current.startsWith(prefix)) {
        commitInput.value = prefix + current.replace(/^(feat|fix|refactor|style|chore):\s*/, "");
      }
      commitInput.focus();
    });
  });

  // Shortcut commit: Cmd+Enter or Ctrl+Enter
  commitInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      commitBtn.click();
    }
  });

  commitBtn.addEventListener("click", () => {
    const msg = commitInput.value.trim();
    if (!msg) {
      setGitMessage("Please enter a commit message.", true);
      commitInput.focus();
      return;
    }
    if (state.bridgeSocket?.readyState === WebSocket.OPEN) {
      setGitMessage("Committing changes…");
      state.bridgeSocket.send(JSON.stringify({ type: "git_commit", message: msg }));
      commitInput.value = "";
    }
  });

  pushBtn.addEventListener("click", () => {
    if (state.bridgeSocket?.readyState === WebSocket.OPEN) {
      setGitMessage("Pushing to remote…");
      state.bridgeSocket.send(JSON.stringify({ type: "git_push" }));
    }
  });

  messageDismiss.addEventListener("click", () => {
    const msgBox = el.querySelector<HTMLDivElement>(".lasso-git-message-box");
    if (msgBox) msgBox.hidden = true;
  });

  return el;
}

export function renderGitState(next: GitState) {
  state.gitState = next;
  if (!gitPanelEl) return;

  const branchName = gitPanelEl.querySelector<HTMLSpanElement>(".lasso-git-branch-name");
  const remotePill = gitPanelEl.querySelector<HTMLDivElement>(".lasso-git-remote-pill");
  const remoteName = gitPanelEl.querySelector<HTMLSpanElement>(".lasso-git-remote-name");
  const uninitView = gitPanelEl.querySelector<HTMLDivElement>(".lasso-git-uninit-view");
  const repoView = gitPanelEl.querySelector<HTMLDivElement>(".lasso-git-repo-view");
  const filesList = gitPanelEl.querySelector<HTMLDivElement>(".lasso-git-files-list");
  const badge = gitPanelEl.querySelector<HTMLSpanElement>(".lasso-git-changes-badge");
  const commitBtn = gitPanelEl.querySelector<HTMLButtonElement>(".lasso-git-commit-btn");
  const commitBtnText = gitPanelEl.querySelector<HTMLSpanElement>(".lasso-git-commit-btn-text");
  const pushBtn = gitPanelEl.querySelector<HTMLButtonElement>(".lasso-git-push-btn");

  // Update branch and remote
  if (branchName) {
    branchName.textContent = next.isRepo ? next.branch || "HEAD (detached)" : "No repository";
  }

  if (remotePill && remoteName) {
    if (next.hasRemote && next.remote) {
      remotePill.classList.add("connected");
      // Extract clean host/repo e.g. github.com/user/repo
      const cleanRemote = next.remote.replace(/.*github\.com[:/]/, "").replace(/\.git$/, "");
      remoteName.textContent = cleanRemote || "remote connected";
      remoteName.title = next.remote;
    } else {
      remotePill.classList.remove("connected");
      remoteName.textContent = next.isRepo ? "No remote configured" : "Not connected";
      remoteName.title = "";
    }
  }

  // Toggle init view vs repo view
  if (uninitView && repoView) {
    uninitView.hidden = next.isRepo;
    repoView.hidden = !next.isRepo;
  }

  // Render changed files
  if (filesList && badge && next.isRepo) {
    const rawStatus = next.status || [];
    const parsed = parseGitStatus(rawStatus);
    const count = parsed.length;

    badge.textContent = count > 0 ? String(count) : "Clean";
    badge.className = `lasso-git-changes-badge${count > 0 ? " has-changes" : " clean"}`;

    if (count === 0) {
      filesList.innerHTML = `
        <div class="lasso-git-clean-state">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="m9 12 2 2 4-4"/>
          </svg>
          <div class="lasso-git-clean-text">
            <span>Working tree is clean</span>
            <small>No uncommitted changes in this workspace</small>
          </div>
        </div>
      `;
    } else {
      filesList.innerHTML = parsed
        .map(
          (f) => `
        <div class="lasso-git-file-row">
          <span class="lasso-git-file-badge ${f.badgeClass}" title="${f.code}">${f.badge}</span>
          <span class="lasso-git-file-path" title="${escapeHtml(f.path)}">
            ${f.dir ? `<span class="lasso-git-file-dir">${escapeHtml(f.dir)}</span>` : ""}
            <span class="lasso-git-file-name">${escapeHtml(f.name)}</span>
          </span>
        </div>
      `
        )
        .join("");
    }

    if (commitBtn && commitBtnText) {
      commitBtn.disabled = count === 0;
      commitBtnText.textContent = count > 0 ? `Commit changes (${count})` : "Commit changes";
    }
  }

  if (pushBtn) {
    pushBtn.disabled = !next.isRepo || !next.hasRemote;
  }

  // Update toolbar badge
  const dom = getDOM();
  const tbBadge = dom.shadow.querySelector<HTMLElement>(".lasso-git-badge");
  if (tbBadge) {
    const changeCount = next.status?.length || 0;
    tbBadge.style.display = changeCount > 0 ? "inline-flex" : "none";
    tbBadge.textContent = String(changeCount);
  }
}

export function setGitMessage(msg: string, isError = false) {
  if (!gitPanelEl) return;
  const msgBox = gitPanelEl.querySelector<HTMLDivElement>(".lasso-git-message-box");
  const msgText = gitPanelEl.querySelector<HTMLSpanElement>(".lasso-git-message-text");
  if (!msgBox || !msgText) return;

  const lower = msg.toLowerCase();
  const detectedError = isError || lower.includes("error") || lower.includes("fatal") || lower.includes("fail");

  msgText.textContent = msg;
  msgBox.className = `lasso-git-message-box ${detectedError ? "error" : "success"}`;
  msgBox.hidden = false;

  if (msgTimer) window.clearTimeout(msgTimer);
  msgTimer = window.setTimeout(() => {
    if (msgBox) msgBox.hidden = true;
  }, 4500);
}

export function toggleGitPanel(force?: boolean): void {
  if (!gitPanelEl) return;
  const next = force !== undefined ? force : gitPanelEl.hidden;
  gitPanelEl.hidden = !next;
  if (next) {
    gitPanelEl.classList.add("visible");
    if (state.bridgeSocket?.readyState === WebSocket.OPEN) {
      state.bridgeSocket.send(JSON.stringify({ type: "git_status" }));
    }
    gitPanelEl.querySelector<HTMLTextAreaElement>(".lasso-git-commit-textarea")?.focus();
  } else {
    gitPanelEl.classList.remove("visible");
  }
}
