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
  const mine = state.heldLockElement === key;

  if (lock) {
    dom.heldLockChip.hidden = false;
    dom.heldLockChip.classList.toggle("held", mine);
    dom.heldLockChip.classList.toggle("blocked", !mine);
    dom.heldLockChip.textContent = mine
      ? "Locked by you"
      : `Locked by ${lock.locker?.name || "a teammate"}`;
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
          state.heldLockElement = key;
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

export function releaseHeldLock() {
  if (!state.heldLockElement) return;
  const elementId = state.heldLockElement;
  state.heldLockElement = "";
  updateLockChip();
  if (state.collabSocket?.connected && state.collabJoined) {
    collabEmit("lock:release", { sessionId: state.collabProjectId, elementId });
  }
}
