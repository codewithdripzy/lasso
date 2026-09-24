import { state } from "../state";
import { getDOM } from "../dom";
import { getElementGroup, getElementLabel, getSourceHint, elementKey, setSelectMode, setPreviewMode } from "../toolbar/select";
import { setCommentMode } from "../toolbar/toolbar";
import { captureScreenshots, showReview } from "../prompt/prompt";
import { LASSO_ICON_DATA_URL } from "../icons/lasso";
import type { DragContext, PendingChange } from "../types";

let isDragging = false;
let startX = 0;
let startY = 0;
let currentDx = 0;
let currentDy = 0;
let originalRect: DOMRect | null = null;
let originalTransform = "";
let originalTransition = "";
let originalZIndex = "";
let originalOpacity = "";

let dragClone: HTMLElement | null = null;
let pausedElements: HTMLElement[] = [];

let dragHoverBox: HTMLDivElement | null = null;
let dragHoverLabel: HTMLDivElement | null = null;
let dragGhostBox: HTMLDivElement | null = null;
let dragHudBadge: HTMLDivElement | null = null;
let dragGuideSvg: SVGSVGElement | null = null;
let dragGuideLine: SVGLineElement | null = null;
let dragCard: HTMLDivElement | null = null;

let cardPromptInput: HTMLTextAreaElement | null = null;
let cardApplyBtn: HTMLButtonElement | null = null;
let cardRevertBtn: HTMLButtonElement | null = null;
let cardCloseBtn: HTMLButtonElement | null = null;
let cardStatusWrap: HTMLDivElement | null = null;
let cardStatusMessage: HTMLSpanElement | null = null;
let cardStatusBadge: HTMLSpanElement | null = null;
let cardParentSwitchBtn: HTMLButtonElement | null = null;

/**
 * Resolves the element to drag. If the user clicks an SVG or inner inline text element,
 * or holds Alt, intelligently resolves to the container element.
 */
function resolveDragTarget(target: Element, preferParent = false): HTMLElement | null {
  let el: Element | null = target;

  // Keep the SVG root as the target. Promoting it to its parent changes the
  // surrounding container instead of moving the graphic.
  if (el instanceof SVGElement) {
    const svg = el.closest("svg");
    if (svg) return (preferParent && svg.parentElement ? svg.parentElement : svg) as unknown as HTMLElement;
  }

  // If user requests parent container via Alt or button
  if (preferParent && el.parentElement && el.parentElement !== document.body && el.parentElement !== document.documentElement) {
    return el.parentElement as HTMLElement;
  }

  // If leaf is an inline/icon child inside a container, resolve to container
  if (
    ["path", "g", "circle", "rect", "line", "polyline", "polygon", "tspan"].includes(el.tagName.toLowerCase())
  ) {
    el = el.closest("svg") || el.parentElement || el;
  }

  // Return resolved HTMLElement (or parent if not an HTMLElement)
  const resolved = (el instanceof HTMLElement ? el : el.parentElement) as HTMLElement | null;
  if (!resolved || resolved === document.body || resolved === document.documentElement) return null;
  return resolved;
}

/**
 * Pauses CSS animations and transitions on an element and all descendants
 * so that objects in motion freeze in place during drag.
 */
function pauseAnimations(el: HTMLElement) {
  pausedElements = [];
  const pauseOne = (node: HTMLElement) => {
    if (node && node.style) {
      node.style.setProperty("animation-play-state", "paused", "important");
      node.style.setProperty("transition", "none", "important");
      pausedElements.push(node);
    }
  };
  pauseOne(el);
  el.querySelectorAll<HTMLElement>("*").forEach(pauseOne);
}

/**
 * Resumes previously paused animations and transitions.
 */
function resumeAnimations() {
  for (const node of pausedElements) {
    node.style.removeProperty("animation-play-state");
    node.style.removeProperty("transition");
  }
  pausedElements = [];
}

export function buildDrag() {
  const dom = getDOM();
  const layer = dom.dragLayer;

  // 1. Hover Box
  dragHoverBox = document.createElement("div");
  dragHoverBox.className = "lasso-drag-hover-box";
  dragHoverBox.style.display = "none";

  dragHoverLabel = document.createElement("div");
  dragHoverLabel.className = "lasso-drag-hover-label";
  dragHoverLabel.innerHTML = `
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/>
    </svg>
    <span class="lasso-drag-hover-text">Drag to move</span>
    <span class="lasso-drag-hover-alt-hint">Alt: parent</span>
  `;
  dragHoverBox.appendChild(dragHoverLabel);

  // 2. Ghost Box (remains at origin during drag)
  dragGhostBox = document.createElement("div");
  dragGhostBox.className = "lasso-drag-ghost-box";
  dragGhostBox.style.display = "none";
  dragGhostBox.innerHTML = `<span class="lasso-drag-ghost-chip">Original position</span>`;

  // 3. HUD Coordinates Badge (follows cursor/drag)
  dragHudBadge = document.createElement("div");
  dragHudBadge.className = "lasso-drag-hud";
  dragHudBadge.style.display = "none";

  // 4. SVG Connector Ray
  dragGuideSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  dragGuideSvg.setAttribute("class", "lasso-drag-guide-svg");
  dragGuideSvg.style.display = "none";
  dragGuideLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
  dragGuideLine.setAttribute("stroke", "#0ea5e9");
  dragGuideLine.setAttribute("stroke-width", "2");
  dragGuideLine.setAttribute("stroke-dasharray", "4 4");
  dragGuideLine.setAttribute("stroke-linecap", "round");
  dragGuideSvg.appendChild(dragGuideLine);

  // 5. Reposition Confirmation Card
  dragCard = document.createElement("div");
  dragCard.className = "lasso-drag-card";
  dragCard.style.display = "none";
  dragCard.innerHTML = `
    <div class="lasso-drag-card-header">
      <div class="lasso-drag-card-brand">
        <span class="lasso-drag-card-icon">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/>
          </svg>
        </span>
        <span class="lasso-drag-card-title">Reposition with AI</span>
      </div>
      <div class="lasso-drag-card-target-wrap">
        <span class="lasso-drag-card-element-chip"></span>
        <button class="lasso-drag-parent-switch-btn" type="button" title="Switch target to parent container">↑ Parent</button>
      </div>
      <button class="lasso-drag-card-close" type="button" aria-label="Cancel reposition" title="Cancel">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
    </div>

    <div class="lasso-drag-stats">
      <div class="lasso-drag-stat-box">
        <span class="lasso-drag-stat-label">Original</span>
        <span class="lasso-drag-stat-val orig-coords">—</span>
      </div>
      <div class="lasso-drag-stat-box">
        <span class="lasso-drag-stat-label">Dropped</span>
        <span class="lasso-drag-stat-val target-coords">—</span>
      </div>
      <div class="lasso-drag-stat-box accent">
        <span class="lasso-drag-stat-label">Offset</span>
        <span class="lasso-drag-stat-val delta-coords">—</span>
      </div>
    </div>

    <div class="lasso-drag-context-hint">
      <span class="lasso-drag-context-icon">⚲</span>
      <span class="lasso-drag-context-text">Layout context</span>
    </div>

    <div class="lasso-drag-status-wrap" style="display:none;">
      <div class="lasso-agent-terminal-header">
        <div class="lasso-agent-terminal-dots">
          <span class="lasso-dot-red"></span>
          <span class="lasso-dot-yellow"></span>
          <span class="lasso-dot-green"></span>
        </div>
        <span class="lasso-agent-status-kicker">lasso-agent</span>
        <span class="lasso-agent-status-badge">working</span>
      </div>
      <div class="lasso-agent-status-line">
        <span class="lasso-agent-terminal-prompt">›</span>
        <span class="lasso-drag-status-msg">Thinking…</span>
      </div>
    </div>

    <div class="lasso-drag-input-wrap">
      <label class="lasso-drag-input-label">AI Instruction</label>
      <textarea class="lasso-drag-textarea" rows="2" placeholder="Modify code to position element…"></textarea>
    </div>

    <div class="lasso-drag-actions">
      <button class="lasso-drag-btn-revert" type="button" title="Reset element position">Revert</button>
      <button class="lasso-drag-btn-apply" type="button" title="Apply change with AI">
        <img src="${LASSO_ICON_DATA_URL}" alt="" class="lasso-btn-sparkle" />
        <span>Apply Reposition</span>
      </button>
    </div>
  `;

  layer.append(dragGhostBox, dragGuideSvg, dragHoverBox, dragHudBadge, dragCard);

  // Wire Card Buttons
  cardPromptInput = dragCard.querySelector<HTMLTextAreaElement>(".lasso-drag-textarea");
  cardApplyBtn = dragCard.querySelector<HTMLButtonElement>(".lasso-drag-btn-apply");
  cardRevertBtn = dragCard.querySelector<HTMLButtonElement>(".lasso-drag-btn-revert");
  cardCloseBtn = dragCard.querySelector<HTMLButtonElement>(".lasso-drag-card-close");
  cardParentSwitchBtn = dragCard.querySelector<HTMLButtonElement>(".lasso-drag-parent-switch-btn");
  cardStatusWrap = dragCard.querySelector<HTMLDivElement>(".lasso-drag-status-wrap");
  cardStatusMessage = dragCard.querySelector<HTMLSpanElement>(".lasso-drag-status-msg");
  cardStatusBadge = dragCard.querySelector<HTMLSpanElement>(".lasso-agent-status-badge");

  cardCloseBtn?.addEventListener("click", () => resetDrag(true));
  cardRevertBtn?.addEventListener("click", () => resetDrag(true));
  cardApplyBtn?.addEventListener("click", () => handleApplyReposition());

  cardParentSwitchBtn?.addEventListener("click", () => {
    if (!state.activeDragTarget || !state.dragContext) return;
    const parent = state.activeDragTarget.parentElement;
    if (!parent || parent === document.body || parent === document.documentElement) return;

    // Reset current element transform
    state.activeDragTarget.style.transform = originalTransform;
    state.activeDragTarget.style.transition = originalTransition;
    state.activeDragTarget.style.zIndex = originalZIndex;

    // Switch active target to parent container
    const newTarget = parent as HTMLElement;
    state.activeDragTarget = newTarget;
    originalRect = newTarget.getBoundingClientRect();
    originalTransform = newTarget.style.transform;
    originalTransition = newTarget.style.transition;
    originalZIndex = newTarget.style.zIndex;

    // Re-finish with parent container
    finishDragDrop(newTarget, originalRect, currentDx, currentDy);
  });

  cardPromptInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleApplyReposition();
    }
  });

  // Attach drag listeners
  initDragListeners();
}

export function setDragMode(active: boolean) {
  state.dragMode = active;
  if (active) {
    state.selectMode = false;
    state.previewMode = false;
    state.commentMode = false;
  }

  const dom = getDOM();
  dom.shadow.querySelector<HTMLButtonElement>(".drag-tool")?.classList.toggle("active", active);
  dom.shadow.querySelector<HTMLButtonElement>(".select-tool")?.classList.toggle("active", state.selectMode);
  dom.shadow.querySelector<HTMLButtonElement>(".preview-tool")?.classList.toggle("active", state.previewMode);
  dom.shadow.querySelector<HTMLButtonElement>(".comment-tool")?.classList.toggle("active", state.commentMode);

  if (active) {
    state.hovered = null;
    dom.hoverBox.style.display = "none";
    dom.label.style.display = "none";
    document.documentElement.style.cursor = "grab";
  } else {
    document.documentElement.style.cursor = "";
    if (dragHoverBox) dragHoverBox.style.display = "none";
    resetDrag(true);
  }
}

function updateHoverBox(el: Element | null, isAltHeld = false) {
  if (!dragHoverBox || !dragHoverLabel) return;
  if (!el || !state.dragMode || isDragging) {
    dragHoverBox.style.display = "none";
    return;
  }

  const resolved = resolveDragTarget(el, isAltHeld);
  if (!resolved) {
    dragHoverBox.style.display = "none";
    return;
  }

  const rect = resolved.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    dragHoverBox.style.display = "none";
    return;
  }

  dragHoverBox.style.display = "block";
  dragHoverBox.style.left = `${rect.left}px`;
  dragHoverBox.style.top = `${rect.top}px`;
  dragHoverBox.style.width = `${rect.width}px`;
  dragHoverBox.style.height = `${rect.height}px`;

  const labelText = dragHoverLabel.querySelector<HTMLSpanElement>(".lasso-drag-hover-text");
  if (labelText) {
    const parentHint = isAltHeld ? " [Container]" : "";
    labelText.textContent = `Drag${parentHint} · ${getElementLabel(resolved)}`;
  }

  const altHint = dragHoverLabel.querySelector<HTMLSpanElement>(".lasso-drag-hover-alt-hint");
  if (altHint) {
    altHint.style.display = isAltHeld ? "none" : "inline-block";
  }

  let labelTop = rect.top - 28;
  if (labelTop < 6) labelTop = rect.bottom + 6;
  let labelLeft = Math.max(6, Math.min(rect.left, window.innerWidth - 220));
  dragHoverLabel.style.left = `${labelLeft}px`;
  dragHoverLabel.style.top = `${labelTop}px`;
}

function initDragListeners() {
  const dom = getDOM();

  // Hover detection during drag mode
  document.addEventListener(
    "mousemove",
    (event) => {
      if (!state.dragMode || isDragging) return;
      const target = event.target;
      if (!(target instanceof Element) || dom.isLassoElement(target)) {
        updateHoverBox(null);
        return;
      }
      updateHoverBox(target, event.altKey);
    },
    true
  );

  // Mousedown starts drag
  document.addEventListener(
    "mousedown",
    (event) => {
      if (!state.dragMode) return;
      if (event.button !== 0) return; // Only left-click
      const target = event.target;
      if (!(target instanceof Element) || dom.isLassoElement(target)) return;

      const resolved = resolveDragTarget(target, event.altKey);
      if (!resolved || resolved === document.documentElement || resolved === document.body) return;

      // Close open card if clicking a different element
      if (state.activeDragTarget && state.activeDragTarget !== resolved) {
        resetDrag(true);
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      isDragging = true;
      state.activeDragTarget = resolved;
      startX = event.clientX;
      startY = event.clientY;
      currentDx = 0;
      currentDy = 0;

      // Pause active CSS animations or transitions on the object so it stays frozen where grabbed
      pauseAnimations(resolved);

      originalRect = resolved.getBoundingClientRect();
      originalTransform = resolved.style.transform;
      originalTransition = resolved.style.transition;
      originalZIndex = resolved.style.zIndex;
      originalOpacity = resolved.style.opacity;

      document.documentElement.style.cursor = "grabbing";
      document.body.style.cursor = "grabbing";

      // Hide hover box, show ghost box at origin
      if (dragHoverBox) dragHoverBox.style.display = "none";
      if (dragCard) dragCard.style.display = "none";

      if (dragGhostBox && originalRect) {
        dragGhostBox.style.display = "block";
        dragGhostBox.style.left = `${originalRect.left}px`;
        dragGhostBox.style.top = `${originalRect.top}px`;
        dragGhostBox.style.width = `${originalRect.width}px`;
        dragGhostBox.style.height = `${originalRect.height}px`;
      }

      if (dragGuideSvg) dragGuideSvg.style.display = "block";
      if (dragHudBadge) dragHudBadge.style.display = "block";

      const onPointerMove = (moveEvt: MouseEvent) => {
        if (!isDragging || !state.activeDragTarget || !originalRect) return;
        currentDx = moveEvt.clientX - startX;
        currentDy = moveEvt.clientY - startY;

        // Move only the Lasso outline. Keeping the application element in its
        // original DOM context prevents image scaling and layout corruption.
        if (dragHoverBox && originalRect) {
          dragHoverBox.style.display = "block";
          dragHoverBox.style.left = `${originalRect.left + currentDx}px`;
          dragHoverBox.style.top = `${originalRect.top + currentDy}px`;
          dragHoverBox.style.width = `${originalRect.width}px`;
          dragHoverBox.style.height = `${originalRect.height}px`;
        }

        // Update HUD badge
        if (dragHudBadge) {
          const signX = currentDx >= 0 ? "+" : "";
          const signY = currentDy >= 0 ? "+" : "";
          const newX = Math.round(originalRect.left + currentDx);
          const newY = Math.round(originalRect.top + currentDy);
          dragHudBadge.innerHTML = `✢ <strong>${newX}</strong>, <strong>${newY}</strong> <span class="lasso-hud-delta">(ΔX: ${signX}${Math.round(currentDx)}px, ΔY: ${signY}${Math.round(currentDy)}px)</span>`;
          dragHudBadge.style.left = `${moveEvt.clientX + 16}px`;
          dragHudBadge.style.top = `${moveEvt.clientY + 18}px`;
        }

        // Update Guide Line
        if (dragGuideLine && originalRect) {
          const originCx = originalRect.left + originalRect.width / 2;
          const originCy = originalRect.top + originalRect.height / 2;
          const currCx = originCx + currentDx;
          const currCy = originCy + currentDy;
          dragGuideLine.setAttribute("x1", String(originCx));
          dragGuideLine.setAttribute("y1", String(originCy));
          dragGuideLine.setAttribute("x2", String(currCx));
          dragGuideLine.setAttribute("y2", String(currCy));
        }
      };

      const onPointerUp = (upEvt: MouseEvent) => {
        window.removeEventListener("mousemove", onPointerMove, true);
        window.removeEventListener("mouseup", onPointerUp, true);

        isDragging = false;
        document.documentElement.style.cursor = state.dragMode ? "grab" : "";
        document.body.style.cursor = "";

        if (dragHudBadge) dragHudBadge.style.display = "none";

        const dist = Math.hypot(currentDx, currentDy);
        if (dist < 5 || !state.activeDragTarget || !originalRect) {
          // Micro-movement / cancel: snap back cleanly
          resetDrag(true);
          return;
        }

        // Element was moved by user!
        finishDragDrop(state.activeDragTarget, originalRect, currentDx, currentDy);
      };

      window.addEventListener("mousemove", onPointerMove, true);
      window.addEventListener("mouseup", onPointerUp, true);
    },
    true
  );
}

function finishDragDrop(el: HTMLElement, orig: DOMRect, dx: number, dy: number) {
  const targetLeft = Math.round(orig.left + dx);
  const targetTop = Math.round(orig.top + dy);
  const roundDx = Math.round(dx);
  const roundDy = Math.round(dy);

  if (dragHoverBox) dragHoverBox.style.display = "none";

  // Remove clone proxy and apply clean positioning to target
  if (dragClone) {
    dragClone.remove();
    dragClone = null;
  }

  // Leave the application element untouched. The dropped coordinates become
  // source-edit context only after the user confirms the reposition.

  // Inspect parent & layout
  const parent = el.parentElement;
  const parentComputed = parent ? window.getComputedStyle(parent) : null;
  const computed = window.getComputedStyle(el);

  const prevSibling = el.previousElementSibling;
  const nextSibling = el.nextElementSibling;

  const dragContext: DragContext = {
    originalRect: { left: Math.round(orig.left), top: Math.round(orig.top), width: Math.round(orig.width), height: Math.round(orig.height) },
    targetRect: { left: targetLeft, top: targetTop, width: Math.round(orig.width), height: Math.round(orig.height) },
    delta: { dx: roundDx, dy: roundDy },
    parentTag: parent?.tagName.toLowerCase(),
    parentClass: parent?.className || undefined,
    parentDisplay: parentComputed?.display,
    parentFlexDirection: parentComputed?.flexDirection,
    currentPositioning: computed.position,
    computedMargins: {
      top: computed.marginTop,
      right: computed.marginRight,
      bottom: computed.marginBottom,
      left: computed.marginLeft,
    },
    siblingBefore: prevSibling ? getElementLabel(prevSibling) : undefined,
    siblingAfter: nextSibling ? getElementLabel(nextSibling) : undefined,
  };

  state.dragContext = dragContext;

  // Populate Drag Card
  if (!dragCard) return;

  const signX = roundDx >= 0 ? "+" : "";
  const signY = roundDy >= 0 ? "+" : "";

  const chipEl = dragCard.querySelector<HTMLSpanElement>(".lasso-drag-card-element-chip");
  if (chipEl) chipEl.textContent = getElementLabel(el);

  // Parent container switcher button visibility
  if (cardParentSwitchBtn) {
    if (parent && parent !== document.body && parent !== document.documentElement) {
      cardParentSwitchBtn.style.display = "inline-flex";
      cardParentSwitchBtn.textContent = `↑ ${getElementLabel(parent)}`;
    } else {
      cardParentSwitchBtn.style.display = "none";
    }
  }

  const origCoordsEl = dragCard.querySelector<HTMLSpanElement>(".orig-coords");
  if (origCoordsEl) origCoordsEl.textContent = `(${Math.round(orig.left)}, ${Math.round(orig.top)})`;

  const targetCoordsEl = dragCard.querySelector<HTMLSpanElement>(".target-coords");
  if (targetCoordsEl) targetCoordsEl.textContent = `(${targetLeft}, ${targetTop})`;

  const deltaCoordsEl = dragCard.querySelector<HTMLSpanElement>(".delta-coords");
  if (deltaCoordsEl) deltaCoordsEl.textContent = `${signX}${roundDx}px, ${signY}${roundDy}px`;

  // Layout context hint
  const hintEl = dragCard.querySelector<HTMLSpanElement>(".lasso-drag-context-text");
  if (hintEl) {
    const parentDesc = parent ? `<${parent.tagName.toLowerCase()}>` : "document";
    const layoutType = parentComputed?.display || "standard";
    const flexDir = parentComputed?.display === "flex" ? ` (${parentComputed.flexDirection})` : "";
    hintEl.textContent = `Parent: ${parentDesc} · Layout: ${layoutType}${flexDir} · Position: ${computed.position}`;
  }

  // Pre-fill prompt with explicit coordinates and layout instructions
  if (cardPromptInput) {
    cardPromptInput.value = `Move this element to the exact dropped position (offset dx: ${signX}${roundDx}px, dy: ${signY}${roundDy}px; target coordinates: left ${targetLeft}px, top ${targetTop}px). Modify the source code (CSS/Tailwind classes, flex/grid alignment, margin offsets, or coordinates) so it is placed accurately here.`;
  }

  // Reset status
  if (cardStatusWrap) cardStatusWrap.style.display = "none";
  if (cardApplyBtn) {
    cardApplyBtn.disabled = false;
    cardApplyBtn.classList.remove("loading");
    const span = cardApplyBtn.querySelector("span");
    if (span) span.textContent = "Apply Reposition";
  }

  // Position Card nicely near dropped element
  positionDragCard(targetLeft, targetTop, orig.width, orig.height);
  dragCard.style.display = "block";
  requestAnimationFrame(() => cardPromptInput?.focus());
}

function positionDragCard(left: number, top: number, width: number, height: number) {
  if (!dragCard) return;
  const cardWidth = 380;
  const cardHeight = 300;
  const gap = 16;

  let posLeft = left + width + gap;
  let posTop = top;

  if (posLeft + cardWidth > window.innerWidth - 16) {
    posLeft = left - cardWidth - gap;
  }
  if (posLeft < 16) {
    posLeft = Math.max(16, left);
    posTop = top + height + gap;
  }
  if (posTop + cardHeight > window.innerHeight - 16) {
    posTop = Math.max(16, window.innerHeight - cardHeight - 16);
  }

  posLeft = Math.max(16, Math.min(posLeft, window.innerWidth - cardWidth - 16));
  posTop = Math.max(16, Math.min(posTop, window.innerHeight - cardHeight - 16));

  dragCard.style.left = `${posLeft}px`;
  dragCard.style.top = `${posTop}px`;
}

export function resetDrag(restoreStyles = true) {
  if (dragClone) {
    dragClone.remove();
    dragClone = null;
  }
  resumeAnimations();

  if (state.activeDragTarget && restoreStyles) {
    state.activeDragTarget.style.transform = originalTransform;
    state.activeDragTarget.style.transition = originalTransition;
    state.activeDragTarget.style.zIndex = originalZIndex;
    state.activeDragTarget.style.opacity = originalOpacity;
    state.activeDragTarget.style.removeProperty("animation-play-state");
  }

  state.activeDragTarget = null;
  state.dragContext = null;
  originalRect = null;
  isDragging = false;

  if (dragHoverBox) dragHoverBox.style.display = "none";
  if (dragGhostBox) dragGhostBox.style.display = "none";
  if (dragHudBadge) dragHudBadge.style.display = "none";
  if (dragGuideSvg) dragGuideSvg.style.display = "none";
  if (dragCard) dragCard.style.display = "none";
}

async function handleApplyReposition() {
  const el = state.activeDragTarget;
  const dragCtx = state.dragContext;
  if (!el || !dragCtx || !cardPromptInput || !cardApplyBtn) return;

  const instruction = cardPromptInput.value.trim();
  if (!instruction) {
    cardPromptInput.focus();
    return;
  }

  if (!state.bridgeSocket || state.bridgeSocket.readyState !== WebSocket.OPEN) {
    setDragCardStatus("error", "The Lasso bridge is not connected. Start Lasso with your dev server.");
    return;
  }

  setDragCardStatus("working", "Thinking about repositioning…");
  cardApplyBtn.disabled = true;
  cardApplyBtn.classList.add("loading");
  const btnSpan = cardApplyBtn.querySelector("span");
  if (btnSpan) btnSpan.textContent = "AI Working…";

  // Capture context
  const screenshots = await captureScreenshots(el);
  const computed = window.getComputedStyle(el);
  const attributes = Object.fromEntries(Array.from(el.attributes).map((a) => [a.name, a.value]));

  const payload = {
    type: "edit",
    instruction,
    messages: [],
    model: state.selectedModel.id,
    provider: state.selectedModel.provider,
    context: {
      selectionId: `drag-${Date.now().toString(36)}`,
      position: {
        top: dragCtx.targetRect.top,
        left: dragCtx.targetRect.left,
        width: dragCtx.targetRect.width,
        height: dragCtx.targetRect.height,
        scrollX: window.scrollX,
        scrollY: window.scrollY,
      },
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
        url: window.location.href,
        title: document.title,
      },
      drag: dragCtx,
      styles: {
        display: computed.display,
        position: computed.position,
        top: computed.top,
        left: computed.left,
        marginTop: computed.marginTop,
        marginLeft: computed.marginLeft,
        marginRight: computed.marginRight,
        marginBottom: computed.marginBottom,
        transform: computed.transform,
      },
      attributes,
      screenshots,
    },
    element: {
      tag: el.tagName.toLowerCase(),
      group: getElementGroup(el),
      label: getElementLabel(el),
      html: el.outerHTML.slice(0, 6000),
      sourceHint: el.getAttribute("data-source") || el.getAttribute("data-lasso-source") || getSourceHint(el),
    },
  };

  state.bridgeSocket.send(JSON.stringify(payload));
}

export function setDragCardStatus(status: "thinking" | "working" | "review" | "error" | "stopped", message: string) {
  if (!cardStatusWrap || !cardStatusMessage || !cardStatusBadge) return;
  cardStatusWrap.style.display = status === "review" || status === "stopped" ? "none" : "block";
  cardStatusMessage.textContent = message;
  cardStatusBadge.textContent = status === "thinking" ? "thinking" : status === "working" ? "executing" : status;
  cardStatusBadge.className = `lasso-agent-status-badge ${status}`;

  if (status === "review" || status === "error" || status === "stopped") {
    if (cardApplyBtn) {
      cardApplyBtn.disabled = false;
      cardApplyBtn.classList.remove("loading");
      const span = cardApplyBtn.querySelector("span");
      if (span) span.textContent = status === "error" ? "Retry Reposition" : "Apply Reposition";
    }
  }
}
