import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { AgentConfig, SourceChange } from "./agent";

const execAsync = promisify(exec);

export interface OneShotResult {
  ok: boolean;
  summary?: string;
  changes?: SourceChange[];
  error?: string;
}

export interface ProgressCallback {
  (status: "thinking" | "working" | "review" | "error" | "stopped", message: string, detail?: string): void;
}

export interface PromptCallback {
  (prompt: { question: string; options?: string[] }): void;
}

export async function runOneShotAgent(
  cwd: string,
  prompt: string,
  scope: "project" | "component",
  config: AgentConfig,
  signal: AbortSignal,
  onProgress: ProgressCallback,
  onPrompt: PromptCallback
): Promise<OneShotResult> {
  try {
    if (signal.aborted) {
      return { ok: false, error: "Operation was cancelled" };
    }

    // Phase 1: Understand & Plan
    onProgress("thinking", "Analyzing project structure...", "Scanning files and dependencies");
    
    const projectStructure = await analyzeProject(cwd);
    const framework = detectFramework(cwd);
    
    onProgress("thinking", "Planning implementation...", `Detected ${framework} framework`);

    // Phase 2: Generate execution plan
    const plan = await generatePlan(prompt, scope, projectStructure, framework, config, signal);
    
    if (signal.aborted) {
      return { ok: false, error: "Operation was cancelled during planning" };
    }

    onProgress("thinking", "Execution plan ready", `${plan.steps.length} steps identified`);

    // Phase 3: Execute plan step by step
    const allChanges: SourceChange[] = [];
    
    for (let i = 0; i < plan.steps.length; i++) {
      if (signal.aborted) {
        return { ok: false, error: "Operation was cancelled during execution" };
      }

      const step = plan.steps[i];
      onProgress("working", `Step ${i + 1}/${plan.steps.length}: ${step.description}`, step.detail || "");

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
    onProgress("working", "Validating changes...", "Running typecheck and build");
    
    const validationResult = await validateChanges(cwd, framework);
    
    if (!validationResult.ok) {
      onProgress("error", "Validation failed", validationResult.error);
      // Still return the changes for review, but flag the error
      return { 
        ok: true, 
        summary: `Completed with validation warnings: ${validationResult.error}`,
        changes: allChanges 
      };
    }

    onProgress("review", "Implementation complete", `${allChanges.length} files modified`);

    return {
      ok: true,
      summary: `Successfully implemented: ${prompt}`,
      changes: allChanges,
    };

  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown error";
    return { ok: false, error: `One-shot agent failed: ${reason}` };
  }
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
  
  const hasTypeScript = dependencies.includes("typescript") || devDependencies.includes("typescript") || fs.existsSync(path.join(cwd, "tsconfig.json"));
  const hasTailwind = dependencies.includes("tailwindcss") || devDependencies.includes("tailwindcss");
  const hasReact = dependencies.includes("react") || devDependencies.includes("react");
  const hasNext = dependencies.includes("next") || devDependencies.includes("next");
  const hasVite = dependencies.includes("vite") || devDependencies.includes("vite");

  // Scan src directory
  const files: string[] = [];
  const srcPath = path.join(cwd, "src");
  if (fs.existsSync(srcPath)) {
    const scanDir = (dir: string, base: string = "") => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") {
          scanDir(path.join(dir, entry.name), path.join(base, entry.name));
        } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx") || entry.name.endsWith(".js") || entry.name.endsWith(".jsx"))) {
          files.push(path.join(base, entry.name));
        }
      }
    };
    scanDir(srcPath);
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
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (deps.next) return "next";
    if (deps.vite) return "vite";
    if (deps.react) return "react";
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
  prompt: string,
  scope: "project" | "component",
  structure: ProjectStructure,
  framework: string,
  config: AgentConfig,
  signal: AbortSignal
): Promise<ExecutionPlan> {
  // For now, return a simple plan. In a real implementation, this would use the LLM
  // to analyze the prompt and generate a detailed execution plan.
  
  const steps: ExecutionPlan["steps"] = [];
  
  // This is a placeholder - in production, this would call the LLM to generate
  // a detailed plan based on the user's prompt
  steps.push({
    description: "Analyze requirements",
    detail: "Understanding what needs to be built",
    type: "command",
    command: "echo 'Planning phase'",
  });

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
  config: AgentConfig,
  signal: AbortSignal,
  onProgress: ProgressCallback,
  onPrompt: PromptCallback
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
        fs.writeFileSync(filePath, step.content, "utf8");
        return { 
          ok: true, 
          changes: [{
            filePath: step.target,
            oldString: "",
            newString: step.content,
          }]
        };
      }
      return { ok: false, error: "Missing target or content for create step" };

    case "modify":
      if (step.target && step.content) {
        const filePath = path.join(cwd, step.target);
        if (fs.existsSync(filePath)) {
          const oldContent = fs.readFileSync(filePath, "utf8");
          fs.writeFileSync(filePath, step.content, "utf8");
          return { 
            ok: true, 
            changes: [{
              filePath: step.target,
              oldString: oldContent,
              newString: step.content,
            }]
          };
        }
        return { ok: false, error: `File not found: ${step.target}` };
      }
      return { ok: false, error: "Missing target or content for modify step" };

    case "delete":
      if (step.target) {
        const filePath = path.join(cwd, step.target);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          return { ok: true };
        }
      }
      return { ok: true }; // Don't fail if file doesn't exist

    case "command":
      if (step.command) {
        await execAsync(step.command, { cwd });
        return { ok: true };
      }
      return { ok: false, error: "Missing command for command step" };

    default:
      return { ok: false, error: `Unknown step type: ${(step as any).type}` };
  }
}

async function validateChanges(cwd: string, framework: string): Promise<{ ok: boolean; error?: string }> {
  try {
    // Run typecheck if TypeScript is available
    if (fs.existsSync(path.join(cwd, "tsconfig.json"))) {
      try {
        await execAsync("npx tsc --noEmit", { cwd, timeout: 30000 });
      } catch (error) {
        return { ok: false, error: "TypeScript typecheck failed" };
      }
    }

    // Run build if applicable
    if (framework === "next") {
      try {
        await execAsync("npx next build", { cwd, timeout: 120000 });
      } catch (error) {
        return { ok: false, error: "Next.js build failed" };
      }
    } else if (framework === "vite") {
      try {
        await execAsync("npm run build", { cwd, timeout: 120000 });
      } catch (error) {
        return { ok: false, error: "Vite build failed" };
      }
    }

    return { ok: true };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown validation error";
    return { ok: false, error: reason };
  }
}
