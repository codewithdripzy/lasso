import type { Socket } from "socket.io-client";
import type {
  ChatMessage,
  CollabConfig,
  CollabLock,
  CollabUser,
  CommentThread,
  DragContext,
  GitState,
  ModelOption,
  PendingChange,
  AgentTask,
  ScreenshotContext,
} from "./types";

export const COLLAB_COLORS = [
  "#6ea0ff",
  "#81c995",
  "#fdd663",
  "#f28b82",
  "#c084fc",
  "#22d3ee",
  "#fb923c",
  "#a78bfa",
];

export function userNameColor(userId: string): string {
  if (!userId) return COLLAB_COLORS[0]!;
  let hash = 0;
  for (let i = 0; i < userId.length; i += 1) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return COLLAB_COLORS[hash % COLLAB_COLORS.length]!;
}

export function initials(name: string): string {
  if (!name) return "?";
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || "")
      .join("") || "?"
  );
}

export function timeAgo(value: string | Date | undefined): string {
  if (!value) return "";
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (seconds < 60) return "now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

export const modelSessionKey = "lasso:selected-model";

export function storedModelId(): string | null {
  try {
    return window.sessionStorage.getItem(modelSessionKey);
  } catch {
    return null;
  }
}

export function rememberModel(model: ModelOption): void {
  try {
    window.sessionStorage.setItem(modelSessionKey, model.id);
  } catch {
    // Storage may be disabled
  }
}

export class OverlayState {
  // Mode & Selection
  selectMode = false;
  dragMode = false;
  previewMode = false;
  commentMode = false;
  hovered: Element | null = null;
  selected: Element | null = null;
  activeDragTarget: HTMLElement | null = null;
  dragContext: DragContext | null = null;
  selectionId = "";
  promptDragged = false;
  lastInstruction = "";

  // Chat & Changes
  chatHistory: ChatMessage[] = [];
  changesHistory: Array<{ summary: string; changes: PendingChange[]; createdAt: string }> = [];
  pendingChanges: PendingChange[] = [];
  agentTasks: AgentTask[] = [];
  activeTaskId: string | null = null;
  runtimeErrors: string[] = [];
  screenshotPromise: Promise<ScreenshotContext> = Promise.resolve({});

  // Agent State
  apiKeyConfigured = false;
  agentRunning = false;

  // Bridge
  bridgeSocket: WebSocket | null = null;

  // Models
  MODELS: ModelOption[] = [
    { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash", provider: "google" },
    { id: "gemini-3.7-flash", label: "Gemini 3.7 Flash", provider: "google" },
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", provider: "google" },
    { id: "gpt-4.1-mini", label: "GPT-4.1 mini", provider: "openai" },
  ];
  selectedModel: ModelOption = this.MODELS[0];
  modelFilter: "all" | ModelOption["provider"] = "all";

  // Collab
  collab: CollabConfig | null = null;
  collabSocket: Socket | null = null;
  collabProjectId = "";
  collabJoined = false;
  myUser: { id: string; name: string; photo: string } | null = null;
  presenceUsers = new Map<string, CollabUser>();
  lockMap = new Map<string, CollabLock>();
  heldLockElement = "";
  spotlightUserId: string | null = null;

  // Comments
  commentThreads = new Map<string, CommentThread>();
  openThreadUid: string | null = null;
  pendingPinPosition: { left: number; top: number } | null = null;

  // Element Registry for remote cursors & comments
  elementRegistry = new Map<string, Element>();

  // Voice Chat
  voiceOn = false;
  voiceMuted = false;
  myLocalStream: MediaStream | null = null;
  rtcPeers = new Map<string, { pc: RTCPeerConnection; audio?: HTMLAudioElement }>();
  rtcPendingCandidates = new Map<string, RTCIceCandidateInit[]>();

  // Git
  gitState: GitState = { isRepo: false };

  // Timer ids
  collabHeartbeat: number | null = null;
  activityTimer: number | null = null;
  spotlightTimer: number | null = null;

  constructor() {
    const saved = storedModelId();
    if (saved) {
      const found = this.MODELS.find((m) => m.id === saved);
      if (found) this.selectedModel = found;
    }
  }
}

export const state = new OverlayState();
