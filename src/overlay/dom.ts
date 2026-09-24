import { buildStyles } from "./styles";

export class OverlayDOM {
  root: HTMLDivElement;
  shadow: ShadowRoot;

  // Visual highlight boxes
  hoverBox: HTMLDivElement;
  selectedBox: HTMLDivElement;
  label: HTMLDivElement;
  heldLockChip: HTMLDivElement;

  // Remote & Spotlight
  remoteLayer: HTMLDivElement;
  spotlightBox: HTMLDivElement;
  spotlightChip: HTMLDivElement;
  activityStrip: HTMLDivElement;

  // Comment pins container
  commentPins: HTMLDivElement;

  // Drag-and-drop layer container
  dragLayer: HTMLDivElement;

  constructor() {
    this.root = document.createElement("div");
    this.root.id = "lasso-root";

    // Isolate host element completely from host application CSS
    const hostStyles: Record<string, string> = {
      all: "initial",
      display: "block",
      position: "fixed",
      inset: "0",
      width: "100vw",
      height: "100vh",
      zIndex: "2147483647",
      pointerEvents: "none",
      isolation: "isolate",
      fontFamily: '"Google Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      lineHeight: "normal",
      color: "#f8f9fc",
    };

    for (const [prop, val] of Object.entries(hostStyles)) {
      this.root.style.setProperty(
        prop.replace(/[A-Z]/g, (l) => `-${l.toLowerCase()}`),
        val,
        "important"
      );
    }

    document.documentElement.appendChild(this.root);

    // Open shadow DOM
    this.shadow = this.root.attachShadow({ mode: "open" });

    // Stylesheet
    const styleEl = document.createElement("style");
    styleEl.textContent = buildStyles();
    this.shadow.appendChild(styleEl);

    // Visual layers
    this.hoverBox = document.createElement("div");
    this.hoverBox.className = "lasso-box hover";

    this.selectedBox = document.createElement("div");
    this.selectedBox.className = "lasso-box selected";

    this.label = document.createElement("div");
    this.label.className = "lasso-label";

    this.heldLockChip = document.createElement("div");
    this.heldLockChip.className = "lasso-lock-chip";
    this.heldLockChip.hidden = true;
    this.selectedBox.appendChild(this.heldLockChip);

    this.remoteLayer = document.createElement("div");
    this.remoteLayer.className = "lasso-remote-layer";

    this.spotlightBox = document.createElement("div");
    this.spotlightBox.className = "lasso-spotlight";
    this.spotlightChip = document.createElement("div");
    this.spotlightChip.className = "lasso-spotlight-chip";
    this.spotlightBox.appendChild(this.spotlightChip);

    this.activityStrip = document.createElement("div");
    this.activityStrip.className = "lasso-activity";

    this.commentPins = document.createElement("div");
    this.commentPins.className = "lasso-comment-pins";

    this.dragLayer = document.createElement("div");
    this.dragLayer.className = "lasso-drag-layer";

    this.shadow.append(
      this.remoteLayer,
      this.spotlightBox,
      this.hoverBox,
      this.selectedBox,
      this.label,
      this.activityStrip,
      this.commentPins,
      this.dragLayer
    );
  }

  isLassoElement(el: Element | null): boolean {
    if (!el) return false;
    return (
      el === this.root ||
      this.root.contains(el) ||
      this.shadow.contains(el) ||
      el.getRootNode() === this.shadow
    );
  }
}

let domInstance: OverlayDOM | null = null;

export function getDOM(): OverlayDOM {
  if (!domInstance) {
    domInstance = new OverlayDOM();
  }
  return domInstance;
}
