export function baseStyles(tokens: string): string {
  return `
    @import url('https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;600&family=Google+Sans+Text:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');

    :host {
      all: initial !important;
      display: block !important;
      position: fixed !important;
      inset: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      z-index: 2147483647 !important;
      pointer-events: none !important;
      isolation: isolate !important;
      font-family: var(--lo-font) !important;
      line-height: normal !important;
      color: var(--lo-text) !important;

      ${tokens}
    }

    *, *::before, *::after {
      box-sizing: border-box !important;
    }

    button, input, textarea, select {
      font-family: inherit;
      letter-spacing: normal;
    }

    /* ==========================================================
       TOOLBAR (Figma-Style Floating Island)
       ========================================================== */

    .lasso-toolbar {
      position: fixed;
      left: 50%;
      bottom: 24px;
      transform: translateX(-50%);
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 48px;
      padding: 6px 8px;
      background: rgba(22, 23, 27, 0.94);
      border: 1px solid var(--lo-border);
      border-radius: var(--lo-radius-full);
      color: var(--lo-text);
      box-shadow: var(--lo-shadow-lg);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      pointer-events: auto;
      user-select: none;
      z-index: 10;
      transition: transform 200ms ease, opacity 200ms ease;
    }

    .lasso-toolbar.dismissed {
      display: none !important;
    }

    .lasso-toolbar-mini {
      display: none;
    }

    /* ==========================================================
       NEW PAGE — nested project explorer
       ========================================================== */
    .lasso-page-backdrop { position: fixed; inset: 0; z-index: 30; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(8, 9, 11, 0.5); backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px); pointer-events: auto; }
    .lasso-page-backdrop[hidden] { display: none; }
    .lasso-page-panel { display: flex; flex-direction: column; width: min(400px, 100%); max-height: calc(100vh - 32px); padding: 16px; border: 1px solid var(--lo-border); border-radius: var(--lo-radius-xl); background: var(--lo-surface); color: var(--lo-text); box-shadow: var(--lo-shadow-lg); pointer-events: auto; animation: lasso-page-in 170ms cubic-bezier(0.16, 1, 0.3, 1); }
    @keyframes lasso-page-in { from { opacity: 0; transform: translateY(10px) scale(0.98); } to { opacity: 1; transform: none; } }
    .lasso-page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
    .lasso-page-title-row { display: flex; align-items: center; gap: 7px; color: var(--lo-text); }
    .lasso-page-title { font-size: 13px; font-weight: 650; letter-spacing: -0.01em; }
    .lasso-page-close { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border: 0; border-radius: 6px; background: transparent; color: var(--lo-text-3); cursor: pointer; transition: background 120ms, color 120ms; }
    .lasso-page-close:hover { background: var(--lo-surface-hover); color: var(--lo-text); }
    .lasso-page-field { display: block; margin-bottom: 13px; }
    .lasso-page-label-text { display: block; margin-bottom: 6px; color: var(--lo-text-3); font-size: 10.5px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; }
    .lasso-page-name { width: 100%; box-sizing: border-box; padding: 9px 11px; border: 1px solid var(--lo-border); border-radius: var(--lo-radius-md); background: var(--lo-surface-2); color: var(--lo-text); font: inherit; font-size: 12.5px; }
    .lasso-page-name::placeholder, .lasso-page-filter::placeholder, .lasso-page-inline-input::placeholder { color: var(--lo-text-3); }
    .lasso-page-name:focus, .lasso-page-filter:focus, .lasso-page-inline-input:focus { outline: none; border-color: var(--lo-primary); box-shadow: 0 0 0 3px var(--lo-primary-soft); }
    .lasso-page-name.invalid { border-color: var(--lo-error); }
    .lasso-page-field-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px; }
    .lasso-page-field-head .lasso-page-label-text { margin-bottom: 0; }
    .lasso-page-field-tools { display: flex; align-items: center; gap: 5px; }
    .lasso-page-filter { width: 96px; box-sizing: border-box; padding: 4px 8px; border: 1px solid var(--lo-border); border-radius: var(--lo-radius-full); background: var(--lo-surface-2); color: var(--lo-text); font: inherit; font-size: 11px; }
    .lasso-page-new-folder { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border: 1px solid var(--lo-border); border-radius: 6px; background: var(--lo-surface-2); color: var(--lo-text-2); cursor: pointer; transition: background 120ms, color 120ms; }
    .lasso-page-new-folder:hover { background: var(--lo-surface-hover); color: var(--lo-text); }
    .lasso-page-tree { max-height: 240px; overflow: auto; padding: 5px; border: 1px solid var(--lo-border); border-radius: var(--lo-radius-md); background: var(--lo-surface-2); }
    .lasso-page-row { display: flex; align-items: center; gap: 4px; min-height: 24px; padding-left: calc(4px + var(--lasso-page-depth, 0) * 13px); padding-right: 4px; border-radius: 5px; color: var(--lo-text-2); font: inherit; font-size: 12px; cursor: pointer; user-select: none; }
    .lasso-page-row:hover { background: var(--lo-surface-hover); color: var(--lo-text); }
    .lasso-page-row.selected { background: var(--lo-primary-soft); color: var(--lo-text); box-shadow: inset 2px 0 0 var(--lo-primary); }
    .lasso-page-row.muted { color: var(--lo-text-3); font-size: 11px; font-style: italic; cursor: default; }
    .lasso-page-row.muted:hover { background: transparent; color: var(--lo-text-3); }
    .lasso-page-row.creating { cursor: default; }
    .lasso-page-row.creating:hover { background: transparent; }
    .lasso-page-twisty { display: inline-flex; align-items: center; justify-content: center; width: 14px; height: 14px; flex: 0 0 auto; color: var(--lo-text-3); transition: transform 120ms ease; }
    .lasso-page-twisty.open { transform: rotate(90deg); }
    .lasso-page-twisty svg { width: 11px; height: 11px; }
    .lasso-page-icon { display: inline-flex; align-items: center; justify-content: center; width: 14px; height: 14px; flex: 0 0 auto; }
    .lasso-page-icon svg { width: 14px; height: 14px; }
    .lasso-page-icon.folder { color: var(--lo-primary); }
    .lasso-page-icon.file { color: var(--lo-text-3); }
    .lasso-page-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .lasso-page-inline-input { min-width: 0; flex: 1; padding: 3px 6px; border: 1px solid var(--lo-primary); border-radius: 5px; background: var(--lo-surface); color: var(--lo-text); font: inherit; font-size: 12px; }
    .lasso-page-inline-confirm, .lasso-page-inline-cancel { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; flex: 0 0 auto; padding: 0; border: 0; border-radius: 5px; cursor: pointer; }
    .lasso-page-inline-confirm { background: var(--lo-primary-soft); color: var(--lo-primary); }
    .lasso-page-inline-cancel { background: transparent; color: var(--lo-text-3); }
    .lasso-page-inline-confirm:hover, .lasso-page-inline-cancel:hover { filter: brightness(1.2); }
    .lasso-page-inline-confirm svg, .lasso-page-inline-cancel svg { width: 12px; height: 12px; }
    .lasso-page-footer { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
    .lasso-page-status { min-width: 0; flex: 1; color: var(--lo-text-3); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .lasso-page-status.error { color: var(--lo-error); }
    .lasso-page-create { flex: 0 0 auto; padding: 8px 15px; border: 0; border-radius: var(--lo-radius-full); background: var(--lo-primary); color: #111214; font: inherit; font-size: 12px; font-weight: 650; cursor: pointer; transition: filter 120ms, opacity 120ms; }
    .lasso-page-create:disabled { opacity: 0.45; cursor: not-allowed; }
    .lasso-page-create:not(:disabled):hover { filter: brightness(1.08); }
    @media (max-width: 600px) { .lasso-page-panel { width: 100%; } }

    .lasso-tb-sep {
      width: 1px;
      height: 20px;
      background: var(--lo-border);
      margin: 0 2px;
      flex-shrink: 0;
    }

    /* Figma-style morphing icon-to-pill tool buttons */
    .lasso-tool-btn {
      position: relative;
      height: 42px;
      min-width: 42px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0 12px;
      border: 0;
      border-radius: var(--lo-radius-full);
      background: transparent;
      color: var(--lo-text-2);
      font-family: inherit;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      outline: none;
      transition: all 200ms cubic-bezier(0.16, 1, 0.3, 1);
      white-space: nowrap;
      overflow: hidden;
    }

    .lasso-tool-btn svg {
      flex-shrink: 0;
      transition: transform 150ms ease;
    }

    .lasso-tool-btn:hover {
      background: var(--lo-surface-hover);
      color: var(--lo-text);
      transform: translateY(-1px);
    }

    .lasso-tool-btn:active {
      transform: scale(0.96);
    }

    .lasso-toolbar-tooltip {
      position: fixed;
      z-index: 100;
      transform: translateX(-50%);
      max-width: 220px;
      padding: 6px 9px;
      border: 1px solid var(--lo-border);
      border-radius: 7px;
      background: var(--lo-surface-2);
      color: var(--lo-text);
      box-shadow: 0 8px 24px rgba(0,0,0,.28);
      font-size: 11px;
      line-height: 1.2;
      white-space: nowrap;
      pointer-events: none;
    }
    .lasso-toolbar-tooltip[hidden] { display: none; }

    /* Animated label transition */
    .lasso-tool-label {
      max-width: 0;
      opacity: 0;
      overflow: hidden;
      display: inline-block;
      transition: max-width 220ms cubic-bezier(0.16, 1, 0.3, 1), opacity 180ms ease, margin-left 200ms ease;
      white-space: nowrap;
    }

    /* Select tool active (Indigo pill) */
    .lasso-tool-btn.select-tool.active {
      background: var(--lo-indigo);
      color: #ffffff;
      box-shadow: 0 2px 10px rgba(99, 102, 241, 0.35);
    }

    .lasso-tool-btn.select-tool.active .lasso-tool-label {
      max-width: 80px;
      opacity: 1;
      margin-left: 6px;
    }

    /* Drag tool active (Sky / Cyan pill) */
    .lasso-tool-btn.drag-tool.active {
      background: #0ea5e9;
      color: #ffffff;
      box-shadow: 0 2px 10px rgba(14, 165, 233, 0.4);
    }

    .lasso-tool-btn.drag-tool.active .lasso-tool-label {
      max-width: 80px;
      opacity: 1;
      margin-left: 6px;
    }

    /* Comment tool active (Amber pill) */
    .lasso-tool-btn.comment-tool.active {
      background: var(--lo-amber);
      color: #ffffff;
      box-shadow: 0 2px 10px rgba(245, 158, 11, 0.35);
    }

    .lasso-tool-btn.comment-tool.active .lasso-tool-label {
      max-width: 80px;
      opacity: 1;
      margin-left: 6px;
    }

    /* Preview tool active (green play pill) */
    .lasso-tool-btn.preview-tool.active {
      background: var(--lo-success);
      color: #ffffff;
      box-shadow: 0 2px 10px rgba(129, 201, 149, 0.35);
    }

    .lasso-tool-btn.preview-tool.active .lasso-tool-label {
      max-width: 80px;
      opacity: 1;
      margin-left: 6px;
    }

    /* Command tool active */
    .lasso-tool-btn.command-tool.active {
      background: var(--lo-surface-3);
      color: #ffffff;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.35);
    }

    .lasso-tool-btn.command-tool.active .lasso-tool-label {
      max-width: 80px;
      opacity: 1;
      margin-left: 6px;
    }

    /* Git & Voice buttons */
    .lasso-tool-btn.git-tool:hover {
      color: var(--lo-primary);
    }

    .lasso-tool-btn.voice-tool {
      color: var(--lo-text-2);
    }

    .lasso-tool-btn.voice-tool:hover {
      color: var(--lo-text);
      background: rgba(255, 255, 255, 0.07);
    }

    .lasso-tool-btn.voice-tool.live {
      background: rgba(129, 201, 149, 0.16);
      color: var(--lo-success);
      box-shadow: 0 0 0 1.5px rgba(129, 201, 149, 0.4);
    }

    .lasso-tool-btn.voice-tool.live svg {
      animation: lasso-mic-pulse 1.8s ease-in-out infinite;
    }

    @keyframes lasso-mic-pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.7; transform: scale(0.92); }
    }

    .lasso-tool-btn.voice-tool.muted {
      background: rgba(242, 139, 130, 0.16);
      color: var(--lo-error);
    }

    /* Command button */
    .lasso-tool-btn.command-tool {
      color: var(--lo-text-2);
    }

    .lasso-tool-btn.command-tool:hover {
      color: var(--lo-primary);
      background: rgba(129, 201, 149, 0.16);
    }

    /* Page button */
    .lasso-tool-btn.page-tool {
      color: var(--lo-text-2);
    }

    .lasso-tool-btn.page-tool:hover {
      color: var(--lo-primary);
      background: rgba(129, 201, 149, 0.16);
    }

    /* Badge on comment button */
    .lasso-comments-badge {
      display: none;
      min-width: 16px;
      height: 16px;
      padding: 0 4px;
      border-radius: var(--lo-radius-full);
      background: var(--lo-error);
      color: #ffffff;
      font-size: 10px;
      font-weight: 700;
      align-items: center;
      justify-content: center;
      line-height: 1;
      margin-left: 4px;
    }

    .lasso-comments-badge.visible {
      display: inline-flex;
    }

    /* Toolbar dismiss button */
    .lasso-toolbar-dismiss {
      width: 32px;
      height: 32px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 0;
      border-radius: var(--lo-radius-full);
      background: transparent;
      color: var(--lo-text-3);
      cursor: pointer;
      transition: background 120ms ease, color 120ms ease;
    }

    .lasso-toolbar-dismiss:hover {
      background: var(--lo-surface-hover);
      color: var(--lo-text);
    }

    /* Floating reopen trigger when dismissed */
    .lasso-toolbar-reopen {
      position: fixed;
      right: 20px;
      bottom: 20px;
      width: 44px;
      height: 44px;
      display: none;
      align-items: center;
      justify-content: center;
      border: 1px solid var(--lo-border);
      border-radius: var(--lo-radius-full);
      background: var(--lo-surface);
      color: var(--lo-primary);
      box-shadow: var(--lo-shadow-lg);
      cursor: pointer;
      pointer-events: auto;
      transition: transform 160ms ease, background 160ms ease;
      z-index: 10;
      touch-action: none;
      user-select: none;
      cursor: grab;
    }

    .lasso-toolbar-reopen:active { cursor: grabbing; }

    .lasso-toolbar-reopen img { display: block; object-fit: contain; pointer-events: none; }

    .lasso-toolbar-reopen.visible {
      display: inline-flex;
    }

    .lasso-toolbar-reopen:hover {
      transform: translateY(-2px) scale(1.05);
      background: var(--lo-surface-elevated);
      color: #ffffff;
    }

    @media (max-width: 760px) {
      .lasso-new-page-panel { left: 50%; transform: translateX(-50%); }
    }

    /* Presence Avatars in toolbar with color outlines */
    .lasso-presence {
      display: flex;
      align-items: center;
      padding: 0 2px;
    }

    .lasso-presence-avatars {
      display: flex;
      align-items: center;
    }

    .lasso-avatar {
      position: relative;
      width: 28px;
      height: 28px;
      border-radius: var(--lo-radius-full);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 700;
      color: #ffffff;
      margin-left: -8px;
      cursor: pointer;
      border: 2px solid var(--ac, #6366f1);
      box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.4);
      transition: transform 150ms ease, box-shadow 150ms ease;
      overflow: hidden;
      padding: 0;
    }

    .lasso-avatar:first-child {
      margin-left: 0;
    }

    .lasso-avatar:hover {
      transform: translateY(-2px) scale(1.1);
      z-index: 2;
    }

    .lasso-avatar.spotlit {
      box-shadow: 0 0 0 3px #ffffff, 0 0 12px var(--ac, #6366f1);
    }

    .lasso-avatar.away {
      opacity: 0.6;
    }

    .lasso-avatar-dot {
      position: absolute;
      right: -1px;
      bottom: -1px;
      width: 8px;
      height: 8px;
      border-radius: var(--lo-radius-full);
      background: var(--lo-success);
      border: 2px solid var(--lo-surface);
    }

    .lasso-avatar.away .lasso-avatar-dot {
      background: var(--lo-text-3);
    }

    .lasso-presence-count {
      font-size: 11px;
      color: var(--lo-text-3);
      margin-left: 6px;
    }

    /* ==========================================================
       DISCORD-STYLE FLOATING VOICE BAR
       ========================================================== */

    .lasso-voice-bar {
      position: fixed;
      left: 50%;
      top: 16px;
      transform: translateX(-50%) translateY(-8px);
      display: none;
      align-items: center;
      gap: 10px;
      padding: 6px 14px;
      background: rgba(22, 23, 27, 0.96);
      border: 1px solid var(--lo-border);
      border-radius: var(--lo-radius-full);
      color: var(--lo-text);
      box-shadow: var(--lo-shadow-lg);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      pointer-events: auto;
      z-index: 10;
      opacity: 0;
      transition: opacity 180ms ease, transform 180ms cubic-bezier(0.16, 1, 0.3, 1);
    }

    .lasso-voice-bar.visible {
      display: inline-flex;
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }

    .lasso-voice-bar-dot {
      width: 8px;
      height: 8px;
      border-radius: var(--lo-radius-full);
      background: var(--lo-success);
      box-shadow: 0 0 8px var(--lo-success);
      animation: lasso-pulse-glow 1.5s ease-in-out infinite;
    }

    @keyframes lasso-pulse-glow {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.6; transform: scale(0.85); }
    }

    .lasso-voice-bar-label {
      font-size: 12px;
      font-weight: 600;
      color: var(--lo-text);
    }

    .lasso-voice-bar-sep {
      width: 1px;
      height: 16px;
      background: var(--lo-border);
    }

    .lasso-voice-bar-btn {
      width: 28px;
      height: 28px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 0;
      border-radius: var(--lo-radius-full);
      background: var(--lo-surface-hover);
      color: var(--lo-text-2);
      cursor: pointer;
      transition: background 120ms ease, color 120ms ease;
    }

    .lasso-voice-bar-btn:hover {
      background: var(--lo-border);
      color: var(--lo-text);
    }

    .lasso-voice-bar-btn.mute-toggle.muted {
      background: rgba(242, 139, 130, 0.2);
      color: var(--lo-error);
    }

    .lasso-voice-bar-btn.disconnect {
      background: rgba(242, 139, 130, 0.25);
      color: var(--lo-error);
    }

    .lasso-voice-bar-btn.disconnect:hover {
      background: var(--lo-error);
      color: #ffffff;
    }

`;
}
