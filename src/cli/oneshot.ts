import fs from "node:fs";
import path from "node:path";
import type { AgentConfig, SourceChange } from "./agent";
import { RuntimeClient, type RuntimeSessionInput, type RuntimeEvent } from "./runtime-client";
import { detectFramework } from "./utils/framework";
import { waitForAgentPrompt } from "./agent";

export interface OneShotThinkingStep {
  title: string;
  detail?: string;
  durationMs?: number;
}

export interface OneShotTodoItem {
  file: string;
  action: "modify" | "create" | "delete";
  reason: string;
}

export interface OneShotResult {
  ok: boolean;
  summary?: string;
  todo?: OneShotTodoItem[];
  changes?: SourceChange[];
  thinking?: OneShotThinkingStep[];
  totalThinkingTimeMs?: number;
  error?: string;
}

export interface ProgressCallback {
  (status: "thinking" | "working" | "review" | "error" | "stopped", message: string, detail?: string): void;
}

export interface PromptCallback {
  (prompt: { question: string; options?: string[] }): void;
}

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

function detectProjectStructure(cwd: string): any {
  const pkgPath = path.join(cwd, "package.json");
  let hasTypeScript = false;
  let hasReact = false;
  let hasNext = false;
  let hasVite = false;
  let hasTailwind = false;
  const files: string[] = [];
  const directories: string[] = [];
  const dependencies: string[] = [];
  const devDependencies: string[] = [];

  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      hasTypeScript = Boolean(deps.typescript);
      hasReact = Boolean(deps.react);
      hasNext = Boolean(deps.next);
      hasVite = Boolean(deps.vite);
      hasTailwind = Boolean(deps.tailwindcss);
      dependencies.push(...Object.keys(pkg.dependencies || {}));
      devDependencies.push(...Object.keys(pkg.devDependencies || {}));
    } catch {}
  }

  // Scan for files and directories
  function scanDir(dir: string, base: string = "") {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = base ? path.join(base, entry.name) : entry.name;
      
      if (entry.isDirectory()) {
        if (!entry.name.startsWith(".") && entry.name !== "node_modules") {
          directories.push(relativePath);
          scanDir(fullPath, relativePath);
        }
      } else {
        files.push(relativePath);
      }
    }
  }

  scanDir(cwd);

  return {
    hasTypeScript,
    hasReact,
    hasNext,
    hasVite,
    hasTailwind,
    files: files.slice(0, 200),
    directories: directories.slice(0, 50),
    dependencies,
    devDependencies,
    sourceRoot: fs.existsSync(path.join(cwd, "src")) ? "src" : ".",
  };
}

export async function runOneShotAgent(
  cwd: string,
  prompt: string,
  scope: "project" | "component",
  config: AgentConfig,
  signal: AbortSignal,
  onProgress: ProgressCallback,
  onPrompt: PromptCallback,
  messages?: ConversationMessage[],
  serverUrl?: string,
  apiKey?: string,
  taskId?: string,
  pageContext?: any
): Promise<OneShotResult> {
  const startTime = Date.now();
  
  try {
    if (signal.aborted) {
      return { ok: false, error: "Operation was cancelled" };
    }

    onProgress("thinking", "Analyzing project structure...", "Scanning files and dependencies");

    const projectStructure = detectProjectStructure(cwd);
    const framework = detectFramework(cwd);

    onProgress("thinking", "Inspecting application...", `Detected ${framework} framework`);

    const targetServerUrl = serverUrl || config.serverUrl || "https://api.lasso.byorello.space";
    const resolvedApiKey = apiKey || config.apiKey || config.lassoKey || "";

    const runtimeClient = new RuntimeClient(targetServerUrl, resolvedApiKey || undefined);

    onProgress("thinking", "Creating runtime session...", `Model: ${config.model || "claude-3-5-sonnet-20241022"}`);

    const sessionInput: RuntimeSessionInput = {
      userPrompt: prompt,
      conversation:
        Array.isArray(messages) && messages.length > 0
          ? messages
              .filter((m) => typeof m?.content === "string" && m.content.trim())
              .map((m) => ({ role: m.role, content: m.content }))
          : undefined,
      project: {
        projectId: "", // TODO: Get from workspace config
        framework,
        hasTypeScript: projectStructure.hasTypeScript,
        hasReact: projectStructure.hasReact,
        hasNext: projectStructure.hasNext,
        hasVite: projectStructure.hasVite,
        files: projectStructure.files.slice(0, 100),
        currentRoute: pageContext?.route || "/",
      },
      model: {
        provider: config.provider as any,
        id: config.model || "claude-3-5-sonnet-20241022",
      },
      selection: pageContext ? {
        element: pageContext.selectedElement ? {
          tag: pageContext.selectedElement.tag,
          text: pageContext.selectedElement.text,
          source: pageContext.selectedElement.source,
          attributes: pageContext.selectedElement.attributes,
        } : undefined,
        viewport: pageContext.viewport,
        route: pageContext.route,
        screenshot: pageContext.screenshot,
      } : undefined,
    };

    const session = await runtimeClient.createSession(sessionInput);

    const thinkingSteps: OneShotThinkingStep[] = [];
    let changes: SourceChange[] = [];

    await runtimeClient.runSession(session.id, cwd, (event: RuntimeEvent) => {
      if (signal.aborted) return;

      switch (event.type) {
        case "agent_started":
          break;

        case "agent_reasoning": {
          const summary = (event.data as any)?.summary;
          if (summary) {
            thinkingSteps.push({ title: summary, durationMs: 0 });
            onProgress("thinking", summary);
          }
          break;
        }

        case "tool_started": {
          const data = (event.data as any) || {};
          if (data.actionType === "model") break;
          const message = data.label || data.tool;
          if (message) onProgress("working", message);
          break;
        }

        case "tool_completed": {
          const data = (event.data as any) || {};
          if (data.actionType === "model") break;
          if (data.success === false) {
            const message = data.label || data.tool;
            onProgress("working", message ? `${message} didn't finish` : "A step didn't finish");
          }
          break;
        }

        case "phase_changed":
          break;

        case "verification_started":
          // Real check names/results arrive with verification_completed.
          break;

        case "verification_completed": {
          const data = (event.data as any) || {};
          const passed = data.success ?? data.passed;
          const summaries: string[] = (data.observations || [])
            .map((o: any) => o?.summary)
            .filter(Boolean);
          onProgress(
            passed ? "working" : "error",
            summaries.length
              ? summaries.join(" · ")
              : passed
                ? "Checks passed"
                : "Checks failed"
          );
          break;
        }

        case "waiting_for_user":
          const question = (event as any).data?.question || "Input required";
          onPrompt({ question });
          break;

        case "error":
          onProgress("error", (event.data as any).error || "Unknown error");
          break;
      }
    }, signal);

    // Get final session state to extract changes
    const finalSession = await runtimeClient.getSession(session.id);
    changes = extractChangesFromSession(finalSession);

    const totalThinkingTimeMs = Date.now() - startTime;

    return {
      ok: true,
      summary: "Task completed",
      changes,
      thinking: thinkingSteps,
      totalThinkingTimeMs,
    };
  } catch (error) {
    console.error("[Lasso] OneShot error:", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

function extractChangesFromSession(session: any): SourceChange[] {
  if (!session) return [];

  const pending = session.metadata?.pendingChanges;
  if (Array.isArray(pending) && pending.length > 0) {
    return pending.map((change: any) => ({
      filePath: change.filePath ?? change.path,
      oldString: change.oldString ?? "",
      newString: change.newString ?? "",
      operation: change.operation ||
        (change.oldString === "" && change.newString === "" ? "deleted" : change.oldString === "" ? "created" : "modified"),
    }));
  }

  const changes: SourceChange[] = [];
  for (const action of session.actions || []) {
    if (!action.data) continue;
    const filePath = action.data.filePath ?? action.data.path;
    if (!filePath) continue;
    if (action.type === "edit_file") {
      changes.push({
        filePath,
        oldString: action.data.oldString ?? "",
        newString: action.data.newString ?? "",
        operation: "modified",
      });
    } else if (action.type === "create_file") {
      changes.push({
        filePath,
        oldString: "",
        newString: action.data.content || "",
        operation: "created",
      });
    } else if (action.type === "delete_file") {
      changes.push({
        filePath,
        oldString: action.data.oldContent ?? "(deleted)",
        newString: "",
        operation: "deleted",
      });
    }
  }
  return changes;
}
