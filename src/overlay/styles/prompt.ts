export const promptStyles = `    /* ==========================================================
       PROMPT CARD (AI Assistant Card)
       ========================================================== */

    @property --lasso-angle {
      syntax: "<angle>";
      initial-value: 0deg;
      inherits: false;
    }

    .lasso-prompt {
      position: fixed;
      width: 360px;
      display: none;
      padding: 1.5px;
      border-radius: var(--lo-radius-xl);
      background: conic-gradient(
        from var(--lasso-angle, 0deg),
        #6ea0ff,
        #a855f7 30%,
        #f472b6 60%,
        #6ea0ff
      );
      box-shadow: var(--lo-shadow-card);
      pointer-events: auto;
      animation: lasso-prompt-rotate 6s linear infinite;
      z-index: 15;
    }

    .lasso-prompt.visible {
      display: block;
    }

    .lasso-prompt-card {
      display: flex;
      flex-direction: column;
      padding: 16px 16px 12px;
      font-family: inherit;
      background: var(--lo-surface);
      border-radius: calc(var(--lo-radius-xl) - 1.5px);
      animation: lasso-prompt-in 130ms ease-out;
      border: 1px solid var(--lo-border-subtle);
    }

    .lasso-prompt-review-tray {
      max-height: 190px;
      margin: 0 -16px;
      padding: 9px 12px;
      border-top: 1px solid rgba(255,255,255,0.08);
      border-bottom: 1px solid rgba(255,255,255,0.08);
    }

    .lasso-prompt-review-tray .lasso-review-tray-actions > div {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    @keyframes lasso-prompt-in {
      from { opacity: 0; transform: translateY(-5px) scale(0.98); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    @keyframes lasso-prompt-rotate {
      to { --lasso-angle: 360deg; }
    }

    .lasso-prompt-top {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 12px;
      cursor: grab;
      touch-action: none;
    }

    .lasso-prompt-top:active {
      cursor: grabbing;
    }

    .lasso-prompt-brand {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      padding: 2px 4px;
      user-select: none;
    }

    .lasso-prompt-brand-logo {
      width: 20px;
      height: 20px;
      object-fit: contain;
      filter: drop-shadow(0 2px 6px rgba(110, 160, 255, 0.4));
    }

    .lasso-prompt-brand-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--lo-text);
      letter-spacing: -0.01em;
    }

    .lasso-prompt-model-wrap {
      position: relative;
      flex: 0 1 132px;
      min-width: 0;
      max-width: 132px;
    }

    .lasso-model-chevron {
      flex: 0 0 16px;
      width: 16px;
      height: 16px;
      opacity: 0.72;
      transition: transform 160ms ease, opacity 160ms ease;
    }

    .lasso-prompt-model[aria-expanded="true"] .lasso-model-chevron,
    .lasso-command-model-btn[aria-expanded="true"] .lasso-model-chevron,
    .lasso-cli-subgroup-header[aria-expanded="true"] .lasso-model-chevron {
      transform: rotate(180deg);
      opacity: 1;
    }

    .lasso-prompt-model {
      height: 28px;
      width: 100%;
      min-width: 0;
      max-width: 132px;
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 0 10px;
      border: 1px solid var(--lo-border);
      border-radius: var(--lo-radius-full);
      background: var(--lo-surface-2);
      color: var(--lo-text-2);
      font-family: inherit;
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
      transition: all 140ms ease;
    }

    .lasso-prompt-model:hover {
      background: var(--lo-surface-hover);
      color: var(--lo-text);
      border-color: rgba(255, 255, 255, 0.2);
    }

    .lasso-prompt-model-menu {
      position: absolute;
      bottom: calc(100% + 8px);
      left: 0;
      min-width: 210px;
      max-height: min(360px, 55vh);
      overflow-y: auto;
      overscroll-behavior: contain;
      padding: 6px;
      background: rgba(24, 25, 29, 0.98);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid var(--lo-border);
      border-radius: var(--lo-radius-lg);
      box-shadow: 0 16px 36px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.08);
      z-index: 30;
      scrollbar-width: thin;
      overflow-x: hidden !important;
      overflow-y: auto !important;
    }

    .lasso-prompt-model-menu[hidden] {
      display: none;
    }

    .lasso-model-filters {
      position: sticky;
      top: -6px;
      z-index: 2;
      display: flex;
      gap: 4px;
      padding: 2px 2px 6px;
      background: rgba(24, 25, 29, 0.98);
      border-bottom: 1px solid var(--lo-border-subtle);
      margin-bottom: 4px;
      overflow-x: auto !important;
      overflow-y: hidden !important;
      white-space: nowrap;
      scrollbar-width: none;
      -webkit-overflow-scrolling: touch;
      max-width: 100%;
    }

    .lasso-model-filters::-webkit-scrollbar {
      display: none;
    }

    .lasso-model-filter {
      flex-shrink: 0;
      white-space: nowrap;
      border: 0;
      border-radius: var(--lo-radius-sm);
      padding: 4px 8px;
      background: transparent;
      color: var(--lo-text-3);
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
      transition: all 120ms ease;
    }

    .lasso-model-filter:hover,
    .lasso-model-filter.active {
      background: var(--lo-primary-soft);
      color: var(--lo-primary);
    }

    .lasso-model-group {
      padding: 6px 10px 3px;
      color: var(--lo-text-3);
      font-size: 10px;
      font-weight: 500;
      letter-spacing: normal;
      text-transform: none;
    }

    .lasso-cli-subgroup { margin: 2px 0; }
    .lasso-cli-subgroup-header {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 5px 9px 5px 10px;
      border: 0;
      border-radius: var(--lo-radius-sm);
      background: transparent;
      color: var(--lo-text-2);
      font: inherit;
      font-size: 11px;
      font-weight: 550;
      text-align: left;
      cursor: pointer;
    }
    .lasso-cli-subgroup-header:hover { background: var(--lo-surface-hover); color: var(--lo-text); }
    .lasso-cli-subgroup-brand { display: flex; align-items: center; gap: 7px; min-width: 0; }
    .lasso-cli-subgroup-chevron { color: var(--lo-text-3); }
    .lasso-cli-subgroup-items {
      margin: 1px 0 3px 17px;
      padding-left: 5px;
      border-left: 1px solid var(--lo-border);
    }
    .lasso-cli-subgroup-brand .lasso-model-item-icon {
      width: 16px;
      height: 16px;
      flex: 0 0 16px;
      padding: 2px;
      border-radius: 4px;
    }
    .lasso-cli-subgroup-brand .lasso-model-item-icon svg {
      width: 12px;
      height: 12px;
    }

    .lasso-model-item-icon {
      display: inline-flex;
      width: 22px;
      height: 22px;
      flex: 0 0 22px;
      padding: 4px;
      box-sizing: border-box;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      border-radius: 6px;
      overflow: hidden;
    }

    .lasso-model-item-icon svg {
      display: block;
      width: 100%;
      height: 100%;
    }

    .lasso-model-active-icon {
      display: inline-flex;
      width: 16px;
      height: 16px;
      flex: 0 0 16px;
      padding: 2px;
      box-sizing: border-box;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      border-radius: 4px;
      margin-right: 6px;
      vertical-align: -3px;
    }

    .lasso-model-active-icon svg {
      display: block;
      width: 100%;
      height: 100%;
    }

    .provider-google { background: rgba(110, 160, 255, 0.16); color: #6ea0ff; }
    .provider-openai { background: rgba(22, 131, 91, 0.16); color: #10b981; }
    .provider-anthropic { background: rgba(245, 158, 11, 0.16); color: #f59e0b; }
    .provider-ollama { background: rgba(255, 255, 255, 0.1); color: var(--lo-text-2); }
    .provider-claude-code { background: rgba(245, 158, 11, 0.16); color: #f59e0b; }
    .provider-codex { background: rgba(129, 201, 149, 0.16); color: var(--lo-success); }
    .provider-cli { background: rgba(192, 132, 252, 0.16); color: #c084fc; }
    .provider-claude_code { background: rgba(245, 158, 11, 0.16); }
    .provider-claude_code svg,
    .provider-cursor svg { filter: brightness(0) invert(1); }
    .provider-codex_cli { background: #fff; color: #111; padding: 4px; border-radius: 5px; }
    .provider-opencode { background: rgba(255, 255, 255, 0.1); }
    .provider-cursor { background: rgba(255, 255, 255, 0.1); }
    .provider-antigravity { background: rgba(255, 255, 255, 0.1); }

    .lasso-prompt-model-name,
    .lasso-prompt-model-name-text,
    .lasso-prompt-model-item > span:not(.lasso-model-item-icon) {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .lasso-prompt-model-name {
      display: flex;
      align-items: center;
      flex: 1;
    }

    .lasso-prompt-model-name-text {
      display: block;
      min-width: 0;
      flex: 1 1 auto;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .lasso-prompt-model-item {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: flex-start;
      gap: 10px;
      padding: 6px 10px;
      border: 0;
      border-radius: var(--lo-radius-md);
      background: transparent;
      color: var(--lo-text);
      font-family: inherit;
      font-size: 12px;
      font-weight: 450;
      text-align: left;
      cursor: pointer;
      transition: background 120ms ease;
    }

    .lasso-prompt-model-item span {
      flex: 1;
      text-align: left;
      font-weight: 450;
      color: var(--lo-text);
    }

    .lasso-prompt-model-item > span.lasso-model-item-icon {
      flex: 0 0 22px;
    }

    .lasso-prompt-model-item:hover {
      background: var(--lo-surface-hover);
    }

    .lasso-prompt-model-item.locked {
      cursor: not-allowed;
      opacity: 0.6;
    }

    .lasso-prompt-model-item.locked:hover {
      background: transparent;
    }

    .lasso-prompt-model-item .lasso-prompt-model-check {
      flex-shrink: 0;
      color: var(--lo-primary);
      opacity: 0;
    }

    .lasso-prompt-model-item.selected .lasso-prompt-model-check {
      opacity: 1;
    }

    .lasso-prompt-model-item .lasso-prompt-model-lock {
      flex-shrink: 0;
      color: var(--lo-text-3);
    }

    .lasso-prompt-element {
      min-width: 0;
      margin-left: auto;
      overflow: hidden;
      color: var(--lo-text-3);
      font-size: 11px;
      font-weight: 500;
      text-overflow: ellipsis;
      white-space: nowrap;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 2px 7px;
      background: var(--lo-surface-2);
      border-radius: var(--lo-radius-sm);
      border: 1px solid var(--lo-border-subtle);
    }

    .lasso-prompt-element svg {
      width: 12px;
      height: 12px;
      flex-shrink: 0;
      color: var(--lo-primary);
    }

    .lasso-prompt-close {
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      border: 0;
      border-radius: var(--lo-radius-sm);
      background: transparent;
      color: var(--lo-text-3);
      cursor: pointer;
      transition: background 120ms ease, color 120ms ease;
    }

    .lasso-prompt-close:hover {
      background: var(--lo-surface-hover);
      color: var(--lo-text);
    }

    .lasso-prompt-input {
      width: 100%;
      min-height: 56px;
      max-height: 140px;
      padding: 6px 8px 8px;
      resize: none;
      border: 0;
      outline: none;
      background: transparent;
      color: var(--lo-text);
      font-family: inherit;
      font-size: 13.5px;
      line-height: 20px;
    }

    .lasso-prompt-input::placeholder {
      color: var(--lo-text-3);
    }

    .lasso-chat-thread {
      display: flex;
      flex-direction: column;
      gap: 7px;
      max-height: 120px;
      overflow-y: auto;
      margin: 0 0 10px;
      padding-right: 2px;
    }

    .lasso-chat-message {
      max-width: 92%;
      padding: 5px 11px;
      border-radius: var(--lo-radius-md);
      color: var(--lo-text-2);
      background: var(--lo-surface-2);
      font-size: 12px;
      line-height: 1.45;
    }

    .lasso-chat-message.user {
      align-self: flex-end;
      color: #ffffff;
      background: var(--lo-indigo);
      font-weight: 500;
    }

    .lasso-chat-message.error {
      color: var(--lo-error);
      background: rgba(242, 139, 130, 0.12);
    }

    .lasso-chat-message code {
      padding: 1px 4px;
      border-radius: 3px;
      background: var(--lo-surface-2);
      color: #a5b4fc;
      font-family: var(--lo-font-mono);
      font-size: 0.92em;
      white-space: pre-wrap;
    }

    /* Compact agent activity status */
    .lasso-agent-status {
      display: flex;
      flex-direction: column;
      margin: 0 0 10px;
      padding: 9px 11px;
      border-radius: 12px;
      background: color-mix(in srgb, var(--lo-primary) 4%, var(--lo-surface));
      border: 1px solid var(--lo-border-subtle);
      font-family: var(--lo-font);
      font-size: 11px;
      line-height: 1.4;
      color: var(--lo-text-2);
    }

    .lasso-agent-status[hidden] {
      display: none;
    }

    .lasso-agent-status-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      min-width: 0;
      gap: 12px;
    }

    .lasso-agent-log-toggle {
      display: inline-flex;
      width: 26px;
      height: 26px;
      flex: 0 0 26px;
      align-items: center;
      justify-content: center;
      padding: 0;
      border: 1px solid color-mix(in srgb, var(--lo-border) 70%, transparent);
      border-radius: var(--lo-radius-full);
      background: rgba(255, 255, 255, 0.025);
      color: var(--lo-text-3);
      cursor: pointer;
      transition: background 140ms ease, border-color 140ms ease, color 140ms ease;
    }

    .lasso-agent-log-toggle:hover {
      background: rgba(255, 255, 255, 0.07);
      border-color: var(--lo-border);
      color: var(--lo-text);
    }

    .lasso-agent-log-toggle svg {
      display: block;
      transition: transform 140ms ease;
    }

    .lasso-agent-log-toggle[aria-expanded="true"] svg {
      transform: rotate(180deg);
    }

    .lasso-agent-log-toggle:focus-visible {
      outline: 2px solid var(--lo-primary);
      outline-offset: 2px;
    }

    .lasso-agent-log-toggle[hidden] {
      display: none;
    }

    .lasso-agent-log-chevron {
      display: block;
    }

    .lasso-agent-status-line {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      color: var(--lo-text);
      font-weight: 500;
    }

    .lasso-agent-status-indicator {
      position: relative;
      display: inline-flex;
      width: 14px;
      height: 14px;
      flex: 0 0 14px;
      align-items: center;
      justify-content: center;
      color: var(--lo-primary);
    }

    .lasso-agent-status-spinner-ring {
      position: absolute;
      inset: 1px;
      border: 1px dashed currentColor;
      border-radius: 50%;
      opacity: 0;
    }

    .lasso-agent-status-spinner-dot {
      width: 4px;
      height: 4px;
      border-radius: 50%;
      background: currentColor;
    }

    .lasso-agent-status-line.is-running .lasso-agent-status-spinner-ring {
      opacity: 1;
      animation: lasso-step-spinner-rotate 1.1s linear infinite;
    }

    .lasso-agent-status[data-status="error"] .lasso-agent-status-indicator,
    .lasso-drag-status-wrap[data-status="error"] .lasso-agent-status-indicator {
      color: var(--lo-error);
    }

    @media (prefers-reduced-motion: reduce) {
      .lasso-agent-status-line.is-running .lasso-agent-status-spinner-ring { animation: none; }
    }

    .lasso-agent-status-message {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .lasso-agent-log {
      display: flex;
      flex-direction: column;
      gap: 5px;
      max-height: 180px;
      margin-top: 8px;
      padding-top: 7px;
      border-top: 1px solid rgba(255, 255, 255, 0.06);
      overflow: auto;
      color: var(--lo-text-3);
      font-size: 10px;
    }

    .lasso-agent-log[hidden] {
      display: none;
    }

    .lasso-agent-log-line {
      display: flex;
      gap: 5px;
      line-height: 1.45;
    }

    .lasso-agent-log-prefix {
      flex: 0 0 auto;
      color: #475569;
    }

    .lasso-agent-log-text {
      min-width: 0;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }

    .lasso-agent-log-cmd {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 7px;
      margin: 2px 0;
      border-radius: 5px;
      background: rgba(15, 23, 42, 0.75);
      border: 1px solid rgba(56, 189, 248, 0.2);
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 9.5px;
      color: #38bdf8;
    }

    .lasso-agent-cmd-badge {
      display: inline-flex;
      align-items: center;
      padding: 1px 4px;
      border-radius: 3px;
      background: rgba(56, 189, 248, 0.2);
      color: #38bdf8;
      font-weight: 700;
      font-size: 8.5px;
      letter-spacing: 0.5px;
      flex-shrink: 0;
    }

    .lasso-agent-cmd-text {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .lasso-agent-log-search {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 7px;
      margin: 2px 0;
      border-radius: 5px;
      background: rgba(88, 28, 135, 0.25);
      border: 1px solid rgba(192, 132, 252, 0.25);
      color: #d8b4fe;
      font-size: 10px;
    }

    .lasso-agent-search-badge {
      flex: 0 0 auto;
    }

    .lasso-agent-search-text {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .lasso-prompt-actions {
      display: flex;
      align-items: center;
      justify-content: space-between;
      min-width: 0;
      gap: 8px;
      padding-top: 6px;
    }

    .lasso-skills-control { position: relative; display: inline-flex; flex: 0 0 auto; }
    .lasso-skills-trigger { position: relative; width: 30px; height: 30px; display: inline-flex; align-items: center; justify-content: center; border: 0; border-radius: 50%; background: transparent; color: var(--lo-text-3); cursor: pointer; }
    .lasso-skills-trigger:hover, .lasso-skills-trigger:focus-visible { background: var(--lo-surface-hover); color: var(--lo-text); }
    .lasso-skills-icon { width: 15px; height: 15px; }
    .lasso-skills-count { position: absolute; top: 0; right: 0; min-width: 14px; height: 14px; padding: 0 3px; border-radius: 99px; background: var(--lo-primary); color: #111; font-size: 9px; line-height: 14px; font-weight: 700; }
    .lasso-skills-popover { position: absolute; z-index: 500; left: 0; bottom: calc(100% + 8px); width: min(320px, calc(100vw - 32px)); max-height: 340px; overflow: auto; padding: 10px; border: 1px solid var(--lo-border); border-radius: 14px; background: var(--lo-surface); box-shadow: 0 12px 32px rgba(0,0,0,.34); color: var(--lo-text); }
    .lasso-command-skills .lasso-skills-popover { left: auto; right: 0; }
    .lasso-skills-popover[hidden] { display: none; }
    .lasso-skills-heading { display: flex; flex-direction: column; gap: 2px; padding: 2px 4px 9px; }
    .lasso-skills-heading strong { font-size: 12px; font-weight: 650; }
    .lasso-skills-heading span, .lasso-skill-option small { color: var(--lo-text-3); font-size: 10px; }
    .lasso-skills-list { display: grid; gap: 3px; max-height: 220px; overflow: auto; }
    .lasso-skill-option { display: flex; align-items: flex-start; gap: 8px; padding: 7px 5px; border-radius: 8px; cursor: pointer; }
    .lasso-skill-option:hover { background: var(--lo-surface-hover); }
    .lasso-skill-option input { margin: 2px 0 0; accent-color: var(--lo-primary); }
    .lasso-skill-option span { min-width: 0; display: grid; gap: 2px; }
    .lasso-skill-option strong { font-size: 11px; font-weight: 550; }
    .lasso-skill-option small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .lasso-skills-empty { margin: 5px; color: var(--lo-text-3); font-size: 11px; }
    .lasso-skills-upload { width: 100%; margin-top: 7px; padding: 7px 8px; border: 1px solid var(--lo-border-subtle); border-radius: 8px; background: transparent; color: var(--lo-text); text-align: left; font: inherit; font-size: 11px; cursor: pointer; }
    .lasso-skills-upload:hover { background: var(--lo-surface-hover); }

    .lasso-prompt-icon-group {
      display: flex;
      align-items: center;
      min-width: 0;
      gap: 5px;
    }

    .lasso-prompt-actions > .lasso-prompt-icon-group:first-child {
      flex: 1 1 auto;
    }

    .lasso-prompt-actions > .lasso-prompt-icon-group:last-child {
      flex: 0 0 auto;
    }

    .lasso-prompt-upload,
    .lasso-prompt-voice,
    .lasso-prompt-history,
    .lasso-prompt-stop {
      flex: 0 0 30px;
      width: 30px;
      height: 30px;
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

    .lasso-prompt-history {
      flex-basis: 26px;
      width: 26px;
      height: 26px;
      border: 1px solid var(--lo-border-subtle);
      border-radius: var(--lo-radius-full);
    }

    .lasso-prompt-history:hover {
      background: var(--lo-surface-hover);
      color: var(--lo-text);
    }

    .lasso-prompt-history-icon {
      width: 14px;
      height: 14px;
    }

    .lasso-prompt-upload:hover {
      background: var(--lo-surface-hover);
      color: var(--lo-text);
    }

    .lasso-prompt-voice {
      cursor: pointer;
      opacity: 0.85;
      transition: background 140ms ease, color 140ms ease, transform 140ms ease;
    }

    .lasso-prompt-voice:hover {
      background: var(--lo-surface-hover);
      color: var(--lo-text);
      opacity: 1;
    }

    .lasso-prompt-voice.recording {
      color: #ea4335 !important;
      background: rgba(234, 67, 53, 0.16) !important;
      border: 1px solid rgba(234, 67, 53, 0.45) !important;
      animation: lasso-pulse-recording 1.2s infinite ease-in-out;
      opacity: 1;
    }

    .lasso-prompt-voice.transcribing {
      color: #fbbc04 !important;
      background: rgba(251, 188, 4, 0.16) !important;
      border: 1px solid rgba(251, 188, 4, 0.45) !important;
      animation: lasso-pulse-transcribing 0.9s infinite alternate ease-in-out;
      opacity: 1;
    }

    @keyframes lasso-pulse-recording {
      0%, 100% {
        transform: scale(1);
        box-shadow: 0 0 0 0 rgba(234, 67, 53, 0.4);
      }
      50% {
        transform: scale(1.1);
        box-shadow: 0 0 0 6px rgba(234, 67, 53, 0);
      }
    }

    @keyframes lasso-pulse-transcribing {
      0% {
        transform: scale(0.96);
        opacity: 0.8;
      }
      100% {
        transform: scale(1.04);
        opacity: 1;
      }
    }

    .lasso-prompt-stop {
      border: 1px solid rgba(242, 139, 130, 0.3);
      background: rgba(242, 139, 130, 0.12);
      color: var(--lo-error);
    }

    .lasso-prompt-stop:hover {
      background: rgba(242, 139, 130, 0.22);
    }

    .lasso-prompt-stop[hidden] {
      display: none;
    }

    .lasso-prompt-send {
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 0 14px;
      border: 0;
      border-radius: var(--lo-radius-full);
      background: var(--lo-primary);
      color: #111214;
      font-family: inherit;
      font-size: 12.5px;
      font-weight: 550;
      cursor: pointer;
      transition: all 140ms ease;
    }

    .lasso-prompt-send:hover {
      background: var(--lo-primary-hover);
      transform: translateY(-1px);
    }

    .lasso-prompt-send:disabled {
      opacity: 0.45;
      cursor: not-allowed;
      transform: none;
    }

    .lasso-prompt-send:active {
      transform: scale(0.96);
    }

    .lasso-prompt-send.loading {
      width: 32px;
      min-width: 32px;
      padding: 0;
      cursor: wait;
      opacity: 0.9;
    }

    .lasso-prompt-send.loading svg {
      display: none;
    }

    .lasso-prompt-send.loading span {
      display: none;
    }

    .lasso-prompt-send.loading::before {
      content: "";
      display: block;
      width: 12px;
      height: 12px;
      border: 2px solid rgba(0, 0, 0, 0.3);
      border-top-color: #000;
      border-radius: 50%;
      animation: lasso-spin .7s linear infinite;
    }

`;
