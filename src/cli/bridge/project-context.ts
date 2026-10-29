import fs from "node:fs";
import path from "node:path";
import type { GitState } from "../../core/interfaces/data";
import type { SourceChange } from "../../core/interfaces/commandbar";
import type { RuntimeSessionInput } from "../runtime-client";
import type { RuntimeSession } from "../runtime-client";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export function toRuntimeConversation(messages: Array<{ role: string; content: string; createdAt?: string; timestamp?: number }> | undefined): RuntimeSessionInput["conversation"] | undefined {
  if (!Array.isArray(messages) || messages.length === 0) return undefined;

  const turns = messages
    .filter((message) => typeof message?.content === "string" && message.content.trim())
    .map((message) => ({
      role: (message.role === "user" ? "user" : message.role === "assistant" ? "assistant" : "system") as "user" | "assistant" | "system",
      content: message.content,
      timestamp: typeof message.timestamp === "number" ? message.timestamp : message.createdAt ? Date.parse(message.createdAt) || Date.now() : Date.now(),
    }));

  return turns.length > 0 ? turns : undefined;
}

export function cleanConversationReply(value: unknown): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return "";

  try {
    const parsed = JSON.parse(text);
    if (typeof parsed?.reply === "string") return parsed.reply.trim();
  } catch {
    const match = text.match(/"reply"\s*:\s*"((?:\\.|[^"\\])*)"/);
    if (match) {
      try {
        return JSON.parse(`"${match[1]}"`).trim();
      } catch {
        return match[1].replace(/\\n/g, "\n").replace(/\\"/g, '"').trim();
      }
    }
  }

  return text;
}

export async function getGitState(cwd: string): Promise<GitState> {
  try {
    await gitCommand(cwd, ["rev-parse", "--is-inside-work-tree"]);
  } catch {
    return { isRepo: false };
  }

  const status = (await gitCommand(cwd, ["status", "--short"])).split("\n").filter(Boolean);
  const branch = await gitCommand(cwd, ["branch", "--show-current"]).catch(() => "");
  const remote = await gitCommand(cwd, ["remote", "get-url", "origin"]).catch(() => "");
  return { isRepo: true, branch, status, hasChanges: status.length > 0, hasRemote: Boolean(remote), remote };
}

export async function gitCommand(cwd: string, args: string[]): Promise<string> {
  const result = await execFileAsync("git", args, { cwd, maxBuffer: 1024 * 1024 });
  return result.stdout.trim();
}

export function loadProjectEnvironment(cwd: string): Record<string, string> {
  return [cwd, path.join(cwd, "web"), path.join(cwd, "server")].reduce<Record<string, string>>((values, root) => {
    Object.assign(values, readEnvFile(root, ".env"), readEnvFile(root, ".env.local"), readEnvFile(root, ".env.production"));
    return values;
  }, {});
}

function readEnvFile(cwd: string, filename: string): Record<string, string> {
  try {
    return fs
      .readFileSync(path.join(cwd, filename), "utf8")
      .split(/\r?\n/)
      .reduce<Record<string, string>>((values, line) => {
        const match = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (!match) return values;

        let value = match[2].trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
        values[match[1]] = value.trim();
        return values;
      }, {});
  } catch {
    return {};
  }
}

export function detectProjectFramework(cwd: string): string {
  try {
    const packageJson = JSON.parse(fs.readFileSync(path.join(cwd, "package.json"), "utf8"));
    const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
    if (dependencies.next) return "next";
    if (dependencies.nuxt) return "nuxt";
    if (dependencies.react) return "react";
    if (dependencies.vue) return "vue";
    if (dependencies.svelte) return "svelte";
    if (dependencies.solid) return "solid";
  } catch {
    // An absent or malformed package.json does not prevent a bridge from starting.
  }

  return "unknown";
}

export function extractChangesFromSession(session: RuntimeSession | null): SourceChange[] {
  if (!session) return [];

  const pendingChanges = session.metadata?.pendingChanges;
  if (Array.isArray(pendingChanges) && pendingChanges.length > 0) {
    return pendingChanges.map((item) => {
      const change = item as Partial<SourceChange>;
      const oldString = typeof change.oldString === "string" ? change.oldString : "";
      const newString = typeof change.newString === "string" ? change.newString : "";
      const operation = change.operation || (oldString === "" && newString === "" ? "deleted" : oldString === "" ? "created" : "modified");
      return { filePath: change.filePath || "", oldString, newString, operation };
    });
  }

  const changes: SourceChange[] = [];
  for (const action of session.actions) {
    const filePath = (action.data.filePath || action.data.path) as string | undefined;
    if (!filePath) continue;

    if (action.type === "edit_file") {
      changes.push({ filePath, oldString: (action.data.oldString as string) || "", newString: (action.data.newString as string) || "", operation: "modified" });
    } else if (action.type === "create_file") {
      changes.push({ filePath, oldString: "", newString: (action.data.content as string) || "", operation: "created" });
    } else if (action.type === "delete_file") {
      changes.push({ filePath, oldString: (action.data.oldContent as string) || "(deleted)", newString: "", operation: "deleted" });
    }
  }

  return changes;
}
