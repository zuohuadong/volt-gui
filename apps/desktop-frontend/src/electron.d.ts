export interface ElectronDshConfig {
  model: string;
  baseURL: string;
  port: number;
  host: "127.0.0.1";
  compactReasoning: boolean;
  degenerationGuard: boolean;
  apiKeySet: boolean;
  brandName: string;
  brandShortName: string;
  managedFields: Array<"model" | "baseURL" | "apiKey">;
}

export interface ElectronToolApprovalPrompt {
  requestId: string;
  toolCallId: string;
  toolName: string;
  workingDirectory: string;
  effect: string;
  risk: string;
  args: Record<string, unknown>;
}

export interface ElectronDshConfigPatch {
  model?: string;
  apiKey?: string;
  clearApiKey?: boolean;
  baseURL?: string;
  compactReasoning?: boolean;
  degenerationGuard?: boolean;
}

export interface ElectronDshConnection {
  baseUrl: string;
  accessToken: string;
}

export interface ElectronDshMutationResult {
  success: boolean;
  config?: ElectronDshConfig;
  connection?: ElectronDshConnection;
  workingDir?: string;
  error?: string;
}

export interface ElectronDshApi {
  getServerConnection(): Promise<ElectronDshConnection>;
  openFolderDialog(): Promise<ElectronDshMutationResult | null>;
  getWorkingDir(): Promise<string>;
  getConfig(): Promise<ElectronDshConfig>;
  saveConfig(config: ElectronDshConfigPatch): Promise<ElectronDshMutationResult>;
  minimizeWindow(): Promise<void>;
  maximizeWindow(): Promise<void>;
  closeWindow(): Promise<void>;
  isMaximized(): Promise<boolean>;
  toggleDevTools(): Promise<void>;
  getPermissionMode(): Promise<"ask" | "auto" | "yolo">;
  setPermissionMode(mode: "ask" | "auto" | "yolo"): Promise<"ask" | "auto" | "yolo">;
  resolveToolApproval(requestId: string, decision: "allow_once" | "deny"): Promise<{ success: boolean; error?: string }>;
  onToolApprovalRequested(callback: (prompt: ElectronToolApprovalPrompt) => void): () => void;
  onWindowStateChange(callback: (state: { isMaximized: boolean }) => void): () => void;
}

declare global {
  interface Window {
    electronDsh?: ElectronDshApi;
  }
}
