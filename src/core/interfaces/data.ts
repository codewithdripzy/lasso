export type CollabConfig = {
  projectId: string;
  name: string;
  version?: string;
  realtimeUrl: string;
  apiUrl: string;
  serverUrl: string;
  registered: boolean;
  registeredAt?: string;
  claimed: boolean;
  workspaceId?: string;
  token?: string;
  apiKey?: string;
  plan?: string;
  configuredProviders?: string[];
};

export type TimelineSnapshot = {
  id: string;
  taskId: string;
  sessionId?: string;
  summary: string;
  files: Array<{
    filePath: string;
    content: string | null;
    hash: string;
    timestamp: string;
  }>;
  createdAt: string;
  parentSnapshotId?: string;
};

export type Provider = "anthropic" | "openai" | "google" | "nvidia" | "ollama" | "claude_code" | "opencode" | "codex_cli" | "cursor" | "antigravity";

export type GitState = {
  isRepo: boolean;
  branch?: string;
  status?: string[];
  hasChanges?: boolean;
  hasRemote?: boolean;
  remote?: string;
};

export type ModelOption = {
  id: string;
  label: string;
  provider: Provider;
  locked?: boolean;
  lockedReason?: string;
};

export type PageEntry = {
  name: string;
  path: string;
  type: "directory" | "file";
};

export type BridgeMessage =
  | { type: "hello"; from: "overlay" | "cli" }
  | { type: "get_skills" }
  | { type: "upload_skill"; name: string; content: string }
  | {
      type: "edit";
      taskId: string;
      instruction: string;
      model: string;
      provider?: Provider;
      messages?: Array<{ role: string; content: string; createdAt?: string }>;
      conversation?: Array<{ role: "user" | "assistant" | "system"; content: string; createdAt?: string }>;
      skillIds?: string[];
      changesHistory?: Array<{ summary: string; changes: any[]; createdAt?: string }>;
      context?: {
        selectionId?: string;
        position?: Record<string, number>;
        viewport?: Record<string, unknown>;
        styles?: Record<string, string>;
        attributes?: Record<string, string>;
        runtimeErrors?: string[];
        screenshots?: { full?: string; element?: string };
      };
      element: { tag: string; group: string; label: string; html?: string; sourceHint?: string };
    }
  | {
      type: "ask";
      taskId: string;
      question: string;
      model: string;
      provider?: Provider;
      messages?: Array<{ role: string; content: string; createdAt?: string }>;
      conversation?: Array<{ role: "user" | "assistant" | "system"; content: string; createdAt?: string }>;
      skillIds?: string[];
      context?: {
        selectionId?: string;
        position?: Record<string, number>;
        viewport?: Record<string, unknown>;
        styles?: Record<string, string>;
        attributes?: Record<string, string>;
        runtimeErrors?: string[];
        screenshots?: { full?: string; element?: string };
      };
      element: { tag: string; group: string; label: string; html?: string; sourceHint?: string };
    }
  | { type: "runtime_error"; selectionId?: string; details: string }
  | { type: "apply"; taskId: string; changes: any[] }
  | { type: "undo"; taskId?: string }
  | { type: "rewind_conversation"; targetMessageId: string; taskIds: string[]; pendingTaskIds?: string[] }
  | { type: "stop"; taskId?: string }
  | { type: "agent_prompt_response"; taskId: string; response: string }
  | { type: "steer"; taskId: string; queueId: string; prompt: string }
  | { type: "list_page_folders"; path?: string }
  | { type: "create_page"; folder: string; fileName: string; content: string }
  | { type: "create_page_folder"; parent: string; name: string }
  | { type: "git_status" }
  | { type: "git_generate_message"; model: string; provider?: Provider; taskId?: string; pageContext?: any }
  | { type: "git_init" }
  | { type: "git_commit"; message: string }
  | { type: "git_push" }
  | { type: "agent_status"; taskId?: string; status: "thinking" | "working" | "review" | "error" | "stopped"; message: string }
  | { type: "transcribe"; requestId: string; audio: string; mimeType?: string; language?: string }
  | {
      type: "oneshot";
      prompt?: string;
      scope?: "project" | "component";
      model?: string;
      provider?: Provider;
      messages?: Array<{ role: "user" | "assistant"; content: string }>;
      conversation?: Array<{ role: "user" | "assistant" | "system"; content: string; timestamp?: number }>;
      conversationId?: string;
      taskId?: string;
      skillIds?: string[];
    }
  | { type: "page_context_response"; requestId: string; pageContext?: any; error?: string }
  | { type: "restore_snapshot"; snapshotId: string }
  | { type: "get_timeline" }
  | { type: "delete_snapshot"; snapshotId: string }
  | { type: "switch_model"; taskId: string; provider: string; modelId: string };

export type ServerBridgeMessage =
  | { type: "skills_catalog"; skills: import("./skills").SkillCatalogEntry[]; error?: string }
  | { type: "config"; apiKeyConfigured: boolean; agentConfigured: boolean; models: ModelOption[]; collab?: CollabConfig | null; user?: { name?: string; email?: string } | null }
  | { type: "git_state"; git: GitState }
  | { type: "git_result"; message?: string; error?: string }
  | { type: "git_progress"; message: string }
  | { type: "git_commit_message"; message?: string; error?: string }
  | {
      type: "agent_status";
      taskId?: string;
      status: "thinking" | "working" | "review" | "complete" | "error" | "stopped";
      message: string;
      detail?: string;
      changes?: any[];
      liveChanges?: boolean;
      thinking?: Array<{ title: string; detail?: string; durationMs?: number }>;
      totalThinkingTimeMs?: number;
    }
  | { type: "agent_prompt"; taskId: string; prompt: { message: string; kind: "permission" | "input" | "multiselect"; options?: string[] } }
  | { type: "steer_result"; taskId: string; queueId: string; success: boolean; error?: string }
  | { type: "rewind_result"; targetMessageId: string; success: boolean; error?: string; restoredFiles?: string[] }
  | { type: "page_folders"; path: string; entries: PageEntry[]; project?: string; error?: string }
  | { type: "page_created"; path: string; error?: string }
  | { type: "page_folder_created"; path: string; error?: string }
  | { type: "assistant_message"; taskId?: string; message: string }
  | { type: "applied"; taskId?: string; message: string; validation?: { passed: boolean; errors: string[]; command: string } }
  | { type: "undone"; taskId?: string; message: string }
  | { type: "transcribe_result"; requestId: string; success: boolean; text?: string; provider?: string; error?: string }
  | { type: "timeline"; snapshots: TimelineSnapshot[] };

export interface CliCredentials {
  apiKey: string;
  keyId: string;
  workspaceId: string;
  workspaceName: string;
  userName: string;
  userEmail: string;
  createdAt: string;
}
export interface AuthStatusResponse {
  status?: string;
  message?: string;
  apiKey?: string;
  keyId?: string;
  workspaceId?: string;
  workspaceName?: string;
  user?: { name?: string; email?: string };
}
export type ProjectFramework = "next" | "nuxt" | "react" | "vue" | "svelte" | "solid";
export type Framework = ProjectFramework;
export type PackageManager = "pnpm" | "npm" | "yarn";
export interface CreateOptions {
  name?: string;
  framework?: ProjectFramework;
  typescript?: boolean;
  packageManager?: PackageManager;
  prompt?: string;
}
export interface CreateResult {
  ok: boolean;
  error?: string;
  projectPath?: string;
}
export interface WorkspaceConfig {
  workspaceId?: string;
  workspaceName?: string;
  plan?: string;
  configuredProviders?: string[];
}
export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  capabilities?: string[];
}
export interface ModelsResponse {
  anthropic: ModelInfo[];
  openai: ModelInfo[];
  google: ModelInfo[];
  nvidia: ModelInfo[];
}
export interface InitResult {
  ok: boolean;
  error?: string;
  projectId?: string;
  workspaceId?: string;
  name?: string;
  domain?: string;
}
export interface ProjectMetadata {
  name: string;
  version: string;
  gitRemote: string;
  payload: Record<string, unknown>;
}

export interface ActionExecutionResult {
  success: boolean;
  actionId: string;
  output?: any;
  error?: string;
  observation?: { type: string; summary: string; data?: any };
}
