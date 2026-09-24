import { state, userNameColor, initials } from "../state";
import { getDOM } from "../dom";
import { collabEmit } from "./socket";
import type { CollabUser } from "../types";

export function isVisible(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && getComputedStyle(el).visibility !== "hidden";
}

export function showActivity(text: string, color = "#6ea0ff") {
  const dom = getDOM();
  dom.activityStrip.innerHTML = "";
  const dot = document.createElement("span");
  dot.className = "lasso-activity-dot";
  dot.style.setProperty("--lc", color);
  const label = document.createElement("span");
  label.textContent = text;
  dom.activityStrip.append(dot, label);
  dom.activityStrip.classList.add("visible");
  if (state.activityTimer) window.clearTimeout(state.activityTimer);
  state.activityTimer = window.setTimeout(() => dom.activityStrip.classList.remove("visible"), 3800);
}

export function spotlightFor(by: { name: string; id?: string }, el: Element | null, labelText: string) {
  const dom = getDOM();
  const target = el || state.selected || null;
  if (!target) return;
  const rect = target.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;

  dom.spotlightBox.style.left = `${rect.left}px`;
  dom.spotlightBox.style.top = `${rect.top}px`;
  dom.spotlightBox.style.width = `${rect.width}px`;
  dom.spotlightBox.style.height = `${rect.height}px`;

  dom.spotlightChip.innerHTML = "";
  const dot = document.createElement("span");
  dot.style.flexShrink = "0";
  dot.style.width = "8px";
  dot.style.height = "8px";
  dot.style.borderRadius = "50%";
  dot.style.background = userNameColor(by.id || by.name);

  const text = document.createElement("span");
  text.textContent = `${by.name} → ${labelText || target.tagName.toLowerCase()}`;
  dom.spotlightChip.append(dot, text);

  dom.spotlightBox.classList.add("visible");
  if (state.spotlightTimer) window.clearTimeout(state.spotlightTimer);
  state.spotlightTimer = window.setTimeout(() => dom.spotlightBox.classList.remove("visible"), 2800);
}

export function applyPresence(users: unknown[]) {
  state.presenceUsers.clear();
  for (const raw of users) {
    const user = raw as CollabUser;
    state.presenceUsers.set(user.socketId, {
      socketId: user.socketId,
      userId: user.userId,
      name: user.name,
      photo: user.photo,
      state: user.state === "away" ? "away" : "online",
      selection: user.selection || null,
      cursor: user.cursor || null,
      activity: user.activity || null,
      color: userNameColor(user.userId || user.socketId),
    });
  }
  renderPresence();
  renderRemoteBoxes();
}

export function renderPresence() {
  const dom = getDOM();
  const avatarsEl = dom.shadow.querySelector<HTMLDivElement>(".lasso-presence-avatars");
  const countEl = dom.shadow.querySelector<HTMLSpanElement>(".lasso-presence-count");
  if (!avatarsEl || !countEl) return;

  avatarsEl.innerHTML = "";
  const offline = Boolean(state.collabProjectId && !state.collabJoined);
  const others = [...state.presenceUsers.values()].filter(
    (user) => user.socketId !== state.collabSocket?.id
  );

  for (const user of others.slice(0, 6)) {
    const av = document.createElement("button");
    av.type = "button";
    av.className =
      "lasso-avatar" +
      (user.state === "away" ? " away" : "") +
      (state.spotlightUserId === user.userId ? " spotlit" : "");
    av.style.background = user.color;
    av.style.setProperty("--ac", user.color);
    av.title = `${user.name} (${user.state})`;

    const dot = document.createElement("span");
    dot.className = "lasso-avatar-dot";

    if (user.photo) {
      const img = document.createElement("img");
      img.src = user.photo;
      img.alt = user.name;
      img.style.width = "100%";
      img.style.height = "100%";
      img.style.borderRadius = "50%";
      av.appendChild(img);
    } else {
      av.textContent = initials(user.name);
    }
    av.appendChild(dot);

    av.addEventListener("click", () => {
      if (state.spotlightUserId === user.userId) {
        state.spotlightUserId = null;
        renderPresence();
        dom.spotlightBox.classList.remove("visible");
        return;
      }
      state.spotlightUserId = user.userId;
      renderPresence();

      const sel = user.selection;
      const el = sel?.elementId ? state.elementRegistry.get(sel.elementId) || null : null;
      spotlightFor(user, el, sel?.label || "");

      if (state.collabSocket?.connected && state.collabProjectId && sel?.elementId) {
        collabEmit("collab:spotlight", {
          sessionId: state.collabProjectId,
          elementId: sel.elementId,
          label: sel.label || "",
        });
      }
    });

    avatarsEl.appendChild(av);
  }

  const presenceEl = dom.shadow.querySelector<HTMLDivElement>(".lasso-presence");
  if (presenceEl) {
    presenceEl.style.display = (others.length > 0 || offline) ? "flex" : "none";
  }

  if (offline) countEl.textContent = "· offline";
  else if (others.length > 6) countEl.textContent = `+${others.length - 6}`;
  else countEl.textContent = "";
}

export function renderRemoteBoxes() {
  const dom = getDOM();
  dom.remoteLayer.innerHTML = "";
  for (const user of state.presenceUsers.values()) {
    if (user.socketId === state.collabSocket?.id) continue;

    // Selection box
    const sel = user.selection;
    if (sel?.elementId) {
      const el = state.elementRegistry.get(sel.elementId);
      if (el && isVisible(el)) {
        const rect = el.getBoundingClientRect();
        const box = document.createElement("div");
        box.className = "lasso-remote-box";
        box.style.setProperty("--lc", user.color);
        box.style.left = `${rect.left}px`;
        box.style.top = `${rect.top}px`;
        box.style.width = `${rect.width}px`;
        box.style.height = `${rect.height}px`;
        const tag = document.createElement("div");
        tag.className = "lasso-remote-tag";
        tag.textContent = `${initials(user.name)}${sel.label ? ` · ${sel.label}` : ""}`;
        box.appendChild(tag);
        dom.remoteLayer.appendChild(box);
      }
    }

    // Cursor dot + name label
    if (user.cursor) {
      const cursor = document.createElement("div");
      cursor.className = "lasso-remote-cursor";
      cursor.style.setProperty("--lc", user.color);
      cursor.style.transform = `translate(${user.cursor.x}px, ${user.cursor.y}px)`;
      cursor.innerHTML = `
        <div class="lasso-remote-cursor-dot"></div>
        <div class="lasso-remote-cursor-label">${initials(user.name)} ${user.name.split(" ")[0]}</div>
      `;
      dom.remoteLayer.appendChild(cursor);
    }
  }
}
