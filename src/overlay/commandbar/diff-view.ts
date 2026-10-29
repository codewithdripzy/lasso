import { escapeHtml } from "./html";

type DiffLine = { kind: "add" | "delete" | "context"; text: string };

/** Compute an LCS line diff, trimming identical edges and bounding large files. */
function getLineDiff(oldText: string, newText: string): { additions: number; deletions: number; lines: DiffLine[] } {
  const oldLines = oldText ? oldText.replace(/\r\n/g, "\n").split("\n") : [];
  const newLines = newText ? newText.replace(/\r\n/g, "\n").split("\n") : [];
  let prefix = 0;
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) prefix++;
  let suffix = 0;
  while (suffix < oldLines.length - prefix && suffix < newLines.length - prefix && oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]) suffix++;

  const oldMiddle = oldLines.slice(prefix, oldLines.length - suffix);
  const newMiddle = newLines.slice(prefix, newLines.length - suffix);
  let changed: DiffLine[];
  if (oldMiddle.length * newMiddle.length > 1_000_000) {
    changed = [...oldMiddle.map((text) => ({ kind: "delete" as const, text })), ...newMiddle.map((text) => ({ kind: "add" as const, text }))];
  } else {
    const lcs = Array.from({ length: oldMiddle.length + 1 }, () => new Uint32Array(newMiddle.length + 1));
    for (let i = oldMiddle.length - 1; i >= 0; i--) {
      for (let j = newMiddle.length - 1; j >= 0; j--) {
        lcs[i][j] = oldMiddle[i] === newMiddle[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
      }
    }
    changed = [];
    let i = 0;
    let j = 0;
    while (i < oldMiddle.length && j < newMiddle.length) {
      if (oldMiddle[i] === newMiddle[j]) {
        changed.push({ kind: "context", text: oldMiddle[i++] });
        j++;
      } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
        changed.push({ kind: "delete", text: oldMiddle[i++] });
      } else {
        changed.push({ kind: "add", text: newMiddle[j++] });
      }
    }
    while (i < oldMiddle.length) changed.push({ kind: "delete", text: oldMiddle[i++] });
    while (j < newMiddle.length) changed.push({ kind: "add", text: newMiddle[j++] });
  }

  const lines: DiffLine[] = [...oldLines.slice(0, prefix).map((text) => ({ kind: "context" as const, text })), ...changed, ...oldLines.slice(oldLines.length - suffix).map((text) => ({ kind: "context" as const, text }))];
  return {
    additions: lines.filter((line) => line.kind === "add").length,
    deletions: lines.filter((line) => line.kind === "delete").length,
    lines,
  };
}

export function renderLineDiff(oldText: string, newText: string): string {
  const diff = getLineDiff(oldText, newText);
  const visible = diff.lines.length > 240 ? diff.lines.slice(0, 240) : diff.lines;
  if (!visible.length) return '<span class="lasso-diff-context">No textual changes</span>';
  const rendered = visible.map((line) => {
    const marker = line.kind === "add" ? "+" : line.kind === "delete" ? "−" : " ";
    const className = line.kind === "add" ? "lasso-diff-add" : line.kind === "delete" ? "lasso-diff-del" : "lasso-diff-context";
    return `<span class="${className}">${marker} ${escapeHtml(line.text) || " "}</span>`;
  });
  if (diff.lines.length > visible.length) rendered.push(`<span class="lasso-diff-context">… ${diff.lines.length - visible.length} more lines</span>`);
  return rendered.join("\n");
}
