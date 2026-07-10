export type ActivityMode = "work" | "code";
export type RunMode = "ask" | "auto" | "yolo" | "plan" | "goal";
export type BackendMode = "normal" | "plan" | "yolo";

export interface BrandInfo {
  name: string;
  shortName: string;
  logoPath?: string;
  wordmarkPath?: string;
  iconPath?: string;
  logoDataUrl?: string;
  wordmarkDataUrl?: string;
  iconDataUrl?: string;
}

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
  imageInputEnabled?: boolean;
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
  vision?: boolean;
}

export interface ProviderView {
  name: string;
  builtIn?: boolean;
  added?: boolean;
  kind: string;
  baseUrl: string;
  apiSurface?: string;
  responsesUrl?: string;
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
  displayName?: string;
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

export interface WorkbenchCustomer {
  id: string;
  name: string;
  type: string;
  contact: string;
  phone: string;
  email: string;
  risk: string;
  riskLevel: string;
  status: string;
  owner: string;
  stage: string;
  industry: string;
  region: string;
  address: string;
  note: string;
  desc: string;
  projectIds: string[];
  matters: number;
  materials: number;
  events: number;
  todos: number;
  reports: number;
  lastTouch: string;
  lastContact: string;
  nextAction: string;
  tags: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface WorkbenchCustomerInput {
  id?: string;
  name: string;
  type?: string;
  contact?: string;
  phone?: string;
  email?: string;
  risk?: string;
  riskLevel?: string;
  status?: string;
  owner?: string;
  stage?: string;
  industry?: string;
  region?: string;
  address?: string;
  note?: string;
  desc?: string;
  projectIds?: string[];
  matters?: number;
  materials?: number;
  events?: number;
  todos?: number;
  reports?: number;
  lastTouch?: string;
  lastContact?: string;
  nextAction?: string;
  tags?: string[];
}

export interface WorkbenchCalendarEvent {
  id: string;
  date?: string;
  day: string;
  title: string;
  time: string;
  type: string;
  place: string;
  projectId?: string;
  customerId?: string;
  status?: string;
  desc?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface WorkbenchCalendarEventInput {
  id?: string;
  date?: string;
  day?: string;
  title: string;
  time?: string;
  type?: string;
  place?: string;
  projectId?: string;
  customerId?: string;
  status?: string;
  desc?: string;
}

export interface WorkbenchReport {
  id: string;
  title: string;
  status: string;
  owner: string;
  desc: string;
  body?: string;
  kind?: string;
  projectId?: string;
  customerId?: string;
  source?: string;
  format?: string;
  priority?: string;
  dueAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface WorkbenchReportInput {
  id?: string;
  title: string;
  status?: string;
  owner?: string;
  desc?: string;
  body?: string;
  kind?: string;
  projectId?: string;
  customerId?: string;
  source?: string;
  format?: string;
  priority?: string;
  dueAt?: string;
}

export interface WorkbenchKnowledgeDocument {
  id: string;
  title: string;
  type: string;
  count: number;
  status: string;
  description?: string;
  source?: string;
  tags?: string;
  fileName?: string;
  filePath?: string;
  mimeType?: string;
  fileSize?: number;
  chunkCount?: number;
  indexedAt?: string;
  error?: string;
  materialIds?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface WorkbenchKnowledgeDocumentInput {
  id?: string;
  title: string;
  type?: string;
  count?: number;
  status?: string;
  description?: string;
  source?: string;
  tags?: string;
  materialIds?: string[];
}

export interface WorkbenchRegulation {
  id: string;
  title: string;
  category: string;
  status: string;
  tags: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface WorkbenchSearchResult {
  title: string;
  scope: string;
  snippet: string;
  source?: string;
  documentId?: string;
  chunkId?: string;
  score?: number;
}

export interface KnowledgeStatus {
  path: string;
  sqlite: boolean;
  fts5: boolean;
  sqliteVec: boolean;
  documents: number;
  chunks: number;
  vectors: number;
  lastError?: string;
  updatedAt: string;
}

export interface KnowledgeBaseView {
  documents: WorkbenchKnowledgeDocument[];
  status: KnowledgeStatus;
}

export interface KnowledgeSearchResult {
  documentId: string;
  chunkId: string;
  title: string;
  type: string;
  source?: string;
  tags?: string;
  fileName?: string;
  filePath?: string;
  snippet: string;
  score: number;
  match: string;
  updatedAt?: string;
}

export interface KnowledgeDocumentImportInput {
  id?: string;
  title: string;
  type?: string;
  source?: string;
  tags?: string;
  description?: string;
  fileName?: string;
  filePath?: string;
  mimeType?: string;
  fileSize?: number;
  content?: string;
}

export interface WorkbenchSyncJob {
  id: string;
  title: string;
  status: string;
  progress: string;
  time: string;
  updatedAt?: string;
}

export interface WorkbenchOperationLog {
  id: string;
  action: string;
  target: string;
  user: string;
  time: string;
  result: string;
  createdAt?: string;
}

export interface WorkbenchTeamRunStep {
  id: string;
  title: string;
  owner: string;
  status: string;
  detail: string;
}

export type WorkbenchTeamRunStatus = "draft" | "running" | "paused" | "stopped" | "completed" | string;

export interface WorkbenchTeamRoom {
  id: string;
  title: string;
  members: number;
  active: string;
  desc: string;
  leader: string;
  leaderId: string;
  status: string;
  topic: string;
  queue: string;
  memberIds: string[];
  avatars: string[];
  mode: string;
  sharedContext: string;
  runState: string;
  nextCheckpoint: string;
  outcome: string;
  controls: string[];
  artifacts: string[];
  steps: WorkbenchTeamRunStep[];
  createdAt?: string;
  updatedAt?: string;
}

export interface WorkbenchTeamRunEvent {
  id: string;
  time: string;
  actor: string;
  type: string;
  detail: string;
}

export interface WorkbenchTeamRunArtifact {
  id: string;
  title: string;
  type: string;
  status: string;
}

export interface WorkbenchTeamRun {
  id: string;
  teamId: string;
  title: string;
  status: WorkbenchTeamRunStatus;
  task: string;
  createdAt: string;
  updatedAt: string;
  currentStepId: string;
  events: WorkbenchTeamRunEvent[];
  artifacts: WorkbenchTeamRunArtifact[];
}

export interface WorkbenchTeamRuntimeInput {
  teamId: string;
  task: string;
  modelRef?: string;
  attachments?: string[];
}

export interface WorkbenchTeamRuntimeResult {
  room: WorkbenchTeamRoom;
  run: WorkbenchTeamRun;
  messages: WorkbenchTeamChatMessage[];
}

export interface WorkbenchTeamChatMessage {
  id: string;
  teamId: string;
  role: "user" | "agent" | string;
  agentId?: string;
  agentName?: string;
  agentAvatar?: string;
  content: string;
  createdAt?: string;
}

export interface WorkbenchData {
  customers: WorkbenchCustomer[];
  calendarEvents: WorkbenchCalendarEvent[];
  reports: WorkbenchReport[];
  knowledgeDocuments: WorkbenchKnowledgeDocument[];
  regulations: WorkbenchRegulation[];
  syncJobs: WorkbenchSyncJob[];
  operationLogs: WorkbenchOperationLog[];
  teamRooms: WorkbenchTeamRoom[];
  teamRuns: WorkbenchTeamRun[];
  teamChatMessages: WorkbenchTeamChatMessage[];
}

export interface WorkbenchDataPersisted extends WorkbenchData {
  initialized?: boolean;
}

export interface CapabilitiesView {
  servers: ServerView[];
  skills: SkillView[];
  skillRoots: SkillRootView[];
  plugins: PluginView[];
}

export interface MCPServerInput {
  name: string;
  transport: string;
  command: string;
  args: string[];
  url: string;
  env?: Record<string, string> | null;
  headers?: Record<string, string> | null;
  trustedReadOnlyTools?: string[];
  tier: string;
  enabled?: boolean;
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

export interface PluginSkillView {
  name: string;
  description?: string;
  path?: string;
  invocation?: string;
  runAs?: string;
}

export interface PluginHookView {
  event: string;
  match?: string;
  command?: string;
  contextFile?: string;
  description?: string;
}

export interface PluginMCPServerView {
  name: string;
  transport?: string;
  command?: string;
  url?: string;
}

export interface PluginView {
  name: string;
  version?: string;
  description?: string;
  source?: string;
  root: string;
  manifestKind?: string;
  enabled: boolean;
  skills: number;
  hooks: number;
  mcpServers: number;
  skillDetails?: PluginSkillView[];
  hookDetails?: PluginHookView[];
  mcpServerDetails?: PluginMCPServerView[];
  warnings?: string[];
  error?: string;
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

export interface MemoryCitation {
  id?: string;
  source: string;
  lineStart?: number;
  lineEnd?: number;
  note?: string;
  kind?: string;
}

export interface MemoryCompilerStats {
  injected: boolean;
  usefulIR: boolean;
  compiledTokens: number;
  irOverheadTokens: number;
  memoryReferences: number;
  constraints: number;
  riskNotes: number;
  executionSteps: number;
  totalNodes: number;
  highSignalNodes: number;
  toolResultNodes: number;
  decisionNodes: number;
  strategyCount: number;
  learningCount: number;
}

export interface WireEvent {
  kind: WireEventKind;
  text?: string;
  detail?: string;
  reasoning?: string;
  memoryCitations?: MemoryCitation[];
  memoryCompiler?: MemoryCompilerStats;
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
  updatedAtMs?: number;
  readOnly?: boolean;
  parentId?: string;
  durationMs?: number;
  truncated?: boolean;
  error?: string;
  toolOutput?: string;
  toolSubject?: string;
  toolSummary?: string;
  toolId?: string;
  archived?: boolean;
  archiveLoading?: boolean;
  archiveLoaded?: boolean;
  archiveLoadError?: string;
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
  toolCalls?: HistoryToolCall[];
  toolCallId?: string;
  toolName?: string;
  toolResultArchived?: boolean;
  toolResultError?: string;
}

export interface HistoryToolCall {
  id: string;
  name: string;
  arguments: string;
  subject?: string;
  summary?: string;
  diff?: string;
  added?: number;
  removed?: number;
  argumentsArchived?: boolean;
}

export interface ToolResultData {
  args: string;
  output: string;
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
