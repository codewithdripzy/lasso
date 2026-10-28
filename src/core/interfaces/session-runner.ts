import type { AgentAction, AgentError, AgentEvent, AgentPhase, Observation } from "./agent-runtime";
import type { IBackend } from "./backend";
import type { PendingChange } from "./review";

export interface LocalSessionOutcome {
  success: boolean;
  status: "waiting" | "completed" | "failed";
  summary?: string;
  changes: PendingChange[];
  binaryPaths: string[];
  actions: AgentAction[];
  observations: Observation[];
  errors: AgentError[];
  conversation: Array<{ role: "user" | "assistant" | "system"; content: string; timestamp: number }>;
  externalSessionId?: string;
  metadata: Record<string, unknown>;
  /** Terminal event, returned to hosts that must persist the outcome before emitting it. */
  terminalEvent?: AgentEvent;
}

export interface LocalSessionRunnerOptions {
  sessionId: string;
  backend: IBackend;
  guard: any;
  emit: (event: AgentEvent) => void;
  phase?: AgentPhase;
  deferTerminalEvent?: boolean;
  /** Keep the agent's edits on disk while the CLI review is open. */
  keepEditsForReview?: boolean;
}
