export interface DesktopBootstrap {
  dshReady: boolean;
  productName: string;
  version: string;
  workspace: string;
  workspaceWarning?: string;
  startupError?: string;
  startupDeadline: number;
  networkMode: "intranet" | "external";
  memoryStatus?: "active" | "disabled" | "requiresGit";
  capabilities?: DesktopCapabilities;
  features?: { permanentSessionDeletion: boolean; updateChecks: boolean };
}

export type DesktopCapabilityKey =
  | "altium" | "pcb" | "sentry" | "report"
  | "documentImport" | "github" | "cnb" | "feishu"
  | "computerUse";

export type DesktopCapabilities = Record<DesktopCapabilityKey, boolean>;

export interface DesktopBrowserExtension {
  version: string;
  directory: string;
  installed: boolean;
  changed: boolean;
  error?: string;
}

export interface DesktopBrowserCandidate {
  id: "chrome" | "edge" | "chromium" | "brave";
  name: string;
  path: string;
}

export type DesktopBrowserExtensionPageResult =
  | { launched: true; browser: DesktopBrowserCandidate }
  | { launched: false; error: string };

/** 框选截图：坐标是截图图片自身的像素，不是窗口 CSS 像素。 */
export interface ScreenshotSelection {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type MicrophoneAccessStatus = "granted" | "denied" | "restricted" | "not-determined" | "unknown";

export interface DesktopUpdateCheck {
  status: "current" | "available";
  currentVersion: string;
  latestVersion: string;
  publishedAt?: string;
  downloadUrl?: string;
}

export interface DesktopShellApi {
  bootstrap(): Promise<DesktopBootstrap>;
  retryRuntime(): Promise<DesktopBootstrap>;
  setNetworkMode(mode: "intranet" | "external"): Promise<DesktopBootstrap>;
  setCapabilities(patch: Partial<DesktopCapabilities>): Promise<DesktopBootstrap>;
  minimize(): Promise<void>;
  maximize(): Promise<boolean>;
  close(): Promise<void>;
  openExternal(url: string): Promise<{ opened: true }>;
  microphoneAccess(): Promise<MicrophoneAccessStatus>;
  openMicrophoneSettings(): Promise<{ opened: true } | { opened: false }>;
  copyText(text: string): Promise<{ copied: true }>;
  checkForUpdate(): Promise<DesktopUpdateCheck>;
  resetBundledModelCredential(): Promise<{ reset: boolean; available: boolean }>;
  captureScreen(): Promise<string | null>;
  cropScreenshot(image: string, selection: ScreenshotSelection): Promise<string>;
  browserExtension(): Promise<DesktopBrowserExtension>;
  openBrowserExtensionFolder(): Promise<{ opened: true } | { opened: false; error: string }>;
  browserExtensionBrowsers(): Promise<DesktopBrowserCandidate[]>;
  openBrowserExtensionPage(browserId: string): Promise<DesktopBrowserExtensionPageResult>;
  pickWorkspace(): Promise<string | null>;
  exportSession(sessionId: string): Promise<{ saved: false } | { saved: true; path: string }>;
  deleteArchivedSession(sessionId: string): Promise<{ deleted: boolean }>;
  smbList(): Promise<SmbMountView[]>;
  smbMount(request: SmbMountRequest): Promise<SmbMountView>;
  smbUnmount(id: string): Promise<SmbMountView>;
  smbRemove(id: string): Promise<{ deleted: true }>;
  smbOpen(localPath: string): Promise<{ opened: true } | { opened: false; error: string }>;
  skillsList(): Promise<SkillStoreState>;
  skillsInstall(id: string, version?: string): Promise<SkillStoreAction>;
  skillsRemove(id: string): Promise<SkillStoreAction>;
  skillsRollback(id: string): Promise<SkillStoreAction>;
  getPathForFile(file: File): string;
  dshRequest(method: string, payload: unknown): Promise<unknown>;
  dshRespond(message: unknown): Promise<unknown>;
  onDshFrame(listener: (frame: unknown) => void): () => void;
  onRuntimeError(listener: (message: string) => void): () => void;
  onRuntimeReady(listener: () => void): () => void;
  /** 有新深链时的通知（#ACB）：只是提醒去取，真正的链接用 pendingAgentConfigLinks 取。 */
  onAgentConfigLink?(listener: () => void): () => void;
  /** 取排队的深链副本（不清空，处理完用 ackAgentConfigLink 确认）；按到达顺序返回。 */
  pendingAgentConfigLinks?(): Promise<string[]>;
  /** 确认已处理到这条链接（含更早的）；主进程据此出队，重载后不会丢也不会重复。 */
  ackAgentConfigLink?(link: string): Promise<unknown>;
  /** 让主进程观察这个会话的被动状态（官方 session/observeState），用于待发送队列。 */
  observeSessionState?(sessionId: string): Promise<{ accepted: boolean; sessionId: string }>;
  /** 官方 host 的变更摘要（`/api/changes.summary`）；会话已释放时返回 undefined。 */
  readChangesSummary?(sessionId: string, seq: number): Promise<unknown>;
  /** 官方 host 的逐文件比对（`/api/changes.diff`）；会话已释放时返回 undefined。 */
  readChangesDiff?(sessionId: string, seq: number, index: number): Promise<unknown>;
  /** 观察当前会话的后台任务花名册（官方 job/list 流）。 */
  observeJobRoster?(sessionId: string): Promise<{ accepted: boolean; sessionId: string }>;
  /** 终止一个后台任务（官方 job/kill）。 */
  killJob?(sessionId: string, jobId: string): Promise<unknown>;
  /** 跟随一个任务的输出尾（官方 job/follow 流）。 */
  followJob?(sessionId: string, jobId: string): Promise<{ following: boolean }>;
  unfollowJob?(): Promise<{ following: boolean }>;
  /** 创建并附着一个官方终端（`terminal/create` + `terminal/attach` 双向流）。 */
  startTerminal?(sessionId: string, cols: number, rows: number, terminalId?: string): Promise<{ terminalId: string; stale?: true }>;
  writeTerminal?(data: string, typed?: boolean): Promise<{ accepted: boolean; reason?: string }>;
  resizeTerminal?(cols: number, rows: number): Promise<{ accepted: boolean; reason?: string }>;
  closeTerminal?(terminalId?: string): Promise<{ closed: boolean; error?: string; superseded?: boolean }>;
}

export type SmbMountStatus = "mounted" | "unmounted" | "offline" | "requires_credentials" | "error" | "unsupported";export interface SmbMountView {
  id: string;
  displayName: string;
  remotePath: string;
  localPath: string;
  autoMount: boolean;
  status: SmbMountStatus;
  lastError?: string;
}
export interface SmbMountRequest {
  id?: string;
  displayName: string;
  remotePath: string;
  localPath: string;
  autoMount?: boolean;
}

declare global {
  interface Window {
    voltDesktop?: DesktopShellApi;
  }
}

export {};

export interface SkillStoreEntry {
  id: string;
  version: string;
  title?: string;
  description?: string;
  whenToUse?: string;
  tags?: string[];
  sha256?: string;
  installedAt?: string;
  ref?: string;
  installed: boolean;
  updateAvailable: boolean;
}

export interface SkillStoreState {
  available: boolean;
  directory?: string;
  skills: SkillStoreEntry[];
  error?: string;
  remoteError?: string;
  tokenConfigured: boolean;
}

export interface SkillStoreAction {
  ok: boolean;
  error?: string;
  result?: { id?: string; version?: string; sha256?: string; raw?: string };
}
