import { File01Icon, FileCodeIcon } from "@hugeicons/core-free-icons";

type HugeiconsSvgNode = readonly (readonly [string, Readonly<Record<string, string | number>>])[];

export function getPathBasename(filePath: string): string {
  return filePath.replace(/\\/g, "/").split("/").filter(Boolean).pop() || filePath;
}

export function getFileExtension(filePath: string): { label: string; className: string } {
  const match = getPathBasename(filePath).match(/\.([^.]+)$/);
  const extension = (match?.[1] || "file").toLowerCase();
  const className = /^(tsx?|jsx?|mjs|cjs)$/.test(extension) ? "code" : extension === "json" ? "json" : /^(css|scss|sass)$/.test(extension) ? "style" : /^(md|mdx)$/.test(extension) ? "docs" : "generic";
  return { label: extension === "file" ? "FILE" : extension.slice(0, 4).toUpperCase(), className };
}

/** Render the small, safe Markdown subset shared by both agent conversations. */
export function formatMessageText(text: string): string {
  const links: string[] = [];
  const withLinkTokens = text.replace(/\[([^\]]+)\]\\?\s*\\?\(([^)]+)\\?\)/g, (_match, rawLabel: string, rawTarget: string) => {
    const label = rawLabel.trim();
    const target = rawTarget.trim();
    const chip = renderMessageLink(label, target);
    if (!chip) return `${label} (${target})`;
    const token = `LASSO_MESSAGE_LINK_${links.length}_TOKEN`;
    links.push(chip);
    return token;
  });

  let formatted = escapeHtml(withLinkTokens);
  formatted = formatted.replace(/`([^`]+)`/g, "<code>$1</code>");
  formatted = formatted.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  formatted = formatted.replace(/LASSO_MESSAGE_LINK_(\d+)_TOKEN/g, (_token, index: string) => links[Number(index)] || "");
  formatted = formatted.replace(/\n\n/g, "</p><p>");
  formatted = formatted.replace(/\n/g, "<br/>");
  return `<p>${formatted}</p>`;
}

function renderMessageLink(label: string, target: string): string | null {
  let href = "";
  let favicon = "";
  let displayName = label;
  let detail = "";
  let tooltip = target;
  let extension = getFileExtension(label);
  let icon = File01Icon;

  try {
    const parsed = new URL(target);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      href = parsed.href;
      displayName = label || getPathBasename(parsed.pathname) || parsed.hostname;
      detail = parsed.hostname;
      favicon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(parsed.hostname)}&sz=32`;
    } else if (parsed.protocol === "file:") {
      const filePath = decodeURIComponent(parsed.pathname);
      href = `vscode://file${encodeURI(filePath)}`;
      displayName = getPathBasename(filePath);
      tooltip = filePath;
      extension = getFileExtension(filePath);
      icon = FileCodeIcon;
    } else {
      return null;
    }
  } catch {
    const isLocalPath = target.startsWith("/") || target.startsWith("~/") || /^[a-zA-Z]:[\\/]/.test(target);
    const looksLikeFile = /\.[a-zA-Z0-9]{1,10}(?:[?#].*)?$/.test(target) || /\.[a-zA-Z0-9]{1,10}$/.test(label);
    if (!isLocalPath && !looksLikeFile) return null;
    const normalizedPath = target.startsWith("~/") ? target : target.replace(/\\/g, "/");
    href = `vscode://file/${encodeURI(normalizedPath.replace(/^\/+/, ""))}`;
    displayName = getPathBasename(target) || getPathBasename(label) || label;
    tooltip = normalizedPath;
    extension = getFileExtension(target);
    icon = FileCodeIcon;
  }

  const iconSvg = renderHugeIcon(icon);
  const fallbackIcon = `<span class="lasso-message-link-file-icon ${extension.className}"${favicon ? " hidden" : ""} aria-hidden="true">${iconSvg}<small>${escapeHtml(extension.label)}</small></span>`;
  const iconHtml = favicon ? `<img class="lasso-message-link-favicon" src="${escapeHtml(favicon)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.hidden=true;this.nextElementSibling.hidden=false" />${fallbackIcon}` : fallbackIcon;
  return `<a class="lasso-message-link-chip" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(detail || tooltip)}" aria-label="${escapeHtml(`${displayName}: ${detail || tooltip}`)}">${iconHtml}<span class="lasso-message-link-copy"><strong>${escapeHtml(displayName)}</strong>${detail ? `<small>${escapeHtml(detail)}</small>` : ""}</span></a>`;
}

function renderHugeIcon(icon: HugeiconsSvgNode): string {
  const nodes = icon
    .map(([tag, attributes]) => {
      const attrs = Object.entries(attributes)
        .filter(([key]) => key !== "key")
        .map(([key, value]) => `${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}="${escapeHtml(String(value))}"`)
        .join(" ");
      return `<${tag} ${attrs} />`;
    })
    .join("");
  return `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${nodes}</svg>`;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
