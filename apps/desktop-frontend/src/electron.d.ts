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
  dshRequest(method: string, payload: unknown): Promise<unknown>;
  dshRespond(message: unknown): Promise<unknown>;
  onDshFrame(listener: (frame: unknown) => void): () => void;
  onRuntimeError(listener: (message: string) => void): () => void;
}

declare global {
  interface Window {
    voltDesktop?: DesktopShellApi;
  }
}

export {};
