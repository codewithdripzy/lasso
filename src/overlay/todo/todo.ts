import { getDOM } from "../dom";
import { state } from "../state";
import { collabEmit } from "../collab/socket";
import type { CollabTodo } from "../types";

const STORAGE_KEY = "lasso:todos";

type TodoStatus = "todo" | "in-progress" | "done";
type TodoPriority = "none" | "low" | "medium" | "high" | "critical";

export interface TodoItem {
  id: string;
  text: string;
  status: TodoStatus;
  priority: TodoPriority;
  assignee: string;
  createdAt: string;
}

const STATUS_CYCLE: TodoStatus[] = ["todo", "in-progress", "done"];
const PRIORITY_CYCLE: TodoPriority[] = ["none", "low", "medium", "high", "critical"];

const STATUS_CONFIG: Record<TodoStatus, { label: string; color: string; bg: string }> = {
  todo: { label: "To do", color: "#94a3b8", bg: "rgba(148,163,184,0.12)" },
  "in-progress": { label: "In progress", color: "#818cf8", bg: "rgba(129,140,248,0.15)" },
  done: { label: "Done", color: "#34d399", bg: "rgba(52,211,153,0.14)" },
};

const PRIORITY_CONFIG: Record<TodoPriority, { label: string; color: string }> = {
  none: { label: "—", color: "#475569" },
  low: { label: "Low", color: "#60a5fa" },
  medium: { label: "Med", color: "#fbbf24" },
  high: { label: "High", color: "#f97316" },
  critical: { label: "Critical", color: "#f87171" },
};

function loadTodos(): TodoItem[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return parsed.map((t: any) => ({
      id: t.id || `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      text: t.text || "",
      status: t.status || (t.done ? "done" : "todo"),
      priority: t.priority || "none",
      assignee: t.assignee || "",
      createdAt: t.createdAt || new Date().toISOString(),
    }));
  } catch {
    return [];
  }
}

function saveTodos(todos: TodoItem[]): void {
  if (state.collabJoined) return;
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(todos)); } catch {}
}

let todoPanelEl: HTMLDivElement | null = null;
let todos: TodoItem[] = [];

export function buildTodoPanel(): HTMLDivElement {
  const dom = getDOM();
  todos = loadTodos();

  const el = document.createElement("div");
  el.className = "lasso-todo-panel";
  el.hidden = true;
  el.innerHTML = `
    <div class="lasso-todo-header">
      <div class="lasso-todo-title-row">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M9 11l3 3L22 4"/>
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
        </svg>
        <span class="lasso-todo-title">Tasks</span>
        <span class="lasso-todo-badge" style="display:none;">0</span>
      </div>
      <div class="lasso-todo-header-actions">
        <span class="lasso-todo-stats">0 tasks</span>
        <button class="lasso-todo-close" type="button" aria-label="Close">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
    </div>

    <div class="lasso-todo-table">
      <div class="lasso-todo-table-head">
        <div class="lasso-todo-col lasso-todo-col-status">Status</div>
        <div class="lasso-todo-col lasso-todo-col-task">Task</div>
        <div class="lasso-todo-col lasso-todo-col-priority">Priority</div>
        <div class="lasso-todo-col lasso-todo-col-assignee">Assignee</div>
        <div class="lasso-todo-col lasso-todo-col-del"></div>
      </div>
      <div class="lasso-todo-table-body"></div>
    </div>

    <div class="lasso-todo-add-row">
      <button class="lasso-todo-add-btn-row" type="button">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        New task
      </button>
      <button class="lasso-todo-clear-done" type="button">Clear done</button>
    </div>

    <datalist id="lasso-todo-assignees">
      <option value="You"></option>
      <option value="Team"></option>
      <option value="Design"></option>
      <option value="Frontend"></option>
      <option value="Backend"></option>
    </datalist>
  `;

  dom.shadow.appendChild(el);
  todoPanelEl = el;

  el.querySelector<HTMLButtonElement>(".lasso-todo-close")!.addEventListener("click", () => toggleTodoPanel(false));

  el.querySelector<HTMLButtonElement>(".lasso-todo-add-btn-row")!.addEventListener("click", () => {
    if (state.collabJoined && state.collabProjectId) {
      collabEmit("todos:add", { sessionId: state.collabProjectId, text: "", status: "todo", priority: "none", assignee: "" }, (res) => {
        if (res.ok && res.todo) {
          upsertTodo(res.todo as CollabTodo);
          const firstInput = el.querySelector<HTMLInputElement>(".lasso-todo-row-text");
          firstInput?.focus();
        }
      });
      return;
    }
    todos.unshift({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      text: "",
      status: "todo",
      priority: "none",
      assignee: "",
      createdAt: new Date().toISOString(),
    });
    saveTodos(todos);
    renderTodoTable();
    const firstInput = el.querySelector<HTMLInputElement>(".lasso-todo-row-text");
    firstInput?.focus();
  });

  el.querySelector<HTMLButtonElement>(".lasso-todo-clear-done")!.addEventListener("click", () => {
    if (state.collabJoined && state.collabProjectId) {
      collabEmit("todos:clear_done", { sessionId: state.collabProjectId });
      return;
    }
    todos = todos.filter((t) => t.status !== "done");
    saveTodos(todos);
    renderTodoTable();
  });

  renderTodoTable();
  return el;
}

function renderTodoTable(): void {
  if (!todoPanelEl) return;
  const body = todoPanelEl.querySelector<HTMLDivElement>(".lasso-todo-table-body");
  const badgeEl = todoPanelEl.querySelector<HTMLSpanElement>(".lasso-todo-badge");
  const statsEl = todoPanelEl.querySelector<HTMLSpanElement>(".lasso-todo-stats");
  if (!body) return;

  const pending = todos.filter((t) => t.status !== "done").length;
  if (badgeEl) {
    badgeEl.textContent = String(pending);
    (badgeEl as HTMLElement).style.display = pending > 0 ? "inline-flex" : "none";
  }
  if (statsEl) statsEl.textContent = `${todos.length} task${todos.length !== 1 ? "s" : ""}`;

  if (todos.length === 0) {
    body.innerHTML = `
      <div class="lasso-todo-empty">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <path d="m9 12 2 2 4-4"/>
        </svg>
        <span>No tasks yet. Click "New task" to add one.</span>
      </div>
    `;
    return;
  }

  body.innerHTML = "";
  for (const item of todos) {
    const sc = STATUS_CONFIG[item.status];
    const pc = PRIORITY_CONFIG[item.priority];
    const row = document.createElement("div");
    row.className = `lasso-todo-row${item.status === "done" ? " done" : ""}`;
    row.dataset.id = item.id;
    row.innerHTML = `
      <div class="lasso-todo-col lasso-todo-col-status">
        <button class="lasso-todo-status-chip" type="button" style="background:${sc.bg};color:${sc.color};">${sc.label}</button>
      </div>
      <div class="lasso-todo-col lasso-todo-col-task">
        <input class="lasso-todo-row-text" type="text" value="${escapeAttr(item.text)}" placeholder="Task…" />
      </div>
      <div class="lasso-todo-col lasso-todo-col-priority">
        <button class="lasso-todo-priority-chip" type="button" style="color:${pc.color};">${pc.label}</button>
      </div>
      <div class="lasso-todo-col lasso-todo-col-assignee">
        <input class="lasso-todo-assignee" type="text" list="lasso-todo-assignees" value="${escapeAttr(item.assignee)}" placeholder="+" />
      </div>
      <div class="lasso-todo-col lasso-todo-col-del">
        <button class="lasso-todo-del-btn" type="button" aria-label="Delete">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    `;

    // Status toggle
    row.querySelector<HTMLButtonElement>(".lasso-todo-status-chip")!.addEventListener("click", () => {
      const idx = STATUS_CYCLE.indexOf(item.status);
      item.status = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
      saveTodos(todos);
      emitTodoUpdate(item);
      renderTodoTable();
    });

    // Priority toggle
    row.querySelector<HTMLButtonElement>(".lasso-todo-priority-chip")!.addEventListener("click", () => {
      const idx = PRIORITY_CYCLE.indexOf(item.priority);
      item.priority = PRIORITY_CYCLE[(idx + 1) % PRIORITY_CYCLE.length];
      saveTodos(todos);
      emitTodoUpdate(item);
      renderTodoTable();
    });

    // Text input
    const textInput = row.querySelector<HTMLInputElement>(".lasso-todo-row-text")!;
    textInput.addEventListener("change", () => { item.text = textInput.value; saveTodos(todos); emitTodoUpdate(item); });
    textInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        textInput.blur();
        todoPanelEl?.querySelector<HTMLButtonElement>(".lasso-todo-add-btn-row")?.click();
      }
    });

    // Assignee input
    const assigneeInput = row.querySelector<HTMLInputElement>(".lasso-todo-assignee")!;
    assigneeInput.addEventListener("change", () => { item.assignee = assigneeInput.value; saveTodos(todos); emitTodoUpdate(item); });

    // Delete
    row.querySelector<HTMLButtonElement>(".lasso-todo-del-btn")!.addEventListener("click", () => {
      todos = todos.filter((t) => t.id !== item.id);
      saveTodos(todos);
      if (state.collabJoined && state.collabProjectId) {
        collabEmit("todos:remove", { sessionId: state.collabProjectId, todoId: item.id });
      }
      renderTodoTable();
    });

    body.appendChild(row);
  }
}

function escapeAttr(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function toggleTodoPanel(force?: boolean): void {
  if (!todoPanelEl) return;
  const next = force !== undefined ? force : todoPanelEl.hidden;
  todoPanelEl.hidden = !next;
  if (next) {
    todoPanelEl.classList.add("visible");
  } else {
    todoPanelEl.classList.remove("visible");
  }
}

function emitTodoUpdate(item: TodoItem): void {
  if (!state.collabJoined || !state.collabProjectId || !item.id || item.id.startsWith("local-")) return;
  collabEmit("todos:update", {
    sessionId: state.collabProjectId,
    todoId: item.id,
    patch: { text: item.text, status: item.status, priority: item.priority, assignee: item.assignee },
  });
}

export function upsertTodo(todo: CollabTodo): void {
  const item: TodoItem = {
    id: todo.uid,
    text: todo.text || "",
    status: todo.status || "todo",
    priority: todo.priority || "none",
    assignee: todo.assignee || "",
    createdAt: todo.createdAt || new Date().toISOString(),
  };
  const index = todos.findIndex((candidate) => candidate.id === item.id);
  if (index === -1) todos.push(item);
  else todos[index] = item;
  renderTodoTable();
}

export function removeTodo(id: string): void {
  todos = todos.filter((todo) => todo.id !== id);
  renderTodoTable();
}

export function replaceTodos(next: CollabTodo[]): void {
  todos = next.map((todo) => ({
    id: todo.uid,
    text: todo.text || "",
    status: todo.status || "todo",
    priority: todo.priority || "none",
    assignee: todo.assignee || "",
    createdAt: todo.createdAt || new Date().toISOString(),
  }));
  renderTodoTable();
}

export { renderTodoTable as renderTodoList };
