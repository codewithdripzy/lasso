import { state } from "../state";
import { getDOM } from "../dom";
import type { ElementGroup, GroupConfig } from "../types";
import { setCommentMode } from "./toolbar";

export const GROUPS: Record<ElementGroup, GroupConfig> = {
  layout: {
    color: "#6ea0ff",
    background: "rgba(110, 160, 255, 0.08)",
    label: "Layout",
  },
  text: {
    color: "#c084fc",
    background: "rgba(192, 132, 252, 0.08)",
    label: "Text",
  },
  interactive: {
    color: "#81c995",
    background: "rgba(129, 201, 149, 0.08)",
    label: "Interactive",
  },
  media: {
    color: "#fdd663",
    background: "rgba(253, 214, 99, 0.08)",
    label: "Media",
  },
  component: {
    color: "#f472b6",
    background: "rgba(244, 114, 182, 0.08)",
    label: "Component",
  },
  default: {
    color: "#818cf8",
    background: "rgba(129, 140, 248, 0.08)",
    label: "Element",
  },
};

export function getElementGroup(el: Element): ElementGroup {
  const tag = el.tagName.toLowerCase();

  if (["button", "a", "input", "textarea", "select", "option", "summary"].includes(tag)) {
    return "interactive";
  }
  if (["img", "video", "audio", "canvas", "svg", "picture", "iframe"].includes(tag)) {
    return "media";
  }
  if (["h1", "h2", "h3", "h4", "h5", "h6", "p", "span", "label", "blockquote", "small", "strong", "em", "code", "pre"].includes(tag)) {
    return "text";
  }
  if (["div", "section", "main", "header", "footer", "nav", "article", "aside", "form", "ul", "ol", "li"].includes(tag)) {
    return "layout";
  }
  return "default";
}

export function getElementLabel(el: Element): string {
  const tag = el.tagName.toLowerCase();
  if (el.id) return `${tag}#${el.id}`;
  if (typeof el.className === "string" && el.className.trim()) {
    const first = el.className.trim().split(/\s+/)[0];
    if (first) return `${tag}.${first}`;
  }
  return `<${tag}>`;
}

export function getSourceHint(el: Element): string | undefined {
  for (const key of Object.keys(el)) {
    if (!key.startsWith("__reactFiber") && !key.startsWith("__reactInternalInstance")) continue;
    let fiber: any = (el as any)[key];
    for (let depth = 0; fiber && depth < 12; depth += 1, fiber = fiber.return) {
      const source = fiber?._debugSource;
      if (source?.fileName) return `${source.fileName}:${source.lineNumber || 1}`;
    }
  }
  return undefined;
}

export function cssPath(el: Element): string {
  const parts: string[] = [];
  let current: Element | null = el;
  while (current && current !== document.documentElement && parts.length < 8) {
    const parent: Element | null = current.parentElement;
    let selector = current.tagName.toLowerCase();
    if (current.id) {
      parts.unshift(`#${current.id}`);
      break;
    }
    if (parent) {
      const index = [...parent.children].indexOf(current as HTMLElement) + 1;
      if (index > 1) selector += `:nth-child(${index})`;
    }
    parts.unshift(selector);
    current = parent;
  }
  return parts.join(" > ").slice(0, 220);
}

export function elementKey(el: Element): string {
  const fromAttr = el.getAttribute("data-source") || el.getAttribute("data-lasso-source") || "";
  if (fromAttr.trim()) return `attr:${fromAttr.trim()}`;
  if (el.id) return `id:${el.id}`;
  return `css:${cssPath(el)}`;
}

export function currentSelectionPayload(): { elementId: string; label: string; sourceHint: string } | null {
  if (!state.selected) return null;
  return {
    elementId: elementKey(state.selected),
    label: getElementLabel(state.selected),
    sourceHint: state.selected.getAttribute("data-source") || getSourceHint(state.selected) || "",
  };
}

export function positionBox(box: HTMLElement, el: Element | null) {
  if (!el) {
    box.style.display = "none";
    return;
  }
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    box.style.display = "none";
    return;
  }
  box.style.display = "block";
  box.style.left = `${rect.left}px`;
  box.style.top = `${rect.top}px`;
  box.style.width = `${rect.width}px`;
  box.style.height = `${rect.height}px`;
}

export function updateHoverVisual(el: Element | null) {
  const dom = getDOM();
  if (!el) {
    dom.hoverBox.style.display = "none";
    dom.label.style.display = "none";
    return;
  }
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    dom.hoverBox.style.display = "none";
    dom.label.style.display = "none";
    return;
  }
  const group = getElementGroup(el);
  const config = GROUPS[group];

  dom.hoverBox.style.display = "block";
  dom.hoverBox.style.left = `${rect.left}px`;
  dom.hoverBox.style.top = `${rect.top}px`;
  dom.hoverBox.style.width = `${rect.width}px`;
  dom.hoverBox.style.height = `${rect.height}px`;
  dom.hoverBox.style.borderColor = config.color;
  dom.hoverBox.style.background = config.background;

  dom.label.textContent = `${config.label} · ${getElementLabel(el)}`;
  dom.label.style.background = config.color;

  let labelTop = rect.top - 29;
  if (labelTop < 6) labelTop = rect.bottom + 6;
  let labelLeft = Math.max(6, Math.min(rect.left, window.innerWidth - 190));
  dom.label.style.left = `${labelLeft}px`;
  dom.label.style.top = `${labelTop}px`;
  dom.label.style.display = "flex";
}

export function setHovered(el: Element | null) {
  if (state.hovered === el) return;
  state.hovered = el;
  updateHoverVisual(state.hovered);
}

export function updateSelectedVisual() {
  const dom = getDOM();
  if (!state.selected) {
    dom.selectedBox.style.display = "none";
    return;
  }
  const group = getElementGroup(state.selected);
  const config = GROUPS[group];
  positionBox(dom.selectedBox, state.selected);
  dom.selectedBox.style.borderColor = config.color;
  dom.selectedBox.style.background = config.background;
}

export function setSelectMode(active: boolean) {
  state.selectMode = active;
  if (active) state.previewMode = false;
  const selectBtn = getDOM().shadow.querySelector<HTMLButtonElement>(".select-tool");
  const previewBtn = getDOM().shadow.querySelector<HTMLButtonElement>(".preview-tool");
  if (selectBtn) {
    selectBtn.classList.toggle("active", active);
  }
  if (previewBtn) previewBtn.classList.toggle("active", state.previewMode);

  if (active) {
    document.documentElement.style.cursor = "default";
    if (state.commentMode) {
      setCommentMode(false);
    }
  } else {
    setHovered(null);
    document.documentElement.style.cursor = state.commentMode ? "default" : "";
  }
}

/**
 * Preview lets the application receive clicks normally. The overlay remains
 * mounted, so a user can exercise a flow and then switch back to Select to
 * edit the UI it opened (for example, a modal or dropdown).
 */
export function setPreviewMode(active: boolean) {
  state.previewMode = active;
  if (active) {
    state.selectMode = false;
    state.commentMode = false;
    setHovered(null);
  }

  const dom = getDOM();
  dom.shadow.querySelector<HTMLButtonElement>(".preview-tool")?.classList.toggle("active", active);
  dom.shadow.querySelector<HTMLButtonElement>(".select-tool")?.classList.toggle("active", state.selectMode);
  dom.shadow.querySelector<HTMLButtonElement>(".comment-tool")?.classList.toggle("active", state.commentMode);
  document.documentElement.style.cursor = "";
}
