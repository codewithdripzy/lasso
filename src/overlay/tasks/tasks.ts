import { getDOM } from "../dom";
import { state, saveChatHistory } from "../state";
import { bridge } from "../bridge/bridge";
import type { AgentTask, AgentTaskStatus, ChatMessage, PendingChange } from "../types";

let panel: HTMLDivElement | null = null;
let list: HTMLDivElement | null = null;
let badge: HTMLElement | null = null;

type TaskSelectionListener = (task: AgentTask | null) => void;
const selectionListeners = new Set<TaskSelectionListener>();
type TaskReviewListener = (task: AgentTask) => void;
const reviewListeners = new Set<TaskReviewListener>();

const statusLabel: Record<AgentTaskStatus, string> = {
  queued: "Queued", thinking: "Thinking", working: "Working", review: "Review",
  complete: "Complete", error: "Error", stopped: "Stopped",
};

function taskId(): string {
  return `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function sameChangeList(left: PendingChange[], right: PendingChange[]): boolean {
  return left.length === right.length && left.every((change, index) => {
    const other = right[index];
    return Boolean(other) && change.filePath === other.filePath && change.oldString === other.oldString && change.newString === other.newString;
  });
}

function normalizedInstruction(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function findReusableAgentTask(instruction: string, element: Element | null): AgentTask | undefined {
  const normalized = normalizedInstruction(instruction);
  return state.agentTasks.find((task) =>
    normalizedInstruction(task.instruction) === normalized && task.element === (element || undefined)
  );
}

export function getComponentConversation(selectionId: string): {
  messages: ChatMessage[];
  changesHistory: Array<{ summary: string; changes: PendingChange[]; createdAt: string }>;
} {
  const task = state.agentTasks.find((candidate) => candidate.selectionId === selectionId);
  if (!task) return { messages: [], changesHistory: [] };
  return {
    messages: task.messages.map((message) => ({ ...message })),
    changesHistory: task.changesHistory.map((entry) => ({
      ...entry,
      changes: entry.changes.map((change) => ({ ...change })),
    })),
  };
}

export function onAgentTaskSelected(listener: TaskSelectionListener): () => void {
  selectionListeners.add(listener);
  return () => selectionListeners.delete(listener);
}

export function onAgentTaskReviewRequested(listener: TaskReviewListener): () => void {
  reviewListeners.add(listener);
  return () => reviewListeners.delete(listener);
}

function notifyTaskSelection(task: AgentTask | null): void {
  for (const listener of selectionListeners) listener(task);
}

function notifyTaskReviewRequested(task: AgentTask): void {
  for (const listener of reviewListeners) listener(task);
}

export function createAgentTask(
  instruction: string,
  messages: ChatMessage[] = state.chatHistory,
  changesHistory: Array<{ summary: string; changes: PendingChange[]; createdAt: string }> = state.changesHistory,
  element: Element | null = state.selected,
  selectionId = state.selectionId,
): AgentTask {
  const now = new Date().toISOString();
  const task: AgentTask = {
    id: taskId(),
    instruction,
    status: "queued",
    message: "Queued",
    pendingChanges: [],
    messages: messages.map((message) => ({ ...message })),
    changesHistory: changesHistory.map((entry) => ({ ...entry, changes: entry.changes.map((change) => ({ ...change })) })),
    activity: ["Queued"],
    lastInstruction: instruction,
    selectionId,
    element: element || undefined,
    createdAt: now,
    updatedAt: now,
  };
  state.agentTasks.unshift(task);
  state.activeTaskId = task.id;
  renderTasks();
  return task;
}

export function getAgentTask(id: string | null | undefined): AgentTask | undefined {
  return id ? state.agentTasks.find((task) => task.id === id) : undefined;
}

export function updateAgentTask(id: string | undefined, patch: Partial<AgentTask>): void {
  if (!id) return;
  const task = getAgentTask(id);
  if (!task) return;
  Object.assign(task, patch, { updatedAt: new Date().toISOString() });
  renderTasks();
}

export function recordTaskActivity(id: string | undefined, text: string): void {
  const task = getAgentTask(id);
  const value = text.trim();
  if (!task || !value || task.activity[task.activity.length - 1] === value) return;
  updateAgentTask(id, { activity: [...task.activity, value].slice(-200) });
}

export function recordTaskChangeHistory(id: string | undefined, summary: string, changes: PendingChange[]): void {
  const task = getAgentTask(id);
  if (!task) return;
  const previous = task.changesHistory[task.changesHistory.length - 1];
  if (previous?.summary === summary && sameChangeList(previous.changes, changes)) return;
  updateAgentTask(id, {
    changesHistory: [...task.changesHistory, { summary, changes: changes.map((change) => ({ ...change })), createdAt: new Date().toISOString() }],
  });
  // Sync changesHistory to state and save to localStorage
  state.changesHistory = task.changesHistory;
  saveChatHistory(state.chatHistory, state.changesHistory);
}

export function appendTaskMessage(id: string | undefined, role: ChatMessage["role"], text: string): ChatMessage | undefined {
  const task = getAgentTask(id);
  const content = text.trim();
  if (!task || !content) return;
  const previous = task.messages[task.messages.length - 1];
  if (previous?.role === role && previous.content === content) return;
  const message: ChatMessage = {
    role,
    content,
    createdAt: new Date().toISOString(),
    contextId: task.selectionId || undefined,
  };
  updateAgentTask(task.id, { messages: [...task.messages, message] });
  // Sync messages to state and save to localStorage
  state.chatHistory = task.messages;
  saveChatHistory(state.chatHistory, state.changesHistory);
  return message;
}

export function selectAgentTask(id: string | null): void {
  const task = getAgentTask(id);
  state.activeTaskId = task?.id || null;
  state.promptTaskId = task?.id || null;
  notifyTaskSelection(task || null);
  renderTasks();
}

export function requestAgentTaskReview(id: string): void {
  const task = getAgentTask(id);
  if (!task || task.status !== "review") return;
  selectAgentTask(task.id);
  notifyTaskReviewRequested(task);
}

export function stopAgentTask(id: string): void {
  const task = getAgentTask(id);
  if (!task) return;
  bridge.send({ type: "stop", taskId: id });
  updateAgentTask(id, { status: "stopped", message: "Task stopped." });
}

export function toggleTaskPanel(force?: boolean): void {
  if (!panel) return;
  panel.hidden = force === undefined ? !panel.hidden : !force;
  panel.classList.toggle("visible", !panel.hidden);
  if (!panel.hidden) renderTasks();
}

export function buildTaskPanel(): HTMLDivElement {
  const dom = getDOM();
  panel = document.createElement("div");
  panel.className = "lasso-task-panel";
  panel.hidden = true;
  panel.innerHTML = `
    <div class="lasso-task-header">
      <div class="lasso-task-title-row">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M7 8h10M7 12h6M7 16h8"/></svg>
        <span>Agent tasks</span><span class="lasso-task-badge" hidden>0</span>
      </div>
      <button class="lasso-task-close" type="button" aria-label="Close tasks">×</button>
    </div>
    <div class="lasso-task-tabs" role="tablist" aria-label="Task status">
      <button class="lasso-task-tab active" type="button" role="tab" data-task-tab="active" aria-selected="true">In progress</button>
      <button class="lasso-task-tab" type="button" role="tab" data-task-tab="complete" aria-selected="false">Completed</button>
    </div>
    <div class="lasso-task-body">
      <div class="lasso-task-list"></div>
    </div>
  `;
  dom.shadow.appendChild(panel);
  list = panel.querySelector<HTMLDivElement>(".lasso-task-list");
  badge = panel.querySelector<HTMLElement>(".lasso-task-badge");
  panel.querySelector<HTMLButtonElement>(".lasso-task-close")!.addEventListener("click", () => toggleTaskPanel(false));
  panel.querySelectorAll<HTMLButtonElement>(".lasso-task-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      panel?.querySelectorAll<HTMLButtonElement>(".lasso-task-tab").forEach((item) => {
        const active = item === tab;
        item.classList.toggle("active", active);
        item.setAttribute("aria-selected", String(active));
      });
      renderTasks();
    });
  });
  renderTasks();
  return panel;
}

function renderTasks(): void {
  const panelEl = panel;
  if (!panelEl || !list || !badge) return;
  const activeCount = state.agentTasks.filter((task) => task.status !== "complete" && task.status !== "error" && task.status !== "stopped").length;
  badge.hidden = state.agentTasks.length === 0;
  badge.textContent = String(activeCount || state.agentTasks.length);
  const navBadge = getDOM().shadow.querySelector<HTMLElement>(".lasso-agent-tasks-badge");
  if (navBadge) navBadge.hidden = activeCount === 0;
  list.replaceChildren();
  const activeTab = panelEl.querySelector<HTMLButtonElement>(".lasso-task-tab.active")?.dataset.taskTab || "active";
  const visibleTasks = state.agentTasks.filter((task) => activeTab === "complete" ? task.status === "complete" : task.status !== "complete");
  if (!visibleTasks.length) {
    list.innerHTML = `<div class="lasso-task-empty">Prompt an element to start a task.</div>`;
  } else {
    for (const task of visibleTasks) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `lasso-task-row${task.id === state.activeTaskId ? " active" : ""}`;
      const isRunning = task.status === "queued" || task.status === "thinking" || task.status === "working";
      button.innerHTML = `<span class="lasso-task-status ${task.status}"></span><span class="lasso-task-row-copy"><strong></strong><small>${statusLabel[task.status]}</small></span>${task.status === "review" ? '<span class="lasso-task-review-label">Review</span>' : ""}${isRunning ? '<button class="lasso-task-stop" type="button" aria-label="Stop task">×</button>' : ""}`;
      button.querySelector("strong")!.textContent = task.instruction;
      button.addEventListener("click", () => selectAgentTask(task.id));
      if (task.status === "review") {
        const review = button.querySelector<HTMLSpanElement>(".lasso-task-review-label")!;
        review.addEventListener("click", (event) => {
          event.stopPropagation();
          requestAgentTaskReview(task.id);
        });
      }
      if (isRunning) {
        const stopBtn = button.querySelector<HTMLButtonElement>(".lasso-task-stop")!;
        stopBtn.addEventListener("click", (event) => {
          event.stopPropagation();
          stopAgentTask(task.id);
        });
      }
      list.appendChild(button);
    }
  }

}
