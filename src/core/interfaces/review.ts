import type { AgentAction } from "./agent-runtime";

export interface PendingChange {
  filePath: string;
  oldString: string;
  newString: string;
  operation: "created" | "modified" | "deleted";
}

export interface WorkspaceReview {
  changes: PendingChange[];
  binaryPaths: string[];
  actions: AgentAction[];
}
