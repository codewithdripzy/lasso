import fs from "node:fs";
import path from "node:path";
import { exec as execSync } from "node:child_process";
import { promisify } from "node:util";
import type { AgentAction } from "./agent-runtime";
import type { ActionExecutionResult } from "../core/interfaces/data";
export type { ActionExecutionResult } from "../core/interfaces/data";

const exec = promisify(execSync);

/**
 * Action Executor - Executes validated model actions on the LOCAL machine.
 *
 * Used by the CLI to fulfil `tool_call` requests from the hosted-model
 * orchestrator. Every path is validated to stay inside the project directory
 * (workspace boundary enforcement happens client-side, never on the server).
 */

export class ActionExecutor {
  private projectPath: string;
  private browserContextProvider?: (action: any) => Promise<any>;

  constructor(projectPath: string, browserContextProvider?: (action: any) => Promise<any>) {
    this.projectPath = projectPath;
    this.browserContextProvider = browserContextProvider;
  }

  /**
   * Execute a single action
   */
  async execute(action: AgentAction): Promise<ActionExecutionResult> {
    const { id, type } = action;

    try {
      switch (type) {
        case "read_file":
          return await this.executeReadFile(action);
        case "edit_file":
          return await this.executeEditFile(action);
        case "create_file":
          return await this.executeCreateFile(action);
        case "delete_file":
          return await this.executeDeleteFile(action);
        case "run_command":
          return await this.executeRunCommand(action);
        case "search_code":
          return await this.executeSearchCode(action);
        case "inspect_project":
          return await this.executeInspectProject(action);
        case "browser_check":
          return await this.executeBrowserCheck(action);
        default:
          return {
            success: false,
            actionId: id,
            error: `Unknown action type: ${type}`,
          };
      }
    } catch (error) {
      return {
        success: false,
        actionId: id,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Execute multiple actions (stop on first failure)
   */
  async executeBatch(actions: AgentAction[]): Promise<ActionExecutionResult[]> {
    const results: ActionExecutionResult[] = [];

    for (const action of actions) {
      const result = await this.execute(action);
      results.push(result);

      // Stop if an action fails
      if (!result.success) {
        break;
      }
    }

    return results;
  }

  /**
   * Read file action
   */
  private async executeReadFile(action: any): Promise<ActionExecutionResult> {
    const { id, data } = action;
    const filePath = data.path as string;

    const fullPath = this.resolvePath(filePath);

    if (!fs.existsSync(fullPath)) {
      return {
        success: false,
        actionId: id,
        error: `File not found: ${filePath}`,
      };
    }

    const content = fs.readFileSync(fullPath, "utf-8");

    return {
      success: true,
      actionId: id,
      output: { content, path: filePath },
      observation: {
        type: "file",
        summary: `Read file: ${filePath}`,
        data: { path: filePath, size: content.length },
      },
    };
  }

  /**
   * Edit file action
   */
  private async executeEditFile(action: any): Promise<ActionExecutionResult> {
    const { id, data } = action;
    const filePath = data.path as string;
    const oldString = data.oldString as string;
    const newString = data.newString as string;

    const fullPath = this.resolvePath(filePath);

    if (!fs.existsSync(fullPath)) {
      return {
        success: false,
        actionId: id,
        error: `File not found: ${filePath}`,
      };
    }

    const content = fs.readFileSync(fullPath, "utf-8");

    if (oldString && !content.includes(oldString)) {
      return {
        success: false,
        actionId: id,
        error: `oldString not found in file: ${filePath}`,
      };
    }

    const newContent = oldString ? content.replace(oldString, newString) : newString;

    // No local backup: the WorkspaceGuard snapshot taken before the run is
    // the authoritative rollback mechanism (and .lasso-backup files would
    // pollute the review diff).
    fs.writeFileSync(fullPath, newContent);

    return {
      success: true,
      actionId: id,
      output: { path: filePath },
      observation: {
        type: "file",
        summary: `Edited file: ${filePath}`,
        data: { path: filePath },
      },
    };
  }

  /**
   * Create file action
   */
  private async executeCreateFile(action: any): Promise<ActionExecutionResult> {
    const { id, data } = action;
    const filePath = data.path as string;
    const content = data.content as string;

    const fullPath = this.resolvePath(filePath);

    if (fs.existsSync(fullPath)) {
      return {
        success: false,
        actionId: id,
        error: `File already exists: ${filePath}`,
      };
    }

    // Ensure directory exists
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(fullPath, content || "");

    return {
      success: true,
      actionId: id,
      output: { path: filePath },
      observation: {
        type: "file",
        summary: `Created file: ${filePath}`,
        data: { path: filePath },
      },
    };
  }

  /**
   * Delete file action
   */
  private async executeDeleteFile(action: any): Promise<ActionExecutionResult> {
    const { id, data } = action;
    const filePath = data.path as string;

    const fullPath = this.resolvePath(filePath);

    if (!fs.existsSync(fullPath)) {
      return {
        success: false,
        actionId: id,
        error: `File not found: ${filePath}`,
      };
    }

    // No local backup: the WorkspaceGuard snapshot is the authoritative
    // rollback mechanism.
    fs.unlinkSync(fullPath);

    return {
      success: true,
      actionId: id,
      output: { path: filePath },
      observation: {
        type: "file",
        summary: `Deleted file: ${filePath}`,
        data: { path: filePath },
      },
    };
  }

  /**
   * Run command action
   */
  private async executeRunCommand(action: any): Promise<ActionExecutionResult> {
    const { id, data } = action;
    const command = data.command as string;
    const cwd = data.cwd as string;

    const workingDir = cwd ? this.resolvePath(cwd) : this.projectPath;

    if (!fs.existsSync(workingDir)) {
      return {
        success: false,
        actionId: id,
        error: `Working directory not found: ${workingDir}`,
      };
    }

    // Safety check: prevent dangerous commands
    const dangerousPatterns = [/\brm\s+-rf\b/, /\bdd\s+if=/, />\s*\/dev\/null/, />\s*\/dev\/sd/];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(command)) {
        return {
          success: false,
          actionId: id,
          error: `Command rejected for safety: ${command}`,
        };
      }
    }

    try {
      const { stdout, stderr } = await exec(command, {
        cwd: workingDir,
        timeout: 120000, // 2 minute timeout
      });

      return {
        success: true,
        actionId: id,
        output: { stdout, stderr },
        observation: {
          type: "command",
          summary: `Ran command: ${command}`,
          data: { command, exitCode: 0 },
        },
      };
    } catch (error: any) {
      return {
        success: false,
        actionId: id,
        error: error.message,
        output: { stdout: error.stdout, stderr: error.stderr },
        observation: {
          type: "command",
          summary: `Command failed: ${command}`,
          data: { command, exitCode: error.code || 1 },
        },
      };
    }
  }

  /**
   * Search code action
   */
  private async executeSearchCode(action: any): Promise<ActionExecutionResult> {
    const { id, data } = action;
    const pattern = data.pattern as string;
    const filePattern = data.filePattern as string;
    const maxResults = (data.maxResults as number) || 50;

    if (!pattern || typeof pattern !== "string") {
      return { success: false, actionId: id, error: "search_code requires a pattern" };
    }

    let matcher: RegExp;
    try {
      matcher = new RegExp(pattern, "i");
    } catch (error) {
      return {
        success: false,
        actionId: id,
        error: `Invalid search pattern: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    const fileMatcher = filePattern ? this.globMatcher(filePattern) : undefined;
    const results: Array<{ file: string; line: number; content: string; context?: string[] }> = [];
    for (const relativePath of this.listProjectFiles(this.projectPath)) {
      if (fileMatcher && !fileMatcher.test(relativePath)) continue;
      if (results.length >= maxResults) break;

      const fullPath = path.join(this.projectPath, relativePath);
      let lines: string[];
      try {
        const content = fs.readFileSync(fullPath, "utf8");
        if (content.includes("\u0000") || content.length > 1_000_000) continue;
        lines = content.split(/\r?\n/);
      } catch {
        continue;
      }

      for (let index = 0; index < lines.length && results.length < maxResults; index++) {
        if (!matcher.test(lines[index])) continue;
        matcher.lastIndex = 0;
        results.push({
          file: relativePath,
          line: index + 1,
          content: lines[index].trim().slice(0, 300),
          context: lines.slice(Math.max(0, index - 1), Math.min(lines.length, index + 2)).map((line) => line.trim().slice(0, 300)),
        });
      }
    }

    // Rank direct filename matches first, then preserve source order.
    const terms = pattern
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
    results.sort((a, b) => {
      const score = (result: typeof a) => terms.reduce((total, term) => total + (result.file.toLowerCase().includes(term) ? 2 : 0), 0);
      return score(b) - score(a);
    });

    return {
      success: true,
      actionId: id,
      output: { results },
      observation: {
        type: "search",
        summary: `Found ${results.length} matches for: ${pattern}`,
        data: { pattern, count: results.length },
      },
    };
  }

  private globMatcher(pattern: string): RegExp {
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`^${escaped.replace(/\*/g, ".*").replace(/\?/g, ".")}$`, "i");
  }

  /**
   * Inspect project action
   */
  private async executeInspectProject(action: any): Promise<ActionExecutionResult> {
    const { id } = action;

    const files = this.listProjectFiles(this.projectPath).slice(0, 500);
    const packageJson = this.readPackageJson();

    return {
      success: true,
      actionId: id,
      output: {
        files,
        packageJson: packageJson
          ? {
              name: packageJson.name,
              framework: packageJson.dependencies?.next ? "next" : packageJson.dependencies?.vite ? "vite" : undefined,
              scripts: Object.keys(packageJson.scripts || {}),
              dependencies: Object.keys(packageJson.dependencies || {}).slice(0, 80),
            }
          : null,
      },
      observation: {
        type: "file",
        summary: `Inspected project: ${files.length} files`,
        data: { fileCount: files.length },
      },
    };
  }

  /**
   * Browser check action (placeholder for now)
   */
  private async executeBrowserCheck(action: any): Promise<ActionExecutionResult> {
    const { id, data } = action;
    const url = data.url as string;
    const check = data.check as string;

    if (!this.browserContextProvider) {
      return {
        success: false,
        actionId: id,
        error: "Live browser context is unavailable because no overlay is connected.",
      };
    }

    const pageContext = await this.browserContextProvider(action);
    return {
      success: true,
      actionId: id,
      output: { url, check, pageContext },
      observation: {
        type: "browser",
        summary: `Captured live browser context${url ? ` for ${url}` : ""}`,
        data: { url, check, pageContext },
      },
    };
  }

  /**
   * Resolve a path relative to the project and enforce the workspace
   * boundary: every resolved path must stay inside projectPath.
   */
  private resolvePath(filePath: string): string {
    const resolved = path.isAbsolute(filePath) ? path.resolve(filePath) : path.resolve(this.projectPath, filePath);
    const root = path.resolve(this.projectPath);
    if (resolved !== root && !resolved.startsWith(root + path.sep)) {
      throw new Error(`Path escapes workspace: ${filePath}`);
    }
    return resolved;
  }

  /**
   * List all project files recursively
   */
  private listProjectFiles(dir: string, maxDepth = 10): string[] {
    const files: string[] = [];
    let depth = 0;

    const traverse = (currentDir: string) => {
      if (depth > maxDepth) return;

      const entries = fs.readdirSync(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);

        // Skip common ignored directories
        if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist" || entry.name === "build" || entry.name === ".next" || entry.name === ".lasso") {
          continue;
        }

        if (entry.isDirectory()) {
          depth++;
          traverse(fullPath);
          depth--;
        } else {
          files.push(path.relative(this.projectPath, fullPath));
        }
      }
    };

    traverse(dir);
    return files;
  }

  /**
   * Read package.json if it exists
   */
  private readPackageJson(): any {
    const packageJsonPath = path.join(this.projectPath, "package.json");

    if (!fs.existsSync(packageJsonPath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(packageJsonPath, "utf-8");
      return JSON.parse(content);
    } catch {
      return null;
    }
  }
}
