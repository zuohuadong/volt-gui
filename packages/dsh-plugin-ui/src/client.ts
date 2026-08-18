/**
 * Anyong UI Client Runtime Bridge
 * Connects frontend UI components to DSH backend services and official DSH slots.
 */

export interface DshUiState {
  sessionId: string;
  activeTurnId: string | null;
  isStreaming: boolean;
  thinking: string;
  content: string;
  toolsExecuting: string[];
  diffs: Array<{ file: string; patch: string }>;
  tokenUsage: {
    prompt: number;
    completion: number;
    cacheHitRatio: number;
  };
}

export class AnyongDshClient {
  private endpoint: string;

  constructor(endpoint = '') {
    this.endpoint = endpoint || (typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:3210');
  }

  public async getBrandInfo() {
    const res = await fetch(`${this.endpoint}/api/anyong/brand`);
    if (!res.ok) return { brandName: 'Anyong DSH', theme: 'dark' };
    return res.json();
  }

  public async getSessionOverview(sessionId: string) {
    const res = await fetch(`${this.endpoint}/api/session/${sessionId}`);
    if (!res.ok) throw new Error('Session not found');
    return res.json();
  }
}
