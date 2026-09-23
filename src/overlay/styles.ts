import { hostTokensCss } from "./tokens";

export function buildStyles(): string {
  return `
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

      ${hostTokensCss()}
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

    /* Git & Voice buttons */
    .lasso-tool-btn.git-tool:hover {
      color: var(--lo-primary);
    }

    .lasso-tool-btn.voice-tool.live {
      background: rgba(129, 201, 149, 0.16);
      color: var(--lo-success);
    }

    .lasso-tool-btn.voice-tool.muted {
      background: rgba(242, 139, 130, 0.16);
      color: var(--lo-error);
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
    }

    .lasso-toolbar-reopen.visible {
      display: inline-flex;
    }

    .lasso-toolbar-reopen:hover {
      transform: translateY(-2px) scale(1.05);
      background: var(--lo-surface-elevated);
      color: #ffffff;
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

    /* ==========================================================
       HOVER / SELECTION BOXES & LABELS
       ========================================================== */

    .lasso-box {
      position: fixed;
      display: none;
      border-radius: var(--lo-radius-sm);
      pointer-events: none;
      transition: left 50ms ease, top 50ms ease, width 50ms ease, height 50ms ease;
    }

    .lasso-box.hover {
      border-width: 1.5px;
      border-style: solid;
    }

    .lasso-box.selected {
      border-width: 2.5px;
      border-style: solid;
    }

    .lasso-label {
      position: fixed;
      display: none;
      align-items: center;
      height: 24px;
      padding: 0 10px;
      border-radius: var(--lo-radius-sm);
      color: #ffffff;
      font-size: 11px;
      font-weight: 600;
      line-height: 24px;
      white-space: nowrap;
      box-shadow: var(--lo-shadow-subtle);
      pointer-events: none;
      user-select: none;
      z-index: 5;
    }

    .lasso-lock-chip {
      position: absolute;
      top: -26px;
      right: -2px;
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 3px 10px;
      border-radius: var(--lo-radius-full);
      font-size: 11px;
      font-weight: 700;
      color: #ffffff;
      white-space: nowrap;
      box-shadow: var(--lo-shadow-subtle);
      pointer-events: none;
    }

    .lasso-lock-chip.held {
      background: var(--lo-amber);
    }

    .lasso-lock-chip.blocked {
      background: var(--lo-error);
    }

    /* Remote user selection box */
    .lasso-remote-box {
      position: fixed;
      pointer-events: none;
      box-shadow: 0 0 0 2px var(--lc);
      border-radius: var(--lo-radius-sm);
      opacity: 0.92;
      transition: opacity 180ms ease;
      z-index: 4;
    }

    .lasso-remote-box .lasso-remote-tag {
      position: absolute;
      left: -2px;
      top: -22px;
      display: flex;
      align-items: center;
      gap: 5px;
      padding: 3px 8px;
      border-radius: var(--lo-radius-full);
      background: var(--lc);
      color: #ffffff;
      font-size: 10px;
      font-weight: 700;
      white-space: nowrap;
    }

    /* Spotlight */
    .lasso-spotlight {
      position: fixed;
      pointer-events: none;
      box-shadow: 0 0 0 3px var(--lo-indigo), 0 0 30px rgba(99, 102, 241, 0.45);
      border-radius: var(--lo-radius-sm);
      opacity: 0;
      transition: opacity 180ms ease;
      z-index: 5;
    }

    .lasso-spotlight.visible {
      opacity: 1;
    }

    .lasso-spotlight-chip {
      position: absolute;
      left: -2px;
      top: -26px;
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 3px 10px;
      border-radius: var(--lo-radius-full);
      background: var(--lo-indigo);
      color: #ffffff;
      font-size: 11px;
      font-weight: 700;
      white-space: nowrap;
      box-shadow: var(--lo-shadow-subtle);
    }

    /* Activity Strip */
    .lasso-activity {
      position: fixed;
      left: 50%;
      bottom: 82px;
      transform: translateX(-50%);
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      border-radius: var(--lo-radius-full);
      background: rgba(22, 23, 27, 0.96);
      border: 1px solid var(--lo-border);
      color: var(--lo-text);
      font-size: 12px;
      font-weight: 600;
      opacity: 0;
      pointer-events: none;
      white-space: nowrap;
      transition: opacity 200ms ease;
      z-index: 8;
      backdrop-filter: blur(12px);
    }

    .lasso-activity.visible {
      opacity: 1;
    }

    .lasso-activity .lasso-activity-dot {
      width: 8px;
      height: 8px;
      border-radius: var(--lo-radius-full);
      background: var(--lc, var(--lo-primary));
      flex-shrink: 0;
    }

    /* ==========================================================
       COMMENT PINS & POPOVERS (Figma-Style Multiplayer)
       ========================================================== */

    .lasso-comment-pins {
      position: fixed;
      inset: 0;
      z-index: 6;
      pointer-events: none;
    }

    .lasso-comment-pin {
      position: fixed;
      width: 34px;
      height: 34px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 2px solid rgba(255, 255, 255, 0.95);
      border-radius: 999px 999px 999px 4px;
      background: var(--lo-indigo);
      color: #ffffff;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35), 0 0 0 2px rgba(99, 102, 241, 0.3);
      font: 700 11px/1 inherit;
      cursor: pointer;
      pointer-events: auto;
      transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 200ms ease, filter 200ms ease, opacity 200ms ease;
      overflow: visible;
      padding: 0;
      outline: none;
      user-select: none;
      touch-action: none;
      z-index: 10;
    }

    .lasso-comment-pin.movable {
      cursor: grab;
    }

    .lasso-comment-pin.movable:active,
    .lasso-comment-pin.dragging {
      cursor: grabbing !important;
      transform: scale(1.28) translateY(-4px);
      transition: none !important;
      z-index: 1000 !important;
      box-shadow: 0 18px 36px rgba(0, 0, 0, 0.65), 0 0 0 3px #ffffff, 0 0 0 7px rgba(99, 102, 241, 0.6);
      filter: brightness(1.12);
      opacity: 1 !important;
    }

    .lasso-comment-pin:hover,
    .lasso-comment-pin.active {
      transform: scale(1.25) translateY(-3px);
      z-index: 50;
      box-shadow: 0 14px 30px rgba(0, 0, 0, 0.55), 0 0 0 3px #ffffff, 0 0 0 6px rgba(99, 102, 241, 0.5);
      filter: brightness(1.1);
      opacity: 1 !important;
    }

    .lasso-comment-pin.resolved {
      background: var(--lo-success);
      box-shadow: 0 5px 14px rgba(0, 0, 0, 0.3), 0 0 0 3px rgba(129, 201, 149, 0.25);
      opacity: 0.8;
    }

    .lasso-comment-pin.resolved:hover,
    .lasso-comment-pin.resolved.active {
      opacity: 1;
      box-shadow: 0 14px 30px rgba(0, 0, 0, 0.55), 0 0 0 3px #ffffff, 0 0 0 6px rgba(129, 201, 149, 0.5);
    }

    .lasso-pin-avatar {
      width: 26px;
      height: 26px;
      border-radius: var(--lo-radius-full);
      display: flex;
      align-items: center;
      justify-content: center;
      font: 700 11px/1 inherit;
      color: #ffffff;
      flex-shrink: 0;
    }

    .lasso-comment-pin-count {
      position: absolute;
      right: -6px;
      top: -6px;
      min-width: 17px;
      height: 17px;
      padding: 0 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 2px solid var(--lo-bg);
      border-radius: var(--lo-radius-full);
      background: #ffffff;
      color: var(--lo-indigo);
      font: 700 10px/1 inherit;
      transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    .lasso-comment-pin:hover .lasso-comment-pin-count,
    .lasso-comment-pin.active .lasso-comment-pin-count {
      transform: scale(1.08);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
    }

    .lasso-pin-tooltip {
      position: absolute;
      left: calc(100% + 10px);
      top: 50%;
      transform: translateY(-50%) scale(0.92);
      transform-origin: left center;
      background: rgba(18, 18, 26, 0.95);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 8px;
      padding: 6px 10px;
      color: #ffffff;
      box-shadow: 0 10px 24px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.08);
      pointer-events: none;
      opacity: 0;
      visibility: hidden;
      transition: opacity 160ms ease, transform 160ms cubic-bezier(0.16, 1, 0.3, 1), visibility 160ms;
      display: flex;
      flex-direction: column;
      gap: 2px;
      white-space: nowrap;
      max-width: 220px;
      z-index: 100;
    }

    .lasso-pin-tooltip.near-right {
      left: auto;
      right: calc(100% + 10px);
      transform-origin: right center;
    }

    .lasso-pin-tooltip-author {
      font-weight: 600;
      font-size: 11px;
      color: #ffffff;
      overflow: hidden;
      text-overflow: ellipsis;
      text-align: left;
    }

    .lasso-pin-tooltip-body {
      font-weight: 400;
      font-size: 10px;
      color: rgba(255, 255, 255, 0.7);
      overflow: hidden;
      text-overflow: ellipsis;
      text-align: left;
    }

    .lasso-comment-pin:hover .lasso-pin-tooltip {
      opacity: 1;
      visibility: visible;
      transform: translateY(-50%) scale(1);
    }

    .lasso-comment-pin.active .lasso-pin-tooltip,
    .lasso-comment-pin.dragging .lasso-pin-tooltip {
      display: none;
    }

    /* Pin Compose Popover */
    .lasso-pin-compose {
      position: fixed;
      width: 260px;
      padding: 12px;
      border-radius: var(--lo-radius-lg);
      background: var(--lo-surface);
      border: 1px solid var(--lo-border);
      box-shadow: var(--lo-shadow-card);
      z-index: 12;
      pointer-events: auto;
      opacity: 0;
      transform: translateY(6px) scale(0.98);
      transition: opacity 160ms ease, transform 160ms cubic-bezier(0.16, 1, 0.3, 1);
    }

    .lasso-pin-compose.visible {
      opacity: 1;
      transform: translateY(0) scale(1);
    }

    .lasso-pin-compose[hidden] {
      display: none;
    }

    .lasso-pin-compose-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
    }

    .lasso-pin-compose-name {
      font-size: 11px;
      font-weight: 600;
      color: var(--lo-text-2);
    }

    .lasso-pin-compose textarea {
      width: 100%;
      min-height: 60px;
      padding: 8px 10px;
      border-radius: var(--lo-radius-md);
      background: var(--lo-surface-2);
      border: 1px solid var(--lo-border);
      color: var(--lo-text);
      font-size: 13px;
      line-height: 1.4;
      resize: none;
      outline: none;
      transition: border-color 140ms ease;
    }

    .lasso-pin-compose textarea:focus {
      border-color: var(--lo-primary);
    }

    .lasso-pin-compose textarea::placeholder {
      color: var(--lo-text-3);
    }

    .lasso-pin-compose-actions {
      display: flex;
      justify-content: flex-end;
      gap: 6px;
      margin-top: 8px;
    }

    .lasso-pin-compose-actions button {
      min-height: 28px;
      padding: 0 12px;
      border-radius: var(--lo-radius-md);
      border: 0;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: background 120ms ease, transform 120ms ease;
    }

    .lasso-pin-cancel {
      background: transparent;
      color: var(--lo-text-2);
    }

    .lasso-pin-cancel:hover {
      background: var(--lo-surface-hover);
      color: var(--lo-text);
    }

    .lasso-pin-post {
      background: var(--lo-primary);
      color: #111214;
    }

    .lasso-pin-post:hover {
      background: var(--lo-primary-hover);
      transform: translateY(-1px);
    }

    /* Pin Thread Popover */
    .lasso-pin-thread {
      position: fixed;
      width: 290px;
      max-height: 400px;
      display: flex;
      flex-direction: column;
      padding: 12px;
      border-radius: var(--lo-radius-lg);
      background: var(--lo-surface);
      border: 1px solid var(--lo-border);
      box-shadow: var(--lo-shadow-card);
      z-index: 12;
      pointer-events: auto;
      opacity: 0;
      transform: translateY(6px) scale(0.98);
      transition: opacity 160ms ease, transform 160ms cubic-bezier(0.16, 1, 0.3, 1);
    }

    .lasso-pin-thread.visible {
      opacity: 1;
      transform: translateY(0) scale(1);
    }

    .lasso-pin-thread[hidden] {
      display: none;
    }

    .lasso-pin-thread-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 10px;
    }

    .lasso-pin-thread-status {
      font-size: 11px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: var(--lo-radius-full);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .lasso-pin-thread-status.open {
      background: rgba(110, 160, 255, 0.15);
      color: var(--lo-primary);
    }

    .lasso-pin-thread-status.resolved {
      background: rgba(129, 201, 149, 0.15);
      color: var(--lo-success);
    }

    .lasso-pin-thread-close {
      border: 0;
      background: transparent;
      color: var(--lo-text-3);
      font-size: 18px;
      line-height: 1;
      cursor: pointer;
      border-radius: var(--lo-radius-sm);
      padding: 2px 6px;
    }

    .lasso-pin-thread-close:hover {
      background: var(--lo-surface-hover);
      color: var(--lo-text);
    }

    .lasso-pin-thread-msgs {
      flex: 1;
      overflow-y: auto;
      max-height: 220px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding-right: 4px;
      margin-bottom: 10px;
    }

    .lasso-pin-thread-msg-row {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 4px;
    }

    .lasso-pin-thread-avatar {
      width: 20px;
      height: 20px;
      border-radius: var(--lo-radius-full);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 9px;
      font-weight: 700;
      color: #ffffff;
      flex-shrink: 0;
    }

    .lasso-pin-thread-author {
      font-size: 11px;
      font-weight: 600;
      color: var(--lo-text);
    }

    .lasso-pin-thread-time {
      font-size: 10px;
      color: var(--lo-text-3);
      margin-left: auto;
    }

    .lasso-pin-thread-body {
      font-size: 12px;
      line-height: 1.45;
      color: var(--lo-text-2);
      padding-left: 26px;
      word-break: break-word;
    }

    .lasso-pin-thread-reply-area {
      padding-top: 4px;
    }

    .lasso-pin-thread-reply-area textarea {
      width: 100%;
      min-height: 48px;
      padding: 6px 8px;
      border-radius: var(--lo-radius-md);
      background: var(--lo-surface-2);
      border: 1px solid var(--lo-border);
      color: var(--lo-text);
      font-size: 12px;
      line-height: 1.4;
      resize: none;
      outline: none;
    }

    .lasso-pin-thread-reply-area textarea:focus {
      border-color: var(--lo-primary);
    }

    .lasso-pin-thread-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: 6px;
    }

    .lasso-pin-resolve {
      border: 0;
      background: transparent;
      color: var(--lo-text-3);
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      padding: 4px 6px;
      border-radius: var(--lo-radius-sm);
    }

    .lasso-pin-resolve:hover {
      background: var(--lo-surface-hover);
      color: var(--lo-text);
    }

    .lasso-pin-reply-post {
      border: 0;
      border-radius: var(--lo-radius-md);
      background: var(--lo-primary);
      color: #111214;
      font-size: 11px;
      font-weight: 600;
      padding: 5px 12px;
      cursor: pointer;
    }

    .lasso-pin-reply-post:hover {
      background: var(--lo-primary-hover);
    }

    /* ==========================================================
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
      gap: 8px;
      margin-bottom: 10px;
      cursor: grab;
      touch-action: none;
    }

    .lasso-prompt-top:active {
      cursor: grabbing;
    }

    .lasso-prompt-ai {
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .lasso-prompt-model-wrap {
      position: relative;
    }

    .lasso-prompt-model {
      height: 26px;
      display: flex;
      align-items: center;
      gap: 5px;
      padding: 0 9px;
      border: 1px solid var(--lo-border);
      border-radius: var(--lo-radius-full);
      background: var(--lo-surface-2);
      color: var(--lo-text);
      font-family: inherit;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      transition: background 120ms ease, border-color 120ms ease;
    }

    .lasso-prompt-model:hover {
      background: var(--lo-surface-hover);
      border-color: var(--lo-primary);
    }

    .lasso-prompt-model-menu {
      position: absolute;
      top: calc(100% + 6px);
      left: 0;
      min-width: 190px;
      padding: 4px;
      background: var(--lo-surface-elevated);
      border: 1px solid var(--lo-border);
      border-radius: var(--lo-radius-md);
      box-shadow: var(--lo-shadow-card);
      z-index: 20;
    }

    .lasso-prompt-model-menu[hidden] {
      display: none;
    }

    .lasso-model-filters {
      display: flex;
      gap: 4px;
      padding: 4px;
      border-bottom: 1px solid var(--lo-border-subtle);
    }

    .lasso-model-filter {
      border: 0;
      border-radius: var(--lo-radius-sm);
      padding: 4px 7px;
      background: transparent;
      color: var(--lo-text-3);
      font: 600 10px/1 inherit;
      cursor: pointer;
    }

    .lasso-model-filter:hover,
    .lasso-model-filter.active {
      background: var(--lo-primary-soft);
      color: var(--lo-primary);
    }

    .lasso-model-group {
      padding: 7px 9px 3px;
      color: var(--lo-text-3);
      font-size: 9px;
      font-weight: 700;
      letter-spacing: .06em;
      text-transform: uppercase;
    }

    .lasso-model-item-icon,
    .lasso-model-active-icon {
      display: inline-flex;
      width: 16px;
      height: 16px;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      border-radius: var(--lo-radius-sm);
      overflow: hidden;
    }

    .lasso-model-item-icon svg,
    .lasso-model-active-icon svg {
      display: block;
      width: 100%;
      height: 100%;
    }

    .lasso-model-active-icon {
      width: 14px;
      height: 14px;
      margin-right: 5px;
      vertical-align: -2px;
    }

    .provider-google { background: rgba(110, 160, 255, 0.16); color: #6ea0ff; }
    .provider-openai { background: rgba(22, 131, 91, 0.16); color: #10b981; }
    .provider-anthropic { background: rgba(245, 158, 11, 0.16); color: #f59e0b; }
    .provider-ollama { background: rgba(255, 255, 255, 0.08); color: var(--lo-text-2); }

    .lasso-prompt-model-item {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 7px 9px;
      border: 0;
      border-radius: var(--lo-radius-sm);
      background: transparent;
      color: var(--lo-text);
      font-family: inherit;
      font-size: 12px;
      font-weight: 500;
      text-align: left;
      cursor: pointer;
      transition: background 120ms ease;
    }

    .lasso-prompt-model-item:hover {
      background: var(--lo-surface-hover);
    }

    .lasso-prompt-model-item .lasso-prompt-model-check {
      flex-shrink: 0;
      color: var(--lo-primary);
      opacity: 0;
    }

    .lasso-prompt-model-item.selected .lasso-prompt-model-check {
      opacity: 1;
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
    }

    .lasso-prompt-element svg {
      width: 13px;
      height: 13px;
      flex-shrink: 0;
      color: var(--lo-primary);
    }

    .lasso-prompt-close {
      width: 26px;
      height: 26px;
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
      min-height: 60px;
      max-height: 140px;
      padding: 6px 8px 10px;
      resize: none;
      border: 0;
      outline: none;
      background: transparent;
      color: var(--lo-text);
      font-family: inherit;
      font-size: 14px;
      line-height: 22px;
    }

    .lasso-prompt-input::placeholder {
      color: var(--lo-text-3);
    }

    .lasso-chat-thread {
      display: flex;
      flex-direction: column;
      gap: 7px;
      max-height: 118px;
      overflow: auto;
      margin: -2px 0 10px;
      padding-right: 2px;
    }

    .lasso-chat-message {
      max-width: 92%;
      padding: 8px 10px;
      border-radius: var(--lo-radius-md);
      color: var(--lo-text-2);
      background: var(--lo-surface-2);
      font-size: 11px;
      line-height: 1.45;
    }

    .lasso-chat-message.user {
      align-self: flex-end;
      color: #111214;
      background: var(--lo-primary);
      font-weight: 500;
    }

    .lasso-chat-message.error {
      color: var(--lo-error);
      background: rgba(242, 139, 130, 0.12);
    }

    .lasso-agent-status {
      display: grid;
      grid-template-columns: 8px auto 1fr;
      align-items: center;
      gap: 8px;
      margin: 0 0 10px;
      padding: 8px 10px;
      border-radius: var(--lo-radius-md);
      background: var(--lo-surface-2);
      color: var(--lo-text-2);
      font-size: 11px;
      line-height: 1.35;
    }

    .lasso-agent-status[hidden] {
      display: none;
    }

    .lasso-agent-status-kicker {
      color: var(--lo-primary);
      font-size: 10px;
      font-weight: 700;
      letter-spacing: .02em;
      white-space: nowrap;
    }

    .lasso-agent-status-message {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .lasso-agent-log {
      grid-column: 1 / -1;
      display: grid;
      gap: 3px;
      margin: 2px 0 0 16px;
      color: var(--lo-text-3);
      font: 10px/1.4 var(--lo-font-mono);
    }

    .lasso-agent-log div {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .lasso-agent-status[data-status="review"] {
      background: rgba(129, 201, 149, 0.12);
      color: var(--lo-success);
    }

    .lasso-agent-status[data-status="error"] {
      background: rgba(242, 139, 130, 0.12);
      color: var(--lo-error);
    }

    .lasso-agent-status-dot {
      width: 7px;
      height: 7px;
      flex-shrink: 0;
      border-radius: 50%;
      background: var(--lo-primary);
      animation: lasso-agent-pulse 1.2s ease-in-out infinite;
    }

    .lasso-agent-status[data-status="thinking"] .lasso-agent-status-dot,
    .lasso-agent-status[data-status="working"] .lasso-agent-status-dot {
      width: 10px;
      height: 10px;
      border: 2px solid var(--lo-border);
      border-top-color: var(--lo-primary);
      background: transparent;
      animation: lasso-agent-spin .8s linear infinite;
    }

    [data-status="review"] .lasso-agent-status-dot { background: var(--lo-success); animation: none; }
    [data-status="error"] .lasso-agent-status-dot { background: var(--lo-error); animation: none; }

    @keyframes lasso-agent-pulse { 50% { opacity: .35; transform: scale(.75); } }
    @keyframes lasso-agent-spin { to { transform: rotate(360deg); } }

    .lasso-prompt-actions {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding-top: 6px;
    }

    .lasso-prompt-icon-group {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .lasso-prompt-upload,
    .lasso-prompt-voice,
    .lasso-prompt-stop {
      width: 32px;
      height: 32px;
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

    .lasso-prompt-upload:hover {
      background: var(--lo-surface-hover);
      color: var(--lo-text);
    }

    .lasso-prompt-voice {
      cursor: not-allowed;
      opacity: 0.5;
    }

    .lasso-prompt-stop {
      border-color: rgba(242, 139, 130, 0.4);
      background: rgba(242, 139, 130, 0.15);
      color: var(--lo-error);
    }

    .lasso-prompt-stop:hover {
      background: rgba(242, 139, 130, 0.25);
    }

    .lasso-prompt-stop[hidden] {
      display: none;
    }

    .lasso-prompt-send {
      height: 34px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 0 16px;
      border: 0;
      border-radius: var(--lo-radius-md);
      background: var(--lo-primary);
      color: #111214;
      font-family: inherit;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: background 120ms ease, transform 120ms ease;
    }

    .lasso-prompt-send:hover {
      background: var(--lo-primary-hover);
      transform: translateY(-1px);
    }

    .lasso-prompt-send:active {
      transform: scale(0.96);
    }

    .lasso-prompt-send.loading {
      min-width: 92px;
      cursor: wait;
      opacity: 0.9;
    }

    .lasso-prompt-send.loading svg {
      display: none;
    }

    .lasso-prompt-send.loading::before {
      content: "";
      width: 13px;
      height: 13px;
      border: 2px solid rgba(0, 0, 0, 0.4);
      border-top-color: #000;
      border-radius: 50%;
      animation: lasso-agent-spin .7s linear infinite;
    }

    /* ==========================================================
       REVIEW PANEL
       ========================================================== */

    .lasso-review {
      position: fixed;
      width: min(540px, calc(100vw - 24px));
      max-height: min(620px, calc(100vh - 24px));
      overflow: auto;
      padding: 18px;
      border: 1px solid var(--lo-border);
      border-radius: var(--lo-radius-lg);
      background: var(--lo-surface);
      color: var(--lo-text);
      box-shadow: var(--lo-shadow-lg);
      pointer-events: auto;
      font-family: inherit;
      z-index: 20;
    }

    .lasso-review[hidden] {
      display: none;
    }

    .lasso-review-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 14px;
    }

    .lasso-review-title {
      margin: 0;
      font-size: 15px;
      font-weight: 700;
    }

    .lasso-review-subtitle {
      margin: 4px 0 0;
      color: var(--lo-text-2);
      font-size: 12px;
      line-height: 1.4;
    }

    .lasso-review-close {
      border: 0;
      background: transparent;
      color: var(--lo-text-3);
      font-size: 18px;
      cursor: pointer;
    }

    .lasso-review-close:hover {
      color: var(--lo-text);
    }

    .lasso-review-file {
      margin-top: 10px;
      overflow: hidden;
      border: 1px solid var(--lo-border);
      border-radius: var(--lo-radius-md);
    }

    .lasso-review-file-name {
      padding: 8px 10px;
      background: var(--lo-surface-2);
      color: var(--lo-text-2);
      font: 600 11px/1.2 var(--lo-font-mono);
    }

    .lasso-review-code {
      display: grid;
      grid-template-columns: 1fr 1fr;
      min-width: 0;
    }

    .lasso-review-code pre {
      min-width: 0;
      margin: 0;
      padding: 10px;
      overflow: auto;
      font: 10px/1.5 var(--lo-font-mono);
      white-space: pre-wrap;
      word-break: break-word;
    }

    .lasso-review-old {
      color: #fca5a5;
      background: rgba(242, 139, 130, 0.08);
    }

    .lasso-review-new {
      color: #86efac;
      background: rgba(129, 201, 149, 0.08);
    }

    .lasso-review-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 16px;
    }

    .lasso-review-actions button {
      min-height: 34px;
      padding: 0 14px;
      border: 1px solid var(--lo-border);
      border-radius: var(--lo-radius-md);
      background: var(--lo-surface-2);
      color: var(--lo-text);
      font: 600 12px/1 inherit;
      cursor: pointer;
      transition: background 120ms ease, transform 120ms ease;
    }

    .lasso-review-actions button:hover {
      background: var(--lo-surface-hover);
      transform: translateY(-1px);
    }

    .lasso-review-actions .primary {
      border-color: var(--lo-primary);
      background: var(--lo-primary);
      color: #111214;
    }

    .lasso-review-actions .primary:hover {
      background: var(--lo-primary-hover);
    }

    /* ==========================================================
       GIT PANEL
       ========================================================== */

    .lasso-git-panel {
      position: fixed;
      right: 20px;
      bottom: 82px;
      width: 320px;
      padding: 14px;
      border: 1px solid var(--lo-border);
      border-radius: var(--lo-radius-lg);
      background: var(--lo-surface);
      color: var(--lo-text);
      box-shadow: var(--lo-shadow-lg);
      pointer-events: auto;
      z-index: 12;
    }

    .lasso-git-panel[hidden] {
      display: none;
    }

    .lasso-git-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 12px;
    }

    .lasso-git-title {
      margin: 0;
      font-size: 13px;
      font-weight: 700;
      color: var(--lo-text);
    }

    .lasso-git-state {
      margin: 4px 0 0;
      color: var(--lo-text-3);
      font-size: 11px;
      line-height: 1.4;
    }

    .lasso-git-close {
      border: 0;
      background: transparent;
      color: var(--lo-text-3);
      font-size: 18px;
      cursor: pointer;
    }

    .lasso-git-close:hover {
      color: var(--lo-text);
    }

    .lasso-git-branch {
      margin-bottom: 10px;
      padding: 8px 10px;
      border-radius: var(--lo-radius-md);
      background: var(--lo-surface-2);
      color: var(--lo-text-2);
      font: 11px/1.3 var(--lo-font-mono);
    }

    .lasso-git-commit {
      width: 100%;
      min-height: 36px;
      margin-bottom: 8px;
      padding: 0 10px;
      border: 1px solid var(--lo-border);
      border-radius: var(--lo-radius-md);
      background: var(--lo-surface-2);
      color: var(--lo-text);
      outline: none;
      font: 12px/1 inherit;
    }

    .lasso-git-commit:focus {
      border-color: var(--lo-primary);
    }

    .lasso-git-actions {
      display: grid;
      gap: 7px;
    }

    .lasso-git-actions button {
      min-height: 32px;
      border: 1px solid var(--lo-border);
      border-radius: var(--lo-radius-md);
      background: var(--lo-surface-2);
      color: var(--lo-text);
      font: 600 11px/1 inherit;
      cursor: pointer;
      transition: background 120ms ease;
    }

    .lasso-git-actions button:hover {
      background: var(--lo-surface-hover);
    }

    .lasso-git-actions button.primary {
      border-color: var(--lo-primary);
      background: var(--lo-primary);
      color: #111214;
    }

    .lasso-git-actions button:disabled {
      cursor: not-allowed;
      opacity: 0.45;
    }

    .lasso-git-message {
      margin: 8px 0 0;
      color: var(--lo-text-3);
      font-size: 11px;
      line-height: 1.4;
    }
  `;
}
