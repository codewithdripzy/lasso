/**
 * Local coding agent factory.
 *
 * Creates the adapter for a local_agent backend config. Adapters are loaded
 * lazily so consumers that never run local agents (e.g. hosted-only server
 * paths) don't pay for parsing the adapter modules.
 */

import { BackendConfig, IBackend, DEFAULT_LOCAL_CAPABILITIES, BackendCapabilities } from "../backend-interface";

export const LOCAL_AGENT_PROVIDERS = ["claude_code", "opencode", "codex_cli", "cursor", "antigravity"] as const;

export type LocalAgentProvider = (typeof LOCAL_AGENT_PROVIDERS)[number];

export function isLocalAgentProvider(provider: string): provider is LocalAgentProvider {
  return (LOCAL_AGENT_PROVIDERS as readonly string[]).includes(provider);
}

export function isLocalAgentConfig(config: BackendConfig | undefined | null): config is BackendConfig & { type: "local_agent" } {
  return Boolean(config && config.type === "local_agent" && isLocalAgentProvider(config.provider));
}

export async function createLocalAgentBackend(config: BackendConfig & { type: "local_agent" }): Promise<IBackend> {
  switch (config.provider) {
    case "claude_code": {
      const { ClaudeCodeAdapter } = await import("./claude-code-adapter.js");
      return new ClaudeCodeAdapter(config as never);
    }
    case "opencode": {
      const { OpenCodeAdapter } = await import("./opencode-adapter.js");
      return new OpenCodeAdapter(config as never);
    }
    case "codex_cli": {
      const { CodexCLIAdapter } = await import("./codex-cli-adapter.js");
      return new CodexCLIAdapter(config as never);
    }
    case "cursor": {
      const { CursorAdapter } = await import("./cursor-adapter.js");
      return new CursorAdapter(config as never);
    }
    case "antigravity": {
      const { AntigravityAdapter } = await import("./antigravity-adapter.js");
      return new AntigravityAdapter(config as never);
    }
    default:
      throw new Error(`Unsupported local agent: ${(config as BackendConfig).provider}`);
  }
}

/** Capabilities for a local agent provider (all share the local-agent profile). */
export function localAgentCapabilities(_provider: string): BackendCapabilities {
  return { ...DEFAULT_LOCAL_CAPABILITIES };
}
