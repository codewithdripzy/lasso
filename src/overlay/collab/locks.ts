import { state } from "../state";
import { getDOM } from "../dom";
import { elementKey, getElementLabel, getSourceHint } from "../toolbar/select";
import { collabEmit } from "./socket";
import { showActivity } from "./presence";
import type { CollabLock } from "../types";

export function indexLocks(locks: unknown[]) {
  state.lockMap.clear();
  for (const raw of locks) {
    const lock = raw as CollabLock;
    if (lock?.elementId) state.lockMap.set(lock.elementId, lock);
  }
}

export function updateLockChip() {
  const dom = getDOM();
  if (!state.selected) {
    dom.heldLockChip.hidden = true;
    return;
  }
  const key = elementKey(state.selected);
  const lock = state.lockMap.get(key);
  const mine = state.heldLockElements.has(key);

  if (lock) {
    dom.heldLockChip.hidden = false;
    dom.heldLockChip.classList.toggle("held", mine);
    dom.heldLockChip.classList.toggle("blocked", !mine);
    const label = mine ? "Locked by you" : `Locked · ${lock.locker?.name || "teammate"}`;
    dom.heldLockChip.innerHTML = `
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
      </svg>
      <span>${label}</span>
    `;
  } else {
    dom.heldLockChip.hidden = true;
  }
}

export function acquireOwnership(el: Element): Promise<boolean> {
  return new Promise((resolve) => {
    if (!state.collabSocket?.connected || !state.collabJoined || !state.collabProjectId) {
      resolve(true);
      return;
    }
    const key = elementKey(el);
    collabEmit(
      "lock:acquire",
      {
        sessionId: state.collabProjectId,
        elementId: key,
        elementLabel: getElementLabel(el),
        sourceHint: el.getAttribute("data-source") || getSourceHint(el) || "",
        action: "editing",
      },
      (res) => {
        if (res.ok && res.lock) {
          state.heldLockElements.add(key);
          state.lockMap.set(key, res.lock as CollabLock);
          updateLockChip();
          resolve(true);
          return;
        }
        if (res.lock) {
          const lock = res.lock as CollabLock;
          state.lockMap.set(key, lock);
          updateLockChip();
          showActivity(res.error || `Locked by ${lock.locker?.name || "a teammate"}`, "#f28b82");
          resolve(false);
          return;
        }
        resolve(true);
      }
    );
  });
}

export function releaseHeldLock(elementId?: string) {
  const elementIds = elementId ? [elementId] : Array.from(state.heldLockElements);
  for (const id of elementIds) {
    if (!state.heldLockElements.delete(id)) continue;
    state.lockMap.delete(id);
    if (state.collabSocket?.connected && state.collabJoined) {
      collabEmit("lock:release", { sessionId: state.collabProjectId, elementId: id });
    }
  }
  updateLockChip();
}
