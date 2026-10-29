/**
 * Workspace Guard - Capture, diff, and resolve proposed project edits.
 *
 * Lasso's non-negotiable review workflow requires:
 *   1. Capture the original project state before an agent runs.
 *   2. Collect resulting file changes after the agent runs.
 *   3. Keep agent edits in place while the user reviews them.
 *   4. On approval, keep selected edits; on rejection, restore originals.
 *
 * The guard backs up every non-ignored file (in memory, or on disk for
 * oversized files), computes a normalized diff against the captured state,
 * and can restore the workspace exactly (content + permission bits + deletions).
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import type { CapturedEntry, FileChange, WorkspaceGuardOptions } from "../core/interfaces/workspace";
export type { FileChange, WorkspaceGuardOptions } from "../core/interfaces/workspace";

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
const TEXT_FILE_EXTENSIONS = new Set([
  ".astro",
  ".c",
  ".cc",
  ".conf",
  ".cpp",
  ".cs",
  ".css",
  ".csv",
  ".cxx",
  ".go",
  ".h",
  ".handlebars",
  ".hpp",
  ".html",
  ".ini",
  ".java",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mdx",
  ".mjs",
  ".mts",
  ".php",
  ".prisma",
  ".py",
  ".rb",
  ".rs",
  ".scss",
  ".sh",
  ".sql",
  ".svelte",
  ".svg",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".vue",
  ".xml",
  ".yaml",
  ".yml",
  ".zsh",
]);

function shouldIgnoreFile(name: string): boolean {
  return DEFAULT_IGNORE_FILES.has(name) || name.endsWith(".tsbuildinfo");
}

function hashBuffer(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function looksBinary(buf: Buffer): boolean {
  const sample = buf.subarray(0, Math.min(buf.length, 8192));
  return sample.includes(0);
}

function isTextFile(relPath: string): boolean {
  return TEXT_FILE_EXTENSIONS.has(path.extname(relPath).toLowerCase());
}

function decodeText(buf: Buffer): string {
  // A stray NUL in a source file should not turn the whole change into an
  // unreviewable binary diff. Strip it from the displayed diff only; snapshots
  // retain the original bytes for exact rejection.
  return buf.toString("utf8").replace(/\0/g, "");
}

export class WorkspaceGuard {
  readonly root: string;
  private readonly files = new Map<string, CapturedEntry>();
  private readonly skipped: string[] = [];
  private readonly tempDir: string;
  private readonly ignoreDirs: Set<string>;
  private readonly ignoreFn?: (relPath: string, isDir: boolean) => boolean;
  private reviewHashes: Map<string, string | null> | null = null;
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

  /** Compare the current workspace state against the captured state. */
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
        changes.push({
          filePath: relPath,
          operation: "deleted",
          oldContent: entry.binary && !isTextFile(relPath) ? undefined : entry.content ? decodeText(entry.content) : undefined,
          binary: entry.binary && !isTextFile(relPath),
        });
        continue;
      }

      let current: Buffer;
      try {
        current = fs.readFileSync(entry.absPath);
      } catch {
        continue;
      }

      if (hashBuffer(current) === entry.hash) continue;

      // Classify the resulting file rather than inheriting the original
      // classification. A text source file can contain a stray NUL byte and
      // then be repaired by the agent; treating it as binary here would hide
      // the edit from review and cause the safety restore to discard it.
      const textFile = isTextFile(relPath);
      if (looksBinary(current) && !textFile) {
        changes.push({ filePath: relPath, operation: "modified", binary: true });
      } else {
        changes.push({
          filePath: relPath,
          operation: "modified",
          oldContent: entry.binary && !textFile ? "(original file contained binary data)" : entry.content ? decodeText(entry.content) : undefined,
          newContent: decodeText(current),
        });
      }
    }

    // Files that did not exist at capture time.
    for (const change of this.listNewFiles(seen)) {
      changes.push(change);
    }

    return changes;
  }

  /** Diff and remember the exact post-agent state so concurrent edits are detected at review resolution. */
  diffForReview(): FileChange[] {
    const changes = this.diff();
    this.reviewHashes = new Map();
    for (const change of changes) {
      const absPath = path.resolve(this.root, change.filePath);
      try {
        const stat = fs.statSync(absPath);
        this.reviewHashes.set(change.filePath, stat.isFile() ? hashBuffer(fs.readFileSync(absPath)) : null);
      } catch {
        this.reviewHashes.set(change.filePath, null);
      }
    }
    return changes;
  }

  /** Keep accepted changes and restore all other captured agent edits. */
  async resolveReview(acceptedFilePaths: string[]): Promise<void> {
    if (this.disposed) throw new Error("This workspace review has already been resolved.");
    if (!this.reviewHashes) throw new Error("Workspace changes were not prepared for review.");

    const accepted = new Set(acceptedFilePaths.map((filePath) => path.normalize(filePath)));
    for (const filePath of accepted) {
      if (!this.reviewHashes.has(filePath)) throw new Error(`Cannot accept ${filePath}: it is not part of this review.`);
    }

    for (const [relPath, expectedHash] of this.reviewHashes) {
      const absPath = path.resolve(this.root, relPath);
      let currentHash: string | null = null;
      try {
        const stat = fs.statSync(absPath);
        if (stat.isFile()) currentHash = hashBuffer(fs.readFileSync(absPath));
      } catch {
        currentHash = null;
      }
      if (currentHash !== expectedHash) {
        throw new Error(`Cannot resolve review: ${relPath} changed after the review opened. Reopen or regenerate the review before deciding.`);
      }
    }

    for (const relPath of this.reviewHashes.keys()) {
      if (accepted.has(path.normalize(relPath))) continue;
      this.restorePath(relPath, true);
    }

    this.disposed = true;
    this.cleanupTemp();
  }

  /**
   * Restore the workspace to the captured state:
   * modified files are reverted, created files are deleted, deleted files are recreated.
   */
  async restore(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;

    for (const relPath of this.files.keys()) this.restorePath(relPath);
    for (const change of this.listNewFiles(new Set(this.files.keys()))) this.restorePath(change.filePath);

    this.cleanupTemp();
  }

  private restorePath(relPath: string, strict = false): void {
    const entry = this.files.get(relPath);
    const absPath = entry?.absPath || path.resolve(this.root, relPath);
    if (!entry) {
      try {
        fs.unlinkSync(absPath);
      } catch (error) {
        if (fs.existsSync(absPath) && strict) throw new Error(`Could not remove rejected file ${relPath}: ${error instanceof Error ? error.message : String(error)}`);
      }
      return;
    }

    const desired = entry.content ?? (entry.tempPath ? fs.readFileSync(entry.tempPath) : null);
    if (!desired) {
      if (strict) throw new Error(`Could not restore rejected file ${relPath}: its original backup is unavailable.`);
      return;
    }
    try {
      if (fs.existsSync(absPath) && hashBuffer(fs.readFileSync(absPath)) === hashBuffer(desired)) {
        fs.chmodSync(absPath, entry.mode);
        return;
      }
      fs.mkdirSync(path.dirname(absPath), { recursive: true });
      fs.writeFileSync(absPath, desired);
      fs.chmodSync(absPath, entry.mode);
    } catch (error) {
      // Best effort: continue restoring remaining files.
      if (strict) throw new Error(`Could not restore rejected file ${relPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
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
          binary = looksBinary(buf) && !isTextFile(relPath);
          content = binary ? undefined : decodeText(buf);
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
