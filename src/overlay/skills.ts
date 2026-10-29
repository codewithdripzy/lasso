import { state } from "./state";
import { SparklesIcon } from "@hugeicons/core-free-icons";
import type { SkillCatalogEntry } from "../core/interfaces/skills";

let catalog: SkillCatalogEntry[] = [];
const selected = new Set<string>();
const controls = new Set<HTMLElement>();
let requested = false;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

function renderSkillIcon(): string {
  const nodes = SparklesIcon.map(([tag, attributes]) => {
    const attrs = Object.entries(attributes).filter(([key]) => key !== "key").map(([key, value]) => `${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}="${String(value)}"`).join(" ");
    return `<${tag} ${attrs} />`;
  }).join("");
  return `<svg class="lasso-skills-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${nodes}</svg>`;
}

function requestCatalog(): void {
  if (state.bridgeSocket?.readyState !== WebSocket.OPEN) return;
  requested = true;
  state.bridgeSocket.send(JSON.stringify({ type: "get_skills" }));
}

export function receiveSkillCatalog(skills: SkillCatalogEntry[], error?: string): void {
  catalog = Array.isArray(skills) ? skills : [];
  for (const id of [...selected]) if (!catalog.some((skill) => skill.id === id)) selected.delete(id);
  controls.forEach(renderControl);
  if (error) console.warn("[lasso] skill upload failed:", error);
}

export function selectedSkillIds(): string[] {
  return [...selected];
}

export function createSkillsControl(className: string): string {
  if (!requested) requestCatalog();
  return `<div class="lasso-skills-control ${className}">
    <button class="lasso-skills-trigger" type="button" aria-label="Skills" title="Skills">${renderSkillIcon()}<span class="lasso-skills-count" hidden></span></button>
    <div class="lasso-skills-popover" hidden></div>
    <input class="lasso-skills-file" type="file" accept=".md,text/markdown,text/plain" hidden />
  </div>`;
}

function renderControl(root: HTMLElement): void {
  const count = root.querySelector<HTMLElement>(".lasso-skills-count");
  const popover = root.querySelector<HTMLElement>(".lasso-skills-popover");
  if (!count || !popover) return;
  count.textContent = String(selected.size);
  count.hidden = selected.size === 0;
  popover.innerHTML = `<div class="lasso-skills-heading"><strong>Skills</strong><span>Auto-discovered for this project</span></div>
    <div class="lasso-skills-list">${catalog.length ? catalog.map((skill) => {
      const builtin = skill.source === "builtin";
      const sourceLabel = builtin ? "Lasso built-in · Auto included for UI tasks" : skill.source === "project" ? "Project" : "Personal";
      return `<label class="lasso-skill-option" title="${escapeHtml(skill.description)}"><input type="checkbox" data-skill-id="${escapeHtml(skill.id)}" ${builtin || selected.has(skill.id) ? "checked" : ""} ${builtin ? "disabled" : ""}><span><strong>${escapeHtml(skill.name)}</strong><small>${sourceLabel} · ${escapeHtml(skill.description)}</small></span></label>`;
    }).join("") : `<p class="lasso-skills-empty">No skills found. Add a SKILL.md file or upload one.</p>`}</div>
    <button class="lasso-skills-upload" type="button">Upload a skill…</button>`;
}

export function bindSkillsControl(root: HTMLElement, onChange?: () => void): void {
  const trigger = root.querySelector<HTMLButtonElement>(".lasso-skills-trigger");
  const popover = root.querySelector<HTMLElement>(".lasso-skills-popover");
  const file = root.querySelector<HTMLInputElement>(".lasso-skills-file");
  if (!trigger || !popover || !file) return;
  controls.add(root);
  renderControl(root);
  root.addEventListener("click", (event) => event.stopPropagation());
  trigger.addEventListener("click", (event) => {
    event.stopPropagation();
    controls.forEach((control) => {
      const menu = control.querySelector<HTMLElement>(".lasso-skills-popover");
      if (menu && menu !== popover) menu.hidden = true;
    });
    popover.hidden = !popover.hidden;
    if (!catalog.length) requestCatalog();
  });
  popover.addEventListener("change", (event) => {
    const input = (event.target as HTMLElement).closest<HTMLInputElement>("input[data-skill-id]");
    if (!input) return;
    if (input.checked) selected.add(input.dataset.skillId!);
    else selected.delete(input.dataset.skillId!);
    renderControl(root);
    onChange?.();
  });
  popover.addEventListener("click", (event) => {
    const upload = (event.target as HTMLElement).closest<HTMLButtonElement>(".lasso-skills-upload");
    if (upload) file.click();
  });
  file.addEventListener("change", async () => {
    const selectedFile = file.files?.[0];
    if (!selectedFile || !state.bridgeSocket || state.bridgeSocket.readyState !== WebSocket.OPEN) return;
    try {
      const content = await selectedFile.text();
      state.bridgeSocket.send(JSON.stringify({ type: "upload_skill", name: selectedFile.name, content }));
    } catch (error) {
      console.warn("[lasso] could not read uploaded skill:", error);
    } finally {
      file.value = "";
    }
  });
  document.addEventListener("click", (event) => {
    if (!event.composedPath().includes(root)) popover.hidden = true;
  });
}
