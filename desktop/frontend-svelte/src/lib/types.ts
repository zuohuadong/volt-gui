export type ActivityMode = "work" | "code";
export type RunMode = "ask" | "auto" | "yolo" | "plan" | "goal";

export interface TabMeta {
  id: string;
  scope: "global" | "project";
  workspaceRoot: string;
  workspaceName: string;
  topicId: string;
  topicTitle: string;
  active: boolean;
  running: boolean;
  mode?: string;
}

export interface ModelInfo {
  name: string;
  label?: string;
  current?: boolean;
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
}

export interface TranscriptItem {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  body: string;
  pending?: boolean;
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
