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
  context?: { selectionId?: string; position?: Record<string, number>; viewport?: Record<string, unknown>; styles?: Record<string, string>; attributes?: Record<string, string>; runtimeErrors?: string[]; screenshots?: { full?: string; element?: string } };
  element: { tag: string; group: string; label: string; html?: string; sourceHint?: string };
};

export type AgentConfig = {
  provider: "anthropic" | "openai" | "google" | "ollama" | "claude-code" | "codex";
  apiKey?: string;
  model?: string;
  baseUrl?: string;
};

export type LocalAgent = "claude-code" | "codex";
export type AgentProgress = (message: string) => void;
export type AgentAnswer = { question: string; context?: AgentInput["context"]; element: AgentInput["element"]; messages?: AgentInput["messages"] };

export async function detectLocalAgents(): Promise<Set<LocalAgent>> {
  const found = new Set<LocalAgent>();
  for (const [name, command] of [["claude-code", "claude"], ["codex", "codex"]] as const) {
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

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (ignored.has(entry.name) || entry.name.startsWith(".")) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await sourceFiles(fullPath)));
    else if (sourceExtensions.test(entry.name)) files.push(fullPath);
    if (files.length >= 80) break;
  }
  return files;
}

async function contextFor(cwd: string, element: AgentInput["element"]): Promise<string> {
  const files = await sourceFiles(cwd);
  const needle = element.sourceHint || element.label.replace(/^[^.#]+[.#]?/, "");
  const sourceFile = element.sourceHint ? path.basename(element.sourceHint.split(":")[0]) : "";
  const snippets: string[] = [];
  for (const file of files) {
    if (snippets.length >= 8) break;
    try {
      const content = await fs.readFile(file, "utf8");
      if (!needle || (sourceFile && file.endsWith(sourceFile)) || content.includes(needle) || content.includes(element.label)) {
        snippets.push(`FILE: ${path.relative(cwd, file)}\n${content.slice(0, 12000)}`);
      }
    } catch {
      // A file can disappear while a dev server is rebuilding; skip it.
    }
  }
  return snippets.join("\n\n---\n\n");
}

function jsonFrom(text: string): { summary: string; changes: SourceChange[] } {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] || text;
  const parsed = JSON.parse(fenced.trim()) as { summary?: string; changes?: SourceChange[] };
  if (!Array.isArray(parsed.changes)) throw new Error("The agent returned no reviewable changes.");
  for (const change of parsed.changes) {
    if (!change.filePath || typeof change.oldString !== "string" || typeof change.newString !== "string") {
      throw new Error("The agent returned an invalid file change.");
    }
  }
  return { summary: parsed.summary || "The proposed source changes are ready for review.", changes: parsed.changes };
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
      for (const candidate of [event.text, event.output_text, item?.text, item?.output_text, item?.message]) {
        if (typeof candidate === "string" && candidate.trim()) texts.push(candidate);
      }
    } catch {
      // Ignore non-JSON progress lines.
    }
  }
  return texts.at(-1) || raw;
}

function progressFromLine(raw: string, provider: LocalAgent): string | null {
  try {
    const event = JSON.parse(raw) as Record<string, any>;
    const item = event.item as Record<string, any> | undefined;
    if (provider === "claude-code") {
      if (event.type === "system") return "Claude Code connected";
      const tool = event.tool_name || event.name || event.tool?.name || event.message?.content?.find?.((part: any) => part.type === "tool_use")?.name;
      if (tool) return `Claude Code · ${String(tool)}`;
      if (event.type === "result" || event.result) return "Claude Code · preparing the proposal";
      if (event.type === "assistant") return "Claude Code · reasoning about the change";
    } else {
      const type = item?.type || event.type;
      if (type === "command_execution" || type === "command_execution_output") return "Codex · inspecting the project";
      if (type === "agent_message" || type === "message") return "Codex · drafting the proposal";
      if (type === "turn.started" || type === "turn_start") return "Codex · starting a turn";
      if (type === "turn.completed" || type === "turn_complete") return "Codex · preparing the proposal";
    }
  } catch {
    // Progress output is best-effort; the final parser reports malformed output.
  }
  return null;
}

async function proposeWithLocalAgent(cwd: string, instruction: string, context: string, config: AgentConfig, signal?: AbortSignal, onProgress?: AgentProgress) {
  const outputContract = `Return ONLY valid JSON in this exact shape: {"summary":"short explanation","changes":[{"filePath":"relative/path","oldString":"exact existing text","newString":"replacement text"}]}. Every oldString must occur exactly once. Do not edit files, run write commands, commit, or produce markdown fences.`;
  const prompt = `${instruction}\n\n${outputContract}\n\nLasso has already assembled this source context:\n${context || "No matching source context was found."}`;
  const command = config.provider === "claude-code" ? "claude" : "codex";
  const args = config.provider === "claude-code"
    ? ["-p", prompt, "--output-format", "stream-json", "--verbose", "--permission-mode", "plan", "--max-turns", "3"]
    : ["exec", "--json", "--sandbox", "read-only", prompt];
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
      if (progress) onProgress?.(progress);
    }
  };
  child.stdout.on("data", consume);
  child.stderr.on("data", (chunk: Buffer | string) => {
    stderr += String(chunk);
    const message = String(chunk).trim();
    if (message) onProgress?.(`${config.provider === "claude-code" ? "Claude Code" : "Codex"} · ${message.slice(0, 180)}`);
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
    if (progress) onProgress?.(progress);
  }
  if (exitCode !== 0) throw new Error(`${command} exited with code ${exitCode}${stderr.trim() ? `: ${stderr.trim().slice(0, 500)}` : ""}`);
  return jsonFrom(extractLocalAgentText(stdout, config.provider as LocalAgent));
}

export async function proposeChanges(cwd: string, input: AgentInput, config: AgentConfig, signal?: AbortSignal, onProgress?: AgentProgress) {
  const context = await contextFor(cwd, input.element);
  const visualContext = input.context ? { ...input.context, screenshots: undefined } : undefined;
  const history = input.messages?.map((message) => `${message.role}: ${message.content}`).join("\n") || input.instruction;
  const priorChanges = input.changesHistory?.length ? JSON.stringify(input.changesHistory, null, 2) : "None";
  const instruction = `Selection context:\n${JSON.stringify(input.element, null, 2)}\n${JSON.stringify(visualContext, null, 2)}\n\nConversation history:\n${history}\n\nPrevious change history for this selection:\n${priorChanges}\n\nRelevant source context:\n${context || "No matching source context was found. Ask for a more specific selection rather than inventing a file."}\n\nReturn ONLY JSON: {"summary":"short explanation","changes":[{"filePath":"relative/path","oldString":"exact text","newString":"replacement text"}]}`;
  if (config.provider === "claude-code" || config.provider === "codex") {
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

  if (config.provider === "claude-code" || config.provider === "codex") {
    const command = config.provider === "claude-code" ? "claude" : "codex";
    const args = config.provider === "claude-code"
      ? ["-p", prompt, "--output-format", "stream-json", "--verbose", "--permission-mode", "plan", "--max-turns", "2"]
      : ["exec", "--json", "--sandbox", "read-only", prompt];
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
        if (progress) onProgress?.(progress);
      }
    };
    child.stdout.on("data", consume);
    child.stderr.on("data", (chunk: Buffer | string) => { stderr += String(chunk); });
    if (signal) signal.addEventListener("abort", () => child.kill("SIGTERM"), { once: true });
    const code = await new Promise<number>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (status) => resolve(status ?? 1));
    });
    if (pending.trim()) output += pending;
    if (code !== 0) throw new Error(`${command} exited with code ${code}${stderr.trim() ? `: ${stderr.trim().slice(0, 500)}` : ""}`);
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
