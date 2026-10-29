export const reviewStyles = `    /* ==========================================================
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
      z-index: 1000;
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
       TIMELINE PANEL
       ========================================================== */

    .lasso-timeline {
      position: fixed;
      width: min(540px, calc(100vw - 24px));
      max-height: min(620px, calc(100vh - 24px));
      overflow: auto;
      padding: 18px;
      border: 1px solid var(--lo-border);
      border-radius: var(--lo-radius-xl);
      background: rgba(22, 23, 27, 0.98);
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      color: var(--lo-text);
      box-shadow: 0 20px 48px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.08);
      pointer-events: auto;
      font-family: inherit;
      z-index: 30;
    }

    .lasso-timeline[hidden] {
      display: none;
    }

    .lasso-timeline-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 14px;
    }

    .lasso-timeline-title {
      margin: 0;
      font-size: 15px;
      font-weight: 700;
    }

    .lasso-timeline-subtitle {
      margin: 4px 0 0;
      color: var(--lo-text-2);
      font-size: 12px;
      line-height: 1.4;
    }

    .lasso-timeline-close {
      border: 0;
      background: transparent;
      color: var(--lo-text-3);
      font-size: 18px;
      cursor: pointer;
    }

    .lasso-timeline-close:hover {
      color: var(--lo-text);
    }

    .lasso-timeline-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .lasso-timeline-empty {
      padding: 20px;
      text-align: center;
      color: var(--lo-text-2);
      font-size: 13px;
    }

    .lasso-timeline-item {
      padding: 12px;
      border: 1px solid var(--lo-border);
      border-radius: var(--lo-radius-md);
      background: var(--lo-surface-2);
    }

    .lasso-timeline-item-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 6px;
    }

    .lasso-timeline-item-summary {
      font-weight: 600;
      font-size: 13px;
    }

    .lasso-timeline-item-time {
      font-size: 11px;
      color: var(--lo-text-2);
    }

    .lasso-timeline-item-files {
      font-size: 11px;
      color: var(--lo-text-2);
      margin-bottom: 8px;
    }

    .lasso-timeline-item-actions {
      display: flex;
      gap: 8px;
    }

    .lasso-timeline-item button {
      padding: 6px 12px;
      border: 1px solid var(--lo-border);
      border-radius: var(--lo-radius-sm);
      background: var(--lo-surface-3);
      color: var(--lo-text);
      font-size: 11px;
      cursor: pointer;
      transition: background 120ms ease;
    }

    .lasso-timeline-item button:hover {
      background: var(--lo-surface-hover);
    }

    .lasso-timeline-restore {
      border-color: var(--lo-primary);
      background: rgba(129, 201, 149, 0.1);
      color: #86efac;
    }

    .lasso-timeline-restore:hover {
      background: rgba(129, 201, 149, 0.2);
    }

    .lasso-timeline-delete {
      border-color: #f28b82;
      background: rgba(242, 139, 130, 0.1);
      color: #f28b82;
    }

    .lasso-timeline-delete:hover {
      background: rgba(242, 139, 130, 0.2);
    }

`;
