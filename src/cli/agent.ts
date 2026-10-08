import fs from "node:fs";
import path from "node:path";
import { execFile, spawn, exec } from "node:child_process";
import { promisify } from "node:util";
import { loadCredentials } from "./auth";

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

interface ProjectStructureInfo {
  framework: string;
  sourceRoot: string;
  directories: string[];
  multipleAppDirs: string[];
}

function detectProjectStructure(cwd: string): ProjectStructureInfo {
  const pkgPath = path.join(cwd, "package.json");
  let framework = "unknown";
  const directories: string[] = [];
  const appDirs: string[] = [];

  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps.next) framework = "Next.js";
      else if (deps.vite) framework = "Vite";
      else if (deps.react) framework = "React";
    } catch {
      // Ignore errors
    }
  }

  // Scan for important directories
  const scanDirs = ["src", "app", "pages", "web", "lib", "components"];
  for (const dir of scanDirs) {
    if (fs.existsSync(path.join(cwd, dir))) {
      directories.push(dir);
      if (dir === "app") appDirs.push(dir);
      // Check for src/app structure
      if (dir === "src" && fs.existsSync(path.join(cwd, "src", "app"))) {
        directories.push("src/app");
        appDirs.push("src/app");
      }
    }
  }

  // Determine source root
  let sourceRoot = ".";
  if (directories.includes("src/app")) sourceRoot = "src";
  else if (directories.includes("app")) sourceRoot = ".";
  else if (directories.includes("src")) sourceRoot = "src";

  return { framework, sourceRoot, directories, multipleAppDirs: appDirs };
}

export type SourceChange = {
  filePath: string;
  oldString: string;
  newString: string;
};

export type AgentInput = {
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
  lassoKey?: string;
  serverUrl?: string;
};

export async function installPackages(
  cwd: string,
  packages: string[],
  onProgress?: AgentProgress
): Promise<string[]> {
  const validPkgs = [...new Set(
    packages
      .map((p) => p.trim().replace(/^['"`]|['"`]$/g, ""))
      .filter((p) => /^(@[a-z0-9\-~][a-z0-9\-_.]*\/)?[a-z0-9\-~][a-z0-9\-_.]*$/i.test(p))
  )];

  if (validPkgs.length === 0) return [];

  // Check package.json to see what is already installed
  let existingDeps: Record<string, string> = {};
  try {
    const pkgJsonPath = path.join(cwd, "package.json");
    const raw = fs.readFileSync(pkgJsonPath, "utf8");
    const parsed = JSON.parse(raw);
    existingDeps = { ...(parsed.dependencies || {}), ...(parsed.devDependencies || {}) };
  } catch {}

  const needed = validPkgs.filter((pkg) => !existingDeps[pkg]);
  if (needed.length === 0) return validPkgs;

  // Detect package manager
  let cmd = "npm install";
  try {
    const rootFiles = fs.readdirSync(cwd);
    if (rootFiles.includes("bun.lockb") || rootFiles.includes("bun.lock")) cmd = "bun add";
    else if (rootFiles.includes("pnpm-lock.yaml")) cmd = "pnpm add";
    else if (rootFiles.includes("yarn.lock")) cmd = "yarn add";
  } catch {}

  const commandStr = `${cmd} ${needed.join(" ")}`;
  onProgress?.(`Installing dependencies (${needed.join(", ")})…`, commandStr, "working");

  try {
    await execAsync(commandStr, { cwd, timeout: 120000 });
    onProgress?.(`Installed ${needed.join(", ")}`, undefined, "working");
  } catch (err: any) {
    onProgress?.(`Package installation failed: ${err.message}`, undefined, "error");
  }

  return validPkgs;
}

export type LocalAgent = "claude-code" | "codex" | "opencode" | "cursor";
export type AgentProgressLevel = "working" | "error";
export type AgentProgress = (message: string, detail?: string, level?: AgentProgressLevel) => void;
export type AgentPrompt = { message: string; kind: "permission" | "input" | "multiselect"; options?: string[] };
export type AgentPromptHandler = (prompt: AgentPrompt) => void;
type AgentProgressEvent = { message: string; detail?: string };
export type AgentAnswer = { taskId?: string; question: string; context?: AgentInput["context"]; element: AgentInput["element"]; messages?: AgentInput["messages"] };

const activeAgentInputs = new Map<string, (value: string) => void>();

export function respondToAgentPrompt(taskId: string, value: string): boolean {
  const respond = activeAgentInputs.get(taskId);
  if (!respond) return false;
  respond(value);
  activeAgentInputs.delete(taskId);
  return true;
}

export function waitForAgentPrompt(taskId: string, timeoutMs = 120000): Promise<string> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      activeAgentInputs.delete(taskId);
      resolve("Skip");
    }, timeoutMs);
    activeAgentInputs.set(taskId, (value) => {
      clearTimeout(timer);
      activeAgentInputs.delete(taskId);
      resolve(value);
    });
  });
}

export async function executeWebSearch(
  query: string,
  maxResults = 5
): Promise<Array<{ title: string; url: string; snippet: string }>> {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    const results: Array<{ title: string; url: string; snippet: string }> = [];
    const resultRegex = /<a class="result__snippet[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = resultRegex.exec(html)) !== null && results.length < maxResults) {
      const rawHref = match[1];
      const uddgMatch = rawHref.match(/uddg=([^&]+)/);
      const targetUrl = uddgMatch ? decodeURIComponent(uddgMatch[1]) : rawHref;
      const cleanSnippet = match[2]
        .replace(/<[^>]*>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/\s+/g, " ")
        .trim();

      if (cleanSnippet && targetUrl.startsWith("http")) {
        results.push({
          title: cleanSnippet.slice(0, 80),
          url: targetUrl,
          snippet: cleanSnippet,
        });
      }
    }
    return results;
  } catch {
    return [];
  }
}

const BLOCKED_COMMANDS = /\b(rm\s+-rf\s+\/|shutdown|reboot|sudo|mkfs|:\(\)\{\|:&\}|chmod\s+-R\s+777\s+\/)\b/i;

export async function executeAgentCommand(
  cwd: string,
  command: string,
  timeout = 30000
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  if (BLOCKED_COMMANDS.test(command)) {
    return { stdout: "", stderr: "Command rejected for safety reasons.", exitCode: 1 };
  }
  try {
    const { stdout, stderr } = await execAsync(command, { cwd, timeout });
    return {
      stdout: stdout.slice(0, 8000),
      stderr: stderr.slice(0, 2000),
      exitCode: 0,
    };
  } catch (err: any) {
    return {
      stdout: (err.stdout || "").slice(0, 8000),
      stderr: (err.stderr || err.message || "").slice(0, 2000),
      exitCode: err.code || 1,
    };
  }
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

function sourceFiles(directory: string, budget = { remaining: 25 }): string[] {
  if (budget.remaining <= 0) return [];
  const cached = sourceFileCache.get(directory);
  if (cached && cached.expiresAt > Date.now()) {
    const files = cached.files.slice(0, budget.remaining);
    budget.remaining -= files.length;
    return files;
  }
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files: string[] = [];
  const layoutFilesList: string[] = [];
  const otherFiles: string[] = [];

  for (const entry of entries) {
    if (ignored.has(entry.name) || entry.name.startsWith(".")) continue;
    const fullPath = path.join(directory, entry.name);
    if (budget.remaining <= 0) break;
    if (entry.isDirectory()) {
      const nested = sourceFiles(fullPath, budget);
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

function contextFor(cwd: string, element: AgentInput["element"]): string {
  const needle = element.label.replace(/^[^.#]+[.#]?/, "");
  const hintedPath = element.sourceHint?.split(":")[0];
  const sourceFile = hintedPath ? path.basename(hintedPath) : "";

  // Add project structure information at the top
  const structure = detectProjectStructure(cwd);
  let projectStructureInfo = `PROJECT STRUCTURE:
- Framework: ${structure.framework}
- Source root: ${structure.sourceRoot}
- Directories found: ${structure.directories.join(", ") || "root"}
- Multiple app directories: ${structure.multipleAppDirs.length > 0 ? structure.multipleAppDirs.join(", ") : "none"}
- IMPORTANT: When creating files, use the existing directory structure. Do not create duplicate directories (e.g., if "src/app/" exists, use it instead of creating a new "app/").
- Path aliases: Check tsconfig.json or jsconfig.json for path aliases like "@/components"

`;

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
        const content = fs.readFileSync(candidate, "utf8");
        return `${projectStructureInfo}FILE: ${path.relative(cwd, candidate)}\n${content.slice(0, 16000)}`;
      } catch {
        // The runtime source hint can point to a different checkout.
      }
    }
  }

  const files = sourceFiles(cwd);
  const snippets: string[] = [];
  const scoredFiles: Array<{ file: string; score: number; content: string }> = [];
  
  const results = files.map((file) => {
    try {
      const content = fs.readFileSync(file, "utf8");
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
  }).filter((r): r is NonNullable<typeof r> => r !== null);
  
  // Sort by score and take top files
  const sortedResults = results.filter((r): r is NonNullable<typeof r> => r !== null).sort((a, b) => b.score - a.score);
  
  for (const result of sortedResults) {
    if (snippets.length < 8) {
      snippets.push(`FILE: ${path.relative(cwd, result.file)}\n${result.content.slice(0, 6000)}`);
    }
  }

  return projectStructureInfo + snippets.join("\n\n---\n\n");
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

function jsonFrom(text: string): { summary: string; packages?: string[]; changes: SourceChange[] } {
  // Remove common progress prefixes and tool output noise
  const cleaned = text
    .replace(/^(Thinking|Working|Planning|Analyzing|Executing|Searching|Scanning)\.\.\.?$/gm, '')
    .replace(/^›/gm, '')
    .replace(/^>/gm, '')
    .replace(/^(grep|find|cat|ls|cd|npm|pnpm|yarn|git).*$/gm, '')
    .replace(/^src\/.*:\d+:.*$/gm, '')
    .replace(/^(The agent|Error|Warning|Info|Note):.*$/gm, '')
    .replace(/^(Progress|Activity|Output|Result):.*$/gm, '')
    .trim();

  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidates = [...(fenced ? [fenced] : []), ...jsonObjectCandidates(cleaned)];
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate.trim()) as { summary?: string; packages?: string[]; changes?: SourceChange[] };
      if (!Array.isArray(parsed.changes)) continue;
      for (const change of parsed.changes) {
        if (!change.filePath || typeof change.oldString !== "string" || typeof change.newString !== "string") {
          throw new Error("The agent returned an invalid file change.");
        }
      }
      const packages = Array.isArray(parsed.packages)
        ? parsed.packages.map((p) => String(p).trim()).filter(Boolean)
        : [];
      return {
        summary: parsed.summary || (packages.length > 0 ? `Installed ${packages.join(", ")} and updated components.` : "The proposed source changes are ready for review."),
        packages,
        changes: parsed.changes,
      };
    } catch (error) {
      if (error instanceof Error && error.message === "The agent returned an invalid file change.") throw error;
    }
  }
  throw new Error("The agent returned no valid reviewable changes. Progress output may have been mixed with the final JSON.");
}

export type AgentStepAction =
  | { type: "run_command"; command: string; thought?: string }
  | { type: "web_search"; query: string; thought?: string }
  | { type: "ask_user"; question: string; kind?: "permission" | "input" | "multiselect"; options?: string[]; thought?: string }
  | { type: "proposal"; summary: string; packages?: string[]; changes: SourceChange[] };

export function parseAgentAction(text: string): AgentStepAction {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidates = [...(fenced ? [fenced] : []), ...jsonObjectCandidates(text)];
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate.trim()) as any;
      if (parsed.action === "run_command" && typeof parsed.command === "string" && parsed.command.trim()) {
        return { type: "run_command", command: parsed.command.trim(), thought: parsed.thought };
      }
      if (parsed.action === "web_search" && typeof parsed.query === "string" && parsed.query.trim()) {
        return { type: "web_search", query: parsed.query.trim(), thought: parsed.thought };
      }
      if (parsed.action === "ask_user" && typeof parsed.question === "string" && parsed.question.trim()) {
        return {
          type: "ask_user",
          question: parsed.question.trim(),
          kind: parsed.kind === "multiselect" ? "multiselect" : parsed.kind === "input" ? "input" : "permission",
          options: Array.isArray(parsed.options) ? parsed.options.map(String) : undefined,
          thought: parsed.thought,
        };
      }
      if (Array.isArray(parsed.changes)) {
        for (const change of parsed.changes) {
          if (!change.filePath || typeof change.oldString !== "string" || typeof change.newString !== "string") {
            throw new Error("The agent returned an invalid file change.");
          }
        }
        const packages = Array.isArray(parsed.packages) ? parsed.packages.map((p: any) => String(p).trim()).filter(Boolean) : [];
        return {
          type: "proposal",
          summary: parsed.summary || (packages.length > 0 ? `Installed ${packages.join(", ")} and updated components.` : "The proposed source changes are ready for review."),
          packages,
          changes: parsed.changes,
        };
      }
    } catch (error) {
      if (error instanceof Error && error.message === "The agent returned an invalid file change.") throw error;
    }
  }
  const fallback = jsonFrom(text);
  return { type: "proposal", ...fallback };
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

function extractLocalAgentProposal(raw: string, provider: LocalAgent): { summary: string; packages?: string[]; changes: SourceChange[] } {
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
  {
    pattern: /quota exceeded|quota limit|out of quota|no quota|quota.*limit|usage.*quota|plan.*limit|plan.*exhausted|credit.*exhausted|billing.*quota|rate.*limit|429|too many requests|request.*limit|insufficient.*credits|no.*credits|credits.*exhausted/i,
    message: "Your plan quota has been exhausted. Please upgrade your plan or add credits to continue using this service.",
  },
  {
    pattern: /payment.*required|subscription.*required|upgrade.*required|upgrade.*plan|billing.*required/i,
    message: "Your subscription or plan requires an upgrade. Please check your billing settings and upgrade to continue.",
  },
  {
    pattern: /api.*key.*invalid|api.*key.*expired|invalid.*api.*key|expired.*api.*key|authentication.*failed|unauthorized|forbidden|401|403/i,
    message: "Authentication failed. Check your API key or sign in to your account, then retry.",
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
  // Check for quota/plan exhaustion in the output
  if (/quota exceeded|quota limit|out of quota|no quota|plan.*limit|plan.*exhausted|credit.*exhausted|billing.*quota|rate.*limit|429|too many requests|request.*limit|insufficient.*credits|no.*credits|credits.*exhausted/i.test(output)) {
    return `${command === "opencode" ? "OpenCode" : command === "cursor" ? "Cursor" : command} request failed: Your plan quota has been exhausted. Please upgrade your plan or add credits to continue using this service.`;
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
    // Headless invocations: codex/opencode/cursor read stdin until EOF and otherwise hang
    // until our timeout, so close stdin right away. Prompt answers can no longer be piped
    // back in, which is fine — none of these command lines are interactive. Swallow the
    // EPIPE that a late write would raise so it cannot crash the CLI.
    child.stdin?.on("error", () => {});
    child.stdin?.end();
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
        const stderrTail = pendingStderr.trim();
        // Check if timeout was due to quota exhaustion
        if (/quota exceeded|quota limit|out of quota|no quota|plan.*limit|plan.*exhausted|credit.*exhausted|billing.*quota|rate.*limit|429|too many requests|request.*limit|insufficient.*credits|no.*credits|credits.*exhausted/i.test(stderrTail)) {
          reject(new Error(`${label} did not finish within 5 minutes: Your plan quota has been exhausted. Please upgrade your plan or add credits to continue using this service.`));
        } else {
          reject(new Error(`${label} did not finish within 5 minutes. Check its login or approval prompt, then retry.`));
        }
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
  const outputContract = `CRITICAL: You MUST return ONLY valid JSON with actual file changes. NEVER explain, describe, or analyze code without proposing edits. If third-party npm packages are needed, list them in "packages". ALWAYS return JSON with at least one change when given a modification instruction. Format: {"summary":"brief action taken","packages":["optional-package-name"],"changes":[{"filePath":"relative/path","oldString":"exact existing text","newString":"replacement text"}]}. Treat the supplied source context as read-only. Before returning, verify every oldString against that context. Use project-relative paths only. Do not edit files, run write commands, commit, or produce markdown fences. If you cannot find the exact text to change, search the provided context more carefully - do not give up and explain instead.`;
  const prompt = `${instruction}\n\n${outputContract}\n\nLasso has already assembled this source context:\n${context || "No matching source context was found."}`;
  const local = localCommand(config.provider as LocalAgent, config.model, prompt);
  const command = local.command;
  const args = local.args;
  const result = await runLocalCommand(cwd, command, args, config.provider as LocalAgent, signal, onProgress, taskId, onPrompt);
  if (result.exitCode !== 0) throw new Error(localAgentError(command, result.stderr, result.exitCode));
  return extractLocalAgentProposal(result.stdout, config.provider as LocalAgent);
}

// Runs a local coding-agent CLI (claude/codex/opencode/cursor) and returns its final text.
// The CLI authenticates itself (its own login), so no provider API key is required.
export async function runLocalAgentPrompt(
  cwd: string,
  config: AgentConfig,
  prompt: string,
  signal?: AbortSignal,
  onProgress?: AgentProgress,
  taskId?: string,
  onPrompt?: AgentPromptHandler
): Promise<string> {
  const provider = config.provider as LocalAgent;
  const local = localCommand(provider, config.model, prompt);
  const result = await runLocalCommand(cwd, local.command, local.args, provider, signal, onProgress, taskId, onPrompt);
  if (result.exitCode !== 0) throw new Error(localAgentError(local.command, result.stderr, result.exitCode));
  return extractLocalAgentText(result.stdout, provider);
}

export async function proposeChanges(cwd: string, input: AgentInput, config: AgentConfig, signal?: AbortSignal, onProgress?: AgentProgress, onPrompt?: AgentPromptHandler) {
  const context = contextFor(cwd, input.element);
  const runtimeErrors = input.context?.runtimeErrors || [];
  const visualContext = input.context ? { ...input.context, screenshots: undefined, runtimeErrors: undefined } : undefined;
  const history = input.messages?.map((message) => `${message.role}: ${message.content}`).join("\n") || input.instruction;
  const priorChanges = input.changesHistory?.length ? JSON.stringify(input.changesHistory, null, 2) : "None";
  const dragHint = input.context?.drag
    ? `\n\nDRAG REPOSITIONING TASK:\nThe user dragged this element by dx: ${input.context.drag.delta?.dx ?? 0}px, dy: ${input.context.drag.delta?.dy ?? 0}px to target coordinates (left: ${input.context.drag.targetRect?.left ?? 0}px, top: ${input.context.drag.targetRect?.top ?? 0}px). Modify the source code (CSS classes, Tailwind classes, flex/grid alignment, margin offsets, or positioning properties) so the element is accurately rendered at this target position.`
    : "";
  const runtimeErrorHint = runtimeErrors.length
    ? `\n\nLIVE CONSOLE/RUNTIME ERRORS (reported by the user's browser — the page is currently broken by these):\n${runtimeErrors.map((error) => `! ${error}`).join("\n")}`
    : "";

  // Detect project structure for instruction
  const structure = detectProjectStructure(cwd);

  const instruction = `Selection context:
${JSON.stringify(input.element, null, 2)}
${JSON.stringify(visualContext, null, 2)}

User instruction:
${input.instruction}

Conversation history:
${history}

Previous change history for this selection:
${priorChanges}

Relevant source context:
${context || "No matching source context was found. Ask for a more specific selection rather than inventing a file."}${dragHint}${runtimeErrorHint}

CRITICAL INSTRUCTIONS:
0. PROJECT STRUCTURE AWARENESS: This project has specific directory structure. Before creating or moving files, verify the actual structure. Do not assume standard locations.
${structure.multipleAppDirs.length > 0 ? `   WARNING: Multiple app directories detected: ${structure.multipleAppDirs.join(", ")}. Use the correct one for this project.\n` : ""}
1. You are an autonomous agent with the ability to install npm packages and edit source code.
2. If the user's request requires or asks for third-party libraries, icon packs, animation tools, or utility packages (e.g. icon libraries, motion, charts, UI primitives, etc.), determine the best npm package for this project and declare them in the "packages" array (e.g. ["@iconify/react", "@hugeicons/react"]).
3. In the "changes" array, propose concrete, minimal edits to the source code to implement the request. You may freely import and use the packages you specified in "packages".
4. If no new packages are required, "packages" should be empty [].
5. If LIVE CONSOLE/RUNTIME ERRORS are listed, fixing them is part of this task — the user's page is currently broken by them.
6. Never guess a package's export names. Before importing a named export (an icon, a component, a hook), verify it actually exists in the installed package (run_command grepping node_modules, or the package docs) — importing a non-existent export throws a SyntaxError and kills the whole page.
7. You MUST return ONLY valid JSON in this exact structure:
{
  "summary": "Brief explanation of what was done",
  "packages": ["package-name-1", "package-name-2"],
  "changes": [
    {
      "filePath": "relative/path/to/file.tsx",
      "oldString": "exact existing text",
      "newString": "replacement text"
    }
  ]
}
Do NOT return prose or markdown outside the JSON.`;

  const callServerGateway = async (gatewayKey: string) => {
    // Use CLI auth key if available, otherwise use the provided gateway key
    const cliCredentials = loadCredentials();
    const apiKeyToUse = cliCredentials?.apiKey || gatewayKey;

    let serverUrl = config.serverUrl || process.env.LASSO_SERVER_URL || process.env.NEXT_PUBLIC_LASSO_SERVER_URL || "https://api.lasso.byorello.space";
    if (serverUrl.includes("collab.lasso.byorello.space")) {
      serverUrl = serverUrl.replace("collab.lasso.byorello.space", "api.lasso.byorello.space");
    }
    const endpoint = `${serverUrl.replace(/\/+$/, "").replace(/\/api\/v1$/, "")}/api/v1/agent/session`;
    const sourceHints: Record<string, string> = {};
    const fileMatch = context?.match(/^FILE:\s*([^\r\n]+)\r?\n([\s\S]*)$/);
    if (fileMatch) {
      sourceHints[fileMatch[1].trim()] = fileMatch[2].slice(0, 16000);
    } else if (context) {
      sourceHints["selection-context"] = context.slice(0, 16000);
    }

    const response = await fetch(endpoint, {
      method: "POST",
      signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKeyToUse}` },
      body: JSON.stringify({
        sessionId: input.taskId,
        prompt: instruction,
        model: { id: config.model, provider: config.provider },
        context: { sourceHints: Object.keys(sourceHints).length > 0 ? sourceHints : undefined },
      }),
    });
    if (!response.ok) {
      const errData = await response.json().catch(() => ({})) as { error?: string; status?: string; summary?: string };
      const errorMessage = errData.error || `Lasso Agent Gateway request failed (${response.status})`;
      // Check for quota/plan exhaustion
      if (/quota exceeded|quota limit|out of quota|no quota|plan.*limit|plan.*exhausted|credit.*exhausted|billing.*quota|rate.*limit|429|too many requests|request.*limit|insufficient.*credits|no.*credits|credits.*exhausted|payment.*required|subscription.*required|upgrade.*required|upgrade.*plan|billing.*required/i.test(errorMessage)) {
        throw new Error("Your plan quota has been exhausted. Please upgrade your plan or add credits to continue using this service.");
      }
      throw new Error(errorMessage);
    }
    const data = await response.json() as { changes?: Array<{ filePath: string; oldString: string; newString: string }>; packages?: string[]; summary?: string; status?: string; error?: string };
    // If the server-side agent reported failure, surface it as a thrown error so the
    // bridge catches it and shows status="error" / "Retry" button, not status="review".
    if (data.status === "failed") {
      throw new Error(data.error || data.summary || "Agent encountered an issue while generating changes.");
    }
    return { summary: data.summary || "Done", packages: data.packages || [], changes: data.changes || [] };
  };

  let proposal: { summary: string; packages?: string[]; changes: SourceChange[] } | null = null;

  // Helper: call /api/v1/agent/generate for one turn of the agentic loop using the Lasso gateway.
  // This allows paid/hosted model users to run the full agentic loop (web_search, run_command,
  // ask_user, propose_changes) rather than being shunted to the one-shot /session endpoint.
  const callGatewayGenerate = async (gatewayKey: string, systemPrompt: string, turnPrompt: string): Promise<string> => {
    let serverUrl = config.serverUrl || process.env.LASSO_SERVER_URL || process.env.NEXT_PUBLIC_LASSO_SERVER_URL || "https://api.lasso.byorello.space";
    if (serverUrl.includes("collab.lasso.byorello.space")) {
      serverUrl = serverUrl.replace("collab.lasso.byorello.space", "api.lasso.byorello.space");
    }
    const endpoint = `${serverUrl.replace(/\/+$/, "").replace(/\/api\/v1$/, "")}/api/v1/agent/generate`;
    const response = await fetch(endpoint, {
      method: "POST",
      signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${gatewayKey}` },
      body: JSON.stringify({
        provider: config.provider,
        model: config.model,
        system: systemPrompt,
        prompt: turnPrompt,
      }),
    });
    if (!response.ok) {
      const errData = await response.json().catch(() => ({})) as { error?: string };
      const errorMessage = errData.error || `Lasso Gateway generate failed (${response.status})`;
      // Check for quota/plan exhaustion
      if (/quota exceeded|quota limit|out of quota|no quota|plan.*limit|plan.*exhausted|credit.*exhausted|billing.*quota|rate.*limit|429|too many requests|request.*limit|insufficient.*credits|no.*credits|credits.*exhausted|payment.*required|subscription.*required|upgrade.*required|upgrade.*plan|billing.*required/i.test(errorMessage)) {
        throw new Error("Your plan quota has been exhausted. Please upgrade your plan or add credits to continue using this service.");
      }
      throw new Error(errorMessage);
    }
    const data = await response.json() as { text?: string };
    if (!data.text?.trim()) throw new Error("The agent returned an empty response.");
    return data.text.trim();
  };

  if (config.provider === "claude-code" || config.provider === "codex" || config.provider === "opencode" || config.provider === "cursor") {
    proposal = await proposeWithLocalAgent(cwd, instruction, context, config, signal, onProgress, input.taskId, onPrompt);
  } else {
    // Check if using Lasso platform key (from CLI auth or env)
    const cliCredentials = loadCredentials();
    const isLassoKey = cliCredentials?.apiKey || config.apiKey?.startsWith("lss_live_") || config.apiKey?.startsWith("lss_");
    const system = `You are Lasso, an autonomous agentic AI coding assistant.
You have the ability to run inspection commands, search the live web for documentation or libraries, ask the user for input or single/multi-selection choices, install npm packages, and edit source code.

AVAILABLE ACTIONS:
1. "run_command": Run safe inspection commands in the project (e.g. grep, find, ls, git status, cat) to investigate files or exports.
   Format: {"action": "run_command", "command": "grep -rn 'search_term' src/", "thought": "Why you need to run this command"}

2. "web_search": Search the live web to find real-time documentation, package details, or API signatures rather than assuming.
   Format: {"action": "web_search", "query": "lucide react icons documentation", "thought": "Why you need to search"}

3. "ask_user": Ask the user for clarification, single-choice, or multi-selection input when their intent is ambiguous.
   Format: {"action": "ask_user", "question": "Which icon library would you prefer?", "kind": "multiselect" | "single_select" | "input", "options": ["Option 1", "Option 2"], "thought": "Why you need user choice"}

4. "propose_changes": Finalize and propose the exact file edits and required npm packages.
   Format:
   {
     "action": "propose_changes",
     "summary": "Brief explanation of what was done",
     "packages": ["package-name-1", "package-name-2"],
     "changes": [
       {
         "filePath": "relative/path/to/file.tsx",
         "oldString": "exact existing text",
         "newString": "replacement text"
       }
     ]
   }

RULES:
- If you already have sufficient context to fulfill the user's request immediately, return "propose_changes" (or standard {"summary": "...", "packages": [...], "changes": [...]}) directly!
- If live console/runtime errors are provided, resolving them is part of the task. Use run_command to verify package exports and file contents before proposing changes instead of guessing.
- Each oldString must match the existing file context exactly.
- CRITICAL: Return ONLY valid JSON with no markdown formatting, no code blocks, no prose, no thinking tags, and no progress output. Just the JSON object.
- Do NOT include phrases like "Thinking...", "Working...", or any progress indicators in your response.
- Do NOT wrap the JSON in code blocks. Return raw JSON only.`;

    const model = config.model;

    if (!model) {
      return {
        summary: "No model selected. Please select a model in settings.",
        changes: [],
        packages: [],
      };
    }

    const image = input.context?.screenshots?.element || input.context?.screenshots?.full;
    const imageData = image?.replace(/^data:image\/[^;]+;base64,/, "");
    const imageMime = image?.match(/^data:(image\/[^;]+);base64,/)?.[1] || "image/jpeg";

    const MAX_TURNS = 5;
    let turn = 0;
    const toolLogs: string[] = [];

    while (turn < MAX_TURNS) {
      turn++;
      const toolContext = toolLogs.length > 0 ? `\n\nTOOL EXECUTION & USER INTERACTION HISTORY:\n${toolLogs.join("\n\n")}` : "";
      const currentPrompt = `${instruction}${toolContext}`;

      let rawText = "";
      try {
        // If using a Lasso platform key, route this turn through the /generate endpoint
        // (full agentic loop via Lasso gateway instead of one-shot session endpoint)
        if (isLassoKey && config.provider !== "ollama") {
          const apiKeyToUse = cliCredentials?.apiKey || config.apiKey!;
          rawText = await callGatewayGenerate(apiKeyToUse, system, currentPrompt);
        } else {
          // Provider-direct inference path
          let response: Response;
          if (config.provider === "openai" || config.provider === "ollama" || config.provider === "nvidia") {
            const content = image && turn === 1 ? [{ type: "text", text: currentPrompt }, { type: "image_url", image_url: { url: image } }] : currentPrompt;
            const baseUrl = config.baseUrl || (config.provider === "nvidia" ? "https://integrate.api.nvidia.com/v1" : "https://api.openai.com/v1");
            response = await fetch(`${baseUrl}/chat/completions`, {
              method: "POST",
              signal,
              headers: { "content-type": "application/json", authorization: `Bearer ${config.apiKey || ""}` },
              body: JSON.stringify({ model, temperature: 0.1, messages: [{ role: "system", content: system }, { role: "user", content }] }),
            });
          } else if (config.provider === "google") {
            const parts: Array<Record<string, unknown>> = [{ text: currentPrompt }];
            if (imageData && turn === 1) parts.push({ inlineData: { mimeType: imageMime, data: imageData } });
            response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(config.apiKey || "")}`, {
              method: "POST",
              signal,
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts }] }),
            });
          } else {
            const content: Array<Record<string, unknown>> = [{ type: "text", text: currentPrompt }];
            if (imageData && turn === 1) content.push({ type: "image", source: { type: "base64", media_type: imageMime, data: imageData } });
            response = await fetch("https://api.anthropic.com/v1/messages", {
              method: "POST",
              signal,
              headers: { "content-type": "application/json", "x-api-key": config.apiKey || "", "anthropic-version": "2023-06-01" },
              body: JSON.stringify({ model, max_tokens: 4096, system, messages: [{ role: "user", content }] }),
            });
          }
          if (!response.ok) {
            // Check for quota/plan exhaustion before fallback
            if (response.status === 429 || response.status === 402 || response.status === 403) {
              throw new Error("Your plan quota has been exhausted. Please upgrade your plan or add credits to continue using this service.");
            }
            if (config.lassoKey && (response.status === 429 || response.status === 401)) {
              onProgress?.("Local provider key limit reached; routing via Lasso Gateway…", undefined, "working");
              proposal = await callServerGateway(config.lassoKey);
              break;
            }
            throw new Error(`Agent request failed (${response.status}).`);
          }
          const payload = await response.json() as {
            content?: Array<{ type?: string; text?: string }>;
            choices?: Array<{ message?: { content?: string } }>;
            candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
          };
          const contentCandidate = (config.provider === "openai" || config.provider === "nvidia" || config.provider === "ollama")
            ? payload.choices?.[0]?.message?.content
            : config.provider === "google"
              ? payload.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("")
              : payload.content?.find((item) => item.type === "text")?.text;
          rawText = contentCandidate || "";
          if (!rawText) throw new Error("The agent returned an empty response.");
        }
      } catch (err: any) {
        // Check for quota/plan exhaustion before fallback
        if (err.message?.includes("429") || err.message?.includes("402") || err.message?.includes("403")) {
          throw new Error("Your plan quota has been exhausted. Please upgrade your plan or add credits to continue using this service.");
        }
        if (!isLassoKey && config.lassoKey && (err.message?.includes("429") || err.message?.includes("401"))) {
          onProgress?.("Local provider key limit reached; routing via Lasso Gateway…", undefined, "working");
          proposal = await callServerGateway(config.lassoKey);
          break;
        }
        throw err;
      }

      const action = parseAgentAction(rawText);

      if (action.type === "run_command") {
        onProgress?.("Running command…", `$ ${action.command}`, "working");
        const res = await executeAgentCommand(cwd, action.command);
        const outputSnippet = res.stdout || res.stderr || "(no output)";
        onProgress?.(`Command completed: ${action.command}`, outputSnippet.slice(0, 150), "working");
        toolLogs.push(`Turn ${turn} Command executed: ${action.command}\nExit code: ${res.exitCode}\nOutput:\n${outputSnippet.slice(0, 3000)}`);
        continue;
      }

      if (action.type === "web_search") {
        onProgress?.("Searching the web…", `🔍 ${action.query}`, "working");
        const results = await executeWebSearch(action.query);
        const summary = results.length > 0
          ? results.map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.snippet}`).join("\n\n")
          : "No web results found.";
        onProgress?.(`Web search complete: ${action.query}`, `${results.length} results found`, "working");
        toolLogs.push(`Turn ${turn} Web search for "${action.query}":\n${summary.slice(0, 3000)}`);
        continue;
      }

      if (action.type === "ask_user") {
        if (onPrompt && input.taskId) {
          onProgress?.("Waiting for your response…", action.question, "working");
          onPrompt({
            message: action.question,
            kind: action.kind || "permission",
            options: action.options,
          });
          const answer = await waitForAgentPrompt(input.taskId);
          onProgress?.(`Answer received: ${answer}`, undefined, "working");
          toolLogs.push(`Turn ${turn} Asked user: "${action.question}"\nUser response: ${answer}`);
          continue;
        }
      }

      if (action.type === "proposal") {
        proposal = {
          summary: action.summary,
          packages: action.packages,
          changes: action.changes,
        };
      } else {
        proposal = { summary: "Waiting for user input.", changes: [] };
      }
      break;
    }

    if (!proposal) {
      proposal = { summary: "Completed agent task.", changes: [] };
    }
  }

  const finalProposal: { summary: string; packages?: string[]; changes: SourceChange[] } = proposal || { summary: "Completed agent task.", changes: [] };

  // Agentic execution: If the AI decided packages are needed, install them now
  if (finalProposal.packages && finalProposal.packages.length > 0) {
    await installPackages(cwd, finalProposal.packages, onProgress);
  }

  return finalProposal;
}

export async function answerQuestion(cwd: string, input: AgentAnswer, config: AgentConfig, signal?: AbortSignal, onProgress?: AgentProgress, onPrompt?: AgentPromptHandler): Promise<string> {
  const context = contextFor(cwd, input.element);
  const history = input.messages?.map((message) => `${message.role}: ${message.content}`).join("\n") || "None";
  const prompt = `Answer the user's question conversationally and directly. Do not propose file changes and do not return JSON. If the question is about the selected UI, use the selection and source context below.\n\nUser question:\n${input.question}\n\nSelected element:\n${JSON.stringify(input.element, null, 2)}\n\nVisual context:\n${JSON.stringify({ ...input.context, screenshots: undefined }, null, 2)}\n\nConversation:\n${history}\n\nRelevant source context:\n${context || "No matching source context was found."}`;

  if (config.provider === "claude-code" || config.provider === "codex" || config.provider === "opencode" || config.provider === "cursor") {
    return (await runLocalAgentPrompt(cwd, config, prompt, signal, onProgress, input.taskId, onPrompt)).trim();
  }

  const callServerGatewayAnswer = async (gatewayKey: string): Promise<string> => {
    // Use CLI auth key if available, otherwise use the provided gateway key
    const cliCredentials = loadCredentials();
    const apiKeyToUse = cliCredentials?.apiKey || gatewayKey;

    let serverUrl = config.serverUrl || process.env.LASSO_SERVER_URL || process.env.NEXT_PUBLIC_LASSO_SERVER_URL || "https://api.lasso.byorello.space";
    if (serverUrl.includes("collab.lasso.byorello.space")) {
      serverUrl = serverUrl.replace("collab.lasso.byorello.space", "api.lasso.byorello.space");
    }
    const endpoint = `${serverUrl.replace(/\/+$/, "").replace(/\/api\/v1$/, "")}/api/v1/agent/generate`;
    const response = await fetch(endpoint, {
      method: "POST",
      signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKeyToUse}` },
      body: JSON.stringify({
        provider: config.provider,
        model: config.model,
        system: "Answer conversationally and directly. Do not edit files or return JSON.",
        prompt,
      }),
    });
    if (!response.ok) {
      const errData = await response.json().catch(() => ({})) as { error?: string };
      const errorMessage = errData.error || `Lasso Agent Gateway request failed (${response.status})`;
      // Check for quota/plan exhaustion
      if (/quota exceeded|quota limit|out of quota|no quota|plan.*limit|plan.*exhausted|credit.*exhausted|billing.*quota|rate.*limit|429|too many requests|request.*limit|insufficient.*credits|no.*credits|credits.*exhausted|payment.*required|subscription.*required|upgrade.*required|upgrade.*plan|billing.*required/i.test(errorMessage)) {
        throw new Error("Your plan quota has been exhausted. Please upgrade your plan or add credits to continue using this service.");
      }
      throw new Error(errorMessage);
    }
    const data = await response.json() as { text?: string };
    if (!data.text?.trim()) throw new Error("The agent returned an empty answer.");
    return data.text.trim();
  };

  // Check if using Lasso platform key (from CLI auth or env)
  const cliCredentials = loadCredentials();
  const isLassoKey = cliCredentials?.apiKey || config.apiKey?.startsWith("lss_live_") || config.apiKey?.startsWith("lss_");
  if (isLassoKey && config.provider !== "ollama") {
    const apiKeyToUse = cliCredentials?.apiKey || config.apiKey!;
    return await callServerGatewayAnswer(apiKeyToUse);
  }

  const model = config.model;

  if (!model) {
    return "No model selected. Please select a model in settings.";
  }

  let response: Response;
  try {
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
    if (!response.ok) {
      // Check for quota/plan exhaustion before fallback
      if (response.status === 429 || response.status === 402 || response.status === 403) {
        throw new Error("Your plan quota has been exhausted. Please upgrade your plan or add credits to continue using this service.");
      }
      if (config.lassoKey && (response.status === 429 || response.status === 401)) {
        onProgress?.("Local provider key limit reached; routing via Lasso Gateway…", undefined, "working");
        return await callServerGatewayAnswer(config.lassoKey);
      }
      throw new Error(`Agent request failed (${response.status}).`);
    }
    const payload = await response.json() as { content?: Array<{ type?: string; text?: string }>; choices?: Array<{ message?: { content?: string } }>; candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const answer = config.provider === "openai" || config.provider === "ollama" || config.provider === "nvidia"
      ? payload.choices?.[0]?.message?.content
      : config.provider === "google"
        ? payload.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("")
        : payload.content?.find((item) => item.type === "text")?.text;
    if (!answer?.trim()) throw new Error("The agent returned an empty answer.");
    return answer.trim();
  } catch (err: any) {
    if (config.lassoKey && (err.message?.includes("429") || err.message?.includes("401"))) {
      onProgress?.("Local provider key limit reached; routing via Lasso Gateway…", undefined, "working");
      return await callServerGatewayAnswer(config.lassoKey);
    }
    throw err;
  }
}

export async function generateCommitMessage(cwd: string, status: string[], config: AgentConfig, signal?: AbortSignal, onProgress?: AgentProgress): Promise<string> {
  const answer = await answerQuestion(cwd, {
    question: `Generate exactly one concise Conventional Commit message for these changes. Return only the commit subject line, no quotes, markdown, explanation, or body. Keep it under 100 characters.\n\nChanged files:\n${status.join("\n") || "No changed files listed."}`,
    element: { tag: "git", group: "workspace", label: "Git working tree" },
  }, config, signal, onProgress);
  return answer.split(/\r?\n/).map((line) => line.replace(/^[-*]\s*/, "").replace(/^['"`]|['"`]$/g, "").trim()).find(Boolean)?.slice(0, 120) || "Update project files";
}
