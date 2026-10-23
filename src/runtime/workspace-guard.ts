/**
 * Workspace Guard - Capture, diff, and roll back project state.
 *
 * Lasso's non-negotiable review workflow requires:
 *   1. Capture the original project state before an agent runs.
 *   2. Collect resulting file changes after the agent runs.
 *   3. Roll back to the original state so nothing is applied before review.
 *   4. On approval, re-apply the changes; on rejection, leave the project untouched.
 *
 * The guard backs up every non-ignored file (in memory, or on disk for
 * oversized files), computes a normalized diff against the captured state,
 * and can restore the workspace exactly (content + permission bits + deletions).
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

export interface FileChange {
  /** Project-relative path using the platform separator */
  filePath: string;
  operation: "created" | "modified" | "deleted";
  /** Full original text content (text files only) */
  oldContent?: string;
  /** Full new text content (text files only) */
  newContent?: string;
  /** True when the file is binary — contents are preserved for rollback but not reviewable as text */
  binary?: boolean;
}

export interface WorkspaceGuardOptions {
  /** Directory names that are never captured (defaults cover Node/tooling outputs) */
  ignoreDirs?: string[];
  /** Extra ignore predicates (relative path, isDirectory) */
  ignore?: (relPath: string, isDir: boolean) => boolean;
  /** Max bytes held in memory per file; larger files are copied to a temp dir (default 4MB) */
  maxMemoryFileSize?: number;
  /** Max total bytes held in memory before oversized handling kicks in per file (default 64MB) */
  maxTotalBytes?: number;
  /** Max directory recursion depth (default 32) */
  maxDepth?: number;
}

const DEFAULT_IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  ".hg",
  ".svn",
  ".next",
  ".nuxt",
  ".output",
  ".svelte-kit",
  ".turbo",
  ".parcel-cache",
  ".cache",
  ".vercel",
  ".netlify",
  ".lasso",
  ".yarn",
  ".pnpm-store",
  "dist",
  "build",
  "out",
  "coverage",
  "__pycache__",
  ".venv",
  "venv",
  "target",
  ".gradle",
  ".terraform",
]);

const DEFAULT_IGNORE_FILES = new Set(["next-env.d.ts", "tsconfig.tsbuildinfo", ".DS_Store", "Thumbs.db"]);

function shouldIgnoreFile(name: string): boolean {
  return DEFAULT_IGNORE_FILES.has(name) || name.endsWith(".tsbuildinfo");
}

type CapturedEntry = {
  /** Absolute original path */
  absPath: string;
  /** Captured bytes; null when the file was stored on disk instead */
  content: Buffer | null;
  /** Temp copy path for oversized files */
  tempPath?: string;
  hash: string;
  size: number;
  mode: number;
  /** True when the file is binary (contains NUL bytes in the sampled header) */
  binary: boolean;
};

function hashBuffer(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function looksBinary(buf: Buffer): boolean {
  const sample = buf.subarray(0, Math.min(buf.length, 8192));
  return sample.includes(0);
}

export class WorkspaceGuard {
  readonly root: string;
  private readonly files = new Map<string, CapturedEntry>();
  private readonly skipped: string[] = [];
  private readonly tempDir: string;
  private readonly ignoreDirs: Set<string>;
  private readonly ignoreFn?: (relPath: string, isDir: boolean) => boolean;
  private tempDirCreated = false;
  private disposed = false;

  private constructor(root: string, ignoreDirs: Set<string>, ignoreFn?: (relPath: string, isDir: boolean) => boolean) {
    this.root = root;
    this.ignoreDirs = ignoreDirs;
    this.ignoreFn = ignoreFn;
    this.tempDir = path.join(os.tmpdir(), `lasso-guard-${crypto.randomBytes(6).toString("hex")}`);
  }

  /**
   * Capture the full current state of the workspace.
   */
  static async capture(projectPath: string, options: WorkspaceGuardOptions = {}): Promise<WorkspaceGuard> {
    const root = path.resolve(projectPath);
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
      throw new Error(`Project path does not exist or is not a directory: ${root}`);
    }

    const ignoreDirs = new Set([...DEFAULT_IGNORE_DIRS, ...(options.ignoreDirs || [])]);
    const maxMemory = options.maxMemoryFileSize ?? 4 * 1024 * 1024;
    const maxDepth = options.maxDepth ?? 32;
    const ignoreFn = options.ignore;

    const guard = new WorkspaceGuard(root, ignoreDirs, ignoreFn);

    const walk = (dir: string, relBase: string, depth: number) => {
      if (depth > maxDepth) return;
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        const relPath = relBase ? path.join(relBase, entry.name) : entry.name;
        const absPath = path.join(dir, entry.name);

        if (entry.isSymbolicLink()) {
          guard.skipped.push(relPath);
          continue;
        }

        const isDir = entry.isDirectory();
        if (isDir && ignoreDirs.has(entry.name)) continue;
        if (ignoreFn && ignoreFn(relPath, isDir)) continue;

        if (isDir) {
          walk(absPath, relPath, depth + 1);
          continue;
        }
        if (!entry.isFile() || shouldIgnoreFile(entry.name)) {
          if (!entry.isFile()) guard.skipped.push(relPath);
          continue;
        }

        try {
          const stat = fs.statSync(absPath);
          let content: Buffer | null = fs.readFileSync(absPath);
          let tempPath: string | undefined;

          if (content.length > maxMemory) {
            // Oversized: keep a disk copy so rollback stays possible without holding it in RAM.
            guard.ensureTempDir();
            tempPath = path.join(guard.tempDir, relPath);
            fs.mkdirSync(path.dirname(tempPath), { recursive: true });
            fs.copyFileSync(absPath, tempPath);
            content = null;
          }

          guard.files.set(relPath, {
            absPath,
            content,
            tempPath,
            hash: hashBuffer(fs.readFileSync(absPath)),
            size: stat.size,
            mode: stat.mode,
            binary: content ? looksBinary(content) : false,
          });
        } catch {
          guard.skipped.push(relPath);
        }
      }
    };

    walk(root, "", 0);
    return guard;
  }

  /** Number of files captured (excludes ignored/skipped entries). */
  get fileCount(): number {
    return this.files.size;
  }

  /** Paths that could not be captured (symlinks, unreadable entries). */
  get skippedPaths(): string[] {
    return [...this.skipped];
  }

  /**
   * Compare the current on-disk state against the captured state.
   * Must be called BEFORE restore() when collecting an agent's changes.
   */
  diff(): FileChange[] {
    const changes: FileChange[] = [];
    const seen = new Set<string>();

    for (const [relPath, entry] of this.files) {
      seen.add(relPath);
      let stat: fs.Stats | null = null;
      try {
        stat = fs.statSync(entry.absPath);
      } catch {
        stat = null;
      }

      if (!stat || !stat.isFile()) {
        changes.push({ filePath: relPath, operation: "deleted", oldContent: entry.binary ? undefined : entry.content?.toString("utf8") });
        continue;
      }

      let current: Buffer;
      try {
        current = fs.readFileSync(entry.absPath);
      } catch {
        continue;
      }

      if (hashBuffer(current) === entry.hash) continue;

      if (entry.binary || looksBinary(current)) {
        changes.push({ filePath: relPath, operation: "modified", binary: true });
      } else {
        changes.push({
          filePath: relPath,
          operation: "modified",
          oldContent: entry.content ? entry.content.toString("utf8") : undefined,
          newContent: current.toString("utf8"),
        });
      }
    }

    // Files that did not exist at capture time.
    for (const change of this.listNewFiles(seen)) {
      changes.push(change);
    }

    return changes;
  }

  /**
   * Restore the workspace to the captured state:
   * modified files are reverted, created files are deleted, deleted files are recreated.
   */
  async restore(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;

    for (const [relPath, entry] of this.files) {
      let currentExists = false;
      try {
        currentExists = fs.statSync(entry.absPath).isFile();
      } catch {
        currentExists = false;
      }

      const desired = entry.content ?? (entry.tempPath ? fs.readFileSync(entry.tempPath) : null);
      if (!desired) continue;

      try {
        if (currentExists) {
          const current = fs.readFileSync(entry.absPath);
          if (hashBuffer(current) === hashBuffer(desired)) {
            // Unchanged — still normalize permissions below.
            fs.chmodSync(entry.absPath, entry.mode);
            continue;
          }
        }
        fs.mkdirSync(path.dirname(entry.absPath), { recursive: true });
        fs.writeFileSync(entry.absPath, desired);
        fs.chmodSync(entry.absPath, entry.mode);
      } catch {
        // Best effort: continue restoring remaining files.
      }
    }

    // Delete files created during execution.
    for (const change of this.listNewFiles(new Set(this.files.keys()))) {
      try {
        fs.unlinkSync(path.join(this.root, change.filePath));
      } catch {
        // Ignore — file may already be gone.
      }
    }

    this.cleanupTemp();
  }

  /** Restore without comparing (used by dispose paths). */
  async dispose(): Promise<void> {
    if (!this.disposed) {
      await this.restore();
    } else {
      this.cleanupTemp();
    }
  }

  private listNewFiles(capturedPaths: Set<string>): FileChange[] {
    const created: FileChange[] = [];
    const walk = (dir: string, relBase: string, depth: number) => {
      if (depth > 40) return;
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const relPath = relBase ? path.join(relBase, entry.name) : entry.name;
        const absPath = path.join(dir, entry.name);
        if (entry.isSymbolicLink()) continue;
        if (entry.isDirectory()) {
          if (this.ignoreDirs.has(entry.name)) continue;
          walk(absPath, relPath, depth + 1);
          continue;
        }
        if (!entry.isFile() || shouldIgnoreFile(entry.name)) continue;
        if (this.ignoreFn && this.ignoreFn(relPath, false)) continue;
        if (capturedPaths.has(relPath)) continue;

        let binary = false;
        let content: string | undefined;
        try {
          const buf = fs.readFileSync(absPath);
          binary = looksBinary(buf);
          content = binary ? undefined : buf.toString("utf8");
        } catch {
          continue;
        }
        created.push(binary ? { filePath: relPath, operation: "created", binary: true } : { filePath: relPath, operation: "created", newContent: content });
      }
    };
    walk(this.root, "", 0);
    return created;
  }

  private ensureTempDir(): void {
    if (this.tempDirCreated) return;
    fs.mkdirSync(this.tempDir, { recursive: true });
    this.tempDirCreated = true;
  }

  private cleanupTemp(): void {
    if (!this.tempDirCreated) return;
    try {
      fs.rmSync(this.tempDir, { recursive: true, force: true });
    } catch {
      // Temp cleanup is best effort.
    }
    this.tempDirCreated = false;
  }
}
