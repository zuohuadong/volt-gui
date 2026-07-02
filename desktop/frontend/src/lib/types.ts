export type ActivityMode = "work" | "code";
export type RunMode = "ask" | "auto" | "yolo" | "plan" | "goal";
export type BackendMode = "normal" | "plan" | "yolo";

export interface TabMeta {
  id: string;
  scope: "global" | "project";
  workspaceRoot: string;
  workspaceName: string;
  workspacePath?: string;
  gitBranch?: string;
  topicId: string;
  topicTitle: string;
  sessionPath?: string;
  readOnly?: boolean;
  projectColor?: string;
  label?: string;
  ready?: boolean;
  active: boolean;
  running: boolean;
  pendingPrompt?: boolean;
  backgroundJobs?: number;
  cancelRequested?: boolean;
  cancellable?: boolean;
  mode?: BackendMode;
  collaborationMode?: string;
  toolApprovalMode?: string;
  tokenMode?: string;
  goal?: string;
  goalStatus?: string;
  startupErr?: string;
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
  builtIn?: boolean;
  added?: boolean;
  kind: string;
  baseUrl: string;
  models: string[];
  visionModels?: string[];
  visionModelsConfigured?: boolean;
  modelsUrl?: string;
  default: string;
  priority?: number;
  apiKeyEnv: string;
  apiKeyValue?: string;
  keySet: boolean;
  requiresKey?: boolean;
  configured?: boolean;
  keySource?: string;
  keySourcePath?: string;
  balanceUrl: string;
  contextWindow: number;
  reasoningProtocol?: string;
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
  authStatus?: string;
  authConfigured?: boolean;
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

export interface AgentView {
  id: string;
  name: string;
  role: string;
  runs: number;
  status: string;
  desc: string;
  avatar?: string;
  vibe?: string;
  provider?: string;
  model?: string;
  tools: string[];
  skills: string[];
  coreFiles: string[];
  builtIn: boolean;
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
}

export interface AgentInput {
  id?: string;
  name: string;
  role?: string;
  status?: string;
  desc: string;
  avatar?: string;
  vibe?: string;
  provider?: string;
  model?: string;
  tools?: string[];
  skills?: string[];
  coreFiles?: string[];
}

export type TodoStatus = "pending" | "in_progress" | "done" | "blocked" | string;

export interface WorkbenchTodo {
  id: string;
  title: string;
  description: string;
  projectId?: string;
  projectName?: string;
  customerId?: string;
  customerName?: string;
  agentId?: string;
  agentName?: string;
  model?: string;
  priority: string;
  dueAt?: string;
  dueLabel: string;
  status: TodoStatus;
  source?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface WorkbenchTodoInput {
  id?: string;
  title: string;
  description: string;
  projectId?: string;
  projectName?: string;
  customerId?: string;
  customerName?: string;
  agentId?: string;
  agentName?: string;
  model?: string;
  priority: string;
  dueAt?: string;
  dueLabel: string;
  status?: TodoStatus;
  source?: string;
}

export interface WorkbenchProject {
  id: string;
  name: string;
  code: string;
  client: string;
  stage: string;
  owner: string;
  desc: string;
  category: string;
  court: string;
  budget: string;
  acceptedAt: string;
  status: "active" | "closed" | string;
  progress: number;
  priority: string;
  risk: string;
  updatedAt: string;
  nextStep: string;
  agent: string;
  materials: number;
  todos: number;
  events: number;
  reports: number;
  timeline: string[];
  createdAt?: string;
  updatedISO?: string;
}

export interface WorkbenchProjectInput {
  id?: string;
  name: string;
  code?: string;
  client?: string;
  stage?: string;
  owner?: string;
  desc?: string;
  category?: string;
  court?: string;
  budget?: string;
  acceptedAt?: string;
  status?: "active" | "closed" | string;
  progress?: number;
  priority?: string;
  risk?: string;
  nextStep?: string;
  agent?: string;
  materials?: number;
  todos?: number;
  events?: number;
  reports?: number;
  timeline?: string[];
}

export interface WorkbenchProjectMaterial {
  id: string;
  projectId: string;
  projectName?: string;
  title: string;
  category: string;
  source: string;
  status: string;
  updatedAt: string;
  desc: string;
  fileName?: string;
  filePath?: string;
  fileSize?: number;
  mimeType?: string;
  createdAt?: string;
  updatedISO?: string;
}

export interface WorkbenchProjectMaterialInput {
  id?: string;
  projectId: string;
  projectName?: string;
  title: string;
  category?: string;
  source?: string;
  status?: string;
  desc?: string;
  fileName?: string;
  filePath?: string;
  fileSize?: number;
  mimeType?: string;
}

export type WorkbenchProjectMaterialBatchInput = WorkbenchProjectMaterialInput[];

export interface WorkbenchAutomation {
  id: string;
  title: string;
  desc: string;
  status: string;
  kind: string;
  owner: string;
  startedAtMs: number;
  cadence: string;
  schedule: string;
  scheduleMode?: string;
  scope: string;
  environment: string;
  command: string;
  nextRunAt?: string;
  result: string;
  lastRun: string;
  nextRun: string;
  steps: string[];
  logs: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface WorkbenchAutomationInput {
  id?: string;
  title: string;
  desc: string;
  status?: string;
  kind?: string;
  owner?: string;
  startedAtMs?: number;
  cadence?: string;
  schedule?: string;
  scheduleMode?: string;
  scope?: string;
  environment?: string;
  command?: string;
  nextRunAt?: string;
  result?: string;
  lastRun?: string;
  nextRun?: string;
  steps?: string[];
  logs?: string[];
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

export interface WorkbenchPluginInput {
  id: string;
  name: string;
  kind: string;
  entry: string;
  version: string;
  capabilities: string[];
  providerIds?: string[];
  config?: Record<string, string>;
  enabled: boolean;
}

export interface SkillPackageInput {
  name: string;
  description: string;
  runAs: string;
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
  shell?: string;
}

export interface SettingsView {
  defaultModel: string;
  plannerModel: string;
  subagentModel?: string;
  subagentEffort?: string;
  autoPlan: string;
  providers: ProviderView[];
  officialProviders?: ProviderView[];
  permissions: PermissionsView;
  sandbox: SandboxView;
  desktopLanguage: string;
  desktopLayoutStyle?: string;
  desktopTheme: string;
  desktopThemeStyle: string;
  closeBehavior: string;
  displayMode?: string;
  statusBarStyle?: string;
  statusBarItems?: string[];
  checkUpdates?: boolean;
  telemetry?: boolean;
  metrics?: boolean;
  expandThinking?: boolean;
  configPath: string;
  providerKinds: string[];
  autoApproveTools?: boolean;
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
  | "tool_progress"
  | "approval_request"
  | "ask_request"
  | "usage"
  | "turn_done"
  | "notice"
  | "phase"
  | "compaction_started"
  | "compaction_done"
  | "mcp_surface_ready"
  | "retrying"
  | "steer"
  | "memory_compiler_stats"
  | "guardian_assessment";

export interface WireCacheDiagnostics {
  prefixHash: string;
  prefixChanged: boolean;
  prefixChangeReasons?: string[];
  systemHash: string;
  toolsHash: string;
  logRewriteVersion: number;
  toolSchemaTokens: number;
  cacheMissTokens: number;
  cacheHitTokens: number;
}

export interface WireEvent {
  kind: WireEventKind;
  text?: string;
  reasoning?: string;
  err?: string;
  level?: "info" | "warn";
  tabId?: string;
  tool?: {
    id?: string;
    name: string;
    args?: string;
    output?: string;
    err?: string;
    readOnly?: boolean;
    truncated?: boolean;
    durationMs?: number;
    partial?: boolean;
    parentId?: string;
    diff?: string;
    added?: number;
    removed?: number;
    profile?: {
      model?: string;
      effort?: string;
    };
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
    cacheHitTokens?: number;
    cacheMissTokens?: number;
    reasoningTokens?: number;
    source?: string;
    cacheDiagnostics?: WireCacheDiagnostics;
    sessionCacheHitTokens?: number;
    sessionCacheMissTokens?: number;
    cost?: number;
    currency?: string;
    costUsd?: number;
  };
  compaction?: {
    trigger?: string;
    messages?: number;
    summary?: string;
    archive?: string;
  };
  retryAttempt?: number;
  retryMax?: number;
  sessionHitTokens?: number;
  sessionMissTokens?: number;
  sessionCost?: number;
  sessionCurrency?: string;
  sessionCostUsd?: number;
}

export interface TranscriptItem {
  id: string;
  role: "user" | "assistant" | "system" | "tool" | "reasoning" | "notice";
  body: string;
  title?: string;
  pending?: boolean;
  createdAtMs?: number;
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
