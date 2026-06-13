export type ActivityMode = "work" | "code";
export type RunMode = "ask" | "auto" | "yolo" | "plan" | "goal";
export type BackendMode = "normal" | "plan" | "yolo";

export interface TabMeta {
  id: string;
  scope: "global" | "project";
  workspaceRoot: string;
  workspaceName: string;
  topicId: string;
  topicTitle: string;
  label?: string;
  ready?: boolean;
  active: boolean;
  running: boolean;
  mode?: BackendMode;
  cwd?: string;
}

export interface ModelInfo {
  name: string;
  label?: string;
  current?: boolean;
}

export interface EffortInfo {
  current: string;
  supported: string[];
}

export type WireEventKind =
  | "turn_started"
  | "reasoning"
  | "text"
  | "message"
  | "tool_dispatch"
  | "tool_result"
  | "approval_request"
  | "ask_request"
  | "usage"
  | "turn_done"
  | "notice";

export interface WireEvent {
  kind: WireEventKind;
  text?: string;
  reasoning?: string;
  level?: "info" | "warn";
  tabId?: string;
  tool?: {
    id?: string;
    name: string;
    args?: string;
    output?: string;
    err?: string;
    readOnly?: boolean;
    parentId?: string;
  };
  approval?: {
    id: string;
    tool: string;
    subject: string;
  };
  ask?: WireAsk;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    reasoningTokens?: number;
  };
}

export interface TranscriptItem {
  id: string;
  role: "user" | "assistant" | "system" | "tool" | "reasoning" | "notice";
  body: string;
  title?: string;
  pending?: boolean;
  readOnly?: boolean;
}

export interface WireAskOption {
  label: string;
  description?: string;
}

export interface WireAskQuestion {
  id: string;
  header?: string;
  prompt: string;
  options: WireAskOption[];
  multi?: boolean;
}

export interface WireAsk {
  id: string;
  questions: WireAskQuestion[];
}

export interface QuestionAnswer {
  questionId: string;
  selected: string[];
}

export interface WireApproval {
  id: string;
  tool: string;
  subject: string;
}

export interface CommandInfo {
  name: string;
  description: string;
  hint?: string;
  kind: "builtin" | "custom" | "mcp" | "skill";
}

export interface DirEntry {
  name: string;
  isDir: boolean;
}

export interface DroppedItem {
  kind: "workspace" | "attachment";
  path: string;
  isDir?: boolean;
  previewUrl?: string;
}

export interface ComposerAttachment {
  path: string;
  previewUrl?: string;
}

export interface FilePreview {
  path: string;
  body: string;
  size: number;
  truncated: boolean;
  binary: boolean;
  err?: string;
}

export interface WorkspaceChangeView {
  path: string;
  oldPath?: string;
  sources: string[];
  gitStatus?: string;
  turns?: number[];
  latestPrompt?: string;
  latestTime?: number;
}

export interface WorkspaceChangesView {
  files: WorkspaceChangeView[];
  gitAvailable: boolean;
  gitErr?: string;
}

export interface ReadFileRecord {
  path: string;
  turn: number;
  time: number;
  offset?: number;
  limit?: number;
  truncated?: boolean;
}

export interface ContextPanelInfo {
  usedTokens: number;
  windowTokens: number;
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  cacheHitTokens: number;
  cacheMissTokens: number;
  readFiles: ReadFileRecord[];
  changedFiles: WorkspaceChangeView[];
}

export interface HistoryMessage {
  role: string;
  content: string;
  reasoning?: string;
}

export interface CheckpointMeta {
  turn: number;
  prompt: string;
  files: string[];
  time: number;
  canCode?: boolean;
  canConversation?: boolean;
}

export interface ResourceRecord {
  id: string;
  [key: string]: unknown;
}

export interface ListParams {
  page?: number;
  perPage?: number;
  filter?: Record<string, unknown>;
}

export interface ListResult<T extends ResourceRecord = ResourceRecord> {
  data: T[];
  total: number;
}
