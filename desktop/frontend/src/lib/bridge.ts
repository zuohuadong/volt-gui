// Wails binding bridge — no fabricated fallback data. This module only works inside a
// Wails desktop runtime. For browser-only development, the Wails dev server
// (wails dev) provides the real bindings on localhost.

import type {
  CommandInfo,
  BrandInfo,
  BrowserCredentialView,
  ContextPanelInfo,
  BrandView,
  DirEntry,
  DroppedItem,
  EffortInfo,
  ExternalDataImportInput,
  ExternalDataImportPreview,
  ExternalDataImportResult,
  ExternalDataPreviewInput,
  ExternalDataSource,
  FilePreview,
  CheckpointMeta,
  CapabilitiesView,
  AgentInput,
  AgentView,
  HistoryMessage,
  HistoryPage,
  MCPServerInput,
  MemoryView,
  ManagedWorktree,
  ManagedWorktreeHandoff,
  ManagedWorktreeSnapshot,
  ScopedMemoryContext,
  ScopedMemoryEntry,
  ScopedMemoryInput,
  ScopedMemoryView,
  SteerDispatchMode,
  SubmitDispatchMode,
  ModelInfo,
  ProjectNode,
  ProviderView,
  QuestionAnswer,
  SettingsView,
  TrustCenterView,
  SessionMeta,
  SlashArgItem,
  TabMeta,
  TopicMeta,
  ToolResultData,
  TrustedIntranetSiteView,
  UpdateInfo,
  UpdateProgress,
  UserInfo,
  WorkbenchArtifactInput,
  WorkbenchJob,
  WorkbenchPluginInput,
  WorkbenchPlugin,
	CloudflareDropPreflight,
  WorkbenchProvider,
  SkillPackageInput,
  WorkbenchTodo,
  WorkbenchTodoInput,
  WorkbenchProject,
  WorkbenchProjectInput,
  WorkbenchProjectMaterial,
  WorkbenchProjectMaterialBatchInput,
  WorkbenchProjectMaterialInput,
  WorkbenchAutomation,
  WorkbenchAutomationRun,
  WorkbenchAutomationInput,
  WorkbenchCalendarEvent,
  WorkbenchCalendarEventInput,
  WorkbenchCustomer,
  WorkbenchCustomerInput,
  WorkbenchData,
  WorkbenchKnowledgeDocument,
  WorkbenchKnowledgeDocumentInput,
  KnowledgeBaseView,
  KnowledgeDocumentImportInput,
  KnowledgeSearchResult,
  KnowledgeStatus,
  HookConfigView,
  HooksSettingsView,
  PluginInstallOptions,
  PluginView,
  WorkbenchReport,
  WorkbenchReportInput,
  WorkbenchRegulation,
  WorkbenchSearchResult,
  WorkbenchSyncJob,
  WorkbenchTeamChatMessage,
  WorkbenchTeamRoom,
  WorkbenchTeamRuntimeInput,
  WorkbenchTeamRuntimeResult,
  WorkbenchTeamRun,
  CreateWorkbenchJobInput,
  UpdateWorkbenchStepInput,
  WireEvent,
  WorkspaceDiffView,
  WorkspaceChangesView,
} from "./types";

type ProjectMaterialFile = {
  selectionToken?: string;
  path?: string;
  name: string;
  size: number;
  mimeType: string;
};

interface AppBindings {
  Brand(): Promise<BrandInfo>;
  SubmitToTab(tabID: string, input: string): Promise<void>;
  SubmitDisplayToTab(tabID: string, display: string, input: string): Promise<void>;
  SubmitDisplayToTabMode(tabID: string, display: string, input: string): Promise<SubmitDispatchMode>;
  CancelTab(tabID: string): Promise<void>;
  SteerForTab(tabID: string, text: string): Promise<void>;
  SteerForTabMode(tabID: string, text: string): Promise<SteerDispatchMode>;
  ReplayPendingPrompts(): Promise<void>;
  ReplayPendingPromptsForTab(tabID: string): Promise<void>;
  ListTabs(): Promise<TabMeta[]>;
  SetActiveTab(tabID: string): Promise<void>;
  PickWorkspace(): Promise<string>;
  OpenGlobalTab(topicID: string): Promise<TabMeta>;
  OpenProjectTab(workspaceRoot: string, topicID: string): Promise<TabMeta>;
  OpenTopicSession(scope: string, workspaceRoot: string, topicID: string, sessionPath: string): Promise<TabMeta>;
  NewConversationThread(scope: string, workspaceRoot: string, title: string): Promise<TabMeta>;
  ReorderTabs(tabIDs: string[]): Promise<void>;
  CloseTab(tabID: string): Promise<void>;
  ListProjectTree(): Promise<ProjectNode[]>;
  RenameProject(workspaceRoot: string, title: string): Promise<void>;
  SetProjectColor(workspaceRoot: string, color: string): Promise<void>;
  ReorderProjects(workspaceRoots: string[]): Promise<void>;
  CreateTopic(scope: string, workspaceRoot: string, title: string): Promise<TopicMeta>;
  RenameTopic(topicID: string, title: string): Promise<void>;
  DeleteTopic(topicID: string): Promise<void>;
  TrashTopic(topicID: string): Promise<void>;
  ListSessions(): Promise<SessionMeta[]>;
  LoadDesktopWorkbenchState(): Promise<string>;
  SaveDesktopWorkbenchState(raw: string): Promise<void>;
  ResumeSessionForTab(tabID: string, path: string): Promise<HistoryMessage[]>;
  HistoryForTab(tabID: string): Promise<HistoryMessage[]>;
  HistoryPageForTab(tabID: string, beforeTurn: number, limit: number): Promise<HistoryPage>;
  ToolResultForTab(tabID: string, toolID: string): Promise<ToolResultData | null>;
  CheckpointsForTab(tabID: string): Promise<CheckpointMeta[]>;
  Fork(turn: number): Promise<TabMeta>;
  Rewind(turn: number, scope: string): Promise<void>;
  ModelsForTab(tabID: string): Promise<ModelInfo[]>;
  SetModelForTab(tabID: string, name: string): Promise<void>;
  SetAgentProfileForTab(tabID: string, profileID: string): Promise<void>;
  DataTrustCenter(): Promise<TrustCenterView>;
  DataTrustCenterForTab(tabID: string): Promise<TrustCenterView>;
  ScopedMemoryForTab(tabID: string): Promise<ScopedMemoryView>;
  SaveScopedMemoryForTab(tabID: string, input: ScopedMemoryInput): Promise<ScopedMemoryEntry>;
  SetScopedMemoryIsolationForTab(tabID: string, entryID: string, isolated: boolean): Promise<ScopedMemoryEntry>;
  DeleteScopedMemoryForTab(tabID: string, entryID: string): Promise<void>;
  SetMemoryContextForTab(tabID: string, context: ScopedMemoryContext): Promise<void>;
  EffortForTab(tabID: string): Promise<EffortInfo>;
  SetEffortForTab(tabID: string, level: string): Promise<void>;
  SetModeForTab(tabID: string, mode: string): Promise<void>;
  SetCollaborationModeForTab(tabID: string, mode: string): Promise<void>;
  SetToolApprovalModeForTab(tabID: string, mode: string): Promise<void>;
  SetTokenModeForTab(tabID: string, mode: string): Promise<void>;
  SetGoalForTab(tabID: string, objective: string): Promise<void>;
  ClearGoalForTab(tabID: string): Promise<void>;
  ApproveTab(tabID: string, id: string, allow: boolean, session: boolean, persist: boolean): Promise<void>;
  AnswerQuestionForTab(tabID: string, id: string, answers: QuestionAnswer[]): Promise<void>;
  SubmitBrowserCredentialTab(tabID: string, id: string, username: string, password: string, save: boolean): Promise<void>;
  CompleteBrowserVerificationTab(tabID: string, id: string, continued: boolean): Promise<void>;
  Commands(): Promise<CommandInfo[]>;
  SlashArgs(input: string): Promise<{ items: SlashArgItem[]; from: number }>;
  ListDir(rel: string): Promise<DirEntry[]>;
  SearchFileRefs(query: string): Promise<DirEntry[]>;
  ReadFile(rel: string): Promise<FilePreview>;
  ReadFileForTab(tabID: string, rel: string): Promise<FilePreview>;
  OpenWorkspacePath(rel: string): Promise<void>;
  RevealWorkspacePath(rel: string): Promise<void>;
  RevealPath(path: string): Promise<void>;
  WorkspaceChanges(paths: string[]): Promise<WorkspaceChangesView>;
  WorkspaceDiff(rel: string): Promise<WorkspaceDiffView>;
  WorkspaceDiffForTab(tabID: string, rel: string): Promise<WorkspaceDiffView>;
  ListManagedWorktrees(workspaceRoot: string): Promise<ManagedWorktree[]>;
  ListManagedWorktreeSnapshots(workspaceRoot: string): Promise<ManagedWorktreeSnapshot[]>;
  CreateManagedWorktree(workspaceRoot: string, name: string): Promise<ManagedWorktree>;
  CreateManagedWorktreeSnapshot(worktreeID: string): Promise<ManagedWorktreeSnapshot>;
  RestoreManagedWorktreeSnapshot(snapshotID: string, targetWorktreeID: string): Promise<ManagedWorktree>;
  HandoffManagedWorktree(sourceWorktreeID: string, targetWorktreeID: string, summary: string): Promise<ManagedWorktreeHandoff>;
  SavePastedImage(dataUrl: string): Promise<string>;
  SavePastedFile(name: string, dataUrl: string): Promise<string>;
  PickProjectMaterialFile(): Promise<ProjectMaterialFile>;
  ImportProjectMaterialFile(selectionToken: string): Promise<ProjectMaterialFile>;
  AttachDropped(path: string): Promise<DroppedItem>;
  AttachmentDataURL(path: string): Promise<string>;
  ContextPanel(tabID: string): Promise<ContextPanelInfo>;
  Capabilities(): Promise<CapabilitiesView>;
  ListAgents(): Promise<AgentView[]>;
  SaveAgent(input: AgentInput): Promise<AgentView>;
  DeleteAgent(id: string): Promise<void>;
  ListTodos(): Promise<WorkbenchTodo[]>;
  SaveTodo(input: WorkbenchTodoInput): Promise<WorkbenchTodo>;
  DeleteTodo(id: string): Promise<void>;
  ListWorkbenchProjects(): Promise<WorkbenchProject[]>;
  SaveWorkbenchProject(input: WorkbenchProjectInput): Promise<WorkbenchProject>;
  DeleteWorkbenchProject(id: string): Promise<void>;
  ListProjectMaterials(): Promise<WorkbenchProjectMaterial[]>;
  SaveProjectMaterial(input: WorkbenchProjectMaterialInput): Promise<WorkbenchProjectMaterial>;
  SaveProjectMaterialsBatch(input: WorkbenchProjectMaterialBatchInput): Promise<WorkbenchProjectMaterial[]>;
  DeleteProjectMaterial(id: string): Promise<void>;
  ListAutomations(): Promise<WorkbenchAutomation[]>;
  ListAutomationRuns(): Promise<WorkbenchAutomationRun[]>;
  MarkAutomationRunRead(id: string, read: boolean): Promise<WorkbenchAutomationRun>;
  SaveAutomation(input: WorkbenchAutomationInput): Promise<WorkbenchAutomation>;
  DeleteAutomation(id: string): Promise<void>;
  RunAutomationNow(id: string): Promise<WorkbenchAutomation>;
  ListWorkbenchData(): Promise<WorkbenchData>;
  ListCustomers(): Promise<WorkbenchCustomer[]>;
  SaveCustomer(input: WorkbenchCustomerInput): Promise<WorkbenchCustomer>;
  DeleteCustomer(id: string): Promise<void>;
  ListCalendarEvents(): Promise<WorkbenchCalendarEvent[]>;
  SaveCalendarEvent(input: WorkbenchCalendarEventInput): Promise<WorkbenchCalendarEvent>;
  DeleteCalendarEvent(id: string): Promise<void>;
  ListWorkbenchReports(): Promise<WorkbenchReport[]>;
  SaveWorkbenchReport(input: WorkbenchReportInput): Promise<WorkbenchReport>;
  ReviewWorkbenchReport(id: string, action: string, reviewedBy: string, comment: string): Promise<WorkbenchReport>;
  SaveKnowledgeDocument(input: WorkbenchKnowledgeDocumentInput): Promise<WorkbenchKnowledgeDocument>;
  ListRegulations(): Promise<WorkbenchRegulation[]>;
  SaveRegulation(input: WorkbenchRegulation): Promise<WorkbenchRegulation>;
  RenderRegulation(id: string, variables: Record<string, string>): Promise<string>;
  DeleteRegulation(id: string): Promise<void>;
  RenderKnowledgeDocument(id: string, variables: Record<string, string>): Promise<string>;
  KnowledgeTemplateVariables(id: string): Promise<string[]>;
  ReindexKnowledgeDocument(id: string): Promise<WorkbenchKnowledgeDocument>;
  KnowledgeBase(): Promise<KnowledgeBaseView>;
  KnowledgeStatus(): Promise<KnowledgeStatus>;
  KnowledgeDocumentPreview(id: string): Promise<string>;
  ImportKnowledgeDocument(input: KnowledgeDocumentImportInput): Promise<WorkbenchKnowledgeDocument>;
  ExternalDataSources(): Promise<ExternalDataSource[]>;
  PickExternalDataDirectory(sourceID: string): Promise<string>;
  PreviewExternalData(input: ExternalDataPreviewInput): Promise<ExternalDataImportPreview>;
  ImportExternalData(input: ExternalDataImportInput): Promise<ExternalDataImportResult>;
  CancelExternalDataImport(): Promise<boolean>;
  SearchKnowledge(query: string, limit: number): Promise<KnowledgeSearchResult[]>;
  DeleteKnowledgeDocument(id: string): Promise<void>;
  RunWorkbenchSync(scope: string): Promise<WorkbenchSyncJob[]>;
  SearchWorkbench(query: string): Promise<WorkbenchSearchResult[]>;
  ExportOperationLogs(): Promise<string>;
  ExportWorkbenchReports(): Promise<string>;
  ExportWorkbenchReport(id: string): Promise<string>;
  DeleteWorkbenchReport(id: string): Promise<void>;
  ListTeamRooms(): Promise<WorkbenchTeamRoom[]>;
  SaveTeamRoom(input: WorkbenchTeamRoom): Promise<WorkbenchTeamRoom>;
  DeleteTeamRoom(id: string): Promise<void>;
  ListTeamRuns(teamID: string): Promise<WorkbenchTeamRun[]>;
  SaveTeamRun(input: WorkbenchTeamRun): Promise<WorkbenchTeamRun>;
  DeleteTeamRun(id: string): Promise<void>;
  ControlTeamRun(runID: string, action: string): Promise<WorkbenchTeamRuntimeResult>;
  ListTeamChatMessages(teamID: string): Promise<WorkbenchTeamChatMessage[]>;
  SaveTeamChatMessage(input: WorkbenchTeamChatMessage): Promise<WorkbenchTeamChatMessage>;
  DeleteTeamChatMessage(id: string): Promise<void>;
  RunTeamRuntime(input: WorkbenchTeamRuntimeInput): Promise<WorkbenchTeamRuntimeResult>;
  DistillAgentFromTodo(input: WorkbenchTodoInput, skillNames: string[]): Promise<AgentView>;
  AddMCPServer(input: MCPServerInput): Promise<number>;
  UpdateMCPServer(name: string, input: MCPServerInput): Promise<void>;
  RemoveMCPServer(name: string): Promise<void>;
  ReconnectMCPServer(name: string): Promise<void>;
  ClearMCPServerAuthentication(name: string): Promise<void>;
  SetMCPServerEnabled(name: string, enabled: boolean): Promise<void>;
  TrustMCPServerTool(name: string, toolName: string): Promise<void>;
  UntrustMCPServerTool(name: string, toolName: string): Promise<void>;
  RefreshSkills(): Promise<void>;
  SetSkillEnabled(name: string, enabled: boolean): Promise<void>;
  HooksSettings(scope: string): Promise<HooksSettingsView>;
  SaveHooksSettings(scope: string, hooks: HookConfigView[]): Promise<void>;
  TrustProjectHooks(): Promise<void>;
  Plugins(): Promise<PluginView[]>;
  PlanPluginInstall(source: string, options: PluginInstallOptions): Promise<string>;
  InstallPlugin(source: string, options: PluginInstallOptions): Promise<string>;
  RemovePlugin(name: string): Promise<void>;
  SetPluginEnabled(name: string, enabled: boolean): Promise<void>;
  UpdatePlugin(name: string): Promise<string>;
  PluginDoctor(name: string): Promise<PluginView>;
  Settings(): Promise<SettingsView>;
  SetCloseBehavior(mode: string): Promise<void>;
  SetDesktopLanguage(lang: string): Promise<void>;
  SetDesktopAppearance(theme: string, style: string): Promise<void>;
  SetDefaultModel(ref: string): Promise<void>;
  SetPlannerModel(ref: string): Promise<void>;
  SetSubagentModel(ref: string): Promise<void>;
  SetSubagentEffort(level: string): Promise<void>;
  SetMaxSubagentDepth(depth: number): Promise<void>;
  SetMaxSubagentConcurrency(limit: number): Promise<void>;
  SaveProvider(provider: ProviderView): Promise<void>;
  DeleteProvider(name: string): Promise<void>;
  RemoveProviderAccess(name: string): Promise<void>;
  FetchProviderModels(provider: ProviderView): Promise<string[]>;
  SetProviderKey(apiKeyEnv: string, value: string): Promise<string>;
  SetPermissionMode(mode: string): Promise<void>;
  AddPermissionRule(list: string, rule: string): Promise<void>;
  RemovePermissionRule(list: string, rule: string): Promise<void>;
  SetSandbox(bash: string, network: boolean, workspaceRoot: string, allowWrite: string[], shell: string): Promise<void>;
  RemoveTrustedIntranetSite(site: TrustedIntranetSiteView): Promise<void>;
  ListBrowserCredentials(): Promise<BrowserCredentialView[]>;
  RemoveBrowserCredential(origin: string): Promise<void>;
  NeedsAuth(): Promise<boolean>;
  StartOIDCLogin(): Promise<void>;
  CancelOIDCLogin(): Promise<void>;
  CurrentUser(): Promise<UserInfo | null>;
  Logout(): Promise<void>;
  Version(): Promise<string>;
  CheckUpdate(): Promise<UpdateInfo | null>;
  ApplyUpdate(): Promise<void>;
  OpenDownloadPage(): Promise<void>;
  Memory(): Promise<MemoryView>;
  Remember(scope: string, note: string): Promise<string>;
  Forget(name: string): Promise<void>;
  WorkbenchPlugins(): Promise<WorkbenchPlugin[]>;
  SaveWorkbenchPlugin(input: WorkbenchPluginInput): Promise<void>;
	PickCloudflareDropFolder(): Promise<CloudflareDropPreflight>;
	PickCloudflareDropZIP(): Promise<CloudflareDropPreflight>;
	OpenCloudflareDrop(): Promise<void>;
  CreateSkillPackage(input: SkillPackageInput): Promise<string>;
  WorkbenchProviders(): Promise<WorkbenchProvider[]>;
  ListWorkbenchJobs(): Promise<WorkbenchJob[]>;
  CreateWorkbenchJob(input: CreateWorkbenchJobInput): Promise<WorkbenchJob>;
  GetWorkbenchJob(id: string): Promise<WorkbenchJob>;
  UpdateWorkbenchStep(jobID: string, stepID: string, patch: UpdateWorkbenchStepInput): Promise<WorkbenchJob>;
  ApproveWorkbenchStep(jobID: string, stepID: string): Promise<WorkbenchJob>;
  AddWorkbenchArtifact(jobID: string, artifact: WorkbenchArtifactInput): Promise<WorkbenchJob>;
  WorkbenchArtifactDir(jobID: string): Promise<string>;
}

interface WailsRuntime {
  EventsOn(name: string, cb: (...data: unknown[]) => void): () => void;
  OnFileDrop?(cb: (x: number, y: number, paths: string[]) => void, useDropTarget: boolean): void;
  OnFileDropOff?(): void;
}

declare global {
  interface Window {
    runtime?: WailsRuntime;
    go?: { main?: { App?: AppBindings } };
  }
}

const EVENT_CHANNEL = "agent:event";
const PROJECT_TREE_CHANNEL = "project-tree:changed";
const AGENT_READY_CHANNEL = "agent:ready";

function bindings(): AppBindings {
  const real = typeof window === "undefined" ? undefined : window.go?.main?.App;
  if (!real) {
    throw new Error(
      "Wails bindings are unavailable. Run inside `wails dev` or `wails build` — browser-only mode does not fabricate desktop data.",
    );
  }
  return real;
}

export function app(): AppBindings {
  return bindings();
}

export function onAgentEvent(cb: (event: WireEvent) => void): () => void {
  const runtime = typeof window === "undefined" ? undefined : window.runtime;
  if (!runtime) return () => {};
  return runtime.EventsOn(EVENT_CHANNEL, (payload) => cb(payload as WireEvent));
}

export function onUpdaterProgress(cb: (progress: UpdateProgress) => void): () => void {
  const runtime = typeof window === "undefined" ? undefined : window.runtime;
  if (!runtime) return () => {};
  return runtime.EventsOn("updater:progress", (payload) => cb(payload as UpdateProgress));
}

export function onProjectTreeChanged(cb: () => void): () => void {
  const runtime = typeof window === "undefined" ? undefined : window.runtime;
  if (!runtime) return () => {};
  return runtime.EventsOn(PROJECT_TREE_CHANNEL, () => cb());
}

export function onWorkspaceReady(cb: () => void): () => void {
  const runtime = typeof window === "undefined" ? undefined : window.runtime;
  if (!runtime) return () => {};
  return runtime.EventsOn(AGENT_READY_CHANNEL, () => cb());
}

export function onFilesDropped(cb: (paths: string[]) => void): () => void {
  const runtime = typeof window === "undefined" ? undefined : window.runtime;
  if (!runtime?.OnFileDrop) return () => {};
  runtime.OnFileDrop((_x, _y, paths) => {
    if (Array.isArray(paths) && paths.length > 0) cb(paths);
  }, true);
  return () => runtime.OnFileDropOff?.();
}
