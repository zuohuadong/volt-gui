import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { Message } from '@dsh/core';

export interface SafeStorageAdapter {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
  backend?: string;
}

export interface PersistedRuntimeConfig {
  schemaVersion: 1;
  model: string;
  baseURL: string;
  compactReasoning: boolean;
  degenerationGuard: boolean;
  credentialRevision: string;
}

export interface PersistedWorkspaceState {
  schemaVersion: 1;
  canonicalRoot: string;
  updatedAt: string;
}

export interface PersistedTrustRecord {
  canonicalRoot: string;
  fingerprint: string;
  trustedAt: string;
}

export interface LoadedSession {
  messages: Message[];
  warning?: string;
}

const SESSION_SCHEMA_VERSION = 1;
const MAX_HISTORY_LINES = 10000;
const MAX_MESSAGE_CONTENT = 4 * 1024 * 1024;
const SAFE_STORAGE_ERROR = '系统安全存储不可用，拒绝将 API 密钥写入明文文件。';

function ensurePlainObject(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a JSON object.');
}

function validMessage(value: unknown): Message {
  ensurePlainObject(value);
  if (!['system', 'user', 'assistant', 'tool'].includes(String(value.role))) throw new Error('Invalid message role.');
  if (typeof value.content !== 'string' || value.content.length > MAX_MESSAGE_CONTENT) {
    throw new Error('Invalid message content.');
  }
  return {
    role: value.role as Message['role'],
    content: value.content,
    ...(typeof value.reasoningContent === 'string' ? { reasoningContent: value.reasoningContent } : {}),
    ...(Array.isArray(value.toolCalls) ? { toolCalls: value.toolCalls as Message['toolCalls'] } : {}),
    ...(typeof value.toolCallId === 'string' ? { toolCallId: value.toolCallId } : {}),
    ...(typeof value.name === 'string' ? { name: value.name } : {}),
  };
}

async function atomicWrite(filePath: string, data: string | Buffer, mode = 0o600): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const tempPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${randomUUID()}.tmp`);
  const handle = await fs.open(tempPath, 'w', mode);
  try {
    await handle.writeFile(data);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fs.rename(tempPath, filePath);
}

async function readJson(filePath: string): Promise<Record<string, unknown> | undefined> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const value = JSON.parse(raw);
    ensurePlainObject(value);
    return value;
  } catch (error: any) {
    if (error?.code === 'ENOENT') return undefined;
    throw error;
  }
}

function workspaceId(canonicalRoot: string): string {
  return createHash('sha256').update(canonicalRoot).digest('hex');
}

export function resolveVoltHome(appDataPath?: string): string {
  const explicit = process.env.VOLTUI_HOME?.trim();
  if (explicit) return path.resolve(explicit);
  return path.join(appDataPath || process.cwd(), 'voltui');
}

export class ElectronPersistence {
  public readonly electronRoot: string;
  public readonly configPath: string;
  public readonly credentialPath: string;
  public readonly workspaceStatePath: string;
  public readonly trustPath: string;
  public readonly sessionsRoot: string;

  constructor(
    root: string,
    private readonly safeStorage: SafeStorageAdapter,
  ) {
    this.electronRoot = path.join(root, 'electron');
    this.configPath = path.join(this.electronRoot, 'runtime-config.json');
    this.credentialPath = path.join(this.electronRoot, 'credentials', 'api-key.bin');
    this.workspaceStatePath = path.join(this.electronRoot, 'workspace-state.json');
    this.trustPath = path.join(this.electronRoot, 'workspace-trust.json');
    this.sessionsRoot = path.join(this.electronRoot, 'sessions');
  }

  public async loadRuntimeConfig(defaults: Omit<PersistedRuntimeConfig, 'credentialRevision' | 'schemaVersion'>): Promise<PersistedRuntimeConfig> {
    const stored = await readJson(this.configPath);
    if (!stored) {
      return { schemaVersion: 1, ...defaults, credentialRevision: '' };
    }
    if (stored.schemaVersion !== 1 || typeof stored.model !== 'string' || typeof stored.baseURL !== 'string') {
      throw new Error('Electron runtime configuration is invalid.');
    }
    return {
      schemaVersion: 1,
      model: stored.model,
      baseURL: stored.baseURL,
      compactReasoning: stored.compactReasoning !== false,
      degenerationGuard: stored.degenerationGuard !== false,
      credentialRevision: typeof stored.credentialRevision === 'string' ? stored.credentialRevision : '',
    };
  }

  public async loadApiKey(): Promise<string> {
    try {
      const encrypted = await fs.readFile(this.credentialPath);
      if (!this.safeStorage.isEncryptionAvailable() || this.safeStorage.backend === 'basic_text') {
        throw new Error(SAFE_STORAGE_ERROR);
      }
      return this.safeStorage.decryptString(encrypted);
    } catch (error: any) {
      if (error?.code === 'ENOENT') return '';
      if (error?.message === SAFE_STORAGE_ERROR) throw error;
      throw new Error('无法解密 API 密钥，请重新输入。');
    }
  }

  public async saveRuntimeConfig(config: Omit<PersistedRuntimeConfig, 'credentialRevision' | 'schemaVersion'>, apiKey?: string): Promise<void> {
    let credentialRevision = '';
    if (apiKey === undefined) {
      const stored = await readJson(this.configPath);
      credentialRevision = typeof stored?.credentialRevision === 'string' ? stored.credentialRevision : '';
    } else if (apiKey) {
      if (!this.safeStorage.isEncryptionAvailable() || this.safeStorage.backend === 'basic_text') {
        throw new Error(SAFE_STORAGE_ERROR);
      }
      const encrypted = this.safeStorage.encryptString(apiKey);
      credentialRevision = createHash('sha256').update(encrypted).digest('hex');
      await atomicWrite(this.credentialPath, encrypted);
    } else if (apiKey === '') {
      await fs.rm(this.credentialPath, { force: true });
    }
    await atomicWrite(this.configPath, JSON.stringify({ schemaVersion: 1, ...config, credentialRevision }, null, 2));
  }

  public async loadWorkspaceState(): Promise<PersistedWorkspaceState | undefined> {
    const stored = await readJson(this.workspaceStatePath);
    if (!stored) return undefined;
    if (stored.schemaVersion !== 1 || typeof stored.canonicalRoot !== 'string') {
      throw new Error('Electron workspace state is invalid.');
    }
    return {
      schemaVersion: 1,
      canonicalRoot: stored.canonicalRoot,
      updatedAt: typeof stored.updatedAt === 'string' ? stored.updatedAt : '',
    };
  }

  public async saveWorkspaceState(canonicalRoot: string): Promise<void> {
    await atomicWrite(
      this.workspaceStatePath,
      JSON.stringify({ schemaVersion: 1, canonicalRoot, updatedAt: new Date().toISOString() }, null, 2),
    );
  }

  public async loadTrustRecords(): Promise<PersistedTrustRecord[]> {
    const stored = await readJson(this.trustPath);
    if (!stored) return [];
    if (!Array.isArray(stored.records)) throw new Error('Electron workspace trust state is invalid.');
    return stored.records.filter((record): record is PersistedTrustRecord => (
      record && typeof record === 'object'
      && typeof (record as any).canonicalRoot === 'string'
      && typeof (record as any).fingerprint === 'string'
      && typeof (record as any).trustedAt === 'string'
    ));
  }

  public async trustWorkspace(record: PersistedTrustRecord): Promise<void> {
    const records = (await this.loadTrustRecords()).filter((existing) => existing.canonicalRoot !== record.canonicalRoot);
    records.push(record);
    await atomicWrite(this.trustPath, JSON.stringify({ schemaVersion: 1, records }, null, 2));
  }

  public async isWorkspaceTrusted(canonicalRoot: string, fingerprint: string): Promise<boolean> {
    const records = await this.loadTrustRecords();
    return records.some((record) => record.canonicalRoot === canonicalRoot && record.fingerprint === fingerprint);
  }

  public sessionPath(canonicalRoot: string): string {
    return path.join(this.sessionsRoot, workspaceId(canonicalRoot), 'active.jsonl');
  }

  public async loadSession(canonicalRoot: string): Promise<LoadedSession> {
    const filePath = this.sessionPath(canonicalRoot);
    let raw: string;
    try {
      raw = await fs.readFile(filePath, 'utf8');
    } catch (error: any) {
      if (error?.code === 'ENOENT') return { messages: [] };
      throw error;
    }
    const lines = raw.split('\n').filter(Boolean);
    if (lines.length > MAX_HISTORY_LINES) throw new Error('Session history exceeds the supported limit.');
    try {
      const messages = lines.map((line) => {
        const value = JSON.parse(line);
        ensurePlainObject(value);
        if (value.schemaVersion !== SESSION_SCHEMA_VERSION) throw new Error('Unsupported session schema.');
        return validMessage(value.message);
      });
      return { messages };
    } catch (error: any) {
      const corruptPath = `${filePath}.corrupt-${Date.now()}`;
      await fs.rename(filePath, corruptPath);
      return { messages: [], warning: `会话文件已隔离为损坏备份：${path.basename(corruptPath)}` };
    }
  }

  public async saveSession(canonicalRoot: string, messages: Message[]): Promise<void> {
    const body = messages
      .map((message) => JSON.stringify({ schemaVersion: SESSION_SCHEMA_VERSION, message: validMessage(message) }))
      .join('\n');
    await atomicWrite(this.sessionPath(canonicalRoot), body ? `${body}\n` : '');
  }

  public async clearSession(canonicalRoot: string): Promise<void> {
    await this.saveSession(canonicalRoot, []);
  }
}

export const persistenceErrors = { SAFE_STORAGE_ERROR };
