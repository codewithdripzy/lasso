export const panelsStyles = `    /* ==========================================================
       NOTEPAD PANEL (Seamless Markdown Canvas)
       ========================================================== */

    .lasso-notepad-panel {
      position: fixed;
      right: 20px;
      bottom: 82px;
      width: 360px;
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

    .lasso-notepad-panel.visible {
      opacity: 1;
      transform: translateY(0) scale(1);
    }

    .lasso-notepad-panel[hidden] {
      display: none;
    }

    .lasso-notepad-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
      padding-bottom: 2px;
    }

    .lasso-notepad-title-row {
      display: flex;
      align-items: center;
      gap: 7px;
      color: var(--lo-text);
    }

    .lasso-notepad-title {
      font-size: 13px;
      font-weight: 600;
    }

    .lasso-notepad-actions {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .lasso-notepad-preview-toggle {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 8px;
      border: 0;
      border-radius: var(--lo-radius-sm);
      background: transparent;
      color: var(--lo-text-2);
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
      transition: all 120ms ease;
    }

    .lasso-notepad-preview-toggle:hover {
      background: var(--lo-surface-hover);
      color: var(--lo-text);
    }

    .lasso-notepad-preview-toggle.active {
      background: var(--lo-primary-soft);
      color: var(--lo-primary);
    }

    .lasso-notepad-voice,
    .lasso-notepad-copy,
    .lasso-notepad-close {
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 0;
      border-radius: var(--lo-radius-sm);
      background: transparent;
      color: var(--lo-text-3);
      cursor: pointer;
      transition: all 120ms ease;
    }

    .lasso-notepad-voice:hover,
    .lasso-notepad-copy:hover,
    .lasso-notepad-close:hover {
      background: var(--lo-surface-hover);
      color: var(--lo-text);
    }

    .lasso-notepad-voice.recording {
      color: var(--lo-error);
      background: rgba(242, 139, 130, 0.12);
      box-shadow: 0 0 0 2px rgba(242, 139, 130, 0.35);
      border-radius: 50%;
      animation: lasso-np-mic-pulse 1.4s ease-in-out infinite;
    }

    @keyframes lasso-np-mic-pulse {
      0%, 100% { box-shadow: 0 0 0 2px rgba(242, 139, 130, 0.35); }
      50%       { box-shadow: 0 0 0 4px rgba(242, 139, 130, 0.18); }
    }

    .lasso-notepad-voice.transcribing {
      color: var(--lo-primary);
      animation: lasso-np-transcribing 0.9s ease-in-out infinite alternate;
    }

    @keyframes lasso-np-transcribing {
      from { opacity: 1; }
      to   { opacity: 0.4; }
    }

    .lasso-notepad-body {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-height: 240px;
    }

    /* Completely blends with background canvas */
    .lasso-notepad-textarea {
      width: 100%;
      flex: 1;
      min-height: 240px;
      max-height: 350px;
      padding: 6px 0;
      border: 0;
      background: transparent;
      color: var(--lo-text);
      font-family: inherit;
      font-size: 12.5px;
      line-height: 1.6;
      resize: none;
      outline: none;
      box-shadow: none;
    }

    .lasso-notepad-textarea::placeholder {
      color: var(--lo-text-3);
    }

    .lasso-notepad-preview {
      width: 100%;
      flex: 1;
      min-height: 240px;
      max-height: 350px;
      overflow-y: auto;
      padding: 6px 0;
      font-size: 12.5px;
      line-height: 1.6;
      color: var(--lo-text);
    }

    .lasso-notepad-preview[hidden] {
      display: none;
    }

    /* Markdown preview rendered styles */
    .lasso-np-p { margin: 0 0 8px; }
    .lasso-np-h { margin: 10px 0 6px; font-weight: 600; color: var(--lo-text); }
    h1.lasso-np-h { font-size: 15px; }
    h2.lasso-np-h { font-size: 13.5px; }
    h3.lasso-np-h { font-size: 12.5px; }
    .lasso-np-pre {
      background: var(--lo-surface-2);
      padding: 8px 10px;
      border-radius: var(--lo-radius-md);
      font-family: var(--lo-font-mono);
      font-size: 11px;
      overflow-x: auto;
      margin: 6px 0;
    }
    .lasso-np-code {
      background: var(--lo-surface-2);
      padding: 1px 4px;
      border-radius: 3px;
      font-family: var(--lo-font-mono);
      font-size: 11px;
      color: #818cf8;
    }
    .lasso-np-check { display: flex; align-items: center; gap: 6px; margin: 3px 0; }
    .lasso-np-check-box { font-size: 11px; opacity: 0.7; }
    .lasso-np-check.done { color: var(--lo-text-3); }
    .lasso-np-li { margin-left: 16px; margin-bottom: 3px; }
    .lasso-np-link { color: var(--lo-primary); text-decoration: underline; }
    .lasso-np-blockquote { border-left: 2px solid var(--lo-primary); padding-left: 8px; margin: 6px 0; color: var(--lo-text-2); font-style: italic; }
    .lasso-np-hr { border: 0; height: 1px; background: var(--lo-border-subtle); margin: 10px 0; }

    .lasso-notepad-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: 6px;
      font-size: 10.5px;
      color: var(--lo-text-3);
    }

    /* ── Clipboard panel ─────────────────────────────────────── */
    .lasso-clipboard-panel {
      position: fixed;
      right: 20px;
      bottom: 82px;
      width: 368px;
      max-height: 560px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      border: 1px solid var(--lo-border);
      border-radius: var(--lo-radius-xl);
      background: rgba(18, 19, 23, 0.97);
      backdrop-filter: blur(28px);
      -webkit-backdrop-filter: blur(28px);
      color: var(--lo-text);
      box-shadow: 0 24px 56px rgba(0,0,0,.7), 0 0 0 1px rgba(255,255,255,.07);
      pointer-events: auto;
      z-index: 12;
      opacity: 0;
      transform: translateY(10px) scale(0.975);
      transition: opacity 180ms ease, transform 200ms cubic-bezier(0.16,1,0.3,1);
    }
    .lasso-clipboard-panel.visible { opacity: 1; transform: translateY(0) scale(1); }
    .lasso-clipboard-panel[hidden] { display: none; }

    /* header */
    .lasso-clipboard-header { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 14px 16px 0; }
    .lasso-clipboard-header-left { display: flex; flex-direction: column; gap: 2px; }
    .lasso-clipboard-title { font-size: 13px; font-weight: 600; letter-spacing: -0.01em; }
    .lasso-clipboard-subtitle { font-size: 10px; color: var(--lo-text-3); }
    .lasso-clipboard-close {
      display: inline-flex; align-items: center; justify-content: center;
      width: 26px; height: 26px; border: 0; border-radius: 6px;
      background: transparent; color: var(--lo-text-3); cursor: pointer;
      transition: background 120ms, color 120ms;
    }
    .lasso-clipboard-close:hover { background: var(--lo-surface-hover); color: var(--lo-text); }

    /* tabs */
    .lasso-clipboard-tabs {
      display: flex; gap: 3px; margin: 10px 16px 0;
      padding: 3px; border: 1px solid var(--lo-border-subtle);
      border-radius: var(--lo-radius-md); background: rgba(255,255,255,.03);
    }
    .lasso-clipboard-tab {
      flex: 1; border: 0; border-radius: 5px; padding: 5px 8px;
      background: transparent; color: var(--lo-text-3);
      font: inherit; font-size: 11px; cursor: pointer;
      transition: background 120ms, color 120ms;
    }
    .lasso-clipboard-tab.active { background: var(--lo-surface-hover); color: var(--lo-text); box-shadow: 0 1px 4px rgba(0,0,0,.22); }

    /* compose */
    .lasso-clipboard-compose { padding: 12px 16px 12px; border-bottom: 1px solid var(--lo-border-subtle); }
    .lasso-clipboard-compose-top { display: flex; gap: 6px; margin-bottom: 7px; }
    .lasso-clipboard-type, .lasso-clipboard-label, .lasso-clipboard-input {
      min-width: 0; border: 1px solid var(--lo-border); border-radius: var(--lo-radius-md);
      background: var(--lo-surface-2); color: var(--lo-text); font: inherit; font-size: 11px; outline: none;
      transition: border-color 120ms;
    }
    .lasso-clipboard-type { width: 72px; padding: 6px 6px; }
    .lasso-clipboard-label { flex: 1; padding: 6px 8px; }
    .lasso-clipboard-type:focus, .lasso-clipboard-label:focus, .lasso-clipboard-input:focus { border-color: var(--lo-primary); }
    .lasso-clipboard-input { display: block; width: 100%; box-sizing: border-box; padding: 8px 10px; resize: vertical; min-height: 68px; }
    .lasso-clipboard-compose-actions { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 8px; }
    .lasso-clipboard-read {
      display: inline-flex; align-items: center; gap: 5px;
      border: 0; border-radius: 5px; padding: 6px 8px;
      background: transparent; color: var(--lo-text-3); font: inherit; font-size: 10px; cursor: pointer;
      transition: color 120ms;
    }
    .lasso-clipboard-read:hover { color: var(--lo-text-2); }
    .lasso-clipboard-add {
      border: 0; border-radius: 6px; padding: 6px 14px;
      background: var(--lo-primary); color: #0e0f12; font: inherit; font-size: 11px;
      font-weight: 600; cursor: pointer; transition: opacity 120ms;
    }
    .lasso-clipboard-add:hover { opacity: 0.88; }

    /* list */
    .lasso-clipboard-list { flex: 1; overflow-y: auto; display: grid; gap: 6px; padding: 10px 16px 14px; }
    .lasso-clipboard-list::-webkit-scrollbar { width: 4px; }
    .lasso-clipboard-list::-webkit-scrollbar-track { background: transparent; }
    .lasso-clipboard-list::-webkit-scrollbar-thumb { background: var(--lo-border); border-radius: 2px; }

    /* item card */
    .lasso-clipboard-item {
      border: 1px solid var(--lo-border-subtle); border-radius: 10px;
      background: rgba(255,255,255,.03); overflow: hidden;
      transition: border-color 140ms, opacity 180ms, transform 180ms;
    }
    .lasso-clipboard-item:hover { border-color: var(--lo-border); }
    .lasso-clipboard-item.removing { opacity: 0; transform: scale(0.96); }
    .lasso-clipboard-item-header {
      display: flex; align-items: center; gap: 8px;
      padding: 9px 10px 5px; justify-content: space-between;
    }
    .lasso-clipboard-item-type-chip {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 2px 6px 2px 5px; border-radius: 20px;
      background: rgba(255,255,255,.06); color: var(--chip-color, var(--lo-text-3));
      font-size: 9.5px; font-weight: 500; letter-spacing: 0.02em;
    }
    .lasso-clipboard-item-label {
      flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      font-size: 11px; font-weight: 550; color: var(--lo-text); text-align: right;
    }
    .lasso-clipboard-item-content {
      position: relative; max-height: 58px; overflow: hidden;
      margin: 0 10px; color: var(--lo-text-2);
      font-size: 10px; line-height: 15px; white-space: pre-wrap; word-break: break-word;
      font-family: inherit;
    }
    .lasso-clipboard-item-content.mono { font-family: var(--lo-font-mono); }
    .lasso-clipboard-item-footer {
      display: flex; align-items: center; justify-content: flex-end; gap: 2px;
      padding: 5px 8px 7px;
    }
    .lasso-clipboard-copy-item, .lasso-clipboard-delete-item {
      display: inline-flex; align-items: center; gap: 4px;
      border: 0; border-radius: 5px; padding: 4px 8px;
      background: transparent; font: inherit; font-size: 10px; cursor: pointer;
      color: var(--lo-text-3); transition: background 110ms, color 110ms;
    }
    .lasso-clipboard-copy-item:hover { background: rgba(255,255,255,.07); color: var(--lo-text); }
    .lasso-clipboard-delete-item { color: rgba(242,139,130,.7); }
    .lasso-clipboard-delete-item:hover { background: rgba(242,139,130,.1); color: #f28b82; }
    .lasso-clipboard-empty {
      padding: 32px 12px; color: var(--lo-text-3); font-size: 11px; text-align: center; line-height: 1.6;
    }
    @media (max-width: 600px) { .lasso-clipboard-panel { right: 10px; bottom: 72px; left: 10px; width: auto; } }

    /* ==========================================================================
       Drag-to-Reposition Tool Styles
       ========================================================================== */
    .lasso-drag-layer {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 2147483640;
    }

    .lasso-drag-hover-box {
      position: fixed;
      pointer-events: none;
      border: 2px dashed #0ea5e9;
      background: rgba(14, 165, 233, 0.08);
      border-radius: 6px;
      box-shadow: 0 0 16px rgba(14, 165, 233, 0.25);
      z-index: 2147483641;
      transition: all 80ms ease;
    }

    .lasso-drag-hover-label {
      position: fixed;
      pointer-events: none;
      z-index: 2147483642;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 3px 8px;
      border-radius: 6px;
      background: #0ea5e9;
      color: #ffffff;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.01em;
      box-shadow: 0 3px 10px rgba(14, 165, 233, 0.4);
      white-space: nowrap;
    }

    .lasso-drag-hover-alt-hint {
      font-size: 9.5px;
      font-weight: 500;
      opacity: 0.85;
      background: rgba(0, 0, 0, 0.25);
      padding: 1px 5px;
      border-radius: 3px;
      margin-left: 2px;
    }

    .lasso-drag-proxy-clone {
      box-sizing: border-box !important;
      will-change: transform !important;
    }

    .lasso-drag-ghost-box {
      position: fixed;
      pointer-events: none;
      border: 2px dashed rgba(14, 165, 233, 0.55);
      background: rgba(14, 165, 233, 0.04);
      border-radius: 6px;
      z-index: 2147483639;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .lasso-drag-ghost-chip {
      padding: 3px 8px;
      border-radius: 5px;
      background: rgba(15, 23, 42, 0.82);
      border: 1px solid rgba(14, 165, 233, 0.3);
      color: #7dd3fc;
      font-size: 10px;
      font-weight: 550;
      letter-spacing: 0.02em;
    }

    .lasso-drag-hud {
      position: fixed;
      pointer-events: none;
      z-index: 2147483647;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(15, 23, 42, 0.94);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(14, 165, 233, 0.4);
      border-radius: 8px;
      padding: 5px 9px;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 11px;
      color: #f8fafc;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.55);
      white-space: nowrap;
    }

    .lasso-drag-hud strong {
      color: #ffffff;
      font-weight: 600;
    }

    .lasso-hud-delta {
      color: #38bdf8;
      font-weight: 600;
    }

    .lasso-drag-guide-svg {
      position: fixed;
      inset: 0;
      pointer-events: none;
      width: 100vw;
      height: 100vh;
      z-index: 2147483638;
    }

    /* Reposition Card */
    .lasso-drag-card {
      position: fixed;
      pointer-events: auto;
      z-index: 2147483645;
      width: 380px;
      max-width: calc(100vw - 24px);
      background: rgba(22, 24, 29, 0.96);
      backdrop-filter: blur(24px);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 16px;
      box-shadow: 0 20px 50px -10px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(14, 165, 233, 0.3);
      padding: 15px 16px 16px;
      font-family: inherit;
      color: #f8f9fc;
      animation: lasso-card-pop 200ms cubic-bezier(0.16, 1, 0.3, 1);
    }

    @keyframes lasso-card-pop {
      from {
        opacity: 0;
        transform: scale(0.96) translateY(6px);
      }
      to {
        opacity: 1;
        transform: scale(1) translateY(0);
      }
    }

    .lasso-drag-card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 12px;
    }

    .lasso-drag-card-brand {
      display: flex;
      align-items: center;
      gap: 7px;
    }

    .lasso-drag-card-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      border-radius: 6px;
      background: rgba(14, 165, 233, 0.18);
      color: #38bdf8;
    }

    .lasso-drag-card-title {
      font-size: 13px;
      font-weight: 600;
      color: #f8f9fc;
    }

    .lasso-drag-card-target-wrap {
      margin-left: auto;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .lasso-drag-card-element-chip {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 10.5px;
      font-weight: 500;
      padding: 2px 7px;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.08);
      color: #cbd5e1;
      max-width: 130px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .lasso-drag-parent-switch-btn {
      display: inline-flex;
      align-items: center;
      padding: 2px 7px;
      border-radius: 4px;
      border: 1px solid rgba(14, 165, 233, 0.35);
      background: rgba(14, 165, 233, 0.12);
      color: #38bdf8;
      font-family: inherit;
      font-size: 10px;
      font-weight: 600;
      cursor: pointer;
      transition: background 110ms, border-color 110ms, color 110ms;
      white-space: nowrap;
    }

    .lasso-drag-parent-switch-btn:hover {
      background: rgba(14, 165, 233, 0.28);
      border-color: #38bdf8;
      color: #ffffff;
    }

    .lasso-drag-card-close {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 22px;
      height: 22px;
      border: 0;
      border-radius: 5px;
      background: transparent;
      color: rgba(255, 255, 255, 0.5);
      cursor: pointer;
      transition: background 120ms, color 120ms;
    }

    .lasso-drag-card-close:hover {
      background: rgba(255, 255, 255, 0.1);
      color: #ffffff;
    }

    .lasso-drag-stats {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      margin-bottom: 10px;
    }

    .lasso-drag-stat-box {
      display: flex;
      flex-direction: column;
      gap: 3px;
      padding: 7px 9px;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.06);
    }

    .lasso-drag-stat-box.accent {
      background: rgba(14, 165, 233, 0.08);
      border-color: rgba(14, 165, 233, 0.25);
    }

    .lasso-drag-stat-label {
      font-size: 9.5px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: rgba(255, 255, 255, 0.5);
      font-weight: 600;
    }

    .lasso-drag-stat-val {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 11px;
      font-weight: 600;
      color: #f1f5f9;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .lasso-drag-stat-box.accent .lasso-drag-stat-val {
      color: #38bdf8;
    }

    .lasso-drag-context-hint {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 5px 9px;
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.05);
      font-size: 10px;
      color: rgba(255, 255, 255, 0.65);
      margin-bottom: 12px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .lasso-drag-context-icon {
      color: #38bdf8;
    }

    .lasso-drag-status-wrap {
      margin-bottom: 12px;
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: #090a0f;
    }

    .lasso-drag-status-wrap .lasso-agent-status-line {
      padding: 9px 11px;
      font-size: 11px;
    }

    .lasso-drag-input-wrap {
      display: flex;
      flex-direction: column;
      gap: 5px;
      margin-bottom: 13px;
    }

    .lasso-drag-input-label {
      font-size: 10.5px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: rgba(255, 255, 255, 0.5);
    }

    .lasso-drag-textarea {
      width: 100%;
      box-sizing: border-box;
      resize: vertical;
      min-height: 52px;
      max-height: 140px;
      padding: 8px 10px;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      background: rgba(0, 0, 0, 0.25);
      color: #f8fafc;
      font-family: inherit;
      font-size: 11.5px;
      line-height: 1.45;
      outline: none;
      transition: border-color 140ms ease, box-shadow 140ms ease;
    }

    .lasso-drag-textarea:focus {
      border-color: #0ea5e9;
      box-shadow: 0 0 0 2px rgba(14, 165, 233, 0.25);
    }

    .lasso-drag-actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
    }

    .lasso-drag-btn-revert {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 6px 12px;
      border-radius: 7px;
      border: 1px solid rgba(255, 255, 255, 0.15);
      background: transparent;
      color: rgba(255, 255, 255, 0.75);
      font-family: inherit;
      font-size: 11.5px;
      font-weight: 500;
      cursor: pointer;
      transition: background 120ms, color 120ms;
    }

    .lasso-drag-btn-revert:hover {
      background: rgba(255, 255, 255, 0.08);
      color: #ffffff;
    }

    .lasso-drag-btn-apply {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 6px 14px;
      border-radius: 7px;
      border: 0;
      background: linear-gradient(135deg, #0ea5e9 0%, #38bdf8 100%);
      color: #ffffff;
      font-family: inherit;
      font-size: 11.5px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 2px 10px rgba(14, 165, 233, 0.35);
      transition: opacity 120ms, transform 120ms;
    }

    .lasso-drag-btn-apply:hover {
      opacity: 0.94;
      transform: translateY(-1px);
    }

    .lasso-drag-btn-apply:active {
      transform: scale(0.97);
    }

    .lasso-drag-btn-apply.loading {
      pointer-events: none;
      opacity: 0.65;
    }

    .lasso-drag-btn-apply .lasso-btn-sparkle {
      width: 14px;
      height: 14px;
    }
  `;
