export type ActivityMode = "work" | "code";
export type SteerDispatchMode = "steer" | "new_turn";
export type SubmitDispatchMode = "turn" | "local" | "maintenance";
export type RunMode = "ask" | "auto" | "yolo" | "plan" | "goal";
export type BackendMode = "normal" | "plan" | "yolo" | "plan-yolo";
export type CollaborationMode = "normal" | "plan" | "goal";
export type TokenMode = "full" | "economy";

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

export interface ScopedMemoryContext {
  organizationId?: string;
  workspaceId?: string;
  projectId?: string;
  threadId?: string;
}

export interface ScopedMemoryContextLabels {
  organization?: string;
  workspace?: string;
  project?: string;
  thread?: string;
}

export type ScopedMemoryLayer = "user" | "organization" | "workspace" | "project" | "thread";

export interface ScopedMemoryReference {
  id: string;
  title?: string;
  source?: string;
}

export interface ScopedMemoryEntry {
  id: string;
  title: string;
  body: string;
  source: string;
  layer: ScopedMemoryLayer;
  scopeId: string;
  owner: ScopedMemoryContext;
  references: ScopedMemoryReference[];
  createdAt: string;
  updatedAt: string;
  isolated: boolean;
}

export interface ScopedMemoryArchive {
  entry: ScopedMemoryEntry;
  archivedAt: string;
}

export interface ScopedMemoryInput {
  id?: string;
  title: string;
  body: string;
  source: string;
  layer: ScopedMemoryLayer;
  scopeId: string;
  references: ScopedMemoryReference[];
  isolated: boolean;
}

export interface ScopedMemoryView {
  context: ScopedMemoryContext;
  contextLabels?: ScopedMemoryContextLabels;
  entries: ScopedMemoryEntry[];
  archives: ScopedMemoryArchive[];
  storePath?: string;
  available: boolean;
}

export type TrustStatus = "configured" | "active" | "disabled" | "possible" | "unknown";

export interface TrustCredentialRef {
  env?: string;
  set: boolean;
}

export interface TrustDestination {
  url?: string;
  scheme?: string;
  host?: string;
  path?: string;
  classification: string;
}

export interface TrustFlow {
  id: string;
  category: string;
  name: string;
  status: TrustStatus;
  direction?: string;
  detail?: string;
  provider?: string;
  models?: string[];
  apiSurface?: string;
  credential: TrustCredentialRef;
  destinations: TrustDestination[];
  classification?: string;
  transport?: string;
  runtime?: string;
  autoStart?: boolean;
  dataCategories: string[];
}

export interface TrustLocation {
  id: string;
  name: string;
  path?: string;
  scope: string;
  retention: string;
  status: TrustStatus;
  exists: boolean;
  sensitive?: boolean;
}

export interface TrustWarning {
  id: string;
  severity: string;
  title: string;
  detail: string;
}

export interface TrustContextView {
  tabId: string;
  scope: string;
  workspaceRoot?: string;
  workspaceId?: string;
  projectId?: string;
  threadId?: string;
  organizationId?: string;
  topicId?: string;
  topicTitle?: string;
  sessionPath?: string;
  agentProfileId?: string;
  agentProfileName?: string;
  memoryScopes: string[];
  memorySourceIds: string[];
  memoryUpdatedAt?: string;
  runtimeModel?: string;
  runtimePermission: string;
}

export interface TrustPolicyView {
  sandboxMode: string;
  sandboxNetwork: boolean;
  writeRoots: string[];
  forbidReadRoots: string[];
  redactToolOutput: boolean;
  filterSubprocessEnv: boolean;
  protectSensitiveFiles: boolean;
  defaultPermission: string;
  runtimeToolApproval: string;
  allowRuleCount: number;
  askRuleCount: number;
  denyRuleCount: number;
}

export interface TrustControlServerView {
  enabled: boolean;
  address?: string;
  tokenEnv?: string;
  tokenSet: boolean;
  status: TrustStatus;
  target: TrustDestination;
}

export interface TrustIMConnectionView {
  id: string;
  label?: string;
  platform: string;
  domain?: string;
  status: TrustStatus;
  configuredStatus?: string;
  workspaceRoots: string[];
  mappingCount: number;
  userCount: number;
  groupCount: number;
  approverCount: number;
  adminCount: number;
  allowAll: boolean;
  pairingEnabled: boolean;
  toolApprovalMode: string;
  credentials: TrustCredentialRef[];
  messagePath: string;
}

export interface TrustEnterpriseIMView {
  enabled: boolean;
  status: TrustStatus;
  runtimeStatus: string;
  runtimeConnections: number;
  allowAll: boolean;
  pairingEnabled: boolean;
  userCount: number;
  groupCount: number;
  approverCount: number;
  adminCount: number;
  toolApprovalMode: string;
  control: TrustControlServerView;
  connections: TrustIMConnectionView[];
  messagePath: string;
}

export interface TrustCenterView {
  generatedAt: string;
  context: TrustContextView;
  providers: TrustFlow[];
  storage: TrustLocation[];
  network: TrustFlow[];
  enterpriseIm: TrustEnterpriseIMView;
  fileEgress: TrustFlow[];
  diagnostics: TrustFlow[];
  policy: TrustPolicyView;
  warnings: TrustWarning[];
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
  agentProfileId?: string;
  agentProfileName?: string;
  agentProfileBaseModel?: string;
  memoryContext?: ScopedMemoryContext;
  memoryScopes?: string[];
  memorySourceIds?: string[];
  memoryUpdatedAt?: string;
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
  kind: "project" | "topic" | "session" | "global_folder" | "global_topic" | "global_session";
  label: string;
  root?: string;
  topicId?: string;
  sessionPath?: string;
  projectColor?: string;
  turns?: number;
  createdAt?: number;
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
  availability?: "available" | "unavailable" | "unknown";
  unavailableReason?: string;
}

export interface ProviderView {
  name: string;
  displayName?: string;
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
  startIntent?: string;
  runtimeState?: string;
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
  toolList?: MCPToolView[];
  authStatus?: string;
  authUrl?: string;
  authConfigured?: boolean;
  headerKeys?: string[];
}

export interface MCPToolView {
  name: string;
  description: string;
  readOnlyHint?: boolean;
}

export interface SkillView {
  name: string;
  displayName?: string;
  description: string;
  scope: string;
  runAs: string;
  enabled: boolean;
  plugin?: string;
  model?: string;
  effort?: string;
  allowedTools?: string[];
  tags?: string[];
  examplePrompts?: string[];
  readOnly: boolean;
  color?: string;
  invocation?: string;
  invocationMode?: string;
  body?: string;
  configuredModel?: string;
  configuredEffort?: string;
  autoUse?: string;
  needsFreshData: boolean;
  cost?: string;
}

export interface SkillRootSkillView {
  name: string;
  displayName?: string;
  description: string;
  scope: string;
  runAs: string;
  plugin?: string;
  model?: string;
  effort?: string;
  allowedTools?: string[];
  tags?: string[];
  examplePrompts?: string[];
  readOnly: boolean;
  color?: string;
  invocation?: string;
  invocationMode?: string;
  autoUse?: string;
  needsFreshData: boolean;
  cost?: string;
}

export interface SkillRootView {
  dir: string;
  scope: string;
  priority: number;
  status: string;
  configured: boolean;
  skills: number;
  skillItems?: SkillRootSkillView[];
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
  projectId?: string;
  projectName?: string;
  createTodoOnFailure?: boolean;
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
  projectId?: string;
  projectName?: string;
  createTodoOnFailure?: boolean;
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

export interface WorkbenchAutomationRun {
  id: string;
  automationId: string;
  automationTitle: string;
  projectId?: string;
  projectName?: string;
  status: "passed" | "failed" | "skipped" | string;
  result: string;
  trigger: "manual" | "scheduled" | "skipped" | string;
  command?: string;
  scope?: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  logs: string[];
  read: boolean;
  needsAttention: boolean;
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
  artifactStyleId?: string;
  reviewStatus?: "draft" | "submitted" | "approved" | "returned";
  reviewStage?: "design" | "export";
  styleApproved?: boolean;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewComment?: string;
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
  artifactStyleId?: string;
}

export interface WorkbenchKnowledgeDocument {
  id: string;
  title: string;
  type: string;
  count: number;
  status: string;
  description?: string;
  content?: string;
  source?: string;
  tags?: string;
  fileName?: string;
  filePath?: string;
  mimeType?: string;
  fileSize?: number;
  contentHash?: string;
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
  content?: string;
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
  content?: string;
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

export interface ExternalDataSource {
  id: string;
  name: string;
  description: string;
  available: boolean;
  defaultRoot?: string;
  categories: string[];
  warning?: string;
}

export interface ExternalDataPreviewInput {
  sourceId: string;
  rootPath: string;
}

export interface ExternalDataImportItem {
  id: string;
  category: string;
  title: string;
  relativePath: string;
  target: "knowledge" | "skills" | "none";
  targetLabel: string;
  compatibility: "compatible" | "warning" | "incompatible";
  compatibilityText: string;
  warning?: string;
  size: number;
  selectedByDefault: boolean;
}

export interface ExternalDataImportPreview {
  sourceId: string;
  sourceName: string;
  rootPath: string;
  items: ExternalDataImportItem[];
  compatible: number;
  warnings: number;
  unsupported: number;
  messages: string[];
}

export interface ExternalDataImportInput {
  sourceId: string;
  rootPath: string;
  itemIds: string[];
}

export interface ExternalDataImportResultItem {
  id: string;
  title: string;
  target: string;
  status: "imported" | "skipped" | "failed";
  message: string;
}

export interface ExternalDataImportResult {
  imported: number;
  skipped: number;
  failed: number;
  items: ExternalDataImportResultItem[];
  warnings: string[];
  summary: string;
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
  path?: string;
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

export interface PluginInstallOptions {
  dryRun?: boolean;
  link?: boolean;
  replace?: boolean;
  name?: string;
}

export interface HookConfigView {
  event: string;
  match?: string;
  command: string;
  description?: string;
  timeout?: number;
  cwd?: string;
}

export interface HooksSettingsView {
  scope: "global" | "project" | string;
  path: string;
  projectRoot: string;
  trusted: boolean;
  hooks: HookConfigView[];
  events: string[];
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

export interface CloudflareDropPreflight {
  sourceName: string;
  sourceType: "folder" | "zip" | string;
  hasRootIndex: boolean;
  fileCount: number;
  totalBytes: number;
  largestFileName: string;
  largestFileBytes: number;
  valid: boolean;
  issues: string[];
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

export interface TrustedIntranetSiteView {
  host: string;
  cidrs: string[];
  ports: number[];
}

export interface TrustedIntranetSettingsView {
  enabled: boolean;
  sites: TrustedIntranetSiteView[];
}

export interface NetworkSettingsView {
  trustedIntranet: TrustedIntranetSettingsView;
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
  network?: NetworkSettingsView;
  agent?: {
    maxSubagentDepth?: number;
    maxSubagentConcurrency?: number;
  };
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
  channel?: string;
  canSelfUpdate: boolean;
  manualOnly?: boolean;
  manualReason?: string;
  installMode?: string;
  requiresElevation?: boolean;
  downloaded?: boolean;
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
  | "guardian_assessment"
  | "browser_credential_request"
  | "browser_verification_request";

export interface WireBrowserPrompt {
  id: string;
  origin: string;
  url?: string;
  hasSaved?: boolean;
  usernameHint?: string;
  reason?: string;
}

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
  code?: string;
  reasoning?: string;
  memoryCitations?: MemoryCitation[];
  memoryCompiler?: MemoryCompilerStats;
  err?: string;
  outcome?: "final_readiness" | "recovery_paused";
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
  approval?: WireApproval;
  guardian?: WireGuardianAssessment;
  ask?: WireAsk;
  browserPrompt?: WireBrowserPrompt;
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
  reason?: string;
  guardian?: WireGuardianAssessment;
}

export interface WireGuardianAssessment {
  id: string;
  tool: string;
  subject: string;
  outcome: string;
  risk_level?: string;
  user_authorization?: string;
  rationale?: string;
  duration_ms?: number;
}

export interface BrowserCredentialView {
  origin: string;
  username: string;
  updatedAt?: string;
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
  gitBranch?: string;
  generation?: string;
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
  stagedRevision?: string;
  unstagedRevision?: string;
  err?: string;
}

export type ReviewSource = "staged" | "unstaged";
export type ReviewPatchAction = "stage" | "unstage" | "revert";
export type ReviewWorkflowAction = "commit" | "push" | "create-pr";
export type ReviewMutationStatus = "success" | "partial-success" | "conflict" | string;

export interface ReviewPatchRequest {
  tabId: string;
  path: string;
  action: ReviewPatchAction;
  source: ReviewSource;
  ticket: number;
  sourceGeneration: number;
  sourceRevision: string;
}

export interface ReviewPatchResult extends ReviewPatchRequest {
  status: ReviewMutationStatus;
  detail?: string;
  applied: string[];
  skipped: string[];
  conflicted: string[];
  changes: WorkspaceChangesView;
  diff: WorkspaceDiffView;
}

export interface ReviewWorkflowRequest {
  tabId: string;
  action: ReviewWorkflowAction;
  ticket: number;
  sourceGeneration: number;
  expectedGeneration: string;
  message?: string;
}

export interface ReviewWorkflowResult extends ReviewWorkflowRequest {
  status: ReviewMutationStatus;
  detail?: string;
  url?: string;
  changes: WorkspaceChangesView;
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
  totalTokens: number;
  reasoningTokens: number;
  cacheHitTokens: number;
  cacheMissTokens: number;
  sessionCacheHitTokens: number;
  sessionCacheMissTokens: number;
  sessionCompletionTokens: number;
  requestCount: number;
  elapsedMs: number;
  sessionCost?: number;
  sessionCurrency?: string;
  sessionCostUsd?: number;
  sources?: Record<string, ContextUsageSource>;
  mock?: boolean;
  readFiles: ReadFileRecord[];
  changedFiles: WorkspaceChangeView[];
}

export interface ContextUsageSource {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  reasoningTokens: number;
  cacheHitTokens: number;
  cacheMissTokens: number;
  requestCount: number;
  sessionCost?: number;
  sessionCurrency?: string;
  sessionCostUsd?: number;
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

export interface HistoryPage {
  messages: HistoryMessage[];
  startTurn: number;
  endTurn: number;
  totalTurns: number;
  hasOlder: boolean;
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

export interface ManagedWorktree {
  id: string;
  name: string;
  repositoryRoot: string;
  path: string;
  branch?: string;
  head?: string;
  dirty: boolean;
  status: "ready" | "missing" | string;
  warning?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ManagedWorktreeSnapshot {
  id: string;
  worktreeId: string;
  repositoryRoot: string;
  baseHead: string;
  patchPath: string;
  filesPath: string;
  untrackedFiles: string[];
  untrackedCount: number;
  createdAt: string;
}

export interface ManagedWorktreeHandoff {
  id: string;
  sourceWorktreeId: string;
  targetWorktreeId: string;
  snapshotId: string;
  summary: string;
  status: string;
  warning?: string;
  artifactPath: string;
  createdAt: string;
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
export type DisplayMode = "office" | "developer";


// ── Upstream-only types merged from upstream/main-v2 ──

export type EventKind = WireEventKind;

export interface WireCompaction {
  trigger?: string; // "auto" | "manual"
  messages?: number; // done: how many messages were folded into the summary
  summary?: string; // done: the briefing (empty on an aborted pass)
  archive?: string; // done: archive path, if any
}

export interface WireProfile {
  model?: string;
  effort?: string;
}

export interface WireTool {
  id?: string;
  name: string;
  args?: string;
  resolvedName?: string;
  capabilityId?: string;
  output?: string;
  err?: string;
  readOnly: boolean;
  truncated?: boolean;
  durationMs?: number;
  partial?: boolean; // an early dispatch (name only) — a full one with args follows
  argChars?: number; // partial only: cumulative argument chars streamed so far
  refreshed?: boolean; // same-ID full dispatch with a preview recomputed after an earlier write
  parentId?: string; // set on a sub-agent's calls — the parent `task` call's id
  diff?: string;
  added?: number;
  removed?: number;
  profile?: WireProfile; // subagent model/effort resolved for this call
}

export interface WireUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cacheHitTokens: number;
  cacheMissTokens: number;
  reasoningTokens?: number;
  source?: string;
  cacheDiagnostics?: WireCacheDiagnostics;
  // Session-cumulative cache tokens — the status bar shows the aggregate
  // hit-rate (Σhit/Σ(hit+miss)), steadier than the single-turn cacheHitTokens.
  sessionCacheHitTokens: number;
  sessionCacheMissTokens: number;
  cost?: number;
  currency?: string;
  // Deprecated compatibility alias. Prefer cost + currency.
  costUsd?: number;
}

export interface WireRecoveryApproval {
  source_agent?: string;
  failed_tool?: string;
  failed_summary?: string;
  diagnosis?: string;
  next_tool?: string;
  next_action?: string;
  change_kind?: string;
  change_rationale?: string;
  review_rationale?: string;
  plan_before?: string;
  plan_after?: string;
  can_grant_task?: boolean;
  task_grant_scope?: string;
}

export interface WireGuardian {
  id: string;
  tool: string;
  subject: string;
  outcome: string;
  risk_level?: string;
  user_authorization?: string;
  rationale?: string;
  duration_ms?: number;
  usage?: WireUsage;
}

export type SessionRuntimePhase = "starting" | "ready" | "lease_blocked" | "failed" | "closing";

export interface SessionRuntimeIssue {
  code: "session_lease_held" | "startup_failed";
  message: string;
  retryable: boolean;
  holderPid?: number;
  holderHost?: string;
  acquiredAt?: string;
}

export interface SessionRuntimeView {
  phase: SessionRuntimePhase;
  epoch: string;
  issue?: SessionRuntimeIssue;
}

export interface WireFinalReadiness {
  attempts?: number;
  missing?: string[];
}

export interface DeliveryWorktreeAvailability {
  available: boolean;
  reason?: string;
  repoRoot?: string;
  branch?: string;
  sourceDirty?: boolean;
}

export interface DeliveryWorktreeOpenResult {
  workspaceRoot: string;
  worktreeRoot: string;
  sourceRoot: string;
  branch: string;
  sourceDirty: boolean;
  tab: TabMeta;
}

export type ProjectTopicStatus = "thinking" | "streaming" | "waiting_confirmation" | "background_job" | "paused" | "error";

export interface SessionRecoveryEvent {
  originalPath?: string;
  recoveryPath: string;
  scope?: string;
  workspaceRoot?: string;
  topicId?: string;
  topicTitle?: string;
  recoveryReason?: string;
  recoveryDigest?: string;
  recoveryParentId?: string;
  existing?: boolean;
}

export interface SessionRecoveryFailedEvent {
  reason?: "lease_held" | "lease_unavailable" | string;
}

export interface UsageSourceStats {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  reasoningTokens: number;
  cacheHitTokens: number;
  cacheMissTokens: number;
  requestCount: number;
  sessionCost?: number;
  sessionCurrency?: string;
  sessionCostUsd?: number;
}

export interface ChangedFileInfo {
  path: string;
  oldPath?: string;
  sources: string[];
  gitStatus?: string;
  turns: number[];
  latestPrompt?: string;
  latestTime?: number;
}

export interface PromptHistoryEntry {
  text: string;
  at: number;          // unix ms
  sessionPath: string;
  turn: number;
}

export interface PromptHistoryResult {
  entries: PromptHistoryEntry[] | null;
  nonce: string;
  olderCursor?: string;
  hasOlder?: boolean;
}

export interface SessionReference {
  path: string;
  title: string;
  preview?: string;
  turns?: number;
  createdAt?: number;
  lastActivityAt?: number;
}

export interface WorkspaceView {
  path: string;
  name: string;
  current: boolean;
}

export interface ContextInfo {
  used: number;
  window: number;
  sessionTokens: number;
  compactRatio?: number;
  sessionCost?: number;
  sessionCurrency?: string;
  cacheHitTokens?: number;
  cacheMissTokens?: number;
  sources?: Record<string, UsageSourceStats>;
}

export interface Meta {
  label: string;
  ready: boolean;
  runtime?: SessionRuntimeView;
  startupErr?: string;
  eventChannel: string;
  cwd: string;
  workspaceRoot?: string;
  workspaceName?: string;
  workspacePath?: string;
  sessionPath?: string;
  gitBranch?: string;
  imageInputEnabled?: boolean;
  autoApproveTools?: boolean;
  bypass?: boolean; // legacy JSON key for YOLO/full-access tool auto-approval
  collaborationMode?: CollaborationMode;
  toolApprovalMode?: ToolApprovalMode;
  tokenMode?: TokenMode;
  goal?: string;
  goalStatus?: GoalStatus;
  autoResearch?: AutoResearchCompactView;
  canonicalTodos?: Todo[];
}

export type ToolApprovalMode = "ask" | "auto" | "yolo";

export type GoalStatus = "running" | "complete" | "blocked" | "stopped";

export interface AutoResearchCompactView {
  taskId: string;
  status: "running" | "blocked" | "complete" | "stopped" | "invalid";
  iteration: number;
  pivotRequired: boolean;
  staleCount: number;
}

export interface AutoResearchCriterionView {
  id: string;
  description: string;
  required: boolean;
  evidenceCount: number;
  status: string;
}

export interface AutoResearchStatusView extends AutoResearchCompactView {
  goal: string;
  currentDirection: string;
  pivotCount: number;
  lastHeartbeatAt: string;
  findingCount: number;
  openCriteria: AutoResearchCriterionView[];
  blocker: string;
  taskPath: string;
  nextRequiredAction: string;
}

export interface AutoResearchFindingView {
  id: string;
  kind: string;
  summary: string;
  source: string;
  command?: string;
  paths?: string[];
  accepted: boolean;
  createdAt: string;
}

export interface AutoResearchEvidenceView {
  id: string;
  kind: string;
  summary: string;
  source: string;
  command?: string;
  paths?: string[];
  accepted: boolean;
}

export type Mode = "normal" | "plan" | "yolo" | "plan-yolo";

export interface WorkspaceChangeDetailView {
  diff?: string;
  source?: "git" | "session";
  added?: number;
  removed?: number;
  binary?: boolean;
  truncated?: boolean;
}

export interface GitCommitView {
  hash: string;
  author: string;
  date: string;
  message: string;
}

export interface GitCommitDetailView {
  diff?: string;
  files?: string[];
}

export interface ComposerInsertRequest {
  id: number;
  text: string;
  mode?: "insert" | "replace" | "prefix";
}

export interface SkillsSettingsView {
  skills: SkillView[];
  skillRoots: SkillRootView[];
}

export interface SubagentProfileInput {
  name: string;
  description: string;
  systemPrompt: string;
  color?: string;
  model?: string;
  effort?: string;
  allowedTools?: string[];
  readOnly?: boolean;
  scope?: "project" | "global";
}

export interface PluginCompatibilityIssue {
  capability: string;
  path?: string;
  reason: string;
}

export interface PluginAgentView {
  name: string;
  description?: string;
  path?: string;
  invocation?: string;
  model?: string;
  allowedTools?: string[];
}

export interface PluginCommandView {
  name: string;
  description?: string;
  argHint?: string;
  path?: string;
  invocation?: string;
  shadowed?: boolean;
  shadowedByPlugin?: string;
}

export interface MCPInstallResult {
  name: string;
  state: "ready" | "action_required" | "issue";
  toolCount: number;
  action: "none" | "authenticate" | "authorize" | "retry";
  message: string;
}

export interface MCPMarketplaceEntry {
  name: string;
  suggestedName: string;
  title?: string;
  description?: string;
  version?: string;
  repositoryUrl?: string;
  installable: boolean;
  unavailableReason?: string;
  transport?: "stdio" | "http" | "sse" | string;
  command?: string;
  args: string[];
  url?: string;
}

export interface MCPMarketplaceView {
  servers: MCPMarketplaceEntry[];
  cached: boolean;
  warning?: string;
}

export interface SlashArgsResult {
  items: SlashArgItem[];
  from: number; // byte offset where the current token begins
}

export interface MemoryArchive extends MemoryFact {
  path: string;
  archivedAt?: string;
}

export interface MemorySuggestion {
  id: string;
  name: string;
  title: string;
  description: string;
  type: string;
  body: string;
  reason: string;
  evidence: string[];
}

export interface SkillSuggestion {
  id: string;
  name: string;
  description: string;
  scope: string;
  body: string;
  reason: string;
  evidence: string[];
}

export interface MemorySuggestionsView {
  memories: MemorySuggestion[];
  skills: SkillSuggestion[];
  generatedAt: string;
  available: boolean;
  source: string;
}

export type SettingsTab = "general" | "models" | "providers" | "bots" | "mcp" | "remote" | "skills" | "subagents" | "plugins" | "memory" | "hooks" | "diagnostics" | "shortcuts" | "permissions" | "sandbox" | "network" | "appearance" | "updates";

export type RemoteConnState =
  | "stopped"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "degraded"
  | "pending_hostkey"
  | "pending_secret";

export type RemoteServerState = "stopped" | "starting" | "ready" | "error";

export interface RemoteHostView {
  id: string;
  label: string;
  host: string;
  port: number;
  user: string;
  identityFile: string;
  proxyJump: string;
  defaultWorkspace: string;
  serveInstall: string;
  useSSHConfig: boolean;
  passwordSet?: boolean;
  keyPassphraseSet?: boolean;
}

export interface RemoteHostInput {
  label: string;
  host: string;
  port: number;
  user: string;
  identityFile: string;
  proxyJump: string;
  defaultWorkspace: string;
  serveInstall: string;
  useSSHConfig: boolean;
  password?: string;
  keyPassphrase?: string;
  clearPassword?: boolean;
  clearPassphrase?: boolean;
  preserveExistingSettings?: boolean;
}

export interface RemoteFingerprintView {
  hostId: string;
  address: string;
  keyType: string;
  sha256: string;
}

export interface RemoteSecretPromptView {
  promptId: string;
  hostId: string;
  host: string;
  kind: "password" | "passphrase";
  identity?: string;
}

export interface RemoteKnownHostLocation {
  path: string;
  line: number;
}

export interface RemoteConnectionErrorDetails {
  code: "connection_failed" | "auth_failed" | "host_key_rejected" | "host_key_mismatch";
  presentedSha256?: string;
  knownHostRecords?: RemoteKnownHostLocation[];
}

export interface RemoteConnectionStatus {
  hostId: string;
  state: RemoteConnState;
  error?: string;
  errorDetails?: RemoteConnectionErrorDetails;
  fingerprint?: RemoteFingerprintView;
  secretPrompt?: RemoteSecretPromptView;
  attempt?: number;
}

export interface RemoteDirEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  mtimeUnix: number;
  symlink: boolean;
}

export interface RemoteFilePreview {
  path: string;
  body: string;
  size: number;
  mtimeUnix: number;
  truncated: boolean;
  binary: boolean;
  err?: string;
}

export interface RemoteWriteResult {
  ok: boolean;
  conflict: boolean;
  newMtimeUnix: number;
}

export interface RemoteForwardInput {
  localPort: number;
  remoteHost: string;
  remotePort: number;
  label: string;
}

export interface RemoteForwardView {
  id: string;
  hostId: string;
  localPort: number;
  remoteHost: string;
  remotePort: number;
  label: string;
  state: string;
  error?: string;
}

export interface RemoteServerView {
  hostId: string;
  workspace: string;
  state: RemoteServerState;
  message?: string;
  localUrl?: string;
  error?: string;
}

export interface RemoteForwardsEvent {
  hostId: string;
  forwards: RemoteForwardView[];
}

export interface CapabilityDiagnosticsReport {
  schema_version: number;
  root: string;
  live: boolean;
  summary: {
    errors: number;
    warnings: number;
    infos: number;
    instructions: number;
    skills: number;
    commands: number;
    hooks: number;
    plugins: number;
    mcp_servers: number;
  };
  instructions: { docs: Array<{ path: string; scope: string; order: number }> };
  skills: CapabilityAssetReport;
  commands: CapabilityAssetReport;
  hooks: {
    trusted_project: boolean;
    project_defines_hooks: boolean;
    sources: Array<{ scope: string; path: string; status: string; hook_count: number; parse_error?: string }>;
    entries: Array<{
      event: string;
      match?: string;
      command?: string;
      context_file?: string;
      description?: string;
      timeout_ms?: number;
      scope: string;
      source: string;
      blocking: boolean;
    }>;
  };
  plugins: {
    state_path?: string;
    packages: Array<{
      name: string;
      enabled: boolean;
      version?: string;
      root: string;
      manifest_kind?: string;
      skills: number;
      commands: number;
      hooks: number;
      mcp_servers: number;
      warnings?: string[];
      status: string;
    }>;
  };
  mcp: {
    servers: Array<{
      name: string;
      source?: string;
      package_owner?: string;
      transport: string;
      start_intent: string;
      command?: string;
      url_host?: string;
      env_keys?: string[];
      header_keys?: string[];
      runtime_status?: string;
      tool_count?: number;
      tools?: Array<{ name: string; read_only_hint?: boolean }>;
      error?: string;
    }>;
  };
  issues: CapabilityIssue[];
}

export interface CapabilityAssetReport {
  roots: Array<{ path: string; scope?: string; status: string }>;
  entries: Array<{
    name: string;
    description?: string;
    scope?: string;
    path: string;
    status: string;
    winner_path?: string;
    error?: string;
    run_as?: string;
  }>;
  winners: number;
  shadowed: number;
  disabled?: number;
  parse_errors?: number;
}

export interface CapabilityIssue {
  severity: "error" | "warning" | "info" | string;
  code: string;
  subsystem: string;
  name?: string;
  source?: string;
  message: string;
  remediation?: string;
  settings_tab?: string;
}

export interface ProviderPresetView {
  id: string;
  label: string;
  description: string;
  keyEnv: string;
  providerNames: string[];
  models: string[];
  added: boolean;
  status?: "available" | "installed" | "installed_modified" | "name_conflict" | "similar_existing";
  statusProviderNames?: string[];
  keySet: boolean;
  requiresKey?: boolean;
  configured?: boolean;
  keySource?: string;
  keySourcePath?: string;
}

export interface ProviderModelOverrideView {
  model: string;
  reasoningProtocol: string;
  supportedEfforts: string[];
  defaultEffort: string;
  vision?: boolean | null;
  contextWindow?: number;
}

export interface BalanceInfo {
  available: boolean;
  display: string;
  err?: string;
}

export interface JobView {
  id: string;
  kind: string; // "bash" | "task"
  label: string;
  status: string; // "running"
  startedAt: number; // unix milliseconds
}

export interface NetworkProxyView {
  type: string;
  server: string;
  port: number;
  username: string;
  password: string;
}

export interface NetworkView {
  proxyMode: string; // "auto" | "custom" | "off" (backend may still return legacy "env")
  proxyUrl: string;
  noProxy: string;
  proxy: NetworkProxyView;
}

export interface BotAllowlistView {
  enabled: boolean;
  allowAll: boolean;
  qqUsers: string[];
  feishuUsers: string[];
  weixinUsers: string[];
  qqApprovers: string[];
  feishuApprovers: string[];
  weixinApprovers: string[];
  qqAdmins: string[];
  feishuAdmins: string[];
  weixinAdmins: string[];
  qqGroups: string[];
  feishuGroups: string[];
  weixinGroups: string[];
}

export interface BotAccessView {
  enabled: boolean;
  allowAll: boolean;
  pairingEnabled: boolean;
  users: string[];
  groups: string[];
  approvers: string[];
  admins: string[];
}

export interface BotSelfUserIDsView {
  qq: string[];
  feishu: string[];
  weixin: string[];
}

export interface BotPairingView {
  enabled: boolean;
  requestTtlMinutes: number;
  maxPendingPerPlatform: number;
}

export interface BotControlView {
  enabled: boolean;
  addr: string;
  tokenEnv: string;
}

export interface BotRouteView {
  connectionId: string;
  platform: string;
  chatType: string;
  chatId: string;
  userId: string;
  threadId: string;
  model: string;
  toolApprovalMode: ToolApprovalMode | "" | string;
  workspaceRoot: string;
}

export interface QQBotView {
  enabled: boolean;
  appId: string;
  appSecretEnv: string;
  secretSet: boolean;
  sandbox: boolean;
  model: string;
  toolApprovalMode: ToolApprovalMode | "" | string;
  workspaceRoot: string;
  access: BotAccessView;
}

export interface FeishuBotView {
  enabled: boolean;
  domain: string;
  appId: string;
  appSecretEnv: string;
  secretSet: boolean;
  verificationToken: string;
  mode: string;
  webhookPort: number;
  requireMention: boolean;
}

export interface WeixinBotView {
  enabled: boolean;
  accountId: string;
  tokenEnv: string;
  tokenSet: boolean;
  apiBase: string;
}

export interface BotConnectionCredentialView {
  appId: string;
  appSecretEnv: string;
  accountId: string;
  tokenEnv: string;
  secretSet: boolean;
}

export interface BotConnectionSessionMappingView {
  remoteId: string;
  sessionId: string;
  sessionSource: string;
  chatType: string;
  userId: string;
  threadId: string;
  scope: "global" | "project" | string;
  workspaceRoot: string;
  updatedAt: string;
}

export interface BotConnectionView {
  id: string;
  provider: "qq" | "feishu" | "weixin" | string;
  domain: "qq" | "feishu" | "lark" | "weixin" | string;
  label: string;
  enabled: boolean;
  status: "disconnected" | "pending" | "connected" | "error" | string;
  model: string;
  toolApprovalMode: ToolApprovalMode | "" | string;
  workspaceRoot: string;
  access: BotAccessView;
  credential: BotConnectionCredentialView;
  sessionMappings: BotConnectionSessionMappingView[];
  lastError: string;
  createdAt: string;
  updatedAt: string;
}

export interface BotSettingsView {
  enabled: boolean;
  model: string;
  toolApprovalMode: ToolApprovalMode | "" | string;
  maxSteps: number;
  debounceMs: number;
  queueMode: string;
  queueCap: number;
  queueDrop: string;
  ignoreSelfMessages: boolean;
  selfUserIds: BotSelfUserIDsView;
  control: BotControlView;
  pairing: BotPairingView;
  routes: BotRouteView[];
  allowlist: BotAllowlistView;
  qq: QQBotView;
  feishu: FeishuBotView;
  weixin: WeixinBotView;
  connections: BotConnectionView[];
}

export interface BotRuntimeStatusView {
  running: boolean;
  status: string;
  message: string;
  connections: number;
  startedAt: string;
}

export interface BotInstallStartResult {
  ok: boolean;
  provider: string;
  domain: string;
  installId: string;
  url: string;
  deviceCode: string;
  userCode: string;
  interval: number;
  expireIn: number;
  message: string;
}

export interface BotInstallPollResult {
  done: boolean;
  connection: BotConnectionView;
  status: string;
  message: string;
  error: string;
}

export interface BotConnectionDiagnostic {
  id: string;
  label: string;
  status: string;
  message: string;
  messageId: string;
  phase: string;
  code: string;
  reportKind: string;
  reportDetail: string;
  occurredAt: string;
}

export interface DesktopStartupSettingsView {
  bot: BotSettingsView;
  desktopLanguage: string; // "" | "en" | "zh"; empty = auto
  desktopLayoutStyle: string; // "classic" | "workbench"
  desktopTheme: string; // "auto" | "dark" | "light"
  desktopThemeStyle: string;
  displayMode: string;   // "standard" | "compact"
  statusBarStyle: string; // "icon" | "text"
  statusBarItems: string[]; // ordered visible status bar item ids
  checkUpdates: boolean; // check for new versions on startup
  updateChannel: string; // "stable" | "preview"
  safeMode?: boolean; // recovery startup with external integrations disabled
  conversationWidth?: string; // "standard" | "full"; absent from older Wails payloads
}

export type ExternalOpenerKind = "file-manager" | "editor" | "terminal";

export interface ExternalOpenerView {
  id: string;
  name: string;
  kind: ExternalOpenerKind;
  iconDataUrl?: string;
}

export interface ExternalOpenersView {
  openers: ExternalOpenerView[];
  preferred: string;
}

export interface UpdateDownloadResult {
  version: string;
  channel: string;
  path: string;
  size: number;
  sha256: string;
}
