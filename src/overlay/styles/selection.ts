export const selectionStyles = `    /* ==========================================================
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
      font-weight: 500;
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

`;
