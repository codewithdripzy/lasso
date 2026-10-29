export interface SourceChange {
  filePath: string;
  oldString: string;
  newString: string;
  operation?: "created" | "modified" | "deleted";
}

export interface CommandThinkingStep {
  title: string;
  detail?: string;
  status: "running" | "completed" | "failed";
}

export interface CommandMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  thinking?: {
    steps: CommandThinkingStep[];
    durationSeconds: number;
    completed: boolean;
    expanded: boolean;
  };
  changes?: SourceChange[];
  liveChanges?: boolean;
  changesApplied?: boolean;
  changesUndone?: boolean;
  error?: string;
  editError?: string;
  isStreaming?: boolean;
  queued?: boolean;
  steering?: boolean;
  steered?: boolean;
}
