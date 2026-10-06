import html2canvas from "html2canvas";
import { state } from "../state";
import type { PageContext } from "../types";

export async function capturePageContext(): Promise<PageContext> {
  const url = window.location.href;
  const route = window.location.pathname + window.location.search;
  const title = document.title || "Untitled Page";
  const doc = document.documentElement;

  const viewport = {
    width: window.innerWidth,
    height: window.innerHeight,
    scrollX: window.scrollX || window.pageXOffset || 0,
    scrollY: window.scrollY || window.pageYOffset || 0,
    scrollHeight: doc.scrollHeight,
  };

  // Extract headings (ignoring #lasso-root)
  const headings: Array<{ level: number; text: string }> = [];
  const headingEls = document.querySelectorAll("h1, h2, h3, h4");
  for (const el of headingEls) {
    if (el.closest("#lasso-root")) continue;
    const text = (el.textContent || "").trim().replace(/\s+/g, " ");
    if (text) {
      const level = parseInt(el.tagName.replace(/h/i, ""), 10) || 2;
      headings.push({ level, text: text.slice(0, 120) });
      if (headings.length >= 15) break;
    }
  }

  // Extract sections & landmarks across the entire page
  const sections: Array<{ name: string; textPreview: string }> = [];
  const sectionEls = document.querySelectorAll(
    "header, nav, main, section, article, footer, [role='banner'], [role='main'], [role='navigation'], [id*='hero'], [class*='hero'], [id*='feature'], [class*='feature'], [id*='pricing'], [class*='pricing'], [id*='testimonial'], [class*='testimonial']"
  );
  for (const el of sectionEls) {
    if (el.closest("#lasso-root")) continue;
    const tag = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : "";
    const ariaLabel = el.getAttribute("aria-label");
    const name = ariaLabel ? `${tag} (${ariaLabel})` : id ? `${tag}${id}` : tag;
    const textPreview = (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 160);
    if (textPreview && !sections.some((s) => s.textPreview === textPreview)) {
      sections.push({ name, textPreview });
      if (sections.length >= 12) break;
    }
  }

  // Extract action buttons
  const buttons: string[] = [];
  const buttonEls = document.querySelectorAll("button, a[role='button'], input[type='button'], input[type='submit'], a.btn, a[class*='button']");
  for (const el of buttonEls) {
    if (el.closest("#lasso-root")) continue;
    const text = (el.textContent || (el as HTMLInputElement).value || "").trim().replace(/\s+/g, " ");
    if (text && !buttons.includes(text)) {
      buttons.push(text.slice(0, 50));
      if (buttons.length >= 12) break;
    }
  }

  // Extract navigation links
  const links: string[] = [];
  const linkEls = document.querySelectorAll("nav a, header a, a.nav-link");
  for (const el of linkEls) {
    if (el.closest("#lasso-root")) continue;
    const text = (el.textContent || "").trim().replace(/\s+/g, " ");
    if (text && !links.includes(text) && !buttons.includes(text)) {
      links.push(text.slice(0, 40));
      if (links.length >= 10) break;
    }
  }

  // Extract form inputs
  const inputs: Array<{ placeholder?: string; type: string }> = [];
  const inputEls = document.querySelectorAll("input:not([type='hidden']), textarea, select");
  for (const el of inputEls) {
    if (el.closest("#lasso-root")) continue;
    const type = (el.getAttribute("type") || el.tagName.toLowerCase()).slice(0, 20);
    const placeholder = el.getAttribute("placeholder")?.slice(0, 60);
    inputs.push({ type, placeholder });
    if (inputs.length >= 8) break;
  }

  // Extract visible body text snippet (ignoring overlay)
  const bodyClone = document.body ? document.body.cloneNode(true) as HTMLElement : null;
  if (bodyClone) {
    const lassoRoot = bodyClone.querySelector("#lasso-root");
    if (lassoRoot) lassoRoot.remove();
  }
  const bodyText = (bodyClone?.innerText || document.body?.innerText || "")
    .replace(/\s+/g, " ")
    .slice(0, 1500);

  // Selected element if any
  let selectedElement: PageContext["selectedElement"] = undefined;
  if (state.selected && !state.selected.closest("#lasso-root")) {
    const el = state.selected;
    selectedElement = {
      tag: el.tagName.toLowerCase(),
      id: el.id || undefined,
      classes: Array.from(el.classList),
      text: (el.textContent || "").trim().slice(0, 100),
      source: el.getAttribute("data-source") || el.getAttribute("data-lasso-source") || undefined,
    };
  }

  // Visual snapshot via html2canvas (timeout 1200ms)
  let screenshot: string | undefined = undefined;
  try {
    const options = {
      backgroundColor: null,
      useCORS: true,
      logging: false,
      scale: 0.6,
      ignoreElements: (node: Element) => node.id === "lasso-root" || Boolean(node.closest?.("#lasso-root")),
    };
    const canvasPromise = html2canvas(document.body, options);
    const timeoutPromise = new Promise<null>((r) => setTimeout(() => r(null), 1200));
    const canvas = await Promise.race([canvasPromise, timeoutPromise]);
    if (canvas && typeof (canvas as any).toDataURL === "function") {
      screenshot = (canvas as HTMLCanvasElement).toDataURL("image/jpeg", 0.65);
    }
  } catch (err) {
    console.warn("[lasso] visual snapshot failed:", err);
  }

  return {
    url,
    route,
    title,
    viewport,
    screenshot,
    runtimeErrors: [...state.runtimeErrors],
    domSummary: {
      headings,
      sections,
      buttons,
      links,
      inputs,
      visibleTextSnippet: bodyText,
    },
    selectedElement,
  };
}

export function scrollPage(direction: "top" | "bottom" | number): void {
  if (direction === "top") {
    window.scrollTo({ top: 0, behavior: "smooth" });
  } else if (direction === "bottom") {
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
  } else {
    window.scrollBy({ top: direction, behavior: "smooth" });
  }
}
