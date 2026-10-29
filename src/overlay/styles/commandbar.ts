export const commandbarStyles = `    /* ==========================================================
       COMMAND BAR (Right Sidebar, Gemini-style)
       ========================================================== */

    .lasso-command-sidebar {
      position: fixed;
      top: 16px;
      right: 16px;
      bottom: 16px;
      width: 380px;
      max-width: calc(100vw - 32px);
      display: flex;
      flex-direction: column;
      border: 1px solid var(--lo-border);
      border-radius: var(--lo-radius-xl);
      background: rgba(18, 19, 23, 0.97);
      backdrop-filter: blur(28px);
      -webkit-backdrop-filter: blur(28px);
      color: var(--lo-text);
      box-shadow: 0 24px 56px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.07);
      pointer-events: auto;
      animation: lasso-command-in 220ms cubic-bezier(0.16, 1, 0.3, 1);
      z-index: 100;
    }

    .lasso-command-sidebar[hidden] {
      display: none;
    }

    @keyframes lasso-command-in {
      from {
        opacity: 0;
        transform: translateX(16px);
      }
      to {
        opacity: 1;
        transform: translateX(0);
      }
    }

    .lasso-command-sidebar-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 16px 12px;
    }

    .lasso-command-brand {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .lasso-command-brand-logo {
      width: 20px;
      height: 20px;
    }

    .lasso-command-brand-title {
      font-size: 13px;
      font-weight: 600;
      letter-spacing: -0.01em;
      color: var(--lo-text-2);
    }

    .lasso-command-header-actions {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .lasso-command-history-btn,
    .lasso-command-new-chat,
    .lasso-command-close {
      width: 26px;
      height: 26px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 0;
      border-radius: var(--lo-radius-md);
      background: transparent;
      color: var(--lo-text-3);
      cursor: pointer;
      transition: background 120ms ease, color 120ms ease;
    }

    .lasso-command-history-btn:hover,
    .lasso-command-history-btn.active,
    .lasso-command-new-chat:hover,
    .lasso-command-close:hover {
      background: var(--lo-surface-hover);
      color: var(--lo-text);
    }

    /* History popover */
    .lasso-command-history-popover {
      position: absolute;
      top: 48px;
      left: 12px;
      right: 12px;
      max-height: 380px;
      overflow-y: auto;
      background: rgba(22, 23, 28, 0.98);
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      border: 1px solid var(--lo-border);
      border-radius: var(--lo-radius-lg);
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255, 255, 255, 0.08);
      z-index: 60;
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .lasso-command-history-popover[hidden] {
      display: none !important;
    }

    .lasso-command-history-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 8px 8px;
      font-size: 11px;
      font-weight: 600;
      color: var(--lo-text-3);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .lasso-command-history-empty {
      padding: 18px 8px;
      text-align: center;
      font-size: 12px;
      color: var(--lo-text-3);
    }

    .lasso-command-history-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 8px 10px;
      border-radius: var(--lo-radius-md);
      background: transparent;
      border: 0;
      color: var(--lo-text);
      cursor: pointer;
      text-align: left;
      transition: background 120ms ease;
      width: 100%;
    }

    .lasso-command-history-load {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      min-width: 0;
      flex: 1;
      padding: 0;
      border: 0;
      background: transparent;
      color: inherit;
      cursor: pointer;
      text-align: left;
    }

    .lasso-command-history-delete {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 auto;
      width: 24px;
      height: 24px;
      padding: 0;
      border: 0;
      border-radius: 5px;
      background: transparent;
      color: var(--lo-text-3);
      cursor: pointer;
      opacity: 0;
      transition: opacity 120ms ease, color 120ms ease, background 120ms ease;
    }

    .lasso-command-history-item:hover .lasso-command-history-delete,
    .lasso-command-history-delete:focus-visible {
      opacity: 1;
    }

    .lasso-command-history-delete:hover {
      color: #fca5a5;
      background: rgba(239, 68, 68, 0.14);
    }

    .lasso-command-history-item:hover {
      background: var(--lo-surface-hover);
    }

    .lasso-command-history-item.active {
      background: var(--lo-primary-soft);
      color: var(--lo-primary);
    }

    .lasso-command-history-title {
      font-size: 12px;
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 220px;
    }

    .lasso-command-history-meta {
      font-size: 11px;
      color: var(--lo-text-3);
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
    }

    .lasso-command-history-scope {
      font-size: 9px;
      padding: 1px 5px;
      border-radius: 4px;
      text-transform: uppercase;
      font-weight: 600;
    }

    .lasso-command-history-scope.private {
      background: rgba(255, 255, 255, 0.08);
      color: var(--lo-text-3);
    }

    .lasso-command-history-scope.team {
      background: rgba(99, 102, 241, 0.16);
      color: #818cf8;
    }

    /* Body — scrollable conversation list */
    .lasso-command-body {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
    }

    .lasso-command-messages {
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding: 16px 14px 20px;
      box-sizing: border-box;
    }

    .lasso-command-msg {
      display: flex;
      flex-direction: column;
      animation: lasso-command-fade-in 0.2s ease-out;
    }

    @keyframes lasso-command-fade-in {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .lasso-command-msg.user {
      align-items: flex-end;
    }

    .lasso-command-msg-bubble {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      max-width: 88%;
      padding: 10px 14px;
      border-radius: 14px 14px 2px 14px;
      background: rgba(255, 255, 255, 0.08);
      border: 0;
      color: var(--lo-text);
      font: inherit;
      font-size: 13.5px;
      line-height: 1.5;
      word-break: break-word;
      white-space: pre-wrap;
    }

    .lasso-command-editable-message {
      cursor: pointer;
      text-align: left;
    }

    .lasso-command-editable-message:hover,
    .lasso-command-editable-message:focus-visible {
      background: rgba(255, 255, 255, 0.12);
    }

    .lasso-command-editable-message:focus-visible { outline: 2px solid rgba(147, 197, 253, 0.65); }

    .lasso-command-editable-message:disabled {
      cursor: default;
    }

    .lasso-command-edit-hint {
      flex: 0 0 auto;
      margin-left: auto;
      color: var(--lo-text-3);
      font-size: 10px;
      opacity: 0;
      transition: opacity 120ms ease;
    }

    .lasso-command-editable-message:hover .lasso-command-edit-hint,
    .lasso-command-editable-message:focus-visible .lasso-command-edit-hint {
      opacity: 1;
    }

    .lasso-command-edit-form {
      width: min(100%, 520px);
      padding: 10px;
      border: 1px solid var(--lo-border);
      border-radius: var(--lo-radius-md);
      background: var(--lo-surface-2);
    }

    .lasso-command-edit-input {
      width: 100%;
      min-height: 74px;
      resize: vertical;
      box-sizing: border-box;
      padding: 9px 10px;
      border: 1px solid var(--lo-border);
      border-radius: 7px;
      background: var(--lo-surface);
      color: var(--lo-text);
      font-family: inherit;
      font-size: 13px;
      line-height: 1.5;
    }

    .lasso-command-edit-warning,
    .lasso-command-edit-error {
      margin-top: 7px;
      color: var(--lo-text-3);
      font-size: 10.5px;
      line-height: 1.4;
    }

    .lasso-command-edit-error { color: #fca5a5; }

    .lasso-command-edit-actions {
      display: flex;
      justify-content: flex-end;
      gap: 7px;
      margin-top: 9px;
    }

    .lasso-command-edit-actions button {
      min-height: 30px;
      padding: 0 10px;
      border: 1px solid var(--lo-border);
      border-radius: 6px;
      background: transparent;
      color: var(--lo-text-2);
      font-family: inherit;
      font-size: 11px;
      font-weight: 500;
      line-height: 1;
      cursor: pointer;
    }

    .lasso-command-edit-actions button.primary {
      border-color: var(--lo-primary);
      background: var(--lo-primary);
      color: #111214;
      font-weight: 650;
    }

    .lasso-command-edit-actions button:disabled { opacity: 0.6; cursor: wait; }

    .lasso-command-msg.assistant {
      align-items: stretch;
      gap: 10px;
    }

    .lasso-command-msg-text {
      color: var(--lo-text);
      font-size: 13.5px;
      line-height: 1.6;
      word-break: break-word;
    }

    .lasso-command-msg-text p {
      margin: 0 0 8px;
    }

    .lasso-command-msg-text p:last-child {
      margin-bottom: 0;
    }

    .lasso-command-msg-text code {
      font-family: var(--lo-font-mono);
      font-size: 12px;
      padding: 2px 5px;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.08);
      color: #93c5fd;
    }

    .lasso-message-link-chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      max-width: min(100%, 420px);
      margin: 0 1px;
      padding: 1px 3px;
      vertical-align: middle;
      border: 1px solid rgba(148, 163, 184, 0.2);
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.045);
      color: var(--lo-text);
      text-decoration: none;
      transition: background 120ms ease, border-color 120ms ease;
    }

    .lasso-message-link-chip:hover {
      background: rgba(255, 255, 255, 0.085);
      border-color: rgba(148, 163, 184, 0.38);
    }

    .lasso-message-link-favicon,
    .lasso-message-link-file-icon {
      display: inline-flex;
      width: 15px;
      height: 15px;
      flex: 0 0 15px;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
    }

    .lasso-message-link-favicon {
      object-fit: contain;
      background: rgba(255, 255, 255, 0.07);
    }

    .lasso-message-link-file-icon {
      position: relative;
      width: 16px;
      height: 16px;
      flex-basis: 16px;
      color: #93c5fd;
      background: rgba(96, 165, 250, 0.12);
    }

    .lasso-message-link-file-icon svg {
      width: 14px;
      height: 14px;
      stroke: currentColor;
      stroke-width: 1.4;
    }

    .lasso-message-link-file-icon small {
      position: absolute;
      right: -3px;
      bottom: -2px;
      padding: 1px 2px;
      border-radius: 3px;
      background: #111827;
      color: #cbd5e1;
      font: 600 6px/1 var(--lo-font-mono);
    }

    .lasso-message-link-file-icon.json { color: #fbbf24; background: rgba(245, 158, 11, 0.12); }
    .lasso-message-link-file-icon.style { color: #c4b5fd; background: rgba(167, 139, 250, 0.12); }
    .lasso-message-link-file-icon.docs { color: #34d399; background: rgba(52, 211, 153, 0.12); }
    .lasso-message-link-file-icon.generic { color: #cbd5e1; background: rgba(148, 163, 184, 0.12); }

    .lasso-message-link-copy {
      display: flex;
      min-width: 0;
      flex-direction: column;
      gap: 2px;
      line-height: 1.2;
    }

    .lasso-message-link-copy strong,
    .lasso-message-link-copy small {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .lasso-message-link-copy strong { font-size: 11px; font-weight: 600; }
    .lasso-message-link-copy small { color: var(--lo-text-3); font-size: 10px; }
    .lasso-command-msg-error {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
      border-radius: 8px;
      background: rgba(239, 68, 68, 0.12);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #fca5a5;
      font-size: 13px;
    }

    .lasso-command-retry-btn {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      margin-top: 6px;
      padding: 5px 10px;
      border-radius: 6px;
      border: 1px solid rgba(239, 68, 68, 0.35);
      background: rgba(239, 68, 68, 0.08);
      color: #fca5a5;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s;
    }
    .lasso-command-retry-btn:hover {
      background: rgba(239, 68, 68, 0.18);
      border-color: rgba(239, 68, 68, 0.55);
    }
    .lasso-command-retry-btn svg {
      flex-shrink: 0;
    }

    /* Active Thinking Block */
    .lasso-command-thinking-active {
      border: 1px solid rgba(255, 255, 255, 0.1);
      background: rgba(255, 255, 255, 0.03);
      border-radius: var(--lo-radius-md);
      padding: 10px 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .lasso-command-thinking-header {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      background: none;
      border: none;
      padding: 0;
      margin: 0;
      color: inherit;
      font-family: inherit;
      cursor: pointer;
      text-align: left;
    }

    .lasso-command-thinking-header .lasso-command-thought-chevron {
      color: var(--lo-text-3);
      margin-left: 2px;
      transition: transform 180ms cubic-bezier(0.16, 1, 0.3, 1);
    }

    .lasso-command-thinking-header .lasso-command-thought-chevron.expanded,
    .lasso-command-thought-toggle.expanded .lasso-command-thought-chevron {
      transform: rotate(90deg);
    }

    .lasso-command-thought-chevron,
    .lasso-command-thought-sparkle,
    .lasso-command-pulse-ring,
    .lasso-command-pulse-dot {
      pointer-events: none;
    }

    .lasso-command-thinking-pulse {
      position: relative;
      width: 10px;
      height: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .lasso-command-pulse-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #60a5fa;
      display: block;
    }

    .lasso-command-pulse-ring {
      position: absolute;
      width: 100%;
      height: 100%;
      border-radius: 50%;
      background: rgba(96, 165, 250, 0.4);
      animation: lasso-pulse-ring 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;
    }

    @keyframes lasso-pulse-ring {
      75%, 100% {
        transform: scale(2.2);
        opacity: 0;
      }
    }

    .lasso-command-thinking-title {
      font-size: 12.5px;
      font-weight: 500;
      color: var(--lo-text-2);
    }

    .lasso-command-active-timer {
      margin-left: auto;
      font-size: 11.5px;
      font-family: var(--lo-font-mono);
      color: var(--lo-text-3);
    }

    /* Completed Thought Toggle: Thought for 30s > */
    .lasso-command-thought-wrapper {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .lasso-command-thought-toggle {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: fit-content;
      max-width: 100%;
      gap: 8px;
      padding: 5px 11px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: var(--lo-radius-full);
      background: rgba(255, 255, 255, 0.03);
      color: var(--lo-text-3);
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: all 140ms ease;
      user-select: none;
    }

    .lasso-command-thought-toggle:hover {
      background: rgba(255, 255, 255, 0.07);
      border-color: rgba(255, 255, 255, 0.16);
      color: var(--lo-text-2);
    }

    .lasso-command-thought-left {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .lasso-command-thought-sparkle {
      color: #93c5fd;
    }

    .lasso-command-thought-chevron {
      color: var(--lo-text-3);
      transition: transform 180ms cubic-bezier(0.16, 1, 0.3, 1);
    }

    .lasso-command-thought-toggle.expanded .lasso-command-thought-chevron {
      transform: rotate(90deg);
    }

    /* Thinking Steps Breakdown */
    .lasso-command-thinking-steps {
      display: flex;
      flex-direction: column;
      gap: 5px;
      margin-top: 4px;
      padding-left: 8px;
      border-left: 2px solid rgba(255, 255, 255, 0.08);
    }

    .lasso-command-thinking-steps[hidden],
    .lasso-command-thought-wrapper .lasso-command-thinking-steps[hidden] {
      display: none !important;
    }

    .lasso-command-thinking-step {
      display: flex;
      align-items: flex-start;
      gap: 7px;
      font-size: 12px;
      line-height: 1.4;
    }

    .lasso-step-status-icon {
      font-size: 11px;
      color: #34d399;
      line-height: 16px;
      flex-shrink: 0;
    }

    .lasso-command-thinking-step.running .lasso-step-status-icon {
      color: #60a5fa;
    }

    .lasso-step-status-spinner {
      position: relative;
      display: inline-flex;
      width: 13px;
      height: 13px;
      align-items: center;
      justify-content: center;
      margin-top: 1px;
    }

    .lasso-step-spinner-ring {
      position: absolute;
      inset: 1px;
      border: 1px dashed currentColor;
      border-radius: 50%;
      animation: lasso-step-spinner-rotate 1.1s linear infinite;
    }

    .lasso-step-spinner-dot {
      width: 3px;
      height: 3px;
      border-radius: 50%;
      background: currentColor;
    }

    @keyframes lasso-step-spinner-rotate {
      to { transform: rotate(360deg); }
    }

    @media (prefers-reduced-motion: reduce) {
      .lasso-step-spinner-ring { animation: none; }
    }

    .lasso-step-content {
      display: flex;
      flex-direction: column;
    }

    .lasso-step-name {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      color: var(--lo-text-2);
      font-weight: 450;
    }

    .lasso-step-tool-icon {
      display: inline-flex;
      width: 14px;
      height: 14px;
      flex: 0 0 14px;
      color: #a5b4fc;
    }

    .lasso-step-tool-icon svg {
      display: block;
      width: 100%;
      height: 100%;
    }

    .lasso-step-detail {
      font-size: 11px;
      color: var(--lo-text-3);
    }

    .lasso-command-file-extension {
      display: inline-flex;
      min-width: 26px;
      height: 18px;
      align-items: center;
      justify-content: center;
      padding: 0 4px;
      border-radius: 4px;
      background: rgba(96, 165, 250, 0.12);
      color: #93c5fd;
      font: 700 8px/1 var(--lo-font-mono);
      letter-spacing: -0.2px;
    }

    .lasso-command-file-extension.json { color: #fbbf24; background: rgba(245, 158, 11, 0.12); }
    .lasso-command-file-extension.style { color: #c4b5fd; background: rgba(167, 139, 250, 0.12); }
    .lasso-command-file-extension.docs { color: #34d399; background: rgba(52, 211, 153, 0.12); }
    .lasso-command-file-extension.generic { color: #cbd5e1; background: rgba(148, 163, 184, 0.12); }

    .lasso-command-diff-content {
      margin: 0;
      white-space: pre-wrap;
      word-break: break-all;
    }

    .lasso-diff-del {
      color: #f87171;
      background: rgba(239, 68, 68, 0.15);
      display: block;
    }

    .lasso-diff-add {
      color: #4ade80;
      background: rgba(34, 197, 94, 0.15);
      display: block;
    }

    .lasso-diff-context {
      display: block;
      color: #94a3b8;
    }

    .lasso-command-apply-btn,
    .lasso-command-undo-btn {
      display: flex;
      align-items: center;
      gap: 5px;
      min-height: 30px;
      padding: 6px 13px;
      border-radius: var(--lo-radius-full);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: background 140ms ease, border-color 140ms ease, color 140ms ease, transform 140ms ease, opacity 140ms ease;
    }

    .lasso-command-apply-btn.primary {
      background: var(--lo-primary);
      color: #111214;
      border: 0;
    }

    .lasso-command-apply-btn.primary:hover:not(:disabled) {
      background: var(--lo-primary-hover);
      transform: translateY(-1px);
    }

    .lasso-command-undo-btn.secondary {
      background: transparent;
      color: var(--lo-text-2);
      border: 1px solid color-mix(in srgb, var(--lo-border) 75%, transparent);
    }

    .lasso-command-undo-btn.secondary:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.045);
      border-color: color-mix(in srgb, var(--lo-border) 100%, transparent);
      color: var(--lo-text);
    }

    .lasso-command-apply-btn:active:not(:disabled),
    .lasso-command-undo-btn:active:not(:disabled) {
      transform: scale(0.98);
    }

    .lasso-command-apply-btn:disabled,
    .lasso-command-undo-btn:disabled {
      cursor: wait;
      opacity: 0.58;
    }

    .lasso-command-submit.working {
      background: rgba(239, 68, 68, 0.85) !important;
      color: #fff !important;
    }

    .lasso-command-submit.working:hover {
      background: rgba(239, 68, 68, 1) !important;
    }

    /* Empty state */
    .lasso-command-empty {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      justify-content: flex-start;
      padding: 28px 20px 20px;
      text-align: left;
      box-sizing: border-box;
      user-select: none;
      overflow-y: auto;
    }

    .lasso-command-empty[hidden] {
      display: none !important;
    }

    .lasso-command-messages[hidden] {
      display: none !important;
    }

    .lasso-command-empty-header {
      width: 100%;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      text-align: left;
    }

    .lasso-command-empty-logo {
      width: 32px;
      height: 32px;
      display: block;
      margin-bottom: 16px;
      border: none;
      background: none;
      box-shadow: none;
      outline: none;
    }

    .lasso-command-empty-text {
      color: var(--lo-text);
      font-size: 19px;
      font-weight: 600;
      line-height: 1.35;
      letter-spacing: -0.02em;
      margin: 0 0 6px 0;
      text-align: left;
    }

    .lasso-command-empty-text .lasso-command-user-name {
      color: var(--lo-text);
      font-weight: 700;
    }

    .lasso-command-empty-sub {
      color: var(--lo-text-subtle, rgba(255, 255, 255, 0.5));
      font-size: 13px;
      line-height: 1.45;
      margin: 0 0 18px 0;
      text-align: left;
    }

    /* Suggestions section */
    .lasso-command-suggestions {
      display: flex;
      flex-direction: column;
      gap: 8px;
      width: 100%;
      margin-top: 6px;
    }

    .lasso-command-suggestion-chip {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      padding: 10px 14px;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: var(--lo-radius-md, 10px);
      color: var(--lo-text);
      font-size: 13px;
      font-weight: 500;
      text-align: left;
      cursor: pointer;
      transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
      box-sizing: border-box;
      outline: none;
      font-family: inherit;
    }

    .lasso-command-suggestion-chip:hover {
      background: rgba(255, 255, 255, 0.08);
      border-color: rgba(255, 255, 255, 0.2);
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    }

    .lasso-command-suggestion-chip:active {
      transform: translateY(0);
      background: rgba(255, 255, 255, 0.12);
    }

    .lasso-command-suggestion-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 26px;
      height: 26px;
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.06);
      color: var(--lo-primary, #6366f1);
      flex-shrink: 0;
    }

    .lasso-command-suggestion-label {
      flex: 1;
      color: var(--lo-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .lasso-command-suggestion-arrow {
      color: var(--lo-text-subtle, rgba(255, 255, 255, 0.35));
      opacity: 0;
      transform: translateX(-4px);
      transition: all 0.15s ease;
      flex-shrink: 0;
    }

    .lasso-command-suggestion-chip:hover .lasso-command-suggestion-arrow {
      opacity: 1;
      transform: translateX(0);
      color: var(--lo-text);
    }

    /* ---- Input composite (textarea + toolbar row) ---- */

    .lasso-command-input-composite {
      display: flex;
      flex-direction: column;
      margin: 10px 12px 12px;
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: var(--lo-radius-lg);
      background: rgba(255,255,255,0.04);
      position: relative;
    }

    .lasso-command-live-review-tray {
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-height: 210px;
      padding: 10px 12px 8px;
      border-bottom: 1px solid rgba(255,255,255,0.08);
      overflow: auto;
    }

    .lasso-command-live-review-tray[hidden] {
      display: none;
    }

    .lasso-review-tray-header,
    .lasso-review-tray-file-heading,
    .lasso-review-tray-actions,
    .lasso-review-tray-actions > div {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .lasso-review-tray-header {
      color: var(--lo-text-2);
      font-size: 11px;
    }

    .lasso-review-tray-header strong {
      color: var(--lo-text);
      font-size: 12px;
    }

    .lasso-review-tray-files {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .lasso-review-tray-file {
      display: block;
      width: 100%;
      min-width: 0;
      padding: 0;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 7px;
      background: rgba(0,0,0,0.16);
      color: inherit;
      text-align: left;
      cursor: pointer;
      overflow: hidden;
      transition: border-color 120ms ease, background 120ms ease;
    }

    .lasso-review-tray-file:hover {
      border-color: rgba(255,255,255,0.2);
      background: rgba(255,255,255,0.06);
    }

    .lasso-review-tray-file-heading {
      min-width: 0;
      justify-content: flex-start;
      padding: 5px 8px;
    }

    .lasso-review-tray-open-icon {
      margin-left: auto;
      color: var(--lo-text-3);
      font-size: 13px;
    }

    .lasso-review-tray-file-name {
      flex: 1;
      overflow: hidden;
      color: var(--lo-text-2);
      font-size: 11px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .lasso-review-tray-diff {
      max-height: 76px;
      margin: 0;
      padding: 5px 8px;
      overflow: auto;
      color: var(--lo-text-3);
      font-family: var(--lo-font-mono);
      font-size: 10px;
      line-height: 1.45;
      white-space: pre-wrap;
    }

    .lasso-review-tray-actions {
      color: var(--lo-text-3);
      font-size: 10px;
    }

    .lasso-review-tray-actions > div {
      flex-shrink: 0;
    }

    .lasso-review-tray-actions .lasso-command-apply-btn,
    .lasso-review-tray-actions .lasso-command-undo-btn {
      min-height: 29px;
      padding: 5px 11px;
      font-size: 11px;
    }

    .lasso-review-diff-backdrop {
      position: fixed;
      inset: 0;
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      background: rgba(4, 5, 7, 0.72);
      backdrop-filter: blur(5px);
      -webkit-backdrop-filter: blur(5px);
      pointer-events: auto;
    }

    .lasso-review-diff-backdrop[hidden] {
      display: none;
    }

    .lasso-review-diff-modal {
      display: flex;
      flex-direction: column;
      width: min(860px, calc(100vw - 40px));
      max-height: min(760px, calc(100vh - 40px));
      overflow: hidden;
      border: 1px solid var(--lo-border);
      border-radius: var(--lo-radius-lg);
      background: #131419;
      color: var(--lo-text);
      box-shadow: 0 24px 80px rgba(0,0,0,0.65);
    }

    .lasso-review-diff-modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 14px 16px;
      border-bottom: 1px solid var(--lo-border);
    }

    .lasso-review-diff-modal-file {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }

    .lasso-review-diff-modal-file > div {
      display: flex;
      flex-direction: column;
      min-width: 0;
      gap: 3px;
    }

    .lasso-review-diff-modal-file strong {
      color: var(--lo-text);
      font-size: 13px;
    }

    .lasso-review-diff-modal-file > div > span {
      overflow: hidden;
      color: var(--lo-text-3);
      font-size: 11px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .lasso-review-diff-close {
      flex: 0 0 auto;
      width: 30px;
      height: 30px;
      border: 0;
      border-radius: 7px;
      background: rgba(255,255,255,0.06);
      color: var(--lo-text-2);
      font-size: 21px;
      line-height: 1;
      cursor: pointer;
    }

    .lasso-review-diff-close:hover {
      background: rgba(255,255,255,0.12);
      color: var(--lo-text);
    }

    .lasso-review-diff-modal-body {
      min-height: 0;
      overflow: auto;
      background: rgba(0,0,0,0.2);
    }

    .lasso-review-diff-modal-body .lasso-command-diff-content {
      max-height: none;
      margin: 0;
      padding: 14px 16px;
      font-size: 12px;
      line-height: 1.6;
      white-space: pre;
    }

    .lasso-command-input {
      width: 100%;
      min-height: 72px;
      max-height: 220px;
      padding: 14px 16px 10px;
      border: 0;
      border-radius: var(--lo-radius-lg) var(--lo-radius-lg) 0 0;
      background: transparent;
      color: var(--lo-text);
      font-family: inherit;
      font-size: 14px;
      line-height: 1.55;
      resize: none;
      outline: none;
      box-sizing: border-box;
    }

    .lasso-command-input::placeholder {
      color: var(--lo-text-3);
    }

    /* bottom row: model selector left, actions right */
    .lasso-command-input-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 10px 8px;
      gap: 8px;
    }

    /* ---- Model selector (inline pill) ---- */

    .lasso-command-model-select {
      position: relative;
    }

    .lasso-command-model-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 5px 10px;
      border: 1px solid var(--lo-border);
      border-radius: var(--lo-radius-full);
      background: var(--lo-surface-2);
      color: var(--lo-text-2);
      font-family: inherit;
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
      transition: border-color 140ms ease, background 140ms ease, color 140ms ease;
      white-space: nowrap;
    }

    .lasso-command-model-btn:hover {
      background: var(--lo-surface-hover);
      color: var(--lo-text);
      border-color: rgba(255,255,255,0.2);
    }

    .lasso-command-model-icon {
      flex: 0 0 auto;
      display: flex;
      align-items: center;
    }

    .lasso-command-model-label {
      max-width: 160px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .lasso-command-model-chevron {
      flex: 0 0 auto;
      opacity: 0.55;
    }

    .lasso-command-model-menu {
      position: absolute;
      bottom: calc(100% + 8px);
      left: 0;
      min-width: 220px;
      max-width: 330px;
      max-height: min(380px, 50vh);
      overflow-x: hidden !important;
      overflow-y: auto !important;
      overscroll-behavior: contain;
      padding: 6px;
      border: 1px solid var(--lo-border);
      border-radius: var(--lo-radius-lg);
      background: rgba(20, 21, 26, 0.98);
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      color: var(--lo-text);
      box-shadow: 0 16px 36px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.08);
      z-index: 50;
      scrollbar-width: thin;
    }



    /* ---- Action buttons (voice + submit) ---- */

    .lasso-command-input-actions {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .lasso-command-voice {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid var(--lo-border);
      border-radius: 50%;
      background: transparent;
      color: var(--lo-text-3);
      cursor: pointer;
      transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
    }

    .lasso-command-voice:hover {
      background: var(--lo-surface-hover);
      color: var(--lo-text);
      border-color: var(--lo-border);
    }

    .lasso-command-voice.recording {
      color: #ea4335 !important;
      background: rgba(234, 67, 53, 0.16) !important;
      border: 1px solid rgba(234, 67, 53, 0.45) !important;
      animation: lasso-pulse-recording 1.2s infinite ease-in-out;
    }

    .lasso-command-voice.transcribing {
      color: #fbbc04 !important;
      background: rgba(251, 188, 4, 0.16) !important;
      border: 1px solid rgba(251, 188, 4, 0.45) !important;
      animation: lasso-pulse-transcribing 0.9s infinite alternate ease-in-out;
    }

    .lasso-command-submit {
      width: 32px;
      min-width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      border: 0;
      border-radius: 999px;
      background: var(--lo-primary);
      color: #111214;
      font-family: inherit;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 140ms ease;
    }

    .lasso-command-submit:hover {
      background: var(--lo-primary-hover);
      transform: translateY(-1px);
    }

    .lasso-command-submit:active {
      transform: scale(0.96);
    }

    .lasso-command-submit.primary {
      background: var(--lo-primary);
    }

    .lasso-agent-prompt-actions button.primary { background: var(--lo-primary); color: #111214; font-weight: 600; }

    .lasso-todo-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 10px;
      padding-bottom: 2px;
    }

    .lasso-todo-title-row {
      display: flex;
      align-items: center;
      gap: 7px;
      color: var(--lo-text);
    }

    .lasso-todo-title {
      font-size: 13px;
      font-weight: 600;
    }

    .lasso-todo-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 18px;
      height: 18px;
      padding: 0 5px;
      border-radius: var(--lo-radius-full);
      background: var(--lo-indigo);
      color: #ffffff;
      font-size: 10px;
      font-weight: 600;
    }

    .lasso-todo-header-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .lasso-todo-stats {
      font-size: 11px;
      color: var(--lo-text-3);
    }

    .lasso-todo-close {
      border: 0;
      background: transparent;
      color: var(--lo-text-3);
      cursor: pointer;
      border-radius: var(--lo-radius-sm);
      display: flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
    }

    .lasso-todo-close:hover {
      background: var(--lo-surface-hover);
      color: var(--lo-text);
    }

    .lasso-todo-table {
      flex: 1;
      overflow-y: auto;
      max-height: 330px;
      display: flex;
      flex-direction: column;
      margin-bottom: 6px;
    }

    .lasso-todo-table-head {
      display: flex;
      align-items: center;
      padding: 4px 6px;
      color: var(--lo-text-3);
      font-size: 10.5px;
      font-weight: 500;
      letter-spacing: 0.02em;
    }

    .lasso-todo-table-body {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .lasso-todo-row {
      display: flex;
      align-items: center;
      padding: 3px 6px;
      border-radius: var(--lo-radius-md);
      transition: background 120ms ease;
    }

    .lasso-todo-row:hover {
      background: var(--lo-surface-hover);
    }

    .lasso-todo-row.done .lasso-todo-row-text {
      text-decoration: line-through;
      color: var(--lo-text-3);
    }

    .lasso-todo-col-status {
      width: 76px;
      flex-shrink: 0;
    }

    .lasso-todo-status-chip {
      border: 0;
      border-radius: 4px;
      padding: 2px 6px;
      font-size: 10px;
      font-weight: 500;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: all 120ms ease;
      letter-spacing: 0.01em;
    }

    .lasso-todo-status-chip:hover {
      filter: brightness(1.2);
    }

    .lasso-todo-col-task {
      flex: 1;
      min-width: 0;
      padding: 0 4px;
    }

    .lasso-todo-row-text {
      width: 100%;
      border: 0;
      background: transparent;
      color: var(--lo-text);
      font-family: inherit;
      font-size: 12px;
      padding: 3px 5px;
      outline: none;
      border-radius: 4px;
      transition: background 120ms ease;
    }

    .lasso-todo-row-text:focus {
      background: var(--lo-surface-2);
    }

    .lasso-todo-col-priority {
      width: 55px;
      flex-shrink: 0;
    }

    .lasso-todo-priority-chip {
      border: 0;
      background: transparent;
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
      padding: 2px 6px;
      border-radius: 4px;
      transition: background 120ms ease;
    }

    .lasso-todo-priority-chip:hover {
      background: var(--lo-surface);
    }

    .lasso-todo-col-assignee {
      width: 72px;
      flex-shrink: 0;
    }

    .lasso-todo-assignee {
      width: 100%;
      border: 0;
      background: transparent;
      color: var(--lo-text-2);
      font-size: 11px;
      padding: 3px 5px;
      outline: none;
      border-radius: 4px;
      transition: background 120ms ease;
    }

    .lasso-todo-assignee:focus {
      background: var(--lo-surface-2);
    }

    .lasso-todo-col-del {
      width: 22px;
      flex-shrink: 0;
      display: flex;
      justify-content: center;
    }

    .lasso-todo-del-btn {
      opacity: 0;
      border: 0;
      background: transparent;
      color: var(--lo-text-3);
      cursor: pointer;
      padding: 2px;
      border-radius: 4px;
      transition: opacity 120ms ease, color 120ms ease;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .lasso-todo-row:hover .lasso-todo-del-btn {
      opacity: 1;
    }

    .lasso-todo-del-btn:hover {
      color: var(--lo-error);
    }

    .lasso-todo-empty {
      padding: 24px 12px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      color: var(--lo-text-3);
      font-size: 11.5px;
      text-align: center;
    }

    .lasso-todo-empty svg {
      opacity: 0.5;
    }

    .lasso-todo-add-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-top: 6px;
    }

    .lasso-todo-add-btn-row {
      border: 0;
      background: transparent;
      color: var(--lo-primary);
      font-size: 11.5px;
      font-weight: 500;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 3px 6px;
      border-radius: 4px;
      transition: background 120ms ease;
    }

    .lasso-todo-add-btn-row:hover {
      background: var(--lo-primary-soft);
    }

    .lasso-todo-clear-done {
      border: 0;
      background: transparent;
      color: var(--lo-text-3);
      font-size: 11px;
      cursor: pointer;
      padding: 3px 6px;
      border-radius: 4px;
      transition: all 120ms ease;
    }

    .lasso-todo-clear-done:hover {
      background: var(--lo-surface-hover);
      color: var(--lo-text);
    }

`;
