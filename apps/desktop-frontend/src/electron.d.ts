export interface DesktopBootstrap {
  dshReady: boolean;
  productName: string;
  version: string;
  workspace: string;
  startupError?: string;
}

export interface DesktopShellApi {
  bootstrap(): Promise<DesktopBootstrap>;
  minimize(): Promise<void>;
  maximize(): Promise<boolean>;
  close(): Promise<void>;
  pickWorkspace(): Promise<string | null>;
  exportSession(sessionId: string): Promise<{ saved: false } | { saved: true; path: string }>;
  smbList(): Promise<SmbMountView[]>;
  smbMount(request: SmbMountRequest): Promise<SmbMountView>;
  smbUnmount(id: string): Promise<SmbMountView>;
  smbRemove(id: string): Promise<{ deleted: true }>;
  smbOpen(localPath: string): Promise<{ opened: true } | { opened: false; error: string }>;
  dshRequest(method: string, payload: unknown): Promise<unknown>;
  dshRespond(message: unknown): Promise<unknown>;
  onDshFrame(listener: (frame: unknown) => void): () => void;
  onRuntimeError(listener: (message: string) => void): () => void;
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
