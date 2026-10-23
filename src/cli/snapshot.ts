// src/cli/snapshot.ts
// Local history snapshot system for safe concurrent edits
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export type FileSnapshot = {
  filePath: string;
  content: string | null; // null means file didn't exist
  hash: string;
  timestamp: string;
};

export type TimelineSnapshot = {
  id: string;
  taskId: string;
  sessionId?: string; // Runtime session ID
  summary: string;
  files: FileSnapshot[];
  createdAt: string;
  parentSnapshotId?: string;
};

export type ConflictInfo = {
  filePath: string;
  expectedHash: string;
  actualHash: string;
  originalContent: string;
  currentContent: string;
};

const SNAPSHOTS_DIR = ".lasso/snapshots";
const TIMELINE_FILE = ".lasso/timeline.json";
const MAX_SNAPSHOTS = 50;

function resolveSnapshotPath(cwd: string, filePath: string): string {
  if (!filePath || path.isAbsolute(filePath)) throw new Error(`Invalid snapshot path: ${filePath}`);
  const root = path.resolve(cwd);
  const fullPath = path.resolve(root, filePath);
  if (fullPath !== root && !fullPath.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Snapshot path escapes workspace: ${filePath}`);
  }
  return fullPath;
}

// Ensure snapshots directory exists
function ensureSnapshotsDir(cwd: string): void {
  const dir = path.join(cwd, SNAPSHOTS_DIR);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Generate content hash
function hashContent(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

// Generate unique snapshot ID
function generateSnapshotId(): string {
  return `snap-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

// Load timeline from disk
function loadTimeline(cwd: string): TimelineSnapshot[] {
  const timelinePath = path.join(cwd, TIMELINE_FILE);
  try {
    if (fs.existsSync(timelinePath)) {
      const data = fs.readFileSync(timelinePath, "utf8");
      return JSON.parse(data);
    }
  } catch {
    // File might be corrupted, start fresh
  }
  return [];
}

// Save timeline to disk
function saveTimeline(cwd: string, timeline: TimelineSnapshot[]): void {
  const timelinePath = path.join(cwd, TIMELINE_FILE);
  try {
    fs.writeFileSync(timelinePath, JSON.stringify(timeline, null, 2));
  } catch (error) {
    console.warn("[lasso] Failed to save timeline:", error);
  }
}

// Create a snapshot of current file states
export function createSnapshot(cwd: string, taskId: string, summary: string, filePaths: string[], parentSnapshotId?: string, sessionId?: string): TimelineSnapshot {
  ensureSnapshotsDir(cwd);

  const snapshotId = generateSnapshotId();
  const files: FileSnapshot[] = [];
  const timestamp = new Date().toISOString();

  for (const filePath of filePaths) {
    const fullPath = resolveSnapshotPath(cwd, filePath);
    let content: string | null = null;
    let hash = "";

    try {
      if (fs.existsSync(fullPath)) {
        content = fs.readFileSync(fullPath, "utf8");
        hash = hashContent(content);
      }
    } catch (error) {
      console.warn(`[lasso] Failed to snapshot ${filePath}:`, error);
    }

    files.push({
      filePath,
      content,
      hash,
      timestamp,
    });
  }

  const snapshot: TimelineSnapshot = {
    id: snapshotId,
    taskId,
    sessionId,
    summary,
    files,
    createdAt: timestamp,
    parentSnapshotId,
  };

  // Update timeline
  const timeline = loadTimeline(cwd);
  timeline.unshift(snapshot);

  // Trim old snapshots
  if (timeline.length > MAX_SNAPSHOTS) {
    const removed = timeline.splice(MAX_SNAPSHOTS);
    // Cleanup old snapshot files
    for (const old of removed) {
      cleanupSnapshotFiles(cwd, old.id);
    }
  }

  saveTimeline(cwd, timeline);

  return snapshot;
}

// Restore a snapshot
export function restoreSnapshot(cwd: string, snapshotId: string): boolean {
  const timeline = loadTimeline(cwd);
  const snapshot = timeline.find((s) => s.id === snapshotId);

  if (!snapshot) {
    console.warn(`[lasso] Snapshot ${snapshotId} not found`);
    return false;
  }

  try {
    for (const file of snapshot.files) {
      const fullPath = resolveSnapshotPath(cwd, file.filePath);

      if (file.content === null) {
        // File didn't exist, delete if it exists now
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
        }
      } else {
        // Restore file content
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, file.content);
      }
    }

    console.log(`[lasso] Restored snapshot ${snapshotId}: ${snapshot.summary}`);
    return true;
  } catch (error) {
    console.error(`[lasso] Failed to restore snapshot ${snapshotId}:`, error);
    return false;
  }
}

// Check for conflicts between expected and current file states
export function detectConflicts(cwd: string, expectedFiles: Array<{ filePath: string; content: string | null; hash?: string }>): ConflictInfo[] {
  const conflicts: ConflictInfo[] = [];

  for (const expected of expectedFiles) {
    const fullPath = resolveSnapshotPath(cwd, expected.filePath);
    const expectedHash = expected.hash || (expected.content ? hashContent(expected.content) : "");

    try {
      if (!fs.existsSync(fullPath)) {
        // File doesn't exist but was expected
        if (expected.content !== null) {
          conflicts.push({
            filePath: expected.filePath,
            expectedHash,
            actualHash: "file-missing",
            originalContent: expected.content || "",
            currentContent: "",
          });
        }
        continue;
      }

      const currentContent = fs.readFileSync(fullPath, "utf8");
      const actualHash = hashContent(currentContent);

      if (expectedHash !== actualHash) {
        conflicts.push({
          filePath: expected.filePath,
          expectedHash,
          actualHash,
          originalContent: expected.content || "",
          currentContent,
        });
      }
    } catch (error) {
      console.warn(`[lasso] Failed to check conflict for ${expected.filePath}:`, error);
    }
  }

  return conflicts;
}

// Get timeline history
export function getTimeline(cwd: string, limit = 20): TimelineSnapshot[] {
  const timeline = loadTimeline(cwd);
  return timeline.slice(0, limit);
}

// Delete a snapshot
export function deleteSnapshot(cwd: string, snapshotId: string): boolean {
  const timeline = loadTimeline(cwd);
  const index = timeline.findIndex((s) => s.id === snapshotId);

  if (index === -1) {
    return false;
  }

  timeline.splice(index, 1);
  saveTimeline(cwd, timeline);
  cleanupSnapshotFiles(cwd, snapshotId);

  return true;
}

// Cleanup snapshot-specific files (if we implement per-snapshot storage)
function cleanupSnapshotFiles(cwd: string, snapshotId: string): void {
  // Currently all data is in timeline.json, but if we add per-snapshot files,
  // this is where we'd clean them up
}

// Clear all snapshots
export function clearSnapshots(cwd: string): void {
  const timelinePath = path.join(cwd, TIMELINE_FILE);
  try {
    if (fs.existsSync(timelinePath)) {
      fs.unlinkSync(timelinePath);
    }
    const snapshotsDir = path.join(cwd, SNAPSHOTS_DIR);
    if (fs.existsSync(snapshotsDir)) {
      fs.rmSync(snapshotsDir, { recursive: true, force: true });
    }
  } catch (error) {
    console.warn("[lasso] Failed to clear snapshots:", error);
  }
}

// Get snapshot by task ID
export function getSnapshotByTaskId(cwd: string, taskId: string): TimelineSnapshot | undefined {
  const timeline = loadTimeline(cwd);
  return timeline.find((s) => s.taskId === taskId);
}

// Get snapshot by session ID
export function getSnapshotBySessionId(cwd: string, sessionId: string): TimelineSnapshot | undefined {
  const timeline = loadTimeline(cwd);
  return timeline.find((s) => s.sessionId === sessionId);
}

// Get latest snapshot
export function getLatestSnapshot(cwd: string): TimelineSnapshot | undefined {
  const timeline = loadTimeline(cwd);
  return timeline[0];
}
