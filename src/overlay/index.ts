import { state } from "./state";
import { getDOM } from "./dom";
import { buildToolbar, setCommentMode } from "./toolbar/toolbar";
import {
  setSelectMode,
  setHovered,
  updateHoverVisual,
  updateSelectedVisual,
  elementKey,
} from "./toolbar/select";
import { buildPinCompose, openPinCompose, closePinCompose, isPinComposeOpen } from "./comments/compose";
import { buildPinThread, closePinThread, isPinThreadOpen } from "./comments/thread";
import { renderCommentPins } from "./comments/pins";
import { buildGitPanel } from "./git/git";
import { buildTodoPanel } from "./todo/todo";
import { buildNotepadPanel } from "./notepad/notepad";
import {
  buildPrompt,
  openPromptForSelected,
  cancelPrompt,
  positionPrompt,
  captureScreenshots,
  isPromptOpen,
} from "./prompt/prompt";
import { connectBridge, initErrorListeners } from "./bridge/bridge";
import { initCollabPagehide, sendPresenceUpdate } from "./collab/socket";
import { renderRemoteBoxes } from "./collab/presence";
import { updateLockChip } from "./collab/locks";

console.log("[lasso] overlay initializing");

export function init() {
  // Prevent duplicate initialization
  if (document.getElementById("lasso-root")) {
    console.log("[lasso] already initialized");
    return;
  }

  const dom = getDOM();

  // Build UI modules
  buildToolbar();
  buildPinCompose();
  buildPinThread();
  buildGitPanel();
  buildTodoPanel();
  buildNotepadPanel();
  buildPrompt();

  // Connect local bridge & collab
  initErrorListeners();
  connectBridge();
  initCollabPagehide();

  // Keep overlays aligned on scroll & resize
  function updatePositions() {
    if (state.selectMode && state.hovered) {
      updateHoverVisual(state.hovered);
    }
    renderRemoteBoxes();
    if (state.commentThreads.size > 0) {
      renderCommentPins();
    }
    if (state.selected) {
      updateSelectedVisual();
      if (!state.promptDragged) {
        positionPrompt(state.selected);
      }
    }
  }

  window.addEventListener("scroll", updatePositions, true);
  window.addEventListener("resize", updatePositions);

  // Hover detection during selectMode (capture phase)
  document.addEventListener(
    "mousemove",
    (event) => {
      if (!state.selectMode) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (dom.isLassoElement(target)) return;
      setHovered(target);
    },
    true
  );

  // Global click handler (capture phase to intercept before host website)
  document.addEventListener(
    "click",
    (event) => {
      const target = event.target as Element | null;

      // 1. Comment mode click: drop pin at click coordinates
      if (state.commentMode) {
        if (target && dom.isLassoElement(target)) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        closePinThread();
        openPinCompose(event.clientX, event.clientY);
        return;
      }

      // 2. Select mode click: pick element
      if (!state.selectMode) return;
      if (!target || dom.isLassoElement(target)) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      state.selected = target;
      state.elementRegistry.set(elementKey(target), target);
      updateLockChip();
      sendPresenceUpdate({});

      state.promptDragged = false;
      state.lastInstruction = "";
      state.selectionId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      state.chatHistory = [];
      state.changesHistory = [];
      state.screenshotPromise = captureScreenshots(target);

      // Hide hover visual, show selected visual
      dom.hoverBox.style.display = "none";
      updateSelectedVisual();

      // Open floating prompt card
      openPromptForSelected(target);
    },
    true
  );

  // Keyboard shortcut listener (Escape to cancel)
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;

    if (isPinComposeOpen()) {
      closePinCompose();
      setCommentMode(false);
      return;
    }

    if (isPinThreadOpen()) {
      closePinThread();
      return;
    }

    if (isPromptOpen()) {
      cancelPrompt(true);
      return;
    }

    if (state.selectMode) {
      setSelectMode(false);
      return;
    }

    if (state.commentMode) {
      setCommentMode(false);
      return;
    }
  });

  // Initial state
  setSelectMode(false);
  console.log("[lasso] overlay ready");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
