export const gitStyles = `    /* ==========================================================
       GIT PANEL (Workspace Git Management)
       ========================================================== */

    .lasso-git-panel {
      position: fixed;
      right: 20px;
      bottom: 82px;
      width: 440px;
      max-height: 560px;
      display: flex;
      flex-direction: column;
      padding: 14px 16px;
      border: 1px solid var(--lo-border);
      border-radius: var(--lo-radius-xl);
      background: rgba(24, 25, 29, 0.98);
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      color: var(--lo-text);
      box-shadow: 0 20px 48px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.08);
      pointer-events: auto;
      z-index: 12;
      opacity: 0;
      transform: translateY(8px) scale(0.98);
      transition: opacity 160ms ease, transform 160ms cubic-bezier(0.16, 1, 0.3, 1);
    }

    .lasso-git-panel.visible {
      opacity: 1;
      transform: translateY(0) scale(1);
    }

    .lasso-git-panel[hidden] {
      display: none;
    }

    .lasso-git-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 10px;
    }

    .lasso-git-title-row {
      display: flex;
      align-items: center;
      gap: 7px;
      color: var(--lo-text);
    }

    .lasso-git-head-icon {
      color: var(--lo-primary);
    }

    .lasso-git-title {
      font-size: 13px;
      font-weight: 600;
    }

    .lasso-git-head-actions {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .lasso-git-refresh-btn,
    .lasso-git-close {
      width: 24px;
      height: 24px;
      border: 0;
      border-radius: var(--lo-radius-sm);
      background: transparent;
      color: var(--lo-text-3);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: all 120ms ease;
    }

    .lasso-git-refresh-btn:hover,
    .lasso-git-close:hover {
      background: var(--lo-surface-hover);
      color: var(--lo-text);
    }

    .lasso-git-refresh-btn.spinning svg {
      animation: lasso-spin 600ms linear infinite;
    }

    /* Repository Meta Info */
    .lasso-git-meta {
      display: flex;
      align-items: center;
      gap: 7px;
      margin-bottom: 12px;
      flex-wrap: wrap;
    }

    .lasso-git-branch-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 3px 9px;
      border-radius: var(--lo-radius-full);
      background: rgba(99, 102, 241, 0.12);
      color: #818cf8;
      font-size: 11px;
      font-weight: 500;
      font-family: var(--lo-font-mono);
      border: 1px solid rgba(99, 102, 241, 0.22);
    }

    .lasso-git-remote-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 3px 9px;
      border-radius: var(--lo-radius-full);
      background: var(--lo-surface-2);
      color: var(--lo-text-3);
      font-size: 11px;
      font-weight: 450;
      border: 1px solid var(--lo-border-subtle);
      max-width: 230px;
    }

    .lasso-git-remote-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .lasso-git-remote-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--lo-text-3);
      flex-shrink: 0;
    }

    .lasso-git-remote-pill.connected {
      color: var(--lo-text-2);
    }

    .lasso-git-remote-pill.connected .lasso-git-remote-dot {
      background: #34d399;
      box-shadow: 0 0 6px rgba(52, 211, 153, 0.6);
    }

    /* Uninitialized View */
    .lasso-git-uninit-box {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 32px 16px;
      gap: 10px;
      text-align: center;
      color: var(--lo-text-3);
    }

    .lasso-git-uninit-text {
      font-size: 12px;
      margin: 0;
    }

    .lasso-git-init-btn {
      margin-top: 4px;
      padding: 7px 18px;
      border-radius: var(--lo-radius-full);
      border: 0;
      background: var(--lo-primary);
      color: #111214;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 120ms ease;
    }

    .lasso-git-init-btn:hover {
      background: var(--lo-primary-hover);
      transform: translateY(-0.5px);
    }

    /* Repo View */
    .lasso-git-repo-view {
      display: flex;
      flex-direction: column;
    }

    .lasso-git-section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 6px;
      font-size: 11px;
      font-weight: 500;
      color: var(--lo-text-2);
    }

    .lasso-git-changes-badge {
      font-size: 10px;
      font-weight: 600;
      padding: 1px 7px;
      border-radius: var(--lo-radius-full);
    }

    .lasso-git-changes-badge.has-changes {
      background: rgba(251, 191, 36, 0.16);
      color: #fbbf24;
      border: 1px solid rgba(251, 191, 36, 0.25);
    }

    .lasso-git-changes-badge.clean {
      background: rgba(52, 211, 153, 0.16);
      color: #34d399;
      border: 1px solid rgba(52, 211, 153, 0.25);
    }

    /* File List */
    .lasso-git-files-list {
      max-height: 165px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 3px;
      margin-bottom: 10px;
      padding-right: 2px;
    }

    .lasso-git-file-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 6px;
      border-radius: var(--lo-radius-sm);
      font-size: 11.5px;
      font-family: var(--lo-font-mono);
      transition: background 100ms ease;
    }

    .lasso-git-file-row:hover {
      background: var(--lo-surface-hover);
    }

    .lasso-git-file-badge {
      width: 17px;
      height: 17px;
      border-radius: 4px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 9.5px;
      font-weight: 700;
      flex-shrink: 0;
    }

    .lasso-git-file-badge.mod { background: rgba(251, 191, 36, 0.16); color: #fbbf24; }
    .lasso-git-file-badge.add { background: rgba(52, 211, 153, 0.16); color: #34d399; }
    .lasso-git-file-badge.del { background: rgba(248, 113, 113, 0.16); color: #f87171; }
    .lasso-git-file-badge.ren { background: rgba(96, 165, 250, 0.16); color: #60a5fa; }
    .lasso-git-file-badge.unt { background: rgba(167, 139, 250, 0.16); color: #a78bfa; }

    .lasso-git-file-path {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .lasso-git-file-dir {
      color: var(--lo-text-3);
    }

    .lasso-git-file-name {
      color: var(--lo-text);
      font-weight: 500;
    }

    .lasso-git-clean-state {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 14px;
      background: rgba(52, 211, 153, 0.06);
      border: 1px solid rgba(52, 211, 153, 0.18);
      border-radius: var(--lo-radius-md);
    }

    .lasso-git-clean-text {
      display: flex;
      flex-direction: column;
      font-size: 12px;
      font-weight: 500;
      color: var(--lo-text);
    }

    .lasso-git-clean-text small {
      font-size: 10.5px;
      font-weight: normal;
      color: var(--lo-text-3);
      margin-top: 1px;
    }

    /* Commit Box */
    .lasso-git-commit-box {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-bottom: 10px;
    }

    .lasso-git-prefix-chips {
      display: flex;
      align-items: center;
      gap: 4px;
      overflow-x: auto;
      padding-bottom: 1px;
    }

    .lasso-git-chip {
      border: 1px solid var(--lo-border-subtle);
      border-radius: var(--lo-radius-full);
      padding: 2px 7px;
      background: var(--lo-surface);
      color: var(--lo-text-3);
      font-size: 10px;
      font-weight: 500;
      cursor: pointer;
      transition: all 120ms ease;
      white-space: nowrap;
    }

    .lasso-git-chip:hover {
      background: var(--lo-primary-soft);
      color: var(--lo-primary);
      border-color: var(--lo-primary);
    }

    .lasso-git-commit-input-wrap {
      position: relative;
      background: var(--lo-surface-2);
      border: 1px solid var(--lo-border);
      border-radius: var(--lo-radius-md);
      padding: 6px 8px;
      transition: border-color 140ms ease;
    }

    .lasso-git-commit-input-wrap:focus-within {
      border-color: var(--lo-primary);
    }

    .lasso-git-commit-textarea {
      width: 100%;
      border: 0;
      background: transparent;
      color: var(--lo-text);
      font-family: inherit;
      font-size: 12px;
      line-height: 1.45;
      resize: none;
      outline: none;
      box-shadow: none;
      padding-right: 28px;
    }

    .lasso-git-ai-btn {
      position: absolute;
      right: 7px;
      bottom: 7px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      padding: 0;
      border: 1px solid var(--lo-border-subtle);
      border-radius: 6px;
      background: var(--lo-surface);
      color: var(--lo-primary);
      cursor: pointer;
    }
    .lasso-git-ai-btn:hover:not(:disabled) { background: var(--lo-primary-soft); }
    .lasso-git-ai-btn:disabled { opacity: .5; cursor: wait; }

    .lasso-git-commit-textarea::placeholder {
      color: var(--lo-text-3);
    }

    /* Action Buttons */
    .lasso-git-actions-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .lasso-git-commit-btn {
      flex: 1;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      height: 32px;
      padding: 0 14px;
      border: 0;
      border-radius: var(--lo-radius-full);
      background: var(--lo-primary);
      color: #111214;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 120ms ease;
    }

    .lasso-git-commit-btn:hover:not(:disabled) {
      background: var(--lo-primary-hover);
      transform: translateY(-0.5px);
    }

    .lasso-git-commit-btn:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }

    .lasso-git-push-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      height: 32px;
      padding: 0 14px;
      border: 1px solid var(--lo-border);
      border-radius: var(--lo-radius-full);
      background: var(--lo-surface-2);
      color: var(--lo-text);
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: all 120ms ease;
    }

    .lasso-git-push-btn:hover:not(:disabled) {
      background: var(--lo-surface-hover);
      border-color: rgba(255, 255, 255, 0.2);
    }

    .lasso-git-push-btn:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }

    /* Status Message Box */
    .lasso-git-message-box {
      margin-top: 10px;
      padding: 6px 10px;
      border-radius: var(--lo-radius-md);
      font-size: 11px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .lasso-git-message-box[hidden] {
      display: none !important;
    }

    .lasso-git-message-box.success {
      background: rgba(52, 211, 153, 0.12);
      color: #34d399;
      border: 1px solid rgba(52, 211, 153, 0.25);
    }

    .lasso-git-message-box.error {
      background: rgba(248, 113, 113, 0.12);
      color: #f87171;
      border: 1px solid rgba(248, 113, 113, 0.25);
    }

    .lasso-git-message-dismiss {
      border: 0;
      background: transparent;
      color: inherit;
      cursor: pointer;
      font-size: 13px;
      opacity: 0.7;
      padding: 0 2px;
    }

    .lasso-git-message-dismiss:hover {
      opacity: 1;
    }

    /* Badge on git button in toolbar */
    .lasso-git-badge {
      display: none;
      min-width: 16px;
      height: 16px;
      padding: 0 4px;
      border-radius: var(--lo-radius-full);
      background: #f59e0b;
      color: #111214;
      font-size: 10px;
      font-weight: 700;
      align-items: center;
      justify-content: center;
      line-height: 1;
      margin-left: 4px;
    }

    @keyframes lasso-spin {
      to { transform: rotate(360deg); }
    }

    /* ==========================================================
       TODO PANEL
       ========================================================== */

    /* ==========================================================
       TODO PANEL (PM Notion Table Style)
       ========================================================== */

    .lasso-todo-panel {
      position: fixed;
      right: 20px;
      bottom: 82px;
      width: 440px;
      max-height: 520px;
      display: flex;
      flex-direction: column;
      padding: 14px 16px;
      border: 1px solid var(--lo-border);
      border-radius: var(--lo-radius-xl);
      background: rgba(24, 25, 29, 0.98);
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      color: var(--lo-text);
      box-shadow: 0 20px 48px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.08);
      pointer-events: auto;
      z-index: 12;
      opacity: 0;
      transform: translateY(8px) scale(0.98);
      transition: opacity 160ms ease, transform 160ms cubic-bezier(0.16, 1, 0.3, 1);
    }

    .lasso-todo-panel.visible {
      opacity: 1;
      transform: translateY(0) scale(1);
    }

    .lasso-todo-panel[hidden] {
      display: none;
    }

    .lasso-task-panel {
      position: fixed;
      right: 12px;
      bottom: 82px;
      width: 390px;
      max-width: calc(100vw - 24px);
      max-height: min(560px, calc(100vh - 104px));
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      color: var(--lo-text);
      background: var(--lo-surface);
      border: 1px solid var(--lo-border);
      border-radius: var(--lo-radius-xl);
      box-shadow: 0 18px 50px rgba(0,0,0,.35);
      z-index: 30;
      opacity: 0;
      transform: translateY(8px) scale(.98);
      transition: opacity 150ms ease, transform 150ms ease;
      pointer-events: auto;
    }

    .lasso-task-panel.visible { opacity: 1; transform: translateY(0) scale(1); }
    .lasso-task-panel[hidden] { display: none; }
    .lasso-task-header, .lasso-task-title-row, .lasso-task-detail-heading { display: flex; align-items: center; }
    .lasso-task-header { justify-content: space-between; }
    .lasso-task-title-row { gap: 7px; font-size: 13px; font-weight: 600; }
    .lasso-task-badge { min-width: 18px; padding: 2px 5px; border-radius: 999px; background: var(--lo-indigo); color: #fff; font-size: 10px; text-align: center; }
    .lasso-task-close, .lasso-task-back { border: 0; background: transparent; color: var(--lo-text-3); cursor: pointer; }
    .lasso-task-close { font-size: 20px; line-height: 20px; }
    .lasso-task-tabs { display: flex; gap: 4px; margin: 10px 0 8px; padding: 3px; border-radius: var(--lo-radius-md); background: var(--lo-surface-2); }
    .lasso-task-tab { flex: 1; padding: 6px 8px; border: 0; border-radius: 7px; background: transparent; color: var(--lo-text-3); font: inherit; font-size: 11px; cursor: pointer; }
    .lasso-task-tab.active { background: var(--lo-surface); color: var(--lo-text); box-shadow: 0 1px 3px rgba(0,0,0,.16); }
    .lasso-task-body { min-height: 90px; max-height: 470px; overflow: auto; }
    .lasso-task-list { display: flex; flex-direction: column; gap: 3px; }
    .lasso-task-row { width: 100%; display: flex; align-items: center; gap: 9px; padding: 9px; border: 0; border-radius: var(--lo-radius-md); background: transparent; color: var(--lo-text); text-align: left; cursor: pointer; }
    .lasso-task-row:hover, .lasso-task-row.active { background: var(--lo-surface-hover); }
    .lasso-task-status { width: 8px; height: 8px; flex: 0 0 auto; border-radius: 50%; background: var(--lo-text-3); }
    .lasso-task-status.thinking, .lasso-task-status.working { background: var(--lo-primary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--lo-primary) 18%, transparent); }
    .lasso-task-status.review { background: #fbbf24; }
    .lasso-task-status.complete { background: #34d399; }
    .lasso-task-status.error { background: #f87171; }
    .lasso-task-row-copy { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
    .lasso-task-row-copy strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; font-weight: 500; }
    .lasso-task-row-copy small, .lasso-task-message { color: var(--lo-text-3); font-size: 11px; }
    .lasso-task-review-label { margin-left: auto; padding: 4px 7px; border-radius: var(--lo-radius-full); background: color-mix(in srgb, #fbbf24 16%, transparent); color: #fbbf24; font-size: 10px; font-weight: 600; cursor: pointer; }
    .lasso-task-stop { margin-left: auto; display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border: 0; border-radius: var(--lo-radius-full); background: color-mix(in srgb, var(--lo-error) 20%, transparent); color: var(--lo-error); font-size: 14px; font-weight: 600; cursor: pointer; transition: background 120ms ease, color 120ms ease; }
    .lasso-task-stop:hover { background: var(--lo-error); color: #ffffff; }
    .lasso-task-empty { padding: 25px 10px; color: var(--lo-text-3); font-size: 12px; text-align: center; }
    .lasso-task-detail { padding: 4px 2px; }
    .lasso-task-detail-heading { justify-content: space-between; margin-bottom: 12px; }
    .lasso-task-detail-status { color: var(--lo-primary); font-size: 11px; font-weight: 600; }
    .lasso-task-prompt { margin: 0 0 10px; font-size: 13px; line-height: 1.45; }
    .lasso-task-message { margin: 0 0 12px; line-height: 1.45; }
    .lasso-task-activity { display: flex; flex-direction: column; gap: 4px; max-height: 130px; margin: 0 0 12px; padding: 8px; overflow: auto; border-radius: var(--lo-radius-md); background: var(--lo-surface-2); color: var(--lo-text-3); font-size: 10.5px; line-height: 1.35; }
    .lasso-task-changes { margin-bottom: 10px; color: var(--lo-text-2); font-size: 11px; }
    .lasso-task-apply { padding: 7px 11px; border: 0; border-radius: var(--lo-radius-full); background: var(--lo-primary); color: #111214; font: inherit; font-size: 11px; font-weight: 600; cursor: pointer; }

    .lasso-agent-tasks-badge { position: absolute; top: 5px; right: 5px; width: 6px; height: 6px; border-radius: 50%; background: var(--lo-primary); }
    .lasso-agent-prompt-backdrop { position: fixed; inset: 0; z-index: 80; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(8, 9, 11, 0.55); backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px); pointer-events: auto; }
    .lasso-agent-prompt-backdrop[hidden] { display: none; }
    .lasso-agent-prompt { display: flex; flex-direction: column; width: min(420px, 100%); max-height: calc(100vh - 32px); overflow: auto; padding: 16px; border: 1px solid var(--lo-border); border-radius: var(--lo-radius-lg); background: var(--lo-surface); color: var(--lo-text); box-shadow: var(--lo-shadow-lg); pointer-events: auto; animation: lasso-agent-prompt-in 160ms cubic-bezier(0.16, 1, 0.3, 1); }
    @keyframes lasso-agent-prompt-in { from { opacity: 0; transform: translateY(8px) scale(0.98); } to { opacity: 1; transform: none; } }
    .lasso-agent-prompt-head { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 12px; }
    .lasso-agent-prompt-mark { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; flex: 0 0 auto; border-radius: 8px; background: var(--lo-primary-soft); color: var(--lo-primary); }
    .lasso-agent-prompt-mark svg { width: 15px; height: 15px; }
    .lasso-agent-prompt-headings { min-width: 0; flex: 1; }
    .lasso-agent-prompt-title { font-size: 13px; font-weight: 650; letter-spacing: -0.01em; }
    .lasso-agent-prompt-subtitle { margin-top: 2px; color: var(--lo-text-3); font-size: 11px; }
    .lasso-agent-prompt-close { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; flex: 0 0 auto; border: 0; border-radius: 6px; background: transparent; color: var(--lo-text-3); cursor: pointer; transition: background 120ms, color 120ms; }
    .lasso-agent-prompt-close:hover { background: var(--lo-surface-hover); color: var(--lo-text); }
    .lasso-agent-prompt-message { max-height: 220px; margin-bottom: 14px; padding: 10px 11px; overflow: auto; border: 1px solid var(--lo-border); border-radius: var(--lo-radius-md); background: var(--lo-surface-2); color: var(--lo-text-2); font: inherit; font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; user-select: text; }
    .lasso-agent-prompt-input { width: 100%; box-sizing: border-box; margin-bottom: 12px; padding: 9px 11px; border: 1px solid var(--lo-border); border-radius: var(--lo-radius-md); background: var(--lo-surface-2); color: var(--lo-text); font: inherit; font-size: 12px; }
    .lasso-agent-prompt-input[hidden] { display: none; }
    .lasso-agent-prompt-options {
      display: flex;
      flex-direction: column;
      gap: 6px;
      max-height: 200px;
      overflow-y: auto;
      margin-bottom: 14px;
      padding: 6px;
      border: 1px solid var(--lo-border);
      border-radius: var(--lo-radius-md);
      background: var(--lo-surface-2);
    }
    .lasso-agent-prompt-options[hidden] { display: none; }
    .lasso-agent-prompt-option-row {
      display: flex;
      align-items: center;
      gap: 9px;
      padding: 6px 8px;
      border-radius: 6px;
      cursor: pointer;
      transition: background 120ms;
      user-select: none;
      font-size: 12px;
      color: var(--lo-text);
    }
    .lasso-agent-prompt-option-row:hover { background: var(--lo-surface-hover); }
    .lasso-agent-prompt-checkbox {
      accent-color: var(--lo-primary);
      width: 15px;
      height: 15px;
      cursor: pointer;
      flex-shrink: 0;
    }
    .lasso-agent-prompt-option-label {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      line-height: 1.35;
    }
    .lasso-agent-prompt-actions { display: flex; justify-content: flex-end; gap: 7px; }
    .lasso-agent-prompt-actions button { padding: 7px 13px; border: 0; border-radius: var(--lo-radius-full); background: var(--lo-surface-2); color: var(--lo-text); font: inherit; font-size: 11.5px; font-weight: 500; cursor: pointer; transition: filter 120ms, transform 120ms; }
    .lasso-agent-prompt-actions button:hover { filter: brightness(1.12); }
    .lasso-agent-prompt-actions button:active { transform: scale(0.97); }


`;
