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
  projectColor?: string;
  label?: string;
  ready?: boolean;
  active: boolean;
  running: boolean;
  mode?: BackendMode;
  cwd?: string;
}

export interface SessionMeta {
  path: string;
  preview: string;
  title?: string;
  turns: number;
  createdAt: number;
  lastActivityAt: number;
  modTime: number;
  deletedAt?: number;
  current: boolean;
  open: boolean;
  scope?: string;
  workspaceRoot?: string;
  topicId?: string;
  topicTitle?: string;
}

export interface TopicMeta {
  id: string;
  title: string;
  createdAt: number;
}

export interface ProjectNode {
  key: string;
  kind: "project" | "topic" | "global_folder" | "global_topic";
  label: string;
  root?: string;
  topicId?: string;
  projectColor?: string;
  turns?: number;
  lastActivityAt?: number;
  open?: boolean;
  running?: boolean;
  children?: ProjectNode[];
}

export interface ModelInfo {
  ref?: string;
  provider?: string;
  model?: string;
  name: string;
  label?: string;
  current?: boolean;
}

export interface ProviderView {
  name: string;
  kind: string;
  baseUrl: string;
  models: string[];
  default: string;
  apiKeyEnv: string;
  keySet: boolean;
  balanceUrl: string;
  contextWindow: number;
  supportedEfforts: string[];
  defaultEffort: string;
}

export interface ServerView {
  name: string;
  transport: string;
  status: "connected" | "deferred" | "failed" | "initializing" | "disabled" | string;
  builtIn?: boolean;
  configured?: boolean;
  autoStart: boolean;
  tier?: string;
  command?: string;
  args?: string[];
  url?: string;
  envKeys?: string[];
  tools: number;
  prompts: number;
  resources: number;
  error?: string;
}

export interface SkillView {
  name: string;
  description: string;
  scope: string;
  runAs: string;
  enabled: boolean;
}

export interface SkillRootView {
  dir: string;
  scope: string;
  priority: number;
  status: string;
  configured: boolean;
  skills: number;
  warning?: string;
}

export interface CapabilitiesView {
  servers: ServerView[];
  skills: SkillView[];
  skillRoots: SkillRootView[];
}

export interface MCPServerInput {
  name: string;
  transport: string;
  command: string;
  args: string[];
  url: string;
  env?: Record<string, string> | null;
  tier: string;
}

export interface WorkbenchPlugin {
  id: string;
  name: string;
  kind: string;
  entry: string;
  version?: string;
  capabilities: string[];
  providerIds?: string[];
  config?: Record<string, string>;
  enabled: boolean;
}

export interface WorkbenchProvider {
  id: string;
  type: string;
  server?: string;
  url?: string;
  command?: string;
  args?: string[];
  capabilities?: string[];
  headerKeys?: string[];
  envKeys?: string[];
  config?: Record<string, string>;
}

export type WorkbenchJobStatus = "draft" | "running" | "waiting_approval" | "done" | "failed" | "canceled" | string;
export type WorkbenchStepStatus = "draft" | "running" | "waiting_approval" | "done" | "failed" | string;

export interface CreateWorkbenchStepInput {
  id?: string;
  name: string;
  status?: WorkbenchStepStatus;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
}

export interface CreateWorkbenchJobInput {
  pluginId?: string;
  kind: string;
  scenario: string;
  templateId?: string;
  mode?: "manual" | "autopilot" | string;
  steps?: CreateWorkbenchStepInput[];
  metadata?: Record<string, unknown>;
}

export interface UpdateWorkbenchStepInput {
  name?: string;
  status?: WorkbenchStepStatus;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
}

export interface WorkbenchArtifactInput {
  id?: string;
  kind: string;
  name: string;
  path: string;
  mimeType?: string;
}

export interface WorkbenchArtifact {
  id: string;
  kind: string;
  name: string;
  path: string;
  mimeType?: string;
  createdAt: string;
}

export interface WorkbenchStep {
  id: string;
  name: string;
  status: WorkbenchStepStatus;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  updatedAt: string;
  error?: string;
}

export interface WorkbenchJob {
  id: string;
  pluginId?: string;
  kind: string;
  scenario: string;
  templateId?: string;
  mode: "manual" | "autopilot" | string;
  currentStep?: string;
  steps: WorkbenchStep[];
  artifacts: WorkbenchArtifact[];
  status: WorkbenchJobStatus;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface PermissionsView {
  mode: string;
  allow: string[];
  ask: string[];
  deny: string[];
}

export interface SandboxView {
  bash: string;
  network: boolean;
  workspaceRoot: string;
  allowWrite: string[];
}

export interface SettingsView {
  defaultModel: string;
  plannerModel: string;
  autoPlan: string;
  providers: ProviderView[];
  permissions: PermissionsView;
  sandbox: SandboxView;
  desktopLanguage: string;
  desktopTheme: string;
  desktopThemeStyle: string;
  closeBehavior: string;
  configPath: string;
  providerKinds: string[];
  bypass: boolean;
}

export interface EffortInfo {
  current: string;
  supported: string[];
}

export interface GoalInfo {
  objective: string;
  status: "idle" | "active" | "complete" | "blocked" | string;
  blockedReason?: string;
}

export interface MemoryDoc {
  path: string;
  scope: string;
  body: string;
}

export interface MemoryFact {
  name: string;
  title?: string;
  description: string;
  type: string;
  body: string;
}

export interface MemoryScope {
  scope: string;
  path: string;
}

export interface MemoryView {
  docs: MemoryDoc[];
  facts: MemoryFact[];
  scopes: MemoryScope[];
  storeDir: string;
  available: boolean;
}

export interface UpdateInfo {
  available: boolean;
  current: string;
  latest: string;
  notes: string;
  canSelfUpdate: boolean;
  downloadUrl: string;
  assetSize: number;
  err?: string;
}

export interface UpdateProgress {
  phase: "downloading" | "verifying" | "applying" | "done" | "error";
  received: number;
  total: number;
  err?: string;
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
  parentId?: string;
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

export interface SlashArgItem {
  label: string;
  insert: string;
  hint?: string;
  description?: string;
  descend?: boolean;
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
  indexStatus?: string;
  worktreeStatus?: string;
  turns?: number[];
  latestPrompt?: string;
  latestTime?: number;
}

export interface WorkspaceChangesView {
  files: WorkspaceChangeView[];
  gitAvailable: boolean;
  gitErr?: string;
}

export interface WorkspaceDiffView {
  path: string;
  oldPath?: string;
  status?: string;
  indexStatus?: string;
  worktreeStatus?: string;
  kind: "create" | "modify" | "delete" | string;
  diff: string;
  added: number;
  removed: number;
  binary: boolean;
  truncated: boolean;
  err?: string;
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

// ResourceRecord is a BaseRecord with a required string id. The workbench data
// adapter always synthesizes ids, so this stricter type is safe for UI code.
export interface ResourceRecord {
  id: string;
  [key: string]: unknown;
}

export interface UserInfo {
  sub: string;
  email?: string;
  name?: string;
}
