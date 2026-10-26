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
}

export interface LocalSessionRunnerOptions {
  sessionId: string;
  backend: IBackend;
  guard: any;
  emit: (event: AgentEvent) => void;
  phase?: AgentPhase;
}
