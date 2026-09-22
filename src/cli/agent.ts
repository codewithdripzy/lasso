import fs from "node:fs/promises";
import path from "node:path";

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
  context?: { selectionId?: string; position?: Record<string, number>; viewport?: Record<string, unknown>; styles?: Record<string, string>; attributes?: Record<string, string>; screenshots?: { full?: string; element?: string } };
  element: { tag: string; group: string; label: string; html?: string; sourceHint?: string };
};

export type AgentConfig = {
  provider: "anthropic" | "openai" | "google" | "ollama";
  apiKey: string;
  model?: string;
  baseUrl?: string;
};

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

export async function proposeChanges(cwd: string, input: AgentInput, config: AgentConfig) {
  const context = await contextFor(cwd, input.element);
  const visualContext = input.context ? { ...input.context, screenshots: undefined } : undefined;
  const history = input.messages?.map((message) => `${message.role}: ${message.content}`).join("\n") || input.instruction;
  const priorChanges = input.changesHistory?.length ? JSON.stringify(input.changesHistory, null, 2) : "None";
  const instruction = `Selection context:\n${JSON.stringify(input.element, null, 2)}\n${JSON.stringify(visualContext, null, 2)}\n\nConversation history:\n${history}\n\nPrevious change history for this selection:\n${priorChanges}\n\nRelevant source context:\n${context || "No matching source context was found. Ask for a more specific selection rather than inventing a file."}\n\nReturn ONLY JSON: {"summary":"short explanation","changes":[{"filePath":"relative/path","oldString":"exact text","newString":"replacement text"}]}`;
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
      headers: { "content-type": "application/json", authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({ model, temperature: 0.1, messages: [{ role: "system", content: system }, { role: "user", content }] }),
    });
  } else if (config.provider === "google") {
    const parts: Array<Record<string, unknown>> = [{ text: instruction }];
    if (imageData) parts.push({ inlineData: { mimeType: imageMime, data: imageData } });
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(config.apiKey)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts }] }),
    });
  } else {
    const content: Array<Record<string, unknown>> = [{ type: "text", text: instruction }];
    if (imageData) content.push({ type: "image", source: { type: "base64", media_type: imageMime, data: imageData } });
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": config.apiKey, "anthropic-version": "2023-06-01" },
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
