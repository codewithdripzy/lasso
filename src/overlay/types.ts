export type PendingChange = {
  filePath: string;
  oldString: string;
  newString: string;
};

export type ChatMessage = {
  role: "user" | "assistant" | "error";
  content: string;
  createdAt: string;
  contextId?: string;
};

export type ScreenshotContext = {
  full?: string;
  element?: string;
};

export type DragContext = {
  originalRect: { left: number; top: number; width: number; height: number };
  targetRect: { left: number; top: number; width: number; height: number };
  delta: { dx: number; dy: number };
  parentTag?: string;
  parentClass?: string;
  parentDisplay?: string;
  parentFlexDirection?: string;
  currentPositioning?: string;
  computedMargins?: { top: string; right: string; bottom: string; left: string };
  siblingBefore?: string;
  siblingAfter?: string;
};

export type ModelOption = {
  id: string;
  label: string;
  provider: "anthropic" | "openai" | "google" | "ollama" | "cli";
};

export type GitState = {
  isRepo: boolean;
  branch?: string;
  status?: string[];
  hasChanges?: boolean;
  hasRemote?: boolean;
  remote?: string;
};

export type CollabConfig = {
  projectId?: string;
  realtimeUrl?: string;
  name?: string;
  version?: string;
  registered?: boolean;
  workspaceId?: string;
  token?: string;
  apiKey?: string;
};

export type CollabUser = {
  socketId: string;
  userId: string;
  name: string;
  photo: string;
  state: "online" | "away";
  selection?: {
    elementId?: string;
    label?: string;
    sourceHint?: string;
  } | null;
  cursor?: { x: number; y: number } | null;
  activity?: string | null;
  color: string;
};

export type CollabLock = {
  id: string;
  sessionId?: string;
  elementId?: string;
  elementLabel?: string;
  sourceHint?: string;
  action?: string;
  locker: {
    id: string;
    name: string;
    photo: string;
  };
};

export type CollabComment = {
  uid: string;
  sessionId: string;
  elementId?: string;
  selectionId?: string;
  parentId?: string;
  body: string;
  status: "OPEN" | "RESOLVED";
  author: {
    id: string;
    name: string;
    photo: string;
  };
  createdAt: string;
  updatedAt?: string;
  resolvedAt?: string;
  meta?: {
    label?: string;
    sourceHint?: string;
    position?: {
      left: number;
      top: number;
      width?: number;
      height?: number;
      space?: "document" | "viewport";
    };
  };
};

export type CollabTodo = {
  uid: string;
  sessionId: string;
  text: string;
  status: "todo" | "in-progress" | "done";
  priority: "none" | "low" | "medium" | "high" | "critical";
  assignee: string;
  createdAt: string;
  updatedAt?: string;
};

export type CollabClipboardItem = {
  uid: string;
  scope: "private" | "shared";
  type: "text" | "url" | "code" | "json" | "image";
  label: string;
  content: string;
  createdAt: string;
  updatedAt?: string;
};

export type CommentThread = {
  root: CollabComment;
  replies: CollabComment[];
};

export type ElementGroup = "layout" | "text" | "interactive" | "media" | "component" | "default";

export type GroupConfig = {
  color: string;
  background: string;
  label: string;
};
