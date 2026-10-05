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
  taskId?: string;
  instruction: string;
  model: string;
  messages?: Array<{ role: string; content: string; createdAt?: string }>;
  changesHistory?: Array<{ summary: string; changes: SourceChange[]; createdAt?: string }>;
  context?: { selectionId?: string; position?: Record<string, number>; viewport?: Record<string, unknown>; styles?: Record<string, string>; attributes?: Record<string, string>; runtimeErrors?: string[]; screenshots?: { full?: string; element?: string }; drag?: Record<string, any> };
  element: { tag: string; group: string; label: string; html?: string; sourceHint?: string };
};

export type AgentConfig = {
  provider: "anthropic" | "openai" | "google" | "ollama" | "nvidia" | "claude-code" | "codex" | "opencode" | "cursor";
  apiKey?: string;
  model?: string;
  baseUrl?: string;
};

export type LocalAgent = "claude-code" | "codex" | "opencode" | "cursor";
export type AgentProgressLevel = "working" | "error";
export type AgentProgress = (message: string, detail?: string, level?: AgentProgressLevel) => void;
export type AgentPrompt = { message: string; kind: "permission" | "input"; options?: string[] };
export type AgentPromptHandler = (prompt: AgentPrompt) => void;
type AgentProgressEvent = { message: string; detail?: string };
export type AgentAnswer = { taskId?: string; question: string; context?: AgentInput["context"]; element: AgentInput["element"]; messages?: AgentInput["messages"] };

const activeAgentInputs = new Map<string, (value: string) => void>();

export function respondToAgentPrompt(taskId: string, value: string): boolean {
  const respond = activeAgentInputs.get(taskId);
  if (!respond) return false;
  respond(value);
  return true;
}

export async function detectLocalAgents(): Promise<Set<LocalAgent>> {
  const found = new Set<LocalAgent>();
  for (const [name, command] of [["claude-code", "claude"], ["codex", "codex"], ["opencode", "opencode"], ["cursor", "cursor"]] as const) {
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
const layoutFiles = /^(layout|_layout|_app|app|_document|document|template|_template)\.(tsx?|jsx?)$/i;
const sourceFileCache = new Map<string, { expiresAt: number; files: string[] }>();

async function sourceFiles(directory: string, budget = { remaining: 25 }): Promise<string[]> {
  if (budget.remaining <= 0) return [];
  const cached = sourceFileCache.get(directory);
  if (cached && cached.expiresAt > Date.now()) {
    const files = cached.files.slice(0, budget.remaining);
    budget.remaining -= files.length;
    return files;
  }
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  const layoutFilesList: string[] = [];
  const otherFiles: string[] = [];
  
  for (const entry of entries) {
    if (ignored.has(entry.name) || entry.name.startsWith(".")) continue;
    const fullPath = path.join(directory, entry.name);
    if (budget.remaining <= 0) break;
    if (entry.isDirectory()) {
      const nested = await sourceFiles(fullPath, budget);
      files.push(...nested);
    } else if (sourceExtensions.test(entry.name)) {
      if (layoutFiles.test(entry.name)) {
        layoutFilesList.push(fullPath);
      } else {
        otherFiles.push(fullPath);
      }
    }
  }
  
  // Prioritize layout files first, then other files
  files.push(...layoutFilesList, ...otherFiles);
  budget.remaining -= files.length;
  
  sourceFileCache.set(directory, { expiresAt: Date.now() + 30000, files });
  return files;
}

async function contextFor(cwd: string, element: AgentInput["element"]): Promise<string> {
  const needle = element.label.replace(/^[^.#]+[.#]?/, "");
  const hintedPath = element.sourceHint?.split(":")[0];
  const sourceFile = hintedPath ? path.basename(hintedPath) : "";
  
  // Extract unique class names and attributes from the element for better matching
  const classMatches = element.html?.match(/class="([^"]+)"/);
  const classNames = classMatches ? classMatches[1].split(/\s+/).filter((c: string) => c.length > 3) : [];
  const hrefMatch = element.html?.match(/href="([^"]+)"/);
  const href = hrefMatch ? hrefMatch[1] : "";
  
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
  const scoredFiles: Array<{ file: string; score: number; content: string }> = [];
  
  const results = await Promise.all(files.map(async (file) => {
    try {
      const content = await fs.readFile(file, "utf8");
      let score = 0;
      
      // Score files based on relevance
      if (sourceFile && file.endsWith(sourceFile)) score += 10;
      if (content.includes(needle)) score += 5;
      if (content.includes(element.label)) score += 5;
      if (href && content.includes(href)) score += 8;
      
      // Check for class name matches
      for (const className of classNames) {
        if (content.includes(className)) score += 3;
      }
      
      // Boost score for component files
      if (file.includes("component") || file.includes("nav") || file.includes("header") || file.includes("layout")) {
        score += 2;
      }
      
      if (score > 0) {
        return { file, score, content };
      }
    } catch {
      // A file can disappear while a dev server is rebuilding; skip it.
    }
    return null;
  }));
  
  // Sort by score and take top files
  const sortedResults = results.filter((r): r is NonNullable<typeof r> => r !== null).sort((a, b) => b.score - a.score);
  
  for (const result of sortedResults) {
    if (snippets.length < 8) {
      snippets.push(`FILE: ${path.relative(cwd, result.file)}\n${result.content.slice(0, 6000)}`);
    }
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

  if (provider === "cursor") {
    // Cursor uses similar output format to claude-code
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

function collectTextFields(value: unknown, fields = new Set(["text", "output_text", "result", "content", "message", "output", "value"]), depth = 0): string[] {
  if (depth > 8 || value == null) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap((entry) => collectTextFields(entry, fields, depth + 1));
  if (typeof value !== "object") return [];
  const output: string[] = [];
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (fields.has(key) && typeof entry === "string") output.push(entry);
    if (typeof entry === "object" && entry !== null) output.push(...collectTextFields(entry, fields, depth + 1));
  }
  return output;
}

function findStructuredProposals(value: unknown, depth = 0): string[] {
  if (depth > 8 || value == null || typeof value !== "object") return [];
  if (!Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.changes)) return [JSON.stringify(record)];
    return Object.values(record).flatMap((entry) => findStructuredProposals(entry, depth + 1));
  }
  return value.flatMap((entry) => findStructuredProposals(entry, depth + 1));
}

function extractLocalAgentProposal(raw: string, provider: LocalAgent): { summary: string; changes: SourceChange[] } {
  const outputs: string[] = [];
  const lines = raw.split(/\r?\n/).filter((line) => line.trim());
  const streamObjects = jsonObjectCandidates(raw).flatMap((candidate) => {
    try {
      return [JSON.parse(candidate) as Record<string, any>];
    } catch {
      return [];
    }
  });

  for (const line of lines) {
    try {
      const event = JSON.parse(line) as Record<string, any>;
      const item = event.item as Record<string, any> | undefined;
      const part = event.part as Record<string, any> | undefined;
      const values = provider === "claude-code" || provider === "cursor"
        ? [event.result, ...((event.message?.content || []) as Array<Record<string, any>>).map((entry) => entry.text)]
        : provider === "opencode"
          ? [...collectTextFields(event), part?.type === "text" ? part.text : undefined]
          : [event.text, event.output_text, item?.text, item?.output_text, item?.message];
      for (const value of values) if (typeof value === "string" && value.trim()) outputs.push(value);
    } catch {
      if (line.trim()) outputs.push(line);
    }
  }

  // OpenCode can emit multiple JSON records on one physical line. The
  // line-based pass above cannot see those records, so inspect each balanced
  // JSON object as well and collect text nested in its final response event.
  for (const event of streamObjects) {
    outputs.push(...collectTextFields(event));
    const part = event.part as Record<string, any> | undefined;
    if (part?.type === "text" && typeof part.text === "string") outputs.push(part.text);
  }

  for (const proposal of streamObjects.flatMap((event) => findStructuredProposals(event)).reverse()) {
    try {
      return jsonFrom(proposal);
    } catch {
      // Continue through text candidates below.
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
  throw new Error(`${provider === "opencode" ? "OpenCode" : provider === "cursor" ? "Cursor" : "The agent"} did not return a reviewable proposal. It produced progress/tool events but no final JSON containing file changes.`);
}

function snippet(value: unknown, max = 80): string {
  const s = String(value ?? "").trim().replace(/\s+/g, " ");
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

const ANSI_PATTERN = /\u001B\[[0-9;?]*[ -/]*[@-~]/g;
const LOG_FIELD_PATTERN = /([A-Za-z_][\w.-]*)=("(?:[^"\\]|\\.)*"|[^\s]*)/g;

function cleanAgentText(value: string): string {
  return value.replace(ANSI_PATTERN, "").replace(/\s+/g, " ").trim();
}

/**
 * Local agents (notably OpenCode) print structured logs such as
 * `timestamp=… level=ERROR run=… message="Failed to fetch models.dev" cause="…"`.
 * Those lines are machine diagnostics, never user-facing copy, so they are parsed
 * into their fields instead of being shown verbatim.
 */
function parseAgentLogFields(line: string): Record<string, string> | null {
  if (!/^\s*(?:timestamp|time|ts)=\S/.test(line)) return null;
  const fields: Record<string, string> = {};
  for (const match of line.matchAll(LOG_FIELD_PATTERN)) {
    const key = match[1]!;
    const raw = match[2] ?? "";
    fields[key] = raw.startsWith('"')
      ? raw.slice(1, -1).replace(/\\(["\\])/g, "$1")
      : raw;
  }
  return fields;
}

// Filesystem failures that a permission request can never resolve.
const AGENT_FAILURE_MARKERS =
  /\b(?:EACCES|EPERM|ENOENT|EEXIST|EISDIR|ENOTDIR|ENOSPC|EMFILE|ENOTEMPTY)\b|\bCause\(\[Die\(/i;

const AGENT_FAILURE_HINTS: Array<{ pattern: RegExp; message: string }> = [
  {
    pattern: /EACCES: permission denied[\s\S]*(?:locks?|state|storage|\.config|config\/)/i,
    message:
      "The local agent cannot write to its own state folder. Fix that folder's ownership (for example `sudo chown -R $(whoami) ~/.local/state/opencode`) and retry.",
  },
  {
    pattern: /EACCES: permission denied/i,
    message: "The local agent was denied access to a file or folder it needs. Check the permissions on its state directory, then retry.",
  },
  {
    pattern: /failed to fetch models\.dev/i,
    message: "The local agent could not reach models.dev to refresh its model list. Check the network or proxy it uses, then retry.",
  },
];

function agentFailureHint(line: string): string | undefined {
  return AGENT_FAILURE_HINTS.find((hint) => hint.pattern.test(line))?.message;
}

const PERMISSION_PROMPT_PATTERN =
  /permission\s+(?:is\s+)?(?:required|requested|needed|denied)|needs?\s+(?:your\s+)?permission|permission\s+to\s+(?:run|edit|write|read|execute|create|delete|modify|access|apply)|approve\s+(?:this|the|tool|action|command)|authori[sz]e\s+(?:this|the|tool|action|command)|authentication\s+(?:is\s+)?required|(?:please\s+)?log\s?in|sign\s?in\s+(?:required|to\s+continue)|press\s+.{1,24}?to\s+(?:continue|approve|confirm)|waiting for (?:your )?(?:permission|approval|input|response)/i;

/**
 * Returns human-readable copy for a real approval/authentication request, or
 * `null` when the line is anything else. A structured error log never becomes a
 * permission prompt: Allow/Deny cannot fix a filesystem failure, and hiding the
 * error behind those buttons is what made the prompt unreadable.
 */
function permissionPromptMessage(raw: string): string | null {
  const line = cleanAgentText(raw);
  if (!line) return null;
  if (parseAgentLogFields(line) || AGENT_FAILURE_MARKERS.test(line)) return null;
  if (!PERMISSION_PROMPT_PATTERN.test(line)) return null;
  const detail = line
    .replace(/^[A-Za-z0-9_.-]+:\s*/, "")
    .replace(/^["'\s]+|["'\s]+$/g, "")
    .trim();
  return snippet(detail || line, 240);
}

function progressEvent(message: string, detail?: unknown): AgentProgressEvent {
  const value = detail == null ? "" : String(detail).trim();
  return value ? { message, detail: value } : { message };
}

function progressFromLine(raw: string, provider: LocalAgent): AgentProgressEvent | null {
  try {
    const event = JSON.parse(raw) as Record<string, any>;
    const item = event.item as Record<string, any> | undefined;

    if (provider === "claude-code" || provider === "cursor") {
      const agentName = provider === "cursor" ? "Cursor" : "Claude Code";
      if (event.type === "system") return progressEvent(`${agentName} connected`);

      // tool_use blocks inside assistant messages
      const toolBlock = event.message?.content?.find?.((p: any) => p.type === "tool_use");
      if (toolBlock) {
        const toolName: string = toolBlock.name || "tool";
        const inp = toolBlock.input as Record<string, any> | undefined;
        const detail =
          inp?.file_path ?? inp?.path ?? inp?.command ?? inp?.query ?? inp?.url ?? "";
        return progressEvent(
          detail
            ? `${agentName} · ${toolName}  ${snippet(detail)}`
            : `${agentName} · ${toolName}`,
          detail,
        );
      }

      // thinking blocks inside assistant messages
      const thinkBlock = event.message?.content?.find?.((p: any) => p.type === "thinking");
      if (thinkBlock?.thinking) {
        return progressEvent(`${agentName} · ${snippet(thinkBlock.thinking)}`, thinkBlock.thinking);
      }

      // top-level tool event fields (stream-json verbose format)
      const tool: string | undefined = event.tool_name || event.name || event.tool?.name;
      if (tool) {
        const inp = event.tool_input as Record<string, any> | undefined;
        const detail =
          inp?.file_path ?? inp?.path ?? inp?.command ?? inp?.query ?? inp?.url ?? "";
        return progressEvent(
          detail
            ? `${agentName} · ${tool}  ${snippet(detail)}`
            : `${agentName} · ${tool}`,
          detail,
        );
      }

      if (event.type === "result" || event.result) {
        return progressEvent(`${agentName} · preparing the proposal`);
      }
      if (event.type === "assistant") return progressEvent(`${agentName} · reasoning about the change`);
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

function progressEventsFromRaw(raw: string, provider: LocalAgent): AgentProgressEvent[] {
  const records = (() => {
    try {
      JSON.parse(raw);
      return [raw];
    } catch {
      return jsonObjectCandidates(raw);
    }
  })();
  return records.flatMap((record) => {
    const progress = progressFromLine(record, provider);
    return progress ? [progress] : [];
  });
}

function localAgentError(command: string, stderr: string, exitCode: number): string {
  const output = stderr.trim();
  const hint = agentFailureHint(output);
  if (hint) return `${command === "opencode" ? "OpenCode" : command === "cursor" ? "Cursor" : command} could not finish: ${hint}`;
  if (command === "opencode" && /waiting for permission or authentication/i.test(output)) {
    return "OpenCode needs permission or authentication. Run OpenCode once in a terminal, approve the requested access or sign in, then retry in Lasso.";
  }
  if (command === "cursor" && /waiting for permission or authentication/i.test(output)) {
    return "Cursor needs permission or authentication. Run Cursor once in a terminal, approve the requested access or sign in, then retry in Lasso.";
  }
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
  if (provider === "cursor") {
    return { command: "cursor", args: ["agent", "run", "--non-interactive", ...(selectedModel ? ["--model", selectedModel] : []), prompt || ""] };
  }
  if (provider === "opencode") {
    return { command: "opencode", args: ["run", "--format", "json", "--print-logs", "--log-level", "INFO", "--agent", "plan", ...(selectedModel ? ["--model", selectedModel] : []), prompt || ""] };
  }
  return { command: "codex", args: ["exec", "--json", "--sandbox", "read-only", "--skip-git-repo-check", ...(selectedModel ? ["--model", selectedModel] : []), prompt || ""] };
}

function runLocalCommand(
  cwd: string,
  command: string,
  args: string[],
  provider: LocalAgent,
  signal?: AbortSignal,
  onProgress?: AgentProgress,
  taskId?: string,
  onPrompt?: AgentPromptHandler,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ["pipe", "pipe", "pipe"] });
    const label = provider === "opencode" ? "OpenCode" : provider === "codex" ? "Codex" : provider === "cursor" ? "Cursor" : "Claude Code";
    let stdout = "";
    let stderr = "";
    let pendingStdout = "";
    let pendingStderr = "";
    let settled = false;
    let timedOut = false;
    let promptShown = false;
    const sendPrompt = (message: string, kind: AgentPrompt["kind"] = "permission") => {
      if (!taskId || promptShown) return;
      promptShown = true;
      activeAgentInputs.set(taskId, (value) => {
        promptShown = false;
        activeAgentInputs.delete(taskId);
        child.stdin.write(`${value}\n`);
      });
      onPrompt?.({ message, kind, options: kind === "permission" ? ["Allow", "Deny"] : undefined });
    };
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 3000).unref();
    }, 5 * 60 * 1000);
    timeout.unref();

    const consume = (chunk: Buffer | string, stream: "stdout" | "stderr") => {
      const value = String(chunk);
      if (stream === "stdout") {
        stdout += value;
        pendingStdout += value;
      } else {
        stderr += value;
        pendingStderr += value;
      }
      const pending = stream === "stdout" ? pendingStdout : pendingStderr;
      const lines = pending.split(/\r?\n/);
      const remainder = lines.pop() || "";
      if (stream === "stdout") pendingStdout = remainder;
      else pendingStderr = remainder;
      for (const line of lines) {
        for (const progress of progressEventsFromRaw(line, provider)) {
          onProgress?.(progress.message, progress.detail);
        }
        const promptMessage = permissionPromptMessage(line);
        if (promptMessage) {
          sendPrompt(promptMessage);
        } else if (stream === "stderr" && line.trim()) {
          const hint = agentFailureHint(line);
          if (hint) onProgress?.(`${label} · ${hint}`, undefined, "error");
          if (provider === "opencode" && /quota exceeded|authentication failed|invalid api key|unauthorized|forbidden/i.test(line)) {
            onProgress?.("OpenCode · provider rejected the request; stopping this task…", undefined, "error");
            child.kill("SIGTERM");
          }
        }
      }
    };

    child.stdout.on("data", (chunk) => consume(chunk, "stdout"));
    child.stderr.on("data", (chunk) => consume(chunk, "stderr"));

    const abort = () => child.kill("SIGTERM");
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });

    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (taskId) activeAgentInputs.delete(taskId);
      signal?.removeEventListener("abort", abort);
      reject(error);
    });
    child.once("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (taskId) activeAgentInputs.delete(taskId);
      signal?.removeEventListener("abort", abort);
      if (timedOut) {
        reject(new Error(`${label} did not finish within 5 minutes. Check its login or approval prompt, then retry.`));
        return;
      }
      const stdoutTail = pendingStdout.trim();
      const stderrTail = pendingStderr.trim();
      if (stdoutTail) {
        stdout += pendingStdout;
        for (const progress of progressEventsFromRaw(stdoutTail, provider)) {
          onProgress?.(progress.message, progress.detail);
        }
      }
      if (stderrTail) {
        for (const progress of progressEventsFromRaw(stderrTail, provider)) {
          onProgress?.(progress.message, progress.detail);
        }
        const hint = agentFailureHint(stderrTail);
        if (hint) onProgress?.(`${label} · ${hint}`, undefined, "error");
        if (provider === "opencode" && /quota exceeded|authentication failed|invalid api key|unauthorized|forbidden/i.test(stderrTail)) {
          onProgress?.("OpenCode · provider rejected the request; stopping this task…", undefined, "error");
        }
        if (provider === "cursor" && /quota exceeded|authentication failed|invalid api key|unauthorized|forbidden/i.test(stderrTail)) {
          onProgress?.("Cursor · provider rejected the request; stopping this task…", undefined, "error");
        }
      }
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });
  });
}

async function proposeWithLocalAgent(cwd: string, instruction: string, context: string, config: AgentConfig, signal?: AbortSignal, onProgress?: AgentProgress, taskId?: string, onPrompt?: AgentPromptHandler) {
  const outputContract = `CRITICAL: You MUST return ONLY valid JSON with actual file changes. NEVER explain, describe, or analyze code without proposing edits. ALWAYS return JSON with at least one change when given a modification instruction. Format: {"summary":"brief action taken","changes":[{"filePath":"relative/path","oldString":"exact existing text","newString":"replacement text"}]}. Treat the supplied source context as read-only. Before returning, verify every oldString against that context. Use project-relative paths only. Do not edit files, run write commands, commit, or produce markdown fences. If you cannot find the exact text to change, search the provided context more carefully - do not give up and explain instead.`;
  const prompt = `${instruction}\n\n${outputContract}\n\nLasso has already assembled this source context:\n${context || "No matching source context was found."}`;
  const local = localCommand(config.provider as LocalAgent, config.model, prompt);
  const command = local.command;
  const args = local.args;
  const result = await runLocalCommand(cwd, command, args, config.provider as LocalAgent, signal, onProgress, taskId, onPrompt);
  if (result.exitCode !== 0) throw new Error(localAgentError(command, result.stderr, result.exitCode));
  return extractLocalAgentProposal(result.stdout, config.provider as LocalAgent);
}

export async function proposeChanges(cwd: string, input: AgentInput, config: AgentConfig, signal?: AbortSignal, onProgress?: AgentProgress, onPrompt?: AgentPromptHandler) {
  const context = await contextFor(cwd, input.element);
  const visualContext = input.context ? { ...input.context, screenshots: undefined } : undefined;
  const history = input.messages?.map((message) => `${message.role}: ${message.content}`).join("\n") || input.instruction;
  const priorChanges = input.changesHistory?.length ? JSON.stringify(input.changesHistory, null, 2) : "None";
  const dragHint = input.context?.drag
    ? `\n\nDRAG REPOSITIONING TASK:\nThe user dragged this element by dx: ${input.context.drag.delta?.dx ?? 0}px, dy: ${input.context.drag.delta?.dy ?? 0}px to target coordinates (left: ${input.context.drag.targetRect?.left ?? 0}px, top: ${input.context.drag.targetRect?.top ?? 0}px). Modify the source code (CSS classes, Tailwind classes, flex/grid alignment, margin offsets, or positioning properties) so the element is accurately rendered at this target position.`
    : "";
  const instruction = `Selection context:\n${JSON.stringify(input.element, null, 2)}\n${JSON.stringify(visualContext, null, 2)}\n\nConversation history:\n${history}\n\nPrevious change history for this selection:\n${priorChanges}\n\nRelevant source context:\n${context || "No matching source context was found. Ask for a more specific selection rather than inventing a file."}${dragHint}\n\nCRITICAL: You MUST return ONLY JSON with actual file changes. Do NOT explain what you see or describe the code. Always propose concrete edits when given an instruction. Return JSON format: {"summary":"brief action taken","changes":[{"filePath":"relative/path","oldString":"exact existing text","newString":"replacement text"}]}`;
  if (config.provider === "claude-code" || config.provider === "codex" || config.provider === "opencode" || config.provider === "cursor") {
    return proposeWithLocalAgent(cwd, instruction, context, config, signal, onProgress, input.taskId, onPrompt);
  }
  const system = "You are Lasso, a source-code editing agent. Your ONLY job is to propose concrete file changes. NEVER explain, describe, or analyze code without proposing edits. ALWAYS return valid JSON with at least one change when the user requests a modification. Each oldString must occur exactly once in its file. Never rewrite whole files. Keep changes focused and minimal. If you cannot find the exact text to change, look harder at the provided context - do not give up and explain instead.";
  const model = config.model || (config.provider === "google" ? "gemini-2.5-flash" : config.provider === "openai" ? "gpt-4.1-mini" : config.provider === "ollama" ? "llama3.2" : config.provider === "nvidia" ? "meta/llama-3.1-70b-instruct" : "claude-sonnet-4-20250514");
  const image = input.context?.screenshots?.element || input.context?.screenshots?.full;
  const imageData = image?.replace(/^data:image\/[^;]+;base64,/, "");
  const imageMime = image?.match(/^data:(image\/[^;]+);base64,/)?.[1] || "image/jpeg";
  let response: Response;

  if (config.provider === "openai" || config.provider === "ollama" || config.provider === "nvidia") {
    const content = image ? [{ type: "text", text: instruction }, { type: "image_url", image_url: { url: image } }] : instruction;
    const baseUrl = config.baseUrl || (config.provider === "nvidia" ? "https://integrate.api.nvidia.com/v1" : "https://api.openai.com/v1");
    response = await fetch(`${baseUrl}/chat/completions`, {
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

export async function answerQuestion(cwd: string, input: AgentAnswer, config: AgentConfig, signal?: AbortSignal, onProgress?: AgentProgress, onPrompt?: AgentPromptHandler): Promise<string> {
  const context = await contextFor(cwd, input.element);
  const history = input.messages?.map((message) => `${message.role}: ${message.content}`).join("\n") || "None";
  const prompt = `Answer the user's question conversationally and directly. Do not propose file changes and do not return JSON. If the question is about the selected UI, use the selection and source context below.\n\nUser question:\n${input.question}\n\nSelected element:\n${JSON.stringify(input.element, null, 2)}\n\nVisual context:\n${JSON.stringify({ ...input.context, screenshots: undefined }, null, 2)}\n\nConversation:\n${history}\n\nRelevant source context:\n${context || "No matching source context was found."}`;

  if (config.provider === "claude-code" || config.provider === "codex" || config.provider === "opencode" || config.provider === "cursor") {
    const local = localCommand(config.provider as LocalAgent, config.model, prompt);
    const result = await runLocalCommand(cwd, local.command, local.args, config.provider as LocalAgent, signal, onProgress, input.taskId, onPrompt);
    if (result.exitCode !== 0) throw new Error(localAgentError(local.command, result.stderr, result.exitCode));
    return extractLocalAgentText(result.stdout, config.provider as LocalAgent).trim();
  }

  const model = config.model || (config.provider === "google" ? "gemini-2.5-flash" : config.provider === "openai" ? "gpt-4.1-mini" : config.provider === "ollama" ? "llama3.2" : config.provider === "nvidia" ? "meta/llama-3.1-70b-instruct" : "claude-sonnet-4-20250514");
  let response: Response;
  if (config.provider === "openai" || config.provider === "ollama" || config.provider === "nvidia") {
    const baseUrl = config.baseUrl || (config.provider === "nvidia" ? "https://integrate.api.nvidia.com/v1" : "https://api.openai.com/v1");
    response = await fetch(`${baseUrl}/chat/completions`, {
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
  const answer = config.provider === "openai" || config.provider === "ollama" || config.provider === "nvidia"
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
