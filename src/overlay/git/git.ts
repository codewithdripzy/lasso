import { state } from "../state";
import { getDOM } from "../dom";
import type { GitState } from "../types";

let gitPanelEl: HTMLDivElement | null = null;
let gitStateText: HTMLParagraphElement | null = null;
let gitBranchText: HTMLDivElement | null = null;
let gitCommitInput: HTMLInputElement | null = null;
let gitMessage: HTMLParagraphElement | null = null;

export function buildGitPanel(): HTMLDivElement {
  const dom = getDOM();
  const el = document.createElement("div");
  el.className = "lasso-git-panel";
  el.hidden = true;
  el.innerHTML = `
    <div class="lasso-git-head">
      <div>
        <p class="lasso-git-title">Git workspace</p>
        <p class="lasso-git-state"></p>
      </div>
      <button class="lasso-git-close" type="button" aria-label="Close Git actions">×</button>
    </div>
    <div class="lasso-git-branch"></div>
    <input class="lasso-git-commit" type="text" placeholder="Commit message" />
    <div class="lasso-git-actions">
      <button class="lasso-git-init" type="button">Initialize repository</button>
      <button class="lasso-git-commit-btn primary" type="button">Commit changes</button>
      <button class="lasso-git-push" type="button">Push changes</button>
    </div>
    <p class="lasso-git-message" aria-live="polite"></p>
  `;

  dom.shadow.appendChild(el);
  gitPanelEl = el;

  gitStateText = el.querySelector<HTMLParagraphElement>(".lasso-git-state");
  gitBranchText = el.querySelector<HTMLDivElement>(".lasso-git-branch");
  gitCommitInput = el.querySelector<HTMLInputElement>(".lasso-git-commit");
  gitMessage = el.querySelector<HTMLParagraphElement>(".lasso-git-message");

  const closeBtn = el.querySelector<HTMLButtonElement>(".lasso-git-close")!;
  const initBtn = el.querySelector<HTMLButtonElement>(".lasso-git-init")!;
  const commitBtn = el.querySelector<HTMLButtonElement>(".lasso-git-commit-btn")!;
  const pushBtn = el.querySelector<HTMLButtonElement>(".lasso-git-push")!;

  closeBtn.addEventListener("click", () => {
    el.hidden = true;
  });

  initBtn.addEventListener("click", () => {
    if (state.bridgeSocket?.readyState === WebSocket.OPEN) {
      state.bridgeSocket.send(JSON.stringify({ type: "git_init" }));
    }
  });

  commitBtn.addEventListener("click", () => {
    const msg = gitCommitInput?.value.trim() || "";
    if (state.bridgeSocket?.readyState === WebSocket.OPEN) {
      state.bridgeSocket.send(JSON.stringify({ type: "git_commit", message: msg }));
    }
  });

  pushBtn.addEventListener("click", () => {
    if (state.bridgeSocket?.readyState === WebSocket.OPEN) {
      state.bridgeSocket.send(JSON.stringify({ type: "git_push" }));
    }
  });

  return el;
}

export function renderGitState(next: GitState) {
  state.gitState = next;
  if (!gitPanelEl || !gitStateText || !gitBranchText) return;

  gitStateText.textContent = !next.isRepo
    ? "This project is not initialized yet."
    : next.hasChanges
      ? `${next.status?.length || 0} change${next.status?.length === 1 ? "" : "s"} ready to commit.`
      : "Working tree clean.";

  gitBranchText.textContent = next.isRepo
    ? `Branch: ${next.branch || "detached HEAD"}${next.hasRemote ? " · remote connected" : " · no remote"}`
    : "No Git repository";

  const initBtn = gitPanelEl.querySelector<HTMLButtonElement>(".lasso-git-init");
  const commitBtn = gitPanelEl.querySelector<HTMLButtonElement>(".lasso-git-commit-btn");
  const pushBtn = gitPanelEl.querySelector<HTMLButtonElement>(".lasso-git-push");

  if (initBtn) initBtn.hidden = next.isRepo;
  if (commitBtn) commitBtn.disabled = !next.isRepo || !next.hasChanges;
  if (pushBtn) pushBtn.disabled = !next.isRepo || !next.hasRemote;
}

export function setGitMessage(msg: string) {
  if (gitMessage) gitMessage.textContent = msg;
}

export function toggleGitPanel() {
  if (!gitPanelEl) return;
  gitPanelEl.hidden = !gitPanelEl.hidden;
  if (!gitPanelEl.hidden && state.bridgeSocket?.readyState === WebSocket.OPEN) {
    state.bridgeSocket.send(JSON.stringify({ type: "git_status" }));
  }
}
