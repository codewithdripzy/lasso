import { BrowserIcon, CommandLineIcon, Delete02Icon, Edit01Icon, File01Icon, FileAddIcon, Folder01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import type { CommandMessage } from "../../core/interfaces/commandbar";
import { formatMessageText } from "../message-format";
import { renderLineDiff } from "./diff-view";
import { escapeHtml } from "./html";

type HugeiconsSvgNode = readonly (readonly [string, Readonly<Record<string, string | number>>])[];

const thinkingToolIcons: Record<string, HugeiconsSvgNode> = {
  inspect_project: Folder01Icon,
  search_code: Search01Icon,
  read_file: File01Icon,
  edit_file: Edit01Icon,
  create_file: FileAddIcon,
  delete_file: Delete02Icon,
  run_command: CommandLineIcon,
  browser_check: BrowserIcon,
};

function renderThinkingStepTitle(title: string): string {
  const separator = title.indexOf(":");
  const tool = separator === -1 ? title : title.slice(0, separator).trim();
  const icon = thinkingToolIcons[tool];
  if (!icon) return `<span>${escapeHtml(title)}</span>`;

  const detail = separator === -1 ? "" : title.slice(separator + 1).trim();
  const iconMarkup = icon
    .map(([tag, attributes]) => {
      const attrs = Object.entries(attributes)
        .filter(([key]) => key !== "key")
        .map(([key, value]) => {
          const name = key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
          const escaped = String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
          return `${name}="${escaped}"`;
        })
        .join(" ");
      return `<${tag} ${attrs} />`;
    })
    .join("");

  const label = detail || tool.replace(/_/g, " ");
  const accessibleToolName = escapeHtml(tool.replace(/_/g, " "));
  return `<span class="lasso-step-tool-icon" role="img" aria-label="${accessibleToolName}" title="${accessibleToolName}"><svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">${iconMarkup}</svg></span><span>${escapeHtml(label)}</span>`;
}

function renderThinking(msg: CommandMessage): string {
  if (!msg.thinking) return "";
  const { steps, durationSeconds, completed, expanded } = msg.thinking;

  if (!completed) {
    // Live thinking process
    return `
      <div class="lasso-command-thinking-active">
        <button class="lasso-command-thinking-header" type="button" aria-expanded="${expanded}">
          <div class="lasso-command-thinking-pulse">
            <span class="lasso-command-pulse-ring"></span>
            <span class="lasso-command-pulse-dot"></span>
          </div>
          <span class="lasso-command-thinking-title">Thinking…</span>
          <span class="lasso-command-active-timer">${formatDuration(durationSeconds)}</span>
          <svg class="lasso-command-thought-chevron ${expanded ? "expanded" : ""}" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 18l6-6-6-6"/>
          </svg>
        </button>
        <div class="lasso-command-thinking-steps" ${expanded ? "" : "hidden"}>
          ${steps
            .map(
              (step) => `
            <div class="lasso-command-thinking-step ${step.status}">
              ${
                step.status === "running"
                  ? `<span class="lasso-step-status-icon lasso-step-status-spinner" role="img" aria-label="In progress"><span class="lasso-step-spinner-ring"></span><span class="lasso-step-spinner-dot"></span></span>`
                  : `<span class="lasso-step-status-icon">${step.status === "failed" ? "×" : "✓"}</span>`
              }
              <div class="lasso-step-content">
                <div class="lasso-step-name">${renderThinkingStepTitle(step.title)}</div>
                ${step.detail ? `<div class="lasso-step-detail">${escapeHtml(step.detail)}</div>` : ""}
              </div>
            </div>
          `
            )
            .join("")}
        </div>
      </div>
    `;
  }

  // Thinking completed: collapsible widget showing "Thought for 30s >"
  return `
    <div class="lasso-command-thought-wrapper">
      <button class="lasso-command-thought-toggle ${expanded ? "expanded" : ""}" type="button" aria-expanded="${expanded}">
        <div class="lasso-command-thought-left">
          <svg class="lasso-command-thought-sparkle" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z"/>
          </svg>
          <span class="lasso-command-thought-label">Thought for ${durationSeconds || 1}s</span>
        </div>
        <svg class="lasso-command-thought-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 18l6-6-6-6"/>
        </svg>
      </button>
      <div class="lasso-command-thinking-steps" ${expanded ? "" : "hidden"}>
        ${steps
          .map(
            (step) => `
          <div class="lasso-command-thinking-step completed">
            <span class="lasso-step-status-icon">✓</span>
            <div class="lasso-step-content">
              <div class="lasso-step-name">${renderThinkingStepTitle(step.title)}</div>
              ${step.detail ? `<div class="lasso-step-detail">${escapeHtml(step.detail)}</div>` : ""}
            </div>
          </div>
        `
          )
          .join("")}
      </div>
    </div>
  `;
}

export function renderAssistantMessage(message: CommandMessage): string {
  return `
    <div class="lasso-command-msg assistant" data-msg-id="${escapeHtml(message.id)}">
      ${renderThinking(message)}
      ${message.content ? `<div class="lasso-command-msg-text">${formatMessageText(message.content)}</div>` : ""}
      ${message.error ? renderMessageError(message) : ""}
    </div>
  `;
}

function renderMessageError(message: CommandMessage): string {
  return `
    <div class="lasso-command-msg-error">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      ${escapeHtml(message.error || "")}
    </div>
    <div class="lasso-command-error-actions" style="display: flex; gap: 8px; margin-top: 6px; flex-wrap: wrap;">
      ${
        message.thinking?.steps.length
          ? `
        <button class="lasso-command-continue-btn" type="button" title="Continue execution using the thoughts and analysis generated so far" style="display: inline-flex; align-items: center; gap: 5px; padding: 5px 10px; font-size: 12px; font-weight: 500; border-radius: 6px; background: rgba(59, 130, 246, 0.15); border: 1px solid rgba(59, 130, 246, 0.3); color: #93c5fd; cursor: pointer;">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          Continue with thoughts so far
        </button>`
          : ""
      }
      <button class="lasso-command-retry-btn" type="button" title="Retry from start" style="display: inline-flex; align-items: center; gap: 5px; padding: 5px 10px; font-size: 12px; font-weight: 500; border-radius: 6px; background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.15); color: #e2e8f0; cursor: pointer;">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
        Retry
      </button>
    </div>
  `;
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}
