import { randomUUID } from 'node:crypto';
import type {
  ToolAuthorizationBroker,
  ToolAuthorizationRequest,
  ToolPermissionMode,
} from '@dsh/core';

export type ToolApprovalDecision = 'allow_once' | 'deny';

export interface ToolApprovalPrompt {
  requestId: string;
  toolCallId: string;
  toolName: string;
  workingDirectory: string;
  effect: string;
  risk: string;
  args: Record<string, unknown>;
}

interface PendingApproval {
  resolve: (decision: { allow: boolean; reason?: string }) => void;
  timer: NodeJS.Timeout;
  signal?: AbortSignal;
  abortListener?: () => void;
}

const MAX_STRING_LENGTH = 4096;
const SENSITIVE_KEY = /(token|secret|password|api[_-]?key|auth|cookie|session|credential|private|key)/i;
const MODES = new Set<ToolPermissionMode>(['ask', 'auto', 'yolo']);

function sanitizedValue(value: unknown, key = ''): unknown {
  if (SENSITIVE_KEY.test(key)) return '[REDACTED]';
  if (typeof value === 'string') return value.slice(0, MAX_STRING_LENGTH);
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 32).map((item) => sanitizedValue(item));
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [entryKey, entryValue] of Object.entries(value).slice(0, 64)) {
      result[entryKey] = sanitizedValue(entryValue, entryKey);
    }
    return result;
  }
  return String(value).slice(0, MAX_STRING_LENGTH);
}

export class ElectronToolPermissionBroker implements ToolAuthorizationBroker {
  private mode: ToolPermissionMode = 'ask';
  private readonly pending = new Map<string, PendingApproval>();

  constructor(
    private readonly showPrompt: (prompt: ToolApprovalPrompt) => boolean,
    private readonly timeoutMs = 120_000,
  ) {}

  public getMode(): ToolPermissionMode {
    return this.mode;
  }

  public setMode(mode: unknown): ToolPermissionMode {
    if (typeof mode !== 'string' || !MODES.has(mode as ToolPermissionMode)) {
      throw new Error('Invalid tool permission mode.');
    }
    this.mode = mode as ToolPermissionMode;
    return this.mode;
  }

  public async authorize(request: ToolAuthorizationRequest): Promise<{ allow: boolean; reason?: string }> {
    const { authorization } = request;
    if (
      !authorization
      || !['read', 'write', 'process', 'external'].includes(authorization.effect)
      || !['ordinary', 'high'].includes(authorization.risk)
    ) {
      return { allow: false, reason: 'Invalid tool authorization metadata.' };
    }
    if (request.signal?.aborted) return { allow: false, reason: 'Tool authorization was canceled.' };
    if (authorization.effect === 'read' && authorization.risk === 'ordinary') return { allow: true };
    if (authorization.risk === 'ordinary') {
      if (this.mode === 'yolo') return { allow: true };
      if (this.mode === 'auto' && authorization.effect === 'write') return { allow: true };
    }

    const requestId = randomUUID();
    const prompt: ToolApprovalPrompt = {
      requestId,
      toolCallId: request.toolCallId,
      toolName: request.toolName.slice(0, 128),
      workingDirectory: request.workingDirectory.slice(0, MAX_STRING_LENGTH),
      effect: authorization.effect,
      risk: authorization.risk,
      args: sanitizedValue(request.args) as Record<string, unknown>,
    };

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.finish(requestId, { allow: false, reason: 'Tool authorization timed out.' });
      }, this.timeoutMs);
      timer.unref();

      const abortListener = () => {
        this.finish(requestId, { allow: false, reason: 'Tool authorization was canceled.' });
      };
      request.signal?.addEventListener('abort', abortListener, { once: true });
      this.pending.set(requestId, { resolve, timer, signal: request.signal, abortListener });

      if (!this.showPrompt(prompt)) {
        this.finish(requestId, { allow: false, reason: 'No trusted Electron window is available for approval.' });
      }
    });
  }

  public resolve(requestId: string, decision: unknown): boolean {
    if (decision !== 'allow_once' && decision !== 'deny') return false;
    return this.finish(
      requestId,
      decision === 'allow_once'
        ? { allow: true }
        : { allow: false, reason: 'Tool authorization was denied by the user.' },
    );
  }

  public cancelAll(reason: string): void {
    for (const requestId of [...this.pending.keys()]) {
      this.finish(requestId, { allow: false, reason });
    }
  }

  private finish(requestId: string, decision: { allow: boolean; reason?: string }): boolean {
    const pending = this.pending.get(requestId);
    if (!pending) return false;
    this.pending.delete(requestId);
    clearTimeout(pending.timer);
    if (pending.signal && pending.abortListener) {
      pending.signal.removeEventListener('abort', pending.abortListener);
    }
    pending.resolve(decision);
    return true;
  }
}
