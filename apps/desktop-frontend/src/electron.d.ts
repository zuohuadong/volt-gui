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
  setWorkingDir(directory: string): Promise<ElectronDshMutationResult>;
  getConfig(): Promise<ElectronDshConfig>;
  saveConfig(config: ElectronDshConfigPatch): Promise<ElectronDshMutationResult>;
  minimizeWindow(): Promise<void>;
  maximizeWindow(): Promise<void>;
  closeWindow(): Promise<void>;
  isMaximized(): Promise<boolean>;
  toggleDevTools(): Promise<void>;
  onWindowStateChange(callback: (state: { isMaximized: boolean }) => void): () => void;
}

declare global {
  interface Window {
    electronDsh?: ElectronDshApi;
  }
}
