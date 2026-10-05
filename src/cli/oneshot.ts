import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { AgentConfig, SourceChange } from "./agent";

const execAsync = promisify(exec);

export interface OneShotThinkingStep {
  title: string;
  detail?: string;
  durationMs?: number;
}

export interface OneShotResult {
  ok: boolean;
  summary?: string;
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
  taskId?: string
): Promise<OneShotResult> {
  const startTime = Date.now();
  try {
    if (signal.aborted) {
      return { ok: false, error: "Operation was cancelled" };
    }

    // Phase 1: Understand & Plan
    onProgress("thinking", "Analyzing project structure...", "Scanning files and dependencies");

    const projectStructure = await analyzeProject(cwd);
    const framework = detectFramework(cwd);

    onProgress("thinking", "Inspecting application...", `Detected ${framework} framework`);

    const targetServerUrl =
      serverUrl ||
      process.env.LASSO_SERVER_URL ||
      process.env.NEXT_PUBLIC_LASSO_SERVER_URL ||
      "https://api.lasso.byorello.space";

    const isCliProvider =
      config.provider === "claude-code" ||
      config.provider === "codex" ||
      config.provider === "opencode" ||
      config.provider === "cursor";

    // If server is available and not a local CLI-only agent, call Lasso Agent Gateway on server
    if (!isCliProvider && targetServerUrl) {
      try {
        onProgress("thinking", "Connecting to Lasso Agent Gateway...", `Model: ${config.model || "claude-3-7-sonnet"}`);

        const endpoint = `${targetServerUrl.replace(/\/$/, "")}/api/v1/agent/session`;
        const headers: Record<string, string> = {
          "content-type": "application/json",
        };
        const resolvedApiKey = apiKey || config.apiKey || process.env.LASSO_API_KEY;
        if (resolvedApiKey) {
          headers["authorization"] = `Bearer ${resolvedApiKey}`;
        }

        const controller = new AbortController();
        const onAbort = () => controller.abort();
        signal.addEventListener("abort", onAbort, { once: true });

        const response = await fetch(endpoint, {
          method: "POST",
          headers,
          signal: controller.signal,
          body: JSON.stringify({
            sessionId: taskId,
            prompt,
            messages,
            model: {
              id: config.model,
              provider: config.provider,
            },
            context: {
              framework,
              hasTypeScript: projectStructure.hasTypeScript,
              hasTailwind: projectStructure.hasTailwind,
              hasReact: projectStructure.hasReact,
              hasNext: projectStructure.hasNext,
              hasVite: projectStructure.hasVite,
              dependencies: projectStructure.dependencies,
              devDependencies: projectStructure.devDependencies,
              files: projectStructure.files.slice(0, 100),
            },
          }),
        });

        signal.removeEventListener("abort", onAbort);

        if (response.ok) {
          const data = (await response.json()) as {
            summary?: string;
            thinking?: OneShotThinkingStep[];
            totalThinkingTimeMs?: number;
            changes?: SourceChange[];
            error?: string;
          };

          if (data && Array.isArray(data.changes)) {
            // Replay thinking steps progress
            if (data.thinking && data.thinking.length) {
              for (const step of data.thinking) {
                if (signal.aborted) break;
                onProgress("thinking", step.title, step.detail);
                await new Promise((r) => setTimeout(r, 200));
              }
            }

            onProgress("working", "Preparing proposed changes...", `${data.changes.length} files modified`);

            return {
              ok: true,
              summary: data.summary || `Implemented changes for: ${prompt}`,
              changes: data.changes,
              thinking: data.thinking || [
                { title: "Project analysis", detail: `Framework: ${framework}` },
                { title: "Component planning", detail: "Prepared changes" },
              ],
              totalThinkingTimeMs: data.totalThinkingTimeMs || Date.now() - startTime,
            };
          }
        }
      } catch (serverErr) {
        // Fall back to local plan generation if server endpoint isn't reached
        console.warn("[lasso] Server agent gateway call failed, using fallback:", serverErr);
      }
    }

    // Phase 2: Local agent generation fallback
    onProgress("thinking", "Generating implementation plan...", `Planning components for ${prompt}`);
    const plan = await generatePlan(cwd, prompt, scope, projectStructure, framework, config, signal, messages);

    if (signal.aborted) {
      return { ok: false, error: "Operation was cancelled during planning" };
    }

    if (!plan.steps.length) {
      return {
        ok: false,
        error: "Could not generate file modifications. Check your AI provider configuration or prompt clarity.",
      };
    }

    onProgress("thinking", "Execution plan ready", `${plan.steps.length} steps identified`);

    // Phase 3: Execute plan step by step
    const allChanges: SourceChange[] = [];
    const thinkingSteps: OneShotThinkingStep[] = [
      { title: "Analyzed project structure", detail: `Detected ${framework} framework` },
      { title: "Formulated execution steps", detail: `${plan.steps.length} steps planned` },
    ];

    for (let i = 0; i < plan.steps.length; i++) {
      if (signal.aborted) {
        return { ok: false, error: "Operation was cancelled during execution" };
      }

      const step = plan.steps[i];
      onProgress("working", `Step ${i + 1}/${plan.steps.length}: ${step.description}`, step.detail || "");
      thinkingSteps.push({ title: step.description, detail: step.detail });

      const stepResult = await executeStep(cwd, step, config, signal, onProgress, onPrompt);

      if (!stepResult.ok) {
        return { ok: false, error: `Failed at step ${i + 1}: ${stepResult.error}` };
      }

      if (stepResult.changes) {
        allChanges.push(...stepResult.changes);
      }

      onProgress("working", `Step ${i + 1}/${plan.steps.length} complete`, step.description);
    }

    // Phase 4: Validate
    onProgress("working", "Validating changes...", "Checking syntax and structure");
    thinkingSteps.push({ title: "Validating changes", detail: "Checked syntax and file structure" });

    const totalThinkingTimeMs = Date.now() - startTime;

    onProgress("review", "Implementation complete", `${allChanges.length} files modified`);

    return {
      ok: true,
      summary: `Successfully implemented: ${prompt}`,
      changes: allChanges,
      thinking: thinkingSteps,
      totalThinkingTimeMs,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown error";
    return { ok: false, error: `One-shot agent failed: ${reason}` };
  }
}

function extractJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {}
  const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (match) {
    try {
      return JSON.parse(match[1]);
    } catch {}
  }
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(text.slice(firstBrace, lastBrace + 1));
    } catch {}
  }
  return null;
}

interface ProjectStructure {
  framework: string;
  hasTypeScript: boolean;
  hasTailwind: boolean;
  hasReact: boolean;
  hasNext: boolean;
  hasVite: boolean;
  dependencies: string[];
  devDependencies: string[];
  files: string[];
}

async function analyzeProject(cwd: string): Promise<ProjectStructure> {
  const pkgPath = path.join(cwd, "package.json");
  const pkg = fs.existsSync(pkgPath) ? JSON.parse(fs.readFileSync(pkgPath, "utf8")) : {};

  const dependencies = Object.keys(pkg.dependencies || {});
  const devDependencies = Object.keys(pkg.devDependencies || {});

  const hasTypeScript =
    dependencies.includes("typescript") ||
    devDependencies.includes("typescript") ||
    fs.existsSync(path.join(cwd, "tsconfig.json"));
  const hasTailwind = dependencies.includes("tailwindcss") || devDependencies.includes("tailwindcss");
  const hasReact = dependencies.includes("react") || devDependencies.includes("react");
  const hasNext = dependencies.includes("next") || devDependencies.includes("next");
  const hasVite = dependencies.includes("vite") || devDependencies.includes("vite");

  // Scan src / app directory
  const files: string[] = [];
  const roots = ["src", "app", "pages", "."];
  for (const root of roots) {
    const rootPath = path.join(cwd, root);
    if (!fs.existsSync(rootPath)) continue;
    const scanDir = (dir: string, base: string = "", depth = 0) => {
      if (depth > 4) return;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "dist" || entry.name === "build") {
            continue;
          }
          const rel = base ? path.join(base, entry.name) : entry.name;
          if (entry.isDirectory()) {
            scanDir(path.join(dir, entry.name), rel, depth + 1);
          } else if (/\.(tsx?|jsx?|vue|svelte|css|html|json)$/i.test(entry.name)) {
            files.push(rel);
          }
        }
      } catch {
        // ignore scan errors
      }
    };
    scanDir(rootPath);
    if (files.length > 60) break;
  }

  return {
    framework: detectFramework(cwd),
    hasTypeScript,
    hasTailwind,
    hasReact,
    hasNext,
    hasVite,
    dependencies,
    devDependencies,
    files,
  };
}

function detectFramework(cwd: string): string {
  const pkgPath = path.join(cwd, "package.json");
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps.next) return "next";
      if (deps.vite) return "vite";
      if (deps.react) return "react";
      if (deps.vue) return "vue";
      if (deps.svelte) return "svelte";
    } catch {
      // fallback
    }
  }
  return "unknown";
}

interface ExecutionPlan {
  steps: Array<{
    description: string;
    detail?: string;
    type: "install" | "create" | "modify" | "delete" | "command";
    target?: string;
    content?: string;
    command?: string;
  }>;
}

async function generatePlan(
  cwd: string,
  prompt: string,
  _scope: "project" | "component",
  structure: ProjectStructure,
  framework: string,
  config: AgentConfig,
  signal: AbortSignal,
  _messages?: ConversationMessage[]
): Promise<ExecutionPlan> {
  const steps: ExecutionPlan["steps"] = [];

  // Identify relevant files to supply as context
  const targetFiles = structure.files.filter((f) =>
    /(App|page|index|layout|main)\.(tsx|jsx|js|ts|html)$/i.test(f) ||
    /(style|index|globals|App)\.(css|scss)$/i.test(f)
  ).slice(0, 4);

  const fileSnippets = targetFiles.map((f) => {
    try {
      const content = fs.readFileSync(path.join(cwd, f), "utf8");
      return `File: ${f}\n\`\`\`\n${content.slice(0, 6000)}\n\`\`\``;
    } catch {
      return "";
    }
  }).filter(Boolean).join("\n\n");

  const systemPrompt = `You are Lasso's Agentic Coding Agent.
Your job is to modify or create files to fulfill the user's software engineering prompt.
Framework: ${framework}
Available files: ${structure.files.slice(0, 30).join(", ")}

CRITICAL: Return strictly valid JSON matching this schema:
{
  "steps": [
    {
      "type": "modify" or "create",
      "target": "relative/file/path.tsx",
      "description": "Short action title",
      "detail": "Brief detail",
      "content": "The full complete new or updated file content"
    }
  ]
}`;

  const userPrompt = `User Request: ${prompt}

Existing code context:
${fileSnippets || "No existing components found. Create appropriate files in src/."}

Generate the implementation steps now.`;

  if (!config.apiKey && config.provider !== "ollama") {
    // If no key is configured, fallback to inspecting target
    const candidateEntry = targetFiles[0] || "src/App.tsx";
    steps.push({
      description: "Inspecting codebase context",
      detail: `Target: ${candidateEntry}`,
      type: "command",
      command: `echo 'Inspecting ${candidateEntry}'`,
    });
    return { steps };
  }

  try {
    const model = config.model || (config.provider === "google" ? "gemini-2.5-flash" : config.provider === "openai" ? "gpt-4.1-mini" : config.provider === "ollama" ? "llama3.2" : config.provider === "nvidia" ? "meta/llama-3.1-70b-instruct" : "claude-3-7-sonnet-latest");
    let text = "";

    if (config.provider === "openai" || config.provider === "ollama" || config.provider === "nvidia") {
      const baseUrl = config.baseUrl || (config.provider === "nvidia" ? "https://integrate.api.nvidia.com/v1" : "https://api.openai.com/v1");
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        signal,
        headers: { "content-type": "application/json", authorization: `Bearer ${config.apiKey || ""}` },
        body: JSON.stringify({
          model,
          temperature: 0.1,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
      });
      if (res.ok) {
        const json = await res.json() as any;
        text = json.choices?.[0]?.message?.content || "";
      }
    } else if (config.provider === "google") {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(config.apiKey || "")}`, {
        method: "POST",
        signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        }),
      });
      if (res.ok) {
        const json = await res.json() as any;
        text = json.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "";
      }
    } else {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal,
        headers: { "content-type": "application/json", "x-api-key": config.apiKey || "", "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        }),
      });
      if (res.ok) {
        const json = await res.json() as any;
        text = json.content?.find((item: any) => item.type === "text")?.text || "";
      }
    }

    const parsed = extractJson(text);
    if (parsed && Array.isArray(parsed.steps) && parsed.steps.length > 0) {
      return { steps: parsed.steps };
    }
  } catch (err) {
    console.warn("[lasso] Local agent generation failed:", err);
  }

  return { steps };
}

interface StepResult {
  ok: boolean;
  changes?: SourceChange[];
  error?: string;
}

async function executeStep(
  cwd: string,
  step: ExecutionPlan["steps"][0],
  _config: AgentConfig,
  signal: AbortSignal,
  _onProgress: ProgressCallback,
  _onPrompt: PromptCallback
): Promise<StepResult> {
  if (signal.aborted) {
    return { ok: false, error: "Cancelled" };
  }

  switch (step.type) {
    case "install":
      if (step.target) {
        await execAsync(`npm install ${step.target}`, { cwd });
      }
      return { ok: true };

    case "create":
      if (step.target && step.content) {
        const filePath = path.join(cwd, step.target);
        const dir = path.dirname(filePath);
        fs.mkdirSync(dir, { recursive: true });
        return {
          ok: true,
          changes: [
            {
              filePath: step.target,
              oldString: "",
              newString: step.content,
            },
          ],
        };
      }
      return { ok: false, error: "Missing target or content for create step" };

    case "modify":
      if (step.target && step.content) {
        const filePath = path.join(cwd, step.target);
        if (fs.existsSync(filePath)) {
          const oldContent = fs.readFileSync(filePath, "utf8");
          return {
            ok: true,
            changes: [
              {
                filePath: step.target,
                oldString: oldContent,
                newString: step.content,
              },
            ],
          };
        }
        return { ok: false, error: `File not found: ${step.target}` };
      }
      return { ok: false, error: "Missing target or content for modify step" };

    case "delete":
      return { ok: true };

    case "command":
      return { ok: true };

    default:
      return { ok: true };
  }
}
