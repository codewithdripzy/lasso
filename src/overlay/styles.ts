import { hostTokensCss } from "./tokens";

export function buildStyles(): string {
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
      top: -28px;
      right: -2px;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 3px 9px 3px 7px;
      border-radius: var(--lo-radius-full);
      font-size: 10.5px;
      font-weight: 600;
      color: #ffffff;
      white-space: nowrap;
      box-shadow: 0 2px 8px rgba(0,0,0,0.35);
      pointer-events: none;
      letter-spacing: 0.01em;
    }

    .lasso-lock-chip.held {
      background: linear-gradient(135deg, #f59e0b, #d97706);
    }

    .lasso-lock-chip.blocked {
      background: linear-gradient(135deg, #ef4444, #dc2626);
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
      gap: 4px;
      padding: 2px 7px;
      border-radius: var(--lo-radius-full);
      background: var(--lc);
      color: #ffffff;
      font-size: 10px;
      font-weight: 600;
      white-space: nowrap;
      box-shadow: 0 1px 4px rgba(0,0,0,0.3);
    }

    /* Remote cursor */
    .lasso-remote-cursor {
      position: fixed;
      pointer-events: none;
      z-index: 9999;
      transform: translate(0, 0);
      transition: transform 80ms linear;
      will-change: transform;
    }

    .lasso-remote-cursor-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--lc);
      box-shadow: 0 0 0 2px rgba(255,255,255,0.5);
    }

    .lasso-remote-cursor-label {
      position: absolute;
      top: 12px;
      left: 8px;
      padding: 2px 7px;
      border-radius: var(--lo-radius-full);
      background: var(--lc);
      color: #fff;
      font-size: 10px;
      font-weight: 600;
      white-space: nowrap;
      box-shadow: 0 1px 4px rgba(0,0,0,0.3);
      opacity: 0.9;
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
      width: 290px;
      padding: 14px;
      border-radius: var(--lo-radius-xl);
      background: rgba(24, 25, 29, 0.98);
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      border: 1px solid var(--lo-border);
      box-shadow: 0 20px 48px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.08);
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
      margin-bottom: 10px;
    }

    .lasso-pin-compose-user {
      display: flex;
      align-items: center;
      gap: 7px;
    }

    .lasso-pin-compose-avatar {
      width: 20px;
      height: 20px;
      border-radius: var(--lo-radius-full);
      background: var(--lo-indigo);
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      font-weight: 600;
    }

    .lasso-pin-compose-name {
      font-size: 12px;
      font-weight: 500;
      color: var(--lo-text);
    }

    .lasso-pin-compose-hint {
      font-size: 10px;
      color: var(--lo-text-3);
    }

    .lasso-pin-compose textarea {
      width: 100%;
      min-height: 64px;
      padding: 8px 10px;
      border-radius: var(--lo-radius-md);
      background: var(--lo-surface-2);
      border: 1px solid var(--lo-border);
      color: var(--lo-text);
      font-family: inherit;
      font-size: 13px;
      line-height: 1.45;
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

    /* Attachment preview */
    .lasso-pin-attachment-preview {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 8px;
      padding: 6px 8px;
      border-radius: var(--lo-radius-md);
      background: var(--lo-surface-hover);
      border: 1px solid var(--lo-border-subtle);
    }

    .lasso-pin-attachment-preview[hidden] {
      display: none;
    }

    .lasso-pin-attachment-thumb {
      width: 28px;
      height: 28px;
      border-radius: 4px;
      overflow: hidden;
      flex-shrink: 0;
      background: #000;
    }

    .lasso-pin-attachment-thumb img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .lasso-pin-attachment-name {
      font-size: 11px;
      color: var(--lo-text-2);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex: 1;
    }

    .lasso-pin-attachment-remove {
      border: 0;
      background: transparent;
      color: var(--lo-text-3);
      cursor: pointer;
      font-size: 14px;
      padding: 2px 4px;
    }

    .lasso-pin-attachment-remove:hover {
      color: var(--lo-error);
    }

    /* Quick GIF picker */
    .lasso-pin-gif-picker {
      margin-top: 8px;
      padding: 8px;
      border-radius: var(--lo-radius-md);
      background: var(--lo-surface-2);
      border: 1px solid var(--lo-border);
    }

    .lasso-pin-gif-picker[hidden] {
      display: none;
    }

    .lasso-gif-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 6.5px;
      font-weight: 700;
      letter-spacing: 0.04em;
      line-height: 1;
      padding: 1.5px 2.5px;
      border-radius: 2px;
      border: 1px solid currentColor;
      opacity: 0.75;
      pointer-events: none;
    }

    .lasso-pin-itool-btn:hover .lasso-gif-badge {
      opacity: 1;
    }

    .lasso-pin-gif-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 6px;
      font-size: 11px;
      font-weight: 500;
      color: var(--lo-text-2);
    }

    .lasso-pin-gif-close {
      border: 0;
      background: transparent;
      color: var(--lo-text-3);
      cursor: pointer;
      font-size: 13px;
    }

    .lasso-pin-gif-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 5px;
    }

    .lasso-pin-gif-item {
      padding: 5px 6px;
      border: 1px solid var(--lo-border-subtle);
      border-radius: var(--lo-radius-sm);
      background: var(--lo-surface);
      color: var(--lo-text-2);
      font-size: 10.5px;
      font-weight: 500;
      cursor: pointer;
      text-align: center;
      transition: all 120ms ease;
    }

    .lasso-pin-gif-item:hover {
      background: var(--lo-primary-soft);
      color: var(--lo-primary);
      border-color: var(--lo-primary);
    }

    /* Modern unified input wrap */
    .lasso-pin-input-wrap {
      display: flex;
      flex-direction: column;
      background: var(--lo-surface-2);
      border: 1px solid var(--lo-border);
      border-radius: var(--lo-radius-lg);
      padding: 6px 8px 6px;
      transition: border-color 140ms ease;
    }

    .lasso-pin-input-wrap:focus-within {
      border-color: var(--lo-primary);
    }

    .lasso-pin-input-wrap textarea {
      width: 100%;
      background: transparent !important;
      border: 0 !important;
      padding: 3px 2px;
      outline: none;
      box-shadow: none !important;
      color: var(--lo-text);
      font-family: inherit;
      font-size: 12.5px;
      line-height: 1.45;
      resize: none;
    }


    .lasso-pin-input-toolbar {
      display: flex;
      align-items: center;
      gap: 3px;
      padding-top: 4px;
    }

    .lasso-pin-itool-btn {
      width: 26px;
      height: 26px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: var(--lo-radius-sm);
      border: 0;
      background: transparent;
      color: var(--lo-text-3);
      cursor: pointer;
      transition: all 120ms ease;
    }

    .lasso-pin-itool-btn:hover {
      background: var(--lo-surface-hover);
      color: var(--lo-text);
    }

    .lasso-pin-itool-btn.recording {
      color: #ea4335 !important;
      background: rgba(234, 67, 53, 0.16) !important;
      border: 1px solid rgba(234, 67, 53, 0.4) !important;
      animation: lasso-pulse-recording 1.2s infinite ease-in-out;
    }

    .lasso-pin-itool-btn.transcribing {
      color: #fbbc04 !important;
      background: rgba(251, 188, 4, 0.16) !important;
      border: 1px solid rgba(251, 188, 4, 0.4) !important;
      animation: lasso-pulse-transcribing 0.9s infinite alternate ease-in-out;
    }

    .lasso-pin-input-spacer {
      flex: 1;
    }

    .lasso-pin-reply-hint {
      font-size: 10px;
      color: var(--lo-text-3);
      margin-right: 4px;
    }

    .lasso-pin-tag-menu {
      background: rgba(24, 25, 29, 0.98);
      border: 1px solid var(--lo-border);
      border-radius: var(--lo-radius-md);
      padding: 4px;
      margin-bottom: 6px;
      display: flex;
      flex-direction: column;
      gap: 2px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
    }

    .lasso-pin-tag-menu[hidden] {
      display: none;
    }

    .lasso-pin-tag-item {
      display: flex;
      align-items: center;
      gap: 7px;
      padding: 5px 8px;
      border: 0;
      border-radius: var(--lo-radius-sm);
      background: transparent;
      color: var(--lo-text);
      font-size: 11px;
      cursor: pointer;
      text-align: left;
      transition: background 100ms ease;
    }

    .lasso-pin-tag-item:hover,
    .lasso-pin-tag-item.focused {
      background: var(--lo-surface-hover);
    }

    .lasso-pin-tag-badge {
      width: 16px;
      height: 16px;
      border-radius: 4px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 9px;
      font-weight: 700;
    }

    .lasso-pin-tag-label {
      font-weight: 500;
      flex: 1;
    }

    .lasso-pin-tag-type {
      font-size: 9px;
      color: var(--lo-text-3);
      text-transform: uppercase;
    }

    .lasso-pin-cancel,
    .lasso-pin-post {
      min-height: 26px;
      padding: 0 12px;
      border-radius: var(--lo-radius-full);
      border: 0;
      font-size: 11.5px;
      font-weight: 500;
      cursor: pointer;
      transition: all 120ms ease;
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
      transform: translateY(-0.5px);
    }

    /* Pin Thread Popover */
    .lasso-pin-thread {
      position: fixed;
      width: 320px;
      max-height: 480px;
      display: flex;
      flex-direction: column;
      padding: 14px;
      border-radius: var(--lo-radius-xl);
      background: rgba(24, 25, 29, 0.98);
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      border: 1px solid var(--lo-border);
      box-shadow: 0 20px 48px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.08);
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
      margin-bottom: 12px;
      padding-bottom: 2px;
    }

    .lasso-pin-thread-head-actions {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    /* PM-style Status Chip */
    .lasso-pin-thread-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 3px 10px;
      border-radius: var(--lo-radius-full);
      border: 1px solid transparent;
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
      user-select: none;
      transition: all 140ms ease;
    }

    .lasso-pin-thread-chip.open {
      background: rgba(99, 102, 241, 0.14);
      color: #818cf8;
      border-color: rgba(99, 102, 241, 0.25);
    }

    .lasso-pin-thread-chip.resolved {
      background: rgba(16, 185, 129, 0.14);
      color: #34d399;
      border-color: rgba(16, 185, 129, 0.25);
    }

    .lasso-pin-thread-chip:hover {
      filter: brightness(1.15);
      transform: translateY(-0.5px);
    }

    .lasso-pin-thread-close {
      width: 24px;
      height: 24px;
      border: 0;
      background: transparent;
      color: var(--lo-text-3);
      cursor: pointer;
      border-radius: var(--lo-radius-sm);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .lasso-pin-thread-close:hover {
      background: var(--lo-surface-hover);
      color: var(--lo-text);
    }

    .lasso-pin-thread-msgs {
      flex: 1;
      overflow-y: auto;
      max-height: 240px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding-right: 4px;
      margin-bottom: 12px;
    }

    .lasso-pin-thread-msg-row {
      display: flex;
      align-items: center;
      gap: 7px;
      margin-bottom: 4px;
    }

    .lasso-pin-thread-avatar {
      width: 22px;
      height: 22px;
      border-radius: var(--lo-radius-full);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      font-weight: 600;
      color: #ffffff;
      flex-shrink: 0;
    }

    .lasso-pin-thread-author {
      font-size: 11.5px;
      font-weight: 500;
      color: var(--lo-text);
    }

    .lasso-pin-thread-time {
      font-size: 10px;
      color: var(--lo-text-3);
      margin-left: auto;
    }

    .lasso-pin-thread-body {
      font-size: 12.5px;
      line-height: 1.45;
      color: var(--lo-text-2);
      padding-left: 29px;
      word-break: break-word;
    }

    .lasso-pin-msg-image {
      margin-top: 6px;
      border-radius: 6px;
      overflow: hidden;
      max-width: 100%;
      border: 1px solid var(--lo-border-subtle);
    }

    .lasso-pin-msg-image img {
      max-width: 100%;
      max-height: 160px;
      display: block;
      object-fit: cover;
    }

    .lasso-pin-thread-reply-area {
      padding-top: 4px;
    }

    .lasso-pin-thread-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: 6px;
    }

    .lasso-pin-reply-hint {
      font-size: 10px;
      color: var(--lo-text-3);
    }

    .lasso-pin-resolve {
      border: 1px solid var(--lo-border);
      background: transparent;
      color: var(--lo-text-2);
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
      padding: 3px 8px;
      border-radius: var(--lo-radius-sm);
      transition: all 120ms ease;
    }

    .lasso-pin-resolve:hover {
      background: var(--lo-surface-hover);
      color: var(--lo-text);
    }

    .lasso-pin-reply-post {
      border: 0;
      border-radius: var(--lo-radius-full);
      background: var(--lo-primary);
      color: #111214;
      font-size: 11.5px;
      font-weight: 550;
      padding: 5px 14px;
      cursor: pointer;
      transition: all 140ms ease;
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
    }

    .lasso-prompt-model {
      height: 28px;
      max-width: 190px;
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
    }

    .lasso-model-filter {
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
      padding: 6px 10px 5px 18px;
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
    .lasso-cli-subgroup-chevron { color: var(--lo-text-3); font-size: 13px; line-height: 10px; }
    .lasso-cli-subgroup-items { padding-left: 6px; }

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
      padding: 8px 12px;
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

    /* CLI / Terminal Thinking Mode */
    .lasso-agent-status {
      display: flex;
      flex-direction: column;
      margin: 0 0 10px;
      padding: 10px 12px;
      border-radius: var(--lo-radius-md);
      background: #0d0e11;
      border: 1px solid rgba(255, 255, 255, 0.08);
      box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.4);
      font-family: var(--lo-font-mono);
      font-size: 11px;
      line-height: 1.45;
      color: #94a3b8;
    }

    .lasso-agent-status[hidden] {
      display: none;
    }

    .lasso-agent-terminal-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
      padding-bottom: 6px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    }

    .lasso-agent-terminal-dots {
      display: flex;
      gap: 4px;
    }

    .lasso-agent-terminal-dots span {
      width: 7px;
      height: 7px;
      border-radius: 50%;
    }

    .lasso-dot-red { background: #ef4444; }
    .lasso-dot-yellow { background: #f59e0b; }
    .lasso-dot-green { background: #10b981; }

    .lasso-agent-status-kicker {
      font-size: 10px;
      color: #64748b;
      font-weight: 500;
    }

    .lasso-agent-status-badge {
      margin-left: auto;
      font-size: 9.5px;
      padding: 1px 6px;
      border-radius: 4px;
      background: rgba(110, 160, 255, 0.14);
      color: var(--lo-primary);
      text-transform: none;
      font-weight: 500;
    }

    .lasso-agent-status-badge.thinking {
      background: rgba(139, 92, 246, 0.16);
      color: #a78bfa;
    }

    .lasso-agent-status-badge.working {
      background: rgba(16, 185, 129, 0.16);
      color: #34d399;
    }

    .lasso-agent-status-badge.error {
      background: rgba(239, 68, 68, 0.16);
      color: #f87171;
    }

    .lasso-agent-status-line {
      display: flex;
      align-items: center;
      gap: 6px;
      color: #e2e8f0;
      font-weight: 500;
      animation: lasso-agent-line-pulse 1.8s ease-in-out infinite;
    }

    .lasso-agent-terminal-prompt {
      color: #38bdf8;
      font-weight: 700;
    }

    .lasso-agent-status-message {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* The status line is the single latest activity message. */
    .lasso-agent-log {
      display: none;
    }

    .lasso-agent-cursor {
      display: inline-block;
      width: 6px;
      height: 12px;
      background: #38bdf8;
      animation: lasso-cursor-blink 1s step-end infinite;
      margin-left: 2px;
    }

    @keyframes lasso-cursor-blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0; }
    }

    .lasso-agent-log {
      display: flex;
      flex-direction: column;
      gap: 2px;
      margin-top: 6px;
      max-height: 80px;
      overflow-y: auto;
      font-size: 10px;
      color: #64748b;
    }

    .lasso-agent-log-line {
      display: flex;
      gap: 5px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      animation: lasso-agent-log-in 180ms ease-out both;
    }

    .lasso-agent-log-prefix {
      color: #475569;
    }

    @keyframes lasso-agent-line-pulse {
      0%, 100% { opacity: .72; }
      50% { opacity: 1; }
    }

    @keyframes lasso-agent-log-in {
      from { opacity: 0; transform: translateY(3px); }
      to { opacity: 1; transform: translateY(0); }
    }

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
      gap: 5px;
    }

    .lasso-prompt-upload,
    .lasso-prompt-voice,
    .lasso-prompt-stop {
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

    .lasso-prompt-send.loading::before {
      content: "";
      width: 12px;
      height: 12px;
      border: 2px solid rgba(0, 0, 0, 0.3);
      border-top-color: #000;
      border-radius: 50%;
      animation: lasso-spin .7s linear infinite;
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

    /* ==========================================================
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

    .lasso-notepad-copy:hover,
    .lasso-notepad-close:hover {
      background: var(--lo-surface-hover);
      color: var(--lo-text);
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

    .lasso-drag-status-wrap .lasso-agent-terminal-header {
      padding: 6px 10px;
    }

    .lasso-drag-status-wrap .lasso-agent-status-line {
      padding: 7px 10px 9px;
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
}
