import { state } from "../state";
import { getDOM } from "../dom";

interface TodoItem {
  id: string;
  text: string;
  done: boolean;
  createdAt: string;
}

const STORAGE_KEY = "lasso:todos";

function loadTodos(): TodoItem[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveTodos(todos: TodoItem[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
  } catch {
    // Storage may be unavailable
  }
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
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M9 11l3 3L22 4"/>
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
        </svg>
        <span class="lasso-todo-title">Tasks</span>
        <span class="lasso-todo-badge">0</span>
      </div>
      <button class="lasso-todo-close" type="button" aria-label="Close Todo">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
    </div>

    <form class="lasso-todo-form">
      <input class="lasso-todo-input" type="text" placeholder="Add a task for this session…" maxlength="240" />
      <button class="lasso-todo-add-btn" type="submit" aria-label="Add task">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      </button>
    </form>

    <div class="lasso-todo-list" role="list"></div>

    <div class="lasso-todo-footer">
      <span class="lasso-todo-stats">0 completed</span>
      <button class="lasso-todo-clear-done" type="button">Clear done</button>
    </div>
  `;

  dom.shadow.appendChild(el);
  todoPanelEl = el;

  const closeBtn = el.querySelector<HTMLButtonElement>(".lasso-todo-close")!;
  const form = el.querySelector<HTMLFormElement>(".lasso-todo-form")!;
  const input = el.querySelector<HTMLInputElement>(".lasso-todo-input")!;
  const clearDoneBtn = el.querySelector<HTMLButtonElement>(".lasso-todo-clear-done")!;

  closeBtn.addEventListener("click", () => {
    toggleTodoPanel(false);
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    todos.unshift({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      text,
      done: false,
      createdAt: new Date().toISOString(),
    });
    input.value = "";
    saveTodos(todos);
    renderTodoList();
  });

  clearDoneBtn.addEventListener("click", () => {
    todos = todos.filter((t) => !t.done);
    saveTodos(todos);
    renderTodoList();
  });

  renderTodoList();
  return el;
}

export function renderTodoList(): void {
  if (!todoPanelEl) return;
  const listEl = todoPanelEl.querySelector<HTMLDivElement>(".lasso-todo-list");
  const badgeEl = todoPanelEl.querySelector<HTMLSpanElement>(".lasso-todo-badge");
  const statsEl = todoPanelEl.querySelector<HTMLSpanElement>(".lasso-todo-stats");
  if (!listEl || !badgeEl || !statsEl) return;

  const remaining = todos.filter((t) => !t.done).length;
  const done = todos.length - remaining;

  badgeEl.textContent = String(remaining);
  badgeEl.style.display = remaining > 0 ? "inline-flex" : "none";
  statsEl.textContent = `${done} of ${todos.length} done`;

  if (todos.length === 0) {
    listEl.innerHTML = `
      <div class="lasso-todo-empty">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <path d="m9 12 2 2 4-4"/>
        </svg>
        <span>No tasks yet. Track quick UI fixes or design notes.</span>
      </div>
    `;
    return;
  }

  listEl.innerHTML = "";
  for (const item of todos) {
    const row = document.createElement("div");
    row.className = `lasso-todo-item${item.done ? " done" : ""}`;
    row.innerHTML = `
      <label class="lasso-todo-checkbox-wrap">
        <input type="checkbox" ${item.done ? "checked" : ""} />
        <span class="lasso-todo-checkmark">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </span>
      </label>
      <span class="lasso-todo-text">${escapeHtml(item.text)}</span>
      <button class="lasso-todo-del" type="button" aria-label="Delete task">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    `;

    const checkbox = row.querySelector<HTMLInputElement>("input[type='checkbox']")!;
    checkbox.addEventListener("change", () => {
      item.done = checkbox.checked;
      saveTodos(todos);
      renderTodoList();
    });

    const delBtn = row.querySelector<HTMLButtonElement>(".lasso-todo-del")!;
    delBtn.addEventListener("click", () => {
      todos = todos.filter((t) => t.id !== item.id);
      saveTodos(todos);
      renderTodoList();
    });

    listEl.appendChild(row);
  }
}

export function toggleTodoPanel(force?: boolean): void {
  if (!todoPanelEl) return;
  const isHidden = todoPanelEl.hidden;
  const next = force !== undefined ? force : isHidden;
  todoPanelEl.hidden = !next;
  if (next) {
    todoPanelEl.classList.add("visible");
    todoPanelEl.querySelector<HTMLInputElement>(".lasso-todo-input")?.focus();
  } else {
    todoPanelEl.classList.remove("visible");
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
