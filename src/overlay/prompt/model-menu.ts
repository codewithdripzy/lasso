import anthropicIcon from "@iconify-icons/logos/anthropic-icon";
import googleIcon from "@iconify-icons/logos/google-icon";
import openaiIcon from "@iconify-icons/logos/openai-icon";
import nvidiaIcon from "@iconify-icons/logos/nvidia";
import terminalIcon from "@iconify-icons/logos/terminal";
import antigravityIcon from "@iconify-icons/logos/antigravity";
import claudeIcon from "@iconify-icons/logos/claude-icon";
import codexIcon from "@iconify-icons/logos/codex";
import cursorIcon from "@iconify-icons/logos/cursor-icon";
import opencodeIcon from "@iconify-icons/logos/opencode-icon";
import { state } from "../state";
import type { ModelOption } from "../types";

const openCliGroups = new Set<string>();
let cliGroupsInitialized = false;

const providerLabels: Record<ModelOption["provider"], string> = {
  google: "Google",
  openai: "OpenAI",
  anthropic: "Anthropic",
  nvidia: "NVIDIA",
  ollama: "Local",
  cli: "CLI",
  claude_code: "Claude Code",
  opencode: "OpenCode",
  codex_cli: "Codex",
  cursor: "Cursor",
  antigravity: "Antigravity",
};

const providerIcons = {
  google: googleIcon,
  openai: openaiIcon,
  anthropic: anthropicIcon,
  nvidia: nvidiaIcon,
  ollama: terminalIcon,
  cli: terminalIcon,
  claude_code: claudeIcon,
  opencode: opencodeIcon,
  codex_cli: codexIcon,
  cursor: cursorIcon,
  antigravity: antigravityIcon,
};

export function providerIcon(provider: ModelOption["provider"], active = false): string {
  const icon = providerIcons[provider];
  if (!icon) {
    return `<span class="${active ? "lasso-model-active-icon" : "lasso-model-item-icon"} provider-${provider}" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" focusable="false"><circle cx="12" cy="12" r="9" fill="currentColor" opacity=".16"/><circle cx="12" cy="9" r="3" fill="currentColor"/><path d="M6.5 18c.9-2.4 2.7-3.6 5.5-3.6s4.6 1.2 5.5 3.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></span>`;
  }
  return `<span class="${active ? "lasso-model-active-icon" : "lasso-model-item-icon"} provider-${provider}" aria-hidden="true"><svg viewBox="0 0 ${icon.width} ${icon.height}" xmlns="http://www.w3.org/2000/svg" focusable="false">${icon.body}</svg></span>`;
}

const LOCAL_AGENT_PROVIDERS = new Set(["cli", "claude_code", "opencode", "codex_cli", "cursor", "antigravity"]);

export function buildModelMenuContent(menuEl: HTMLElement, onRefresh: () => void): void {
  const filters = document.createElement("div");
  filters.className = "lasso-model-filters";
  const allProviders = Array.from(new Set(state.MODELS.map((m) => m.provider)));
  // Collapse local-agent providers into a single "CLI" filter chip.
  const hasLocal = allProviders.some((p) => LOCAL_AGENT_PROVIDERS.has(p));
  const hostedProviders = allProviders.filter((p) => !LOCAL_AGENT_PROVIDERS.has(p));
  const providers = ["all", ...hostedProviders, ...(hasLocal ? ["cli"] : [])];

  for (const provider of providers) {
    const filter = document.createElement("button");
    filter.type = "button";
    filter.className = `lasso-model-filter${state.modelFilter === provider ? " active" : ""}`;
    filter.dataset.providerFilter = provider;
    filter.textContent = provider === "all" ? "All" : providerLabels[provider as ModelOption["provider"]] || provider;
    filters.appendChild(filter);
  }

  const children: Node[] = [filters];
  // Map the "cli" filter chip back to all local-agent providers.
  const visibleProviders = state.modelFilter === "all" ? providers.slice(1) : state.modelFilter === "cli" ? ["cli"] : [state.modelFilter];

  for (const provider of visibleProviders) {
    const isCliGroup = provider === "cli";
    const models = isCliGroup ? state.MODELS.filter((m) => LOCAL_AGENT_PROVIDERS.has(m.provider)) : state.MODELS.filter((m) => m.provider === provider);
    if (!models.length) continue;
    const group = document.createElement("div");
    group.className = "lasso-model-group";
    group.textContent = isCliGroup ? "CLI" : providerLabels[provider as ModelOption["provider"]] || provider;
    children.push(group);

    if (isCliGroup) {
      // Subgroup by local agent provider.
      const cliGroups = new Map<string, ModelOption[]>();
      for (const model of models) {
        const key = model.provider;
        const groupModels = cliGroups.get(key) || [];
        groupModels.push(model);
        cliGroups.set(key, groupModels);
      }
      const selectedCliGroup = state.selectedModel.provider;
      if (!cliGroupsInitialized && selectedCliGroup && LOCAL_AGENT_PROVIDERS.has(selectedCliGroup)) {
        openCliGroups.add(selectedCliGroup);
      }
      cliGroupsInitialized = true;
      for (const [cliKey, cliModels] of cliGroups) {
        const subGroup = document.createElement("div");
        subGroup.className = "lasso-cli-subgroup";
        const subHeader = document.createElement("button");
        subHeader.type = "button";
        subHeader.className = "lasso-cli-subgroup-header";
        subHeader.setAttribute("aria-expanded", String(openCliGroups.has(cliKey)));
        subHeader.innerHTML = `<span class="lasso-cli-subgroup-brand">${providerIcon(cliKey as ModelOption["provider"])}<span>${providerLabels[cliKey as ModelOption["provider"]] || cliKey}</span></span><svg class="lasso-model-chevron lasso-cli-subgroup-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>`;
        const subItems = document.createElement("div");
        subItems.className = "lasso-cli-subgroup-items";
        subItems.hidden = !openCliGroups.has(cliKey);
        subHeader.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (openCliGroups.has(cliKey)) openCliGroups.delete(cliKey);
          else openCliGroups.add(cliKey);
          onRefresh();
        });
        subGroup.append(subHeader, subItems);
        children.push(subGroup);
        for (const model of cliModels) subItems.appendChild(modelItem(model));
      }
      continue;
    }

    for (const model of models) {
      children.push(modelItem(model));
    }
  }

  menuEl.replaceChildren(...children);
  for (const item of menuEl.querySelectorAll<HTMLButtonElement>(".lasso-prompt-model-item")) {
    item.classList.toggle("selected", item.dataset.model === state.selectedModel.id);
  }
}

function cliLabel(key: string): string {
  if (key === "claude-code") return "Claude Code";
  if (key === "codex") return "Codex";
  if (key === "opencode") return "OpenCode";
  if (key === "cursor") return "Cursor";
  if (key === "antigravity") return "Antigravity";
  return key;
}

function modelItem(model: ModelOption): HTMLButtonElement {
  const item = document.createElement("button");
  item.type = "button";
  item.className = "lasso-prompt-model-item";
  item.dataset.model = model.id;

  if (model.locked) {
    item.classList.add("locked");
    item.disabled = true;
    item.setAttribute("aria-disabled", "true");
    item.setAttribute("title", model.lockedReason || "This model is locked");
    item.innerHTML = `${providerIcon(model.provider)}<span>${model.label}</span><svg class="lasso-prompt-model-lock" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
  } else {
    item.innerHTML = `${providerIcon(model.provider)}<span>${model.label}</span><svg class="lasso-prompt-model-check" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>`;
  }

  return item;
}
