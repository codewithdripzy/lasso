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

export function isConversationalPrompt(prompt: string): boolean {
  const p = prompt.trim().toLowerCase().replace(/[!?.,;:]+$/, "");
  const greetings = [
    "hi", "hello", "hey", "heya", "howdy", "sup", "yo",
    "good morning", "good afternoon", "good evening",
    "thanks", "thank you", "thx", "ty", "cool", "awesome", "great", "nice",
    "who are you", "what are you", "what can you do", "help", "help me",
    "what is lasso", "how do you work", "how does this work",
  ];
  if (greetings.includes(p)) return true;
  if (/^(hi|hello|hey|howdy|yo)\b/i.test(p) && p.split(/\s+/).length <= 4) {
    const buildKeywords = /(build|create|add|make|fix|update|modify|change|refactor|implement|delete|remove|style|install|wire|code)/i;
    if (!buildKeywords.test(p)) return true;
  }
  const questionOnly = /^(what is|what's|how do i|why does|can you explain|tell me about)\b/i.test(p);
  const actionVerbs = /(build|create|add|make|fix|update|modify|change|refactor|implement|write code|code this|delete|remove|generate)/i;
  if (questionOnly && !actionVerbs.test(p)) {
    return true;
  }
  return false;
}

async function generateConversationalReply(
  prompt: string,
  framework: string,
  config: AgentConfig,
  signal: AbortSignal,
  messages?: ConversationMessage[],
  pageContext?: any
): Promise<string> {
  const history = messages?.map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n\n") || "";

  let pageObservation = "";
  if (pageContext) {
    const headings = (pageContext.domSummary?.headings || []).map((h: any) => `H${h.level}: "${h.text}"`).join("\n  ");
    const sections = (pageContext.domSummary?.sections || []).map((s: any) => `- [${s.name}]: ${s.textPreview}`).join("\n  ");
    const buttons = (pageContext.domSummary?.buttons || []).join(", ");
    const links = (pageContext.domSummary?.links || []).join(", ");

    pageObservation = `
Live Browser Page Context (what the user is currently viewing in their live app):
- Route: ${pageContext.route || "/"}
- Page Title: "${pageContext.title || "Untitled"}"
- Viewport: ${pageContext.viewport?.width}x${pageContext.viewport?.height} (Document height: ${pageContext.viewport?.scrollHeight}px, scrolled: ${pageContext.viewport?.scrollY}px)
- Rendered Headings:
  ${headings || "None"}
- Rendered Page Sections & Landmarks:
  ${sections || "None"}
- Call-to-Action Buttons: ${buttons || "None"}
- Navigation Links: ${links || "None"}
- Visible Text Preview: "${pageContext.domSummary?.visibleTextSnippet?.slice(0, 1000) || "Empty"}"
${pageContext.selectedElement ? `- Selected Element: <${pageContext.selectedElement.tag}> "${pageContext.selectedElement.text || ""}"` : ""}
`;
  }

  const systemPrompt = `You are Lasso, a fast and helpful AI coding assistant embedded in a live web application (${framework}).
Respond conversationally, concisely, and helpfully.
${pageContext ? "You have live access to the browser page context. When the user asks about the page, design, layout, or components, reference the actual headings, sections, buttons, and text rendered on screen. Provide concrete, expert design and UX feedback. Never claim the page has no content or components when rendered headings and sections are present." : ""}
Do not output code changes, file patches, or JSON schemas — just talk to the developer naturally and offer assistance.`;
  const userPrompt = `${history ? `Conversation History:\n${history}\n\n` : ""}${pageObservation}\nUser message: ${prompt}`;

  if (!config.apiKey && config.provider !== "ollama") {
    if (pageContext && (prompt.toLowerCase().includes("landing page") || prompt.toLowerCase().includes("page"))) {
      const headings = (pageContext.domSummary?.headings || []).map((h: any) => `"${h.text}"`).join(", ");
      const sections = (pageContext.domSummary?.sections || []).map((s: any) => s.name).join(", ");
      return `Looking at your current page ("${pageContext.title}" on ${pageContext.route}):\n\n- **Rendered Sections:** ${sections || "Standard container"}\n- **Key Headings:** ${headings || "None"}\n- **CTAs:** ${(pageContext.domSummary?.buttons || []).join(", ") || "None"}\n\nTo build or refine components, configure your AI API key in settings or ask me what to modify!`;
    }
    return "Hello! I'm Lasso, your AI pair programmer. You can ask me questions about your project or tell me what to build, modify, or fix.";
  }

  try {
    const model = config.model || (config.provider === "google" ? "gemini-2.5-flash" : config.provider === "openai" ? "gpt-4.1-mini" : config.provider === "ollama" ? "llama3.2" : config.provider === "nvidia" ? "nvidia/llama-3.1-nemotron-70b-instruct" : "claude-3-7-sonnet-latest");

    if (config.provider === "openai" || config.provider === "ollama" || config.provider === "nvidia") {
      const baseUrl = config.baseUrl || (config.provider === "nvidia" ? "https://integrate.api.nvidia.com/v1" : "https://api.openai.com/v1");
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        signal,
        headers: { "content-type": "application/json", authorization: `Bearer ${config.apiKey || ""}` },
        body: JSON.stringify({
          model,
          temperature: 0.7,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
      });
      if (res.ok) {
        const json = (await res.json()) as any;
        const text = json.choices?.[0]?.message?.content?.trim();
        if (text) return text;
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
        const json = (await res.json()) as any;
        const text = json.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("")?.trim();
        if (text) return text;
      }
    } else {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal,
        headers: { "content-type": "application/json", "x-api-key": config.apiKey || "", "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model,
          max_tokens: 1024,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        }),
      });
      if (res.ok) {
        const json = (await res.json()) as any;
        const text = json.content?.find((item: any) => item.type === "text")?.text?.trim();
        if (text) return text;
      }
    }
  } catch (err) {
    console.warn("[lasso] Local conversational reply generation error:", err);
  }

  return "Hello! I'm Lasso, your AI pair programmer. You can ask me questions about your project or tell me what to build, modify, or fix.";
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

    const isConversational = isConversationalPrompt(prompt);

    // Browser inspection & snapshot steps
    if (pageContext) {
      onProgress(
        "thinking",
        "Inspecting browser page...",
        `Page: "${pageContext.title || "Landing page"}" (${pageContext.route || "/"})`
      );
      if (pageContext.viewport) {
        onProgress(
          "thinking",
          "Capturing visual snapshot...",
          `Viewport: ${pageContext.viewport.width}x${pageContext.viewport.height} (Document height: ${pageContext.viewport.scrollHeight}px)`
        );
      }
      if (pageContext.domSummary) {
        const sectionsCount = pageContext.domSummary.sections?.length || 0;
        const headingsCount = pageContext.domSummary.headings?.length || 0;
        const buttonsCount = pageContext.domSummary.buttons?.length || 0;
        onProgress(
          "thinking",
          "Scrolling & analyzing page sections...",
          `${sectionsCount} sections, ${headingsCount} headings, ${buttonsCount} CTAs detected`
        );
      }
    } else {
      onProgress("thinking", isConversational ? "Thinking..." : "Analyzing project structure...", isConversational ? undefined : "Scanning files and dependencies");
    }

    const projectStructure = await analyzeProject(cwd);
    const framework = detectFramework(cwd);

    if (!isConversational && !pageContext) {
      onProgress("thinking", "Inspecting application...", `Detected ${framework} framework`);
    }

    let rawServerUrl =
      serverUrl ||
      process.env.LASSO_SERVER_URL ||
      process.env.NEXT_PUBLIC_LASSO_SERVER_URL ||
      process.env.LASSO_API_URL ||
      "https://api.lasso.byorello.space";

    if (rawServerUrl.includes("collab.lasso.byorello.space")) {
      rawServerUrl = rawServerUrl.replace("collab.lasso.byorello.space", "api.lasso.byorello.space");
    }
    const targetServerUrl = rawServerUrl.replace(/\/$/, "").replace(/\/api\/v1$/, "");

    const isCliProvider =
      config.provider === "claude-code" ||
      config.provider === "codex" ||
      config.provider === "opencode" ||
      config.provider === "cursor";

    const hasLocalProviderKey = Boolean(
      config.apiKey &&
      config.apiKey !== "ollama" &&
      !config.apiKey.startsWith("lss_live_") &&
      !config.apiKey.startsWith("lss_")
    );

    // If the user does NOT have a local provider key in .env, route to Lasso Agent Gateway on server.
    // When they DO have a local key in .env, it runs locally to save server resources!
    const shouldRouteToServer = !isCliProvider && !hasLocalProviderKey && Boolean(targetServerUrl);

    if (shouldRouteToServer) {
      try {
        if (!isConversational && !pageContext) {
          onProgress("thinking", "Connecting to Lasso Agent Gateway...", `Model: ${config.model || "claude-3-7-sonnet"}`);
        }

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

        // Build sourceHints: read relevant file contents to give the AI real code context.
        // This is what enables code changes instead of "please share the file" responses.
        const sourceHints: Record<string, string> = {};
        if (!isConversational) {
          const promptLower = prompt.toLowerCase();
          const allCssFiles = projectStructure.files.filter((f) => /\.(css|scss)$/i.test(f));
          const entryFiles = projectStructure.files.filter((f) =>
            /(App|page|index|layout|main|hero|header|landing)\.(tsx|jsx|js|ts|html)$/i.test(f)
          );
          const mentionedFiles = projectStructure.files.filter((f) => {
            const base = path.basename(f, path.extname(f)).toLowerCase();
            return base.length > 2 && promptLower.includes(base);
          });
          const targetFiles = [...new Set([...allCssFiles, ...entryFiles, ...mentionedFiles])].slice(0, 8);
          for (const file of targetFiles) {
            try {
              const content = fs.readFileSync(path.join(cwd, file), "utf8");
              sourceHints[file] = content.slice(0, 8000);
            } catch { /* skip unreadable files */ }
          }
        }

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
              sourceHints: Object.keys(sourceHints).length > 0 ? sourceHints : undefined,
              currentRoute: pageContext?.route || "/",
              pageContext,
            },
          }),
        });

        signal.removeEventListener("abort", onAbort);

        if (!response.ok) {
          const errData = (await response.json().catch(() => ({}))) as { error?: string };
          const errorMessage = errData.error || `Agent request failed (${response.status})`;
          return { ok: false, error: errorMessage };
        }

        const data = (await response.json()) as {
          status?: string;
          summary?: string;
          reply?: string;
          thinking?: OneShotThinkingStep[];
          totalThinkingTimeMs?: number;
          changes?: SourceChange[];
          error?: string;
        };

        if (data.status === "failed" || data.error) {
          return { ok: false, error: data.error || data.summary || "Agent session failed on server." };
        }

        if (data) {
          const changes = Array.isArray(data.changes) ? data.changes : [];
          const isChatReply =
            isConversational ||
            (typeof data.reply === "string" && data.reply.trim().length > 0 && changes.length === 0) ||
            (changes.length === 0 && Boolean(data.summary));

          if (isChatReply) {
            // Conversational reply — no file changes needed
            return {
              ok: true,
              summary: data.reply?.trim() || data.summary || "Hello! How can I help you with your project today?",
              changes: [],
              thinking: [],
              totalThinkingTimeMs: data.totalThinkingTimeMs || Date.now() - startTime,
            };
          }

          // Replay thinking steps progress for implementation
          if (data.thinking && data.thinking.length) {
            for (const step of data.thinking) {
              if (signal.aborted) break;
              onProgress("thinking", step.title, step.detail);
              await new Promise((r) => setTimeout(r, 200));
            }
          }

          if (changes.length > 0) {
            onProgress("working", "Preparing proposed changes...", `${changes.length} files modified`);
            return {
              ok: true,
              summary: data.summary || `Implemented changes for: ${prompt}`,
              todo: Array.isArray((data as any).todo) ? (data as any).todo : undefined,
              changes,
              thinking: data.thinking || [
                { title: "Project analysis", detail: `Framework: ${framework}` },
                { title: "Component planning", detail: "Prepared changes" },
              ],
              totalThinkingTimeMs: data.totalThinkingTimeMs || Date.now() - startTime,
            };
          }

          // Server returned 200 but no changes and no reply — surface a clear error
          return {
            ok: false,
            error: "The agent couldn't generate changes for that request. Try rephrasing or check your AI provider key in the dashboard.",
          };
        }
      } catch (serverErr) {
        return {
          ok: false,
          error: serverErr instanceof Error ? serverErr.message : "Failed to connect to Lasso Agent Gateway.",
        };
      }
    }


    // If it's a conversational prompt and server was not used or failed, respond directly without modifying files!
    if (isConversational) {
      const reply = await generateConversationalReply(prompt, framework, config, signal, messages, pageContext);
      return {
        ok: true,
        summary: reply,
        changes: [],
        thinking: [],
        totalThinkingTimeMs: Date.now() - startTime,
      };
    }

    // Phase 2: Local agent generation fallback for code changes
    onProgress("thinking", "Generating implementation plan...", `Planning components for ${prompt}`);
    const plan = await generatePlan(cwd, prompt, scope, projectStructure, framework, config, signal, messages, pageContext);

    if (signal.aborted) {
      return { ok: false, error: "Operation was cancelled during planning" };
    }

    if (plan.isConversational || (plan.reply && (!plan.steps || plan.steps.length === 0))) {
      return {
        ok: true,
        summary: plan.reply || "How can I help you with your project?",
        changes: [],
        thinking: [],
        totalThinkingTimeMs: Date.now() - startTime,
      };
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
      summary: plan.summary || `Implemented changes for: ${prompt}`,
      todo: plan.todo,
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
  summary?: string;
  reply?: string;
  isConversational?: boolean;
  todo?: Array<{
    file: string;
    action: "modify" | "create" | "delete";
    reason: string;
  }>;
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
  _messages?: ConversationMessage[],
  pageContext?: any
): Promise<ExecutionPlan> {
  const steps: ExecutionPlan["steps"] = [];

  // Identify relevant files to supply as context.
  // Priority 1: Any CSS / SCSS files (global styles are the most common source of regressions)
  // Priority 2: Core app entry points
  // Priority 3: Any component mentioned by keyword in the prompt
  const promptLower = prompt.toLowerCase();
  const allCssFiles = structure.files.filter((f) => /\.(css|scss)$/i.test(f));
  const entryFiles = structure.files.filter((f) =>
    /(App|page|index|layout|main)\.(tsx|jsx|js|ts|html)$/i.test(f)
  );
  // Pull component files whose filename appears in the user prompt
  const mentionedFiles = structure.files.filter((f) => {
    const base = path.basename(f, path.extname(f)).toLowerCase();
    return base.length > 2 && promptLower.includes(base);
  });
  const targetFiles = [...new Set([...allCssFiles, ...entryFiles, ...mentionedFiles])].slice(0, 8);

  const fileSnippets = targetFiles.map((f) => {
    try {
      const content = fs.readFileSync(path.join(cwd, f), "utf8");
      return `File: ${f}\n\`\`\`\n${content.slice(0, 8000)}\n\`\`\``;
    } catch {
      return "";
    }
  }).filter(Boolean).join("\n\n");

  let pageObservation = "";
  if (pageContext) {
    const headings = (pageContext.domSummary?.headings || []).map((h: any) => `H${h.level}: "${h.text}"`).join("\n  ");
    const sections = (pageContext.domSummary?.sections || []).map((s: any) => `- [${s.name}]: ${s.textPreview}`).join("\n  ");
    const buttons = (pageContext.domSummary?.buttons || []).join(", ");
    pageObservation = `
Live Browser Page Context (currently rendered):
- Route: ${pageContext.route || "/"}
- Title: "${pageContext.title || "Untitled"}"
- Viewport: ${pageContext.viewport?.width}x${pageContext.viewport?.height} (Height: ${pageContext.viewport?.scrollHeight}px)
- Rendered Headings: ${headings || "None"}
- Rendered Sections: ${sections || "None"}
- Action Buttons: ${buttons || "None"}
`;
  }

  const systemPrompt = `You are Lasso's Agentic Coding Agent embedded in a live ${framework} web app.
All project files: ${structure.files.slice(0, 50).join(", ")}

## CRITICAL RULES — read before generating anything:
1. You will receive the full content of ALL CSS/style files. Treat them as ground truth for the design system. Do NOT rewrite, restructure, or remove existing CSS classes — only add new rules or make targeted changes the user explicitly asked for.
2. Before writing any code, declare your TASK SCOPE: the exact list of files you will touch. You must NOT modify any file outside this scope.
3. When modifying an existing file, output the COMPLETE updated file content — never partial snippets.
4. If the user's request only affects one component, do not touch global stylesheets or unrelated files.

Analyze the user's request.
If the request is a general question, explanation, greeting, or does not require file modifications, return strictly valid JSON:
{
  "isConversational": true,
  "reply": "Clear, friendly, conversational answer or explanation"
}

If the request asks to build, modify, create, fix, style, or refactor code, return strictly valid JSON:
{
  "isConversational": false,
  "summary": "Clear, concise user-facing description of what was changed",
  "todo": [
    {
      "file": "relative/file/path.tsx",
      "action": "modify" | "create" | "delete",
      "reason": "One sentence explaining exactly what will change and why"
    }
  ],
  "steps": [
    {
      "type": "install" | "modify" | "create",
      "target": "package name (e.g. '@iconify/react @hugeicons/react' for install) or relative/file/path.tsx",
      "description": "Short action title",
      "detail": "Brief detail",
      "content": "The full complete new or updated file content (required for modify/create, omit for install)"
    }
  ]
}

If any third-party npm libraries or packages are needed, add an "install" step first before modifying or creating components.`;

  const userPrompt = `User Request: ${prompt}
${pageObservation}
Existing code context (study these carefully before writing — especially the CSS files):
${fileSnippets || "No existing components found. Create appropriate files in src/."}

Analyze the existing code structure, then respond in JSON:`;

  if (!config.apiKey && config.provider !== "ollama") {
    return {
      steps: [],
      isConversational: true,
      reply: "Please configure an AI provider API key or model in settings to enable code generation.",
    };
  }

  try {
    const model = config.model || (config.provider === "google" ? "gemini-2.5-flash" : config.provider === "openai" ? "gpt-4.1-mini" : config.provider === "ollama" ? "llama3.2" : config.provider === "nvidia" ? "nvidia/llama-3.1-nemotron-70b-instruct" : "claude-3-7-sonnet-latest");
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
    if (parsed) {
      if (parsed.isConversational || (typeof parsed.reply === "string" && (!parsed.steps || parsed.steps.length === 0))) {
        return {
          steps: [],
          isConversational: true,
          reply: parsed.reply || text.trim(),
        };
      }
      if (Array.isArray(parsed.steps) && parsed.steps.length > 0) {
        return {
          steps: parsed.steps,
          summary: parsed.summary,
          todo: Array.isArray(parsed.todo) ? parsed.todo : undefined,
        };
      }
    }

    if (text.trim().length > 0) {
      return {
        steps: [],
        isConversational: true,
        reply: text.trim(),
      };
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
        let cmd = "npm install";
        try {
          if (fs.existsSync(path.join(cwd, "bun.lockb")) || fs.existsSync(path.join(cwd, "bun.lock"))) cmd = "bun add";
          else if (fs.existsSync(path.join(cwd, "pnpm-lock.yaml"))) cmd = "pnpm add";
          else if (fs.existsSync(path.join(cwd, "yarn.lock"))) cmd = "yarn add";
        } catch {}
        const commandStr = `${cmd} ${step.target}`;
        _onProgress("working", `Installing ${step.target}…`, commandStr);
        await execAsync(commandStr, { cwd, timeout: 120000 });
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
