import fs from "node:fs/promises";
import path from "node:path";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type SourceChange = {
  filePath: string;
  oldString: string;
  newString: string;
};

type AgentInput = {
  instruction: string;
  model: string;
  messages?: Array<{ role: string; content: string; createdAt?: string }>;
  changesHistory?: Array<{ summary: string; changes: SourceChange[]; createdAt?: string }>;
  context?: { selectionId?: string; position?: Record<string, number>; viewport?: Record<string, unknown>; styles?: Record<string, string>; attributes?: Record<string, string>; runtimeErrors?: string[]; screenshots?: { full?: string; element?: string }; drag?: Record<string, any> };
  element: { tag: string; group: string; label: string; html?: string; sourceHint?: string };
};

export type AgentConfig = {
  provider: "anthropic" | "openai" | "google" | "ollama" | "claude-code" | "codex" | "opencode";
  apiKey?: string;
  model?: string;
  baseUrl?: string;
};

export type LocalAgent = "claude-code" | "codex" | "opencode";
export type AgentProgress = (message: string, detail?: string) => void;
type AgentProgressEvent = { message: string; detail?: string };
export type AgentAnswer = { question: string; context?: AgentInput["context"]; element: AgentInput["element"]; messages?: AgentInput["messages"] };

export async function detectLocalAgents(): Promise<Set<LocalAgent>> {
  const found = new Set<LocalAgent>();
  for (const [name, command] of [["claude-code", "claude"], ["codex", "codex"], ["opencode", "opencode"]] as const) {
    try {
      await execFileAsync(process.platform === "win32" ? "where.exe" : "which", [command]);
      found.add(name);
    } catch {
      // Local coding CLIs are optional.
    }
  }
  return found;
}

const ignored = new Set(["node_modules", ".git", ".next", "dist", "build", ".turbo"]);
const sourceExtensions = /\.(tsx?|jsx?|vue|svelte|css|scss|html)$/i;
const sourceFileCache = new Map<string, { expiresAt: number; files: string[] }>();

async function sourceFiles(directory: string): Promise<string[]> {
  const cached = sourceFileCache.get(directory);
  if (cached && cached.expiresAt > Date.now()) return cached.files;
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (ignored.has(entry.name) || entry.name.startsWith(".")) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await sourceFiles(fullPath)));
    else if (sourceExtensions.test(entry.name)) files.push(fullPath);
    if (files.length >= 40) break;
  }
  sourceFileCache.set(directory, { expiresAt: Date.now() + 5000, files });
  return files;
}

async function contextFor(cwd: string, element: AgentInput["element"]): Promise<string> {
  const needle = element.label.replace(/^[^.#]+[.#]?/, "");
  const hintedPath = element.sourceHint?.split(":")[0];
  const sourceFile = hintedPath ? path.basename(hintedPath) : "";
  if (hintedPath) {
    const candidates = [
      path.isAbsolute(hintedPath) ? hintedPath : path.resolve(cwd, hintedPath),
    ];
    const normalizedHint = hintedPath.replace(/\\/g, "/");
    const srcMarker = "/src/";
    const srcIndex = normalizedHint.lastIndexOf(srcMarker);
    if (srcIndex >= 0) candidates.push(path.join(cwd, normalizedHint.slice(srcIndex + 1)));
    for (const candidate of candidates) {
      try {
        const content = await fs.readFile(candidate, "utf8");
        return `FILE: ${path.relative(cwd, candidate)}\n${content.slice(0, 16000)}`;
      } catch {
        // The runtime source hint can point to a different checkout.
      }
    }
  }
  const files = await sourceFiles(cwd);
  const snippets: string[] = [];
  const results = await Promise.all(files.map(async (file) => {
    try {
      const content = await fs.readFile(file, "utf8");
      if (!needle || (sourceFile && file.endsWith(sourceFile)) || content.includes(needle) || content.includes(element.label)) {
        return `FILE: ${path.relative(cwd, file)}\n${content.slice(0, 8000)}`;
      }
    } catch {
      // A file can disappear while a dev server is rebuilding; skip it.
    }
    return null;
  }));
  for (const result of results) {
    if (result && snippets.length < 6) snippets.push(result);
  }
  return snippets.join("\n\n---\n\n");
}

function jsonObjectCandidates(text: string): string[] {
  const candidates: string[] = [];
  for (let start = 0; start < text.length; start += 1) {
    if (text[start] !== "{") continue;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < text.length; index += 1) {
      const character = text[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') inString = false;
        continue;
      }
      if (character === '"') {
        inString = true;
      } else if (character === "{") {
        depth += 1;
      } else if (character === "}" && --depth === 0) {
        candidates.push(text.slice(start, index + 1));
        break;
      }
    }
  }
  return candidates;
}

function jsonFrom(text: string): { summary: string; changes: SourceChange[] } {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidates = [...(fenced ? [fenced] : []), ...jsonObjectCandidates(text)];
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate.trim()) as { summary?: string; changes?: SourceChange[] };
      if (!Array.isArray(parsed.changes)) continue;
      for (const change of parsed.changes) {
        if (!change.filePath || typeof change.oldString !== "string" || typeof change.newString !== "string") {
          throw new Error("The agent returned an invalid file change.");
        }
      }
      return { summary: parsed.summary || "The proposed source changes are ready for review.", changes: parsed.changes };
    } catch (error) {
      if (error instanceof Error && error.message === "The agent returned an invalid file change.") throw error;
    }
  }
  throw new Error("The agent returned no valid reviewable changes. Progress output may have been mixed with the final JSON.");
}

function extractLocalAgentText(raw: string, provider: LocalAgent): string {
  if (provider === "claude-code") {
    try {
      const payload = JSON.parse(raw) as { result?: string };
      if (payload.result) return payload.result;
    } catch {
      // Stream-json output is handled below.
    }
    const results: string[] = [];
    for (const line of raw.split(/\r?\n/)) {
      try {
        const event = JSON.parse(line) as Record<string, unknown>;
        if (typeof event.result === "string") results.push(event.result);
        const message = event.message as { content?: Array<{ type?: string; text?: string }> } | undefined;
        for (const part of message?.content || []) if (part.type === "text" && part.text) results.push(part.text);
      } catch {
        // Ignore progress lines that are not JSON.
      }
    }
    return results.at(-1) || raw;
  }

  const texts: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    try {
      const event = JSON.parse(line) as Record<string, unknown>;
      const item = event.item as Record<string, unknown> | undefined;
      const part = event.part as Record<string, unknown> | undefined;
      const candidates = provider === "opencode"
        ? [part?.type === "text" ? part.text : undefined, event.text, event.output_text]
        : [event.text, event.output_text, item?.text, item?.output_text, item?.message];
      for (const candidate of candidates) {
        if (typeof candidate === "string" && candidate.trim()) texts.push(candidate);
      }
    } catch {
      // Ignore non-JSON progress lines.
    }
  }
  return texts.at(-1) || raw;
}

function extractLocalAgentProposal(raw: string, provider: LocalAgent): { summary: string; changes: SourceChange[] } {
  const outputs: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    try {
      const event = JSON.parse(line) as Record<string, any>;
      const item = event.item as Record<string, any> | undefined;
      const part = event.part as Record<string, any> | undefined;
      const values = provider === "claude-code"
        ? [event.result, ...((event.message?.content || []) as Array<Record<string, any>>).map((entry) => entry.text)]
        : provider === "opencode"
          ? [part?.type === "text" ? part.text : undefined, event.text, event.output_text]
          : [event.text, event.output_text, item?.text, item?.output_text, item?.message];
      for (const value of values) if (typeof value === "string" && value.trim()) outputs.push(value);
    } catch {
      if (line.trim()) outputs.push(line);
    }
  }

  // Tool events are interleaved with the final answer. Try text events in
  // reverse order, then the complete stream as a final fallback.
  for (const output of [...outputs.reverse(), raw]) {
    try {
      return jsonFrom(output);
    } catch {
      // Keep looking; this output may only be a progress or tool event.
    }
  }
  throw new Error("The agent returned no valid reviewable changes. Progress output may have been mixed with the final JSON.");
}

function snippet(value: unknown, max = 80): string {
  const s = String(value ?? "").trim().replace(/\s+/g, " ");
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function progressEvent(message: string, detail?: unknown): AgentProgressEvent {
  const value = detail == null ? "" : String(detail).trim();
  return value ? { message, detail: value } : { message };
}

function progressFromLine(raw: string, provider: LocalAgent): AgentProgressEvent | null {
  try {
    const event = JSON.parse(raw) as Record<string, any>;
    const item = event.item as Record<string, any> | undefined;

    if (provider === "claude-code") {
      if (event.type === "system") return progressEvent("Claude Code connected");

      // tool_use blocks inside assistant messages
      const toolBlock = event.message?.content?.find?.((p: any) => p.type === "tool_use");
      if (toolBlock) {
        const toolName: string = toolBlock.name || "tool";
        const inp = toolBlock.input as Record<string, any> | undefined;
        const detail =
          inp?.file_path ?? inp?.path ?? inp?.command ?? inp?.query ?? inp?.url ?? "";
        return progressEvent(
          detail
            ? `Claude Code · ${toolName}  ${snippet(detail)}`
            : `Claude Code · ${toolName}`,
          detail,
        );
      }

      // thinking blocks inside assistant messages
      const thinkBlock = event.message?.content?.find?.((p: any) => p.type === "thinking");
      if (thinkBlock?.thinking) {
        return progressEvent(`Claude Code · ${snippet(thinkBlock.thinking)}`, thinkBlock.thinking);
      }

      // top-level tool event fields (stream-json verbose format)
      const tool: string | undefined = event.tool_name || event.name || event.tool?.name;
      if (tool) {
        const inp = event.tool_input as Record<string, any> | undefined;
        const detail =
          inp?.file_path ?? inp?.path ?? inp?.command ?? inp?.query ?? inp?.url ?? "";
        return progressEvent(
          detail
            ? `Claude Code · ${tool}  ${snippet(detail)}`
            : `Claude Code · ${tool}`,
          detail,
        );
      }

      if (event.type === "result" || event.result) {
        return progressEvent("Claude Code · preparing the proposal");
      }
      if (event.type === "assistant") return progressEvent("Claude Code · reasoning about the change");
    } else if (provider === "codex") {
      const type: string = item?.type || event.type || "";
      if (type === "command_execution" || type === "command_execution_output") {
        const cmd: string = item?.command || event.command || "";
        return progressEvent(cmd ? `Codex · Bash  ${snippet(cmd)}` : "Codex · running a command", cmd);
      }
      if (type === "file_read" || type === "read_file") {
        const fp: string = item?.path || event.path || "";
        return progressEvent(fp ? `Codex · Read  ${snippet(fp)}` : "Codex · reading a file", fp);
      }
      if (type === "agent_message" || type === "message") {
        return progressEvent("Codex · drafting the proposal");
      }
      if (type === "reasoning") {
        const text: string = item?.content || event.content || "";
        return progressEvent(text ? `Codex · ${snippet(text)}` : "Codex · reasoning", text);
      }
      if (type === "turn.started" || type === "turn_start") {
        return progressEvent("Codex · starting a turn");
      }
      if (type === "turn.completed" || type === "turn_complete") {
        return progressEvent("Codex · preparing the proposal");
      }
    } else if (provider === "opencode") {
      const part = event.part as Record<string, any> | undefined;
      if (event.type === "step-start") return progressEvent("OpenCode · starting a step");
      if (part?.type === "tool") {
        const toolName: string = part.tool || "tool";
        const inp = part.input as Record<string, any> | undefined;
        const detail =
          inp?.file_path ?? inp?.path ?? inp?.command ?? inp?.query ?? inp?.url ?? "";
        return progressEvent(
          detail
            ? `OpenCode · ${toolName}  ${snippet(detail)}`
            : `OpenCode · ${toolName}`,
          detail,
        );
      }
      if (part?.type === "text") {
        const text: string = part.text || "";
        return progressEvent(text ? `OpenCode · ${snippet(text)}` : "OpenCode · drafting the response", text);
      }
      if (event.type === "step-finish") return progressEvent("OpenCode · finalizing the response");
    }
  } catch {
    // Progress output is best-effort; the final parser reports malformed output.
  }
  return null;
}

function localAgentError(command: string, stderr: string, exitCode: number): string {
  const output = stderr.trim();
  if (command === "codex" && output.includes("missing field `base_instructions`")) {
    return "Codex could not read its models cache because it uses an older cache format. Update Codex, then retry. Lasso already bypasses the repository trust check.";
  }
  if (command === "codex" && output.includes("mcp.canva.com") && output.includes("invalid_token")) {
    return "Codex started, but the Canva MCP connection has an expired OAuth token. Re-authenticate or remove the Canva MCP server from Codex, then retry.";
  }
  return `${command} exited with code ${exitCode}${output ? `: ${output.slice(0, 500)}` : ""}`;
}

function localModel(provider: LocalAgent, model?: string): string | undefined {
  if (!model) return undefined;
  const prefix = `${provider}:`;
  return model.startsWith(prefix) ? model.slice(prefix.length) : model;
}

function localCommand(provider: LocalAgent, model?: string, prompt?: string): { command: string; args: string[] } {
  const selectedModel = localModel(provider, model);
  if (provider === "claude-code") {
    return { command: "claude", args: ["-p", prompt || "", "--output-format", "stream-json", "--verbose", "--permission-mode", "plan", "--max-turns", "3", ...(selectedModel ? ["--model", selectedModel] : [])] };
  }
  if (provider === "opencode") {
  return { command: "opencode", args: ["run", "--format", "json", "--agent", "plan", ...(selectedModel ? ["--model", selectedModel] : []), prompt || ""] };
  }
  return { command: "codex", args: ["exec", "--json", "--sandbox", "read-only", "--skip-git-repo-check", ...(selectedModel ? ["--model", selectedModel] : []), prompt || ""] };
}

async function proposeWithLocalAgent(cwd: string, instruction: string, context: string, config: AgentConfig, signal?: AbortSignal, onProgress?: AgentProgress) {
  const outputContract = `Return ONLY valid JSON in this exact shape: {"summary":"short explanation","changes":[{"filePath":"relative/path","oldString":"exact existing text","newString":"replacement text"}]}. Treat the supplied source context as read-only. Before returning, verify every oldString against that context. Use project-relative paths only. Do not edit files, run write commands, commit, or produce markdown fences.`;
  const prompt = `${instruction}\n\n${outputContract}\n\nLasso has already assembled this source context:\n${context || "No matching source context was found."}`;
  const local = localCommand(config.provider as LocalAgent, config.model, prompt);
  const command = local.command;
  const args = local.args;
  const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  let pending = "";
  const consume = (chunk: Buffer | string) => {
    pending += String(chunk);
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() || "";
    for (const line of lines) {
      stdout += `${line}\n`;
      const progress = progressFromLine(line, config.provider as LocalAgent);
      if (progress) onProgress?.(progress.message, progress.detail);
    }
  };
  child.stdout.on("data", consume);
  child.stderr.on("data", (chunk: Buffer | string) => {
    stderr += String(chunk);
  });
  if (signal) {
    if (signal.aborted) child.kill("SIGTERM");
    signal.addEventListener("abort", () => child.kill("SIGTERM"), { once: true });
  }
  const exitCode = await new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolve(code ?? 1));
  });
  if (pending.trim()) {
    stdout += pending;
    const progress = progressFromLine(pending, config.provider as LocalAgent);
    if (progress) onProgress?.(progress.message, progress.detail);
  }
  if (exitCode !== 0) throw new Error(localAgentError(command, stderr, exitCode));
  return extractLocalAgentProposal(stdout, config.provider as LocalAgent);
}

export async function proposeChanges(cwd: string, input: AgentInput, config: AgentConfig, signal?: AbortSignal, onProgress?: AgentProgress) {
  const context = await contextFor(cwd, input.element);
  const visualContext = input.context ? { ...input.context, screenshots: undefined } : undefined;
  const history = input.messages?.map((message) => `${message.role}: ${message.content}`).join("\n") || input.instruction;
  const priorChanges = input.changesHistory?.length ? JSON.stringify(input.changesHistory, null, 2) : "None";
  const dragHint = input.context?.drag
    ? `\n\nDRAG REPOSITIONING TASK:\nThe user dragged this element by dx: ${input.context.drag.delta?.dx ?? 0}px, dy: ${input.context.drag.delta?.dy ?? 0}px to target coordinates (left: ${input.context.drag.targetRect?.left ?? 0}px, top: ${input.context.drag.targetRect?.top ?? 0}px). Modify the source code (CSS classes, Tailwind classes, flex/grid alignment, margin offsets, or positioning properties) so the element is accurately rendered at this target position.`
    : "";
  const instruction = `Selection context:\n${JSON.stringify(input.element, null, 2)}\n${JSON.stringify(visualContext, null, 2)}\n\nConversation history:\n${history}\n\nPrevious change history for this selection:\n${priorChanges}\n\nRelevant source context:\n${context || "No matching source context was found. Ask for a more specific selection rather than inventing a file."}${dragHint}\n\nReturn ONLY JSON: {"summary":"short explanation","changes":[{"filePath":"relative/path","oldString":"exact text","newString":"replacement text"}]}`;
  if (config.provider === "claude-code" || config.provider === "codex" || config.provider === "opencode") {
    return proposeWithLocalAgent(cwd, instruction, context, config, signal, onProgress);
  }
  const system = "You are Lasso, a careful source-code editing agent. Return only valid JSON. Each oldString must occur exactly once in its file. Never rewrite whole files. Keep changes focused on the request.";
  const model = config.model || (config.provider === "google" ? "gemini-2.5-flash" : config.provider === "openai" ? "gpt-4.1-mini" : config.provider === "ollama" ? "llama3.2" : "claude-sonnet-4-20250514");
  const image = input.context?.screenshots?.element || input.context?.screenshots?.full;
  const imageData = image?.replace(/^data:image\/[^;]+;base64,/, "");
  const imageMime = image?.match(/^data:(image\/[^;]+);base64,/)?.[1] || "image/jpeg";
  let response: Response;

  if (config.provider === "openai" || config.provider === "ollama") {
    const content = image ? [{ type: "text", text: instruction }, { type: "image_url", image_url: { url: image } }] : instruction;
    response = await fetch(`${config.baseUrl || "https://api.openai.com/v1"}/chat/completions`, {
      method: "POST",
      signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${config.apiKey || ""}` },
      body: JSON.stringify({ model, temperature: 0.1, messages: [{ role: "system", content: system }, { role: "user", content }] }),
    });
  } else if (config.provider === "google") {
    const parts: Array<Record<string, unknown>> = [{ text: instruction }];
    if (imageData) parts.push({ inlineData: { mimeType: imageMime, data: imageData } });
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(config.apiKey || "")}`, {
      method: "POST",
      signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts }] }),
    });
  } else {
    const content: Array<Record<string, unknown>> = [{ type: "text", text: instruction }];
    if (imageData) content.push({ type: "image", source: { type: "base64", media_type: imageMime, data: imageData } });
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal,
      headers: { "content-type": "application/json", "x-api-key": config.apiKey || "", "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: 4096, system, messages: [{ role: "user", content }] }),
    });
  }
  if (!response.ok) throw new Error(`Agent request failed (${response.status}).`);
  const payload = await response.json() as {
    content?: Array<{ type?: string; text?: string }>;
    choices?: Array<{ message?: { content?: string } }>;
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = config.provider === "openai"
    ? payload.choices?.[0]?.message?.content
    : config.provider === "google"
      ? payload.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("")
      : payload.content?.find((item) => item.type === "text")?.text;
  if (!text) throw new Error("The agent returned an empty response.");
  return jsonFrom(text);
}

export async function answerQuestion(cwd: string, input: AgentAnswer, config: AgentConfig, signal?: AbortSignal, onProgress?: AgentProgress): Promise<string> {
  const context = await contextFor(cwd, input.element);
  const history = input.messages?.map((message) => `${message.role}: ${message.content}`).join("\n") || "None";
  const prompt = `Answer the user's question conversationally and directly. Do not propose file changes and do not return JSON. If the question is about the selected UI, use the selection and source context below.\n\nUser question:\n${input.question}\n\nSelected element:\n${JSON.stringify(input.element, null, 2)}\n\nVisual context:\n${JSON.stringify({ ...input.context, screenshots: undefined }, null, 2)}\n\nConversation:\n${history}\n\nRelevant source context:\n${context || "No matching source context was found."}`;

  if (config.provider === "claude-code" || config.provider === "codex" || config.provider === "opencode") {
    const local = localCommand(config.provider as LocalAgent, config.model, prompt);
    const command = local.command;
    const args = local.args;
    const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    let pending = "";
    let stderr = "";
    const consume = (chunk: Buffer | string) => {
      pending += String(chunk);
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() || "";
      for (const line of lines) {
        output += `${line}\n`;
        const progress = progressFromLine(line, config.provider as LocalAgent);
        if (progress) onProgress?.(progress.message, progress.detail);
      }
    };
    child.stdout.on("data", consume);
    child.stderr.on("data", (chunk: Buffer | string) => { stderr += String(chunk); });
    if (signal) signal.addEventListener("abort", () => child.kill("SIGTERM"), { once: true });
    const code = await new Promise<number>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (status) => resolve(status ?? 1));
    });
    if (pending.trim()) {
      output += pending;
      const progress = progressFromLine(pending, config.provider as LocalAgent);
      if (progress) onProgress?.(progress.message, progress.detail);
    }
    if (code !== 0) throw new Error(localAgentError(command, stderr, code));
    return extractLocalAgentText(output, config.provider as LocalAgent).trim();
  }

  const model = config.model || (config.provider === "google" ? "gemini-2.5-flash" : config.provider === "openai" ? "gpt-4.1-mini" : config.provider === "ollama" ? "llama3.2" : "claude-sonnet-4-20250514");
  let response: Response;
  if (config.provider === "openai" || config.provider === "ollama") {
    response = await fetch(`${config.baseUrl || "https://api.openai.com/v1"}/chat/completions`, {
      method: "POST", signal, headers: { "content-type": "application/json", authorization: `Bearer ${config.apiKey || ""}` },
      body: JSON.stringify({ model, temperature: 0.2, messages: [{ role: "system", content: "Answer conversationally. Do not edit files or return JSON." }, { role: "user", content: prompt }] }),
    });
  } else if (config.provider === "google") {
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(config.apiKey || "")}`, {
      method: "POST", signal, headers: { "content-type": "application/json" },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: "Answer conversationally. Do not edit files or return JSON." }] }, contents: [{ role: "user", parts: [{ text: prompt }] }] }),
    });
  } else {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", signal, headers: { "content-type": "application/json", "x-api-key": config.apiKey || "", "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: 2048, system: "Answer conversationally. Do not edit files or return JSON.", messages: [{ role: "user", content: prompt }] }),
    });
  }
  if (!response.ok) throw new Error(`Agent request failed (${response.status}).`);
  const payload = await response.json() as { content?: Array<{ type?: string; text?: string }>; choices?: Array<{ message?: { content?: string } }>; candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const answer = config.provider === "openai" || config.provider === "ollama"
    ? payload.choices?.[0]?.message?.content
    : config.provider === "google"
      ? payload.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("")
      : payload.content?.find((item) => item.type === "text")?.text;
  if (!answer?.trim()) throw new Error("The agent returned an empty answer.");
  return answer.trim();
}

export async function generateCommitMessage(cwd: string, status: string[], config: AgentConfig, signal?: AbortSignal, onProgress?: AgentProgress): Promise<string> {
  const answer = await answerQuestion(cwd, {
    question: `Generate exactly one concise Conventional Commit message for these changes. Return only the commit subject line, no quotes, markdown, explanation, or body. Keep it under 100 characters.\n\nChanged files:\n${status.join("\n") || "No changed files listed."}`,
    element: { tag: "git", group: "workspace", label: "Git working tree" },
  }, config, signal, onProgress);
  return answer.split(/\r?\n/).map((line) => line.replace(/^[-*]\s*/, "").replace(/^['"`]|['"`]$/g, "").trim()).find(Boolean)?.slice(0, 120) || "Update project files";
}
