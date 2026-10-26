import type { AgentError, AgentPhase, Observation } from "./agent-runtime";

export interface VerificationConfig {
  typecheckTimeout: number;
  buildTimeout: number;
  devServerTimeout: number;
  browserTimeout: number;
  devServerUrl?: string;
  browserContextProvider?: (action: { id: string; type: "browser_check"; data?: Record<string, unknown> }) => Promise<unknown>;
}

export interface VerificationResult {
  type: "typecheck" | "build" | "dev_server" | "browser";
  success: boolean;
  skipped?: boolean;
  command?: string;
  output?: string;
  error?: string;
  observations: Observation[];
  errors: AgentError[];
  duration: number;
}
