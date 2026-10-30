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
}

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
  getPathForFile(file: File): string;
  dshRequest(method: string, payload: unknown): Promise<unknown>;
  dshRespond(message: unknown): Promise<unknown>;
  onDshFrame(listener: (frame: unknown) => void): () => void;
  onRuntimeError(listener: (message: string) => void): () => void;
  onRuntimeReady(listener: () => void): () => void;
}

export type SmbMountStatus = "mounted" | "unmounted" | "offline" | "requires_credentials" | "error" | "unsupported";
export interface SmbMountView {
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
