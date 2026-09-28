import { state } from "../state";
import { getDOM } from "../dom";

export type PageEntry = { name: string; path: string; type: "directory" | "file" };

type PageNode = PageEntry & { expanded: boolean; loaded: boolean; children: PageNode[] };

const ROOT_PATH = ".";
const DEFAULT_FILE_NAME = "page.tsx";

const ICON_FOLDER = `<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M1.75 4.2c0-.6.5-1.1 1.1-1.1h3.1c.35 0 .68.16.9.45l.7.95h4.4c.6 0 1.1.5 1.1 1.1v6.3c0 .6-.5 1.1-1.1 1.1H2.85c-.6 0-1.1-.5-1.1-1.1z" fill="currentColor" fill-opacity=".16" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>`;
const ICON_FOLDER_OPEN = `<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M1.75 12.4V4.2c0-.6.5-1.1 1.1-1.1h3.1c.35 0 .68.16.9.45l.7.95h3.9c.5 0 .92.34 1.05.8l.9 3.3H4.4l-1.5 3.1H2.85c-.6 0-1.1-.5-1.1-1.1z" fill="currentColor" fill-opacity=".16" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M4.2 12.4l1.6-3.3h8.6l-1.7 3.3z" fill="currentColor" fill-opacity=".16" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>`;
const ICON_FILE = `<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 2.2h4.6L12 5.6v8.2H4z" fill="currentColor" fill-opacity=".1" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M8.4 2.4V5.7H11.7" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>`;
const ICON_CHEVRON = `<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

let panelEl: HTMLDivElement | null = null;
let treeEl: HTMLDivElement | null = null;
let nameInput: HTMLInputElement | null = null;
let filterInput: HTMLInputElement | null = null;
let statusEl: HTMLDivElement | null = null;
let newFolderBtn: HTMLButtonElement | null = null;
let createBtn: HTMLButtonElement | null = null;

let root: PageNode = { name: "Project", path: ROOT_PATH, type: "directory", expanded: true, loaded: false, children: [] };
let selectedFolder = ROOT_PATH;
let filter = "";
let inlineCreate: { parent: string } | null = null;
let loadingPaths = new Set<string>();

function findNode(path: string, nodes: PageNode[] = [root]): PageNode | null {
  for (const node of nodes) {
    if (node.path === path) return node;
    if (node.type === "directory") {
      const found = findNode(path, node.children);
      if (found) return found;
    }
  }
  return null;
}

function toNode(entry: PageEntry): PageNode {
  return { ...entry, expanded: false, loaded: false, children: [] };
}

function requestChildren(path: string, force = false): void {
  const node = findNode(path);
  if (!node || node.type !== "directory") return;
  if (node.loaded && !force) return;
  if (state.bridgeSocket?.readyState !== WebSocket.OPEN) {
    setStatus("The Lasso agent bridge is not connected.", true);
    return;
  }
  loadingPaths.add(path);
  render();
  state.bridgeSocket.send(JSON.stringify({ type: "list_page_folders", path }));
}

/** Auto-expands the folders that lead to the current selection so it stays visible. */
function revealSelected(): void {
  const found = findNode(selectedFolder);
  if (!found || found === root) return;
  const chain: PageNode[] = [];
  const collect = (nodes: PageNode[], trail: PageNode[]): boolean => {
    for (const node of nodes) {
      if (node === found) {
        chain.push(...trail);
        return true;
      }
      if (node.type === "directory" && collect(node.children, [...trail, node])) return true;
    }
    return false;
  };
  if (!collect(root.children, [])) return;
  for (const node of chain) {
    if (!node.expanded) {
      node.expanded = true;
      if (!node.loaded) requestChildren(node.path);
    }
  }
}

function setStatus(message: string, isError = false): void {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function matchesFilter(node: PageNode, term: string): boolean {
  if (node.name.toLowerCase().includes(term)) return true;
  return node.children.some((child) => child.type === "directory" && child.expanded && matchesFilter(child, term));
}

function render(): void {
  if (!treeEl) return;
  const rows: HTMLElement[] = [];
  const term = filter.trim().toLowerCase();

  const walk = (nodes: PageNode[], depth: number): void => {
    for (const node of nodes) {
      if (term && !matchesFilter(node, term)) continue;
      rows.push(renderRow(node, depth));
      if (node.type === "directory" && node.expanded) {
        if (inlineCreate?.parent === node.path) rows.push(renderInlineCreate(depth + 1));
        if (loadingPaths.has(node.path)) {
          rows.push(placeholderRow(depth + 1, "Loading…"));
          continue;
        }
        if (!node.children.length) {
          if (node.loaded) rows.push(placeholderRow(depth + 1, "Empty"));
          continue;
        }
        walk(node.children, depth + 1);
      }
    }
  };

  // The project root is a real row so the destination is always visible and
  // selectable, and so a new folder can be created at the top level.
  walk([root], 0);
  if (!rows.length) {
    rows.push(placeholderRow(0, term ? "No matching folders" : loadingPaths.size ? "Loading folders…" : "No folders to show"));
  }
  treeEl.replaceChildren(...rows);
  syncCreateButton();
}

function placeholderRow(depth: number, label: string): HTMLElement {
  const row = document.createElement("div");
  row.className = "lasso-page-row muted";
  row.style.setProperty("--lasso-page-depth", String(depth));
  row.textContent = label;
  return row;
}

function renderRow(node: PageNode, depth: number): HTMLElement {
  const isDirectory = node.type === "directory";
  const row = document.createElement("div");
  row.className = "lasso-page-row";
  row.dataset.path = node.path;
  row.dataset.type = node.type;
  row.style.setProperty("--lasso-page-depth", String(depth));
  row.setAttribute("role", "treeitem");
  if (isDirectory) {
    row.setAttribute("aria-expanded", String(node.expanded));
  }
  row.classList.toggle("selected", isDirectory && node.path === selectedFolder);

  const twisty = document.createElement("span");
  twisty.className = "lasso-page-twisty";
  if (isDirectory) {
    twisty.innerHTML = ICON_CHEVRON;
    twisty.classList.toggle("open", node.expanded);
    twisty.title = node.expanded ? "Collapse" : "Expand";
    // Toggling lives on the twisty so picking a folder as the target never
    // collapses it out from under the user.
    twisty.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleDirectory(node);
    });
  }

  const icon = document.createElement("span");
  icon.className = `lasso-page-icon ${isDirectory ? "folder" : "file"}`;
  icon.innerHTML = isDirectory && node.expanded ? ICON_FOLDER_OPEN : isDirectory ? ICON_FOLDER : ICON_FILE;

  const label = document.createElement("span");
  label.className = "lasso-page-label";
  label.textContent = node.name;

  row.append(twisty, icon, label);

  row.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (isDirectory) {
      selectFolder(node.path);
      if (!node.expanded) toggleDirectory(node);
    } else {
      // Clicking a file reuses its name so the user only types the missing part.
      selectFolder(node.path.includes("/") ? node.path.slice(0, node.path.lastIndexOf("/")) : ROOT_PATH);
      if (nameInput && !nameInput.value.trim()) nameInput.value = node.name;
    }
  });

  return row;
}

function renderInlineCreate(depth: number): HTMLElement {
  const row = document.createElement("div");
  row.className = "lasso-page-row creating";
  row.style.setProperty("--lasso-page-depth", String(depth));

  const icon = document.createElement("span");
  icon.className = "lasso-page-icon folder";
  icon.innerHTML = ICON_FOLDER;

  const input = document.createElement("input");
  input.className = "lasso-page-inline-input";
  input.type = "text";
  input.placeholder = "New folder name";
  input.setAttribute("aria-label", "New folder name");

  const confirm = document.createElement("button");
  confirm.type = "button";
  confirm.className = "lasso-page-inline-confirm";
  confirm.title = "Create folder";
  confirm.setAttribute("aria-label", "Create folder");
  confirm.innerHTML = `<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3.5 8.4l3 3 6-6.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "lasso-page-inline-cancel";
  cancel.title = "Cancel";
  cancel.setAttribute("aria-label", "Cancel folder creation");
  cancel.innerHTML = `<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;

  const submit = () => {
    const name = input.value.trim();
    if (!name) {
      cancelCreate();
      return;
    }
    if (state.bridgeSocket?.readyState !== WebSocket.OPEN) {
      setStatus("The Lasso agent bridge is not connected.", true);
      return;
    }
    const parent = inlineCreate?.parent || selectedFolder;
    setStatus(`Creating ${name}…`);
    state.bridgeSocket.send(JSON.stringify({ type: "create_page_folder", parent, name }));
    inlineCreate = null;
    render();
  };

  input.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      submit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancelCreate();
    }
  });
  input.addEventListener("click", (event) => event.stopPropagation());
  confirm.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    submit();
  });
  cancel.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    cancelCreate();
  });

  row.append(icon, input, confirm, cancel);
  requestAnimationFrame(() => input.focus());
  return row;
}

function cancelCreate(): void {
  inlineCreate = null;
  render();
}

function startInlineCreate(): void {
  inlineCreate = { parent: selectedFolder };
  setStatus("");
  render();
}

function toggleDirectory(node: PageNode): void {
  node.expanded = !node.expanded;
  if (node.expanded && !node.loaded) requestChildren(node.path);
  render();
}

function selectFolder(path: string): void {
  selectedFolder = path;
  if (nameInput) {
    nameInput.placeholder = path === ROOT_PATH ? DEFAULT_FILE_NAME : `${path}/page.tsx`;
  }
  render();
}

function syncCreateButton(): void {
  if (!createBtn) return;
  const name = nameInput?.value.trim() || "";
  createBtn.disabled = !name;
  if (nameInput) nameInput.classList.toggle("invalid", Boolean(name) && /(^|\/)(\.|\.\.)$/.test(name));
}

function selectedTargetLabel(): string {
  return selectedFolder === ROOT_PATH ? "project root" : selectedFolder;
}

export function buildPagePanel(): HTMLDivElement {
  const dom = getDOM();

  const el = document.createElement("div");
  el.className = "lasso-page-backdrop";
  el.hidden = true;
  el.innerHTML = `
    <div class="lasso-page-panel" role="dialog" aria-modal="true" aria-labelledby="lasso-page-title">
      <div class="lasso-page-header">
        <div class="lasso-page-title-row">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <path d="M14 2v6h6"/>
          </svg>
          <span class="lasso-page-title" id="lasso-page-title">New page</span>
        </div>
        <button class="lasso-page-close" type="button" aria-label="Close">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <label class="lasso-page-field">
        <span class="lasso-page-label-text">Name</span>
        <input class="lasso-page-name" type="text" spellcheck="false" autocomplete="off" placeholder="${DEFAULT_FILE_NAME}" />
      </label>

      <div class="lasso-page-field">
        <div class="lasso-page-field-head">
          <span class="lasso-page-label-text">Folder</span>
          <div class="lasso-page-field-tools">
            <input class="lasso-page-filter" type="text" spellcheck="false" autocomplete="off" placeholder="Filter" aria-label="Filter folders" />
            <button class="lasso-page-new-folder" type="button" title="New folder">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M12 5v14M5 12h14"/>
              </svg>
            </button>
          </div>
        </div>
        <div class="lasso-page-tree" role="tree" aria-label="Project folders"></div>
      </div>

      <div class="lasso-page-footer">
        <div class="lasso-page-status" aria-live="polite"></div>
        <button class="lasso-page-create" type="button">Create page</button>
      </div>
    </div>
  `;

  dom.shadow.appendChild(el);
  panelEl = el;
  treeEl = el.querySelector<HTMLDivElement>(".lasso-page-tree");
  nameInput = el.querySelector<HTMLInputElement>(".lasso-page-name");
  filterInput = el.querySelector<HTMLInputElement>(".lasso-page-filter");
  statusEl = el.querySelector<HTMLDivElement>(".lasso-page-status");
  newFolderBtn = el.querySelector<HTMLButtonElement>(".lasso-page-new-folder");
  createBtn = el.querySelector<HTMLButtonElement>(".lasso-page-create");

  el.addEventListener("pointerdown", (event) => {
    if (event.target === el) closePagePanel();
  });
  el.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (inlineCreate) {
      cancelCreate();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    closePagePanel();
  });

  el.querySelector<HTMLButtonElement>(".lasso-page-close")!.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    closePagePanel();
  });

  newFolderBtn!.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    startInlineCreate();
  });

  nameInput!.addEventListener("input", syncCreateButton);
  nameInput!.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      createPage();
    }
  });
  filterInput!.addEventListener("input", () => {
    filter = filterInput?.value || "";
    render();
  });
  filterInput!.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      if (filterInput?.value) {
        filterInput.value = "";
        filter = "";
      } else {
        closePagePanel();
      }
      render();
    }
  });

  createBtn!.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    createPage();
  });

  window.addEventListener("lasso-page-folders", (event) => {
    const detail = (event as CustomEvent<{ path: string; entries: PageEntry[]; project?: string; error?: string }>).detail;
    if (!detail) return;
    loadingPaths.delete(detail.path);
    const node = findNode(detail.path);
    if (detail.error) {
      setStatus(detail.error, true);
    } else if (node) {
      if (detail.project) root.name = detail.project;
      node.children = detail.entries.map(toNode);
      node.loaded = true;
    }
    render();
  });

  window.addEventListener("lasso-page-folder-created", (event) => {
    const detail = (event as CustomEvent<{ path: string; error?: string }>).detail;
    if (!detail) return;
    if (detail.error) {
      setStatus(detail.error, true);
      return;
    }
    setStatus(`Created folder ${detail.path}`);
    requestChildren(detail.path.replace(/\/[^/]+$/, "") || ROOT_PATH, true);
    selectFolder(detail.path);
  });

  window.addEventListener("lasso-page-created", (event) => {
    const detail = (event as CustomEvent<{ path: string; error?: string }>).detail;
    if (!detail) return;
    if (detail.error) {
      setStatus(detail.error, true);
      return;
    }
    const parent = detail.path.includes("/") ? detail.path.slice(0, detail.path.lastIndexOf("/")) : ROOT_PATH;
    requestChildren(parent, true);
    setStatus(`Created ${detail.path}`);
    if (nameInput) {
      nameInput.value = "";
      nameInput.focus();
    }
    syncCreateButton();
  });

  return el;
}

function createPage(): void {
  if (!nameInput || !createBtn) return;
  const fileName = nameInput.value.trim();
  if (!fileName) {
    setStatus("Enter a name for the new page.", true);
    nameInput.focus();
    return;
  }
  if (state.bridgeSocket?.readyState !== WebSocket.OPEN) {
    setStatus("The Lasso agent bridge is not connected.", true);
    return;
  }
  createBtn.disabled = true;
  setStatus(`Creating ${fileName} in ${selectedTargetLabel()}…`);
  state.bridgeSocket.send(
    JSON.stringify({
      type: "create_page",
      folder: selectedFolder,
      fileName,
      content: starterContent(fileName),
    })
  );
}

function starterContent(fileName: string): string {
  const extension = (fileName.split(".").pop() || "").toLowerCase();
  const base = (fileName.split("/").pop() || "page").replace(/\.[^.]+$/, "");
  const component = base
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join("") || "Page";
  const className = base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "page";

  if (extension === "tsx" || extension === "jsx") {
    return `export default function ${component}() {\n  return (\n    <main className="${className}">\n      <h1>${component}</h1>\n    </main>\n  );\n}\n`;
  }
  if (extension === "ts" || extension === "js") {
    return `export function ${component.toLowerCase()}() {\n  return null;\n}\n`;
  }
  if (extension === "css") return `/* ${base} styles */\n`;
  if (extension === "json") return "{}\n";
  if (extension === "md") return `# ${base}\n`;
  return "";
}

export function openPagePanel(): void {
  if (!panelEl) return;
  panelEl.hidden = false;
  setStatus("");
  if (nameInput) nameInput.value = "";
  syncCreateButton();
  render();
  requestChildren(ROOT_PATH, true);
  revealSelected();
  render();
  requestAnimationFrame(() => nameInput?.focus());
}

export function closePagePanel(): void {
  if (!panelEl) return;
  panelEl.hidden = true;
  inlineCreate = null;
}

export function togglePagePanel(): void {
  if (!panelEl) return;
  if (panelEl.hidden) openPagePanel();
  else closePagePanel();
}

export function isPagePanelOpen(): boolean {
  return panelEl ? !panelEl.hidden : false;
}
