/**
 * WorkspaceGuard diff → review payload normalization.
 *
 * Shared by the server orchestrator and the CLI LocalRuntime: the guard diff
 * is the authoritative record of what an agent changed, normalized into the
 * pendingChanges contract consumed by the review UI and the apply flow.
 */

import { FileChange } from "./workspace-guard";
import { AgentAction } from "./agent-runtime";

export interface PendingChange {
  filePath: string;
  oldString: string;
  newString: string;
  operation: "created" | "modified" | "deleted";
}

export interface WorkspaceReview {
  /** Reviewable (text) changes in the wire format used by the review UI. */
  changes: PendingChange[];
  /** Paths of binary changes — preserved for rollback, not shown as text. */
  binaryPaths: string[];
  /** Normalized session actions matching the reviewable changes. */
  actions: AgentAction[];
}

export function diffToReview(rawChanges: FileChange[]): WorkspaceReview {
  const binaryPaths = rawChanges.filter((c) => c.binary).map((c) => c.filePath);
  const applyable = rawChanges.filter((c) => !c.binary);

  const changes: PendingChange[] = applyable.map((change) => ({
    filePath: change.filePath,
    oldString: change.operation === "created" ? "" : (change.oldContent ?? ""),
    newString: change.operation === "deleted" ? "" : (change.newContent ?? ""),
    operation: change.operation,
  }));

  const actions: AgentAction[] = applyable.map((change) => ({
    id: crypto.randomUUID(),
    type: change.operation === "created" ? "create_file" : change.operation === "deleted" ? "delete_file" : "edit_file",
    data: change.operation === "created" ? { filePath: change.filePath, content: change.newContent } : change.operation === "deleted" ? { filePath: change.filePath } : { filePath: change.filePath, oldString: change.oldContent ?? "", newString: change.newContent ?? "" },
  })) as AgentAction[];

  return { changes, binaryPaths, actions };
}
