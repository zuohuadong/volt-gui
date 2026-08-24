import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { Message, ToolCall } from '@dsh/core';

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

export interface PersistenceHooks {
  beforeRuntimeConfigCommit?: () => Promise<void>;
}

const SESSION_SCHEMA_VERSION = 1;
const MAX_HISTORY_LINES = 10000;
const MAX_MESSAGE_CONTENT = 4 * 1024 * 1024;
const MAX_REASONING_CONTENT = 4 * 1024 * 1024;
const MAX_TOOL_CALLS = 128;
const MAX_TOOL_CALL_ID = 512;
const MAX_TOOL_NAME = 512;
const MAX_TOOL_ARGUMENTS = 2 * 1024 * 1024;
const SAFE_STORAGE_ERROR = '系统安全存储不可用，拒绝将 API 密钥写入明文文件。';

function ensurePlainObject(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a JSON object.');
}

function isNodeError(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error && error.code === code;
}

function isPersistedTrustRecord(value: unknown): value is PersistedTrustRecord {
  return Boolean(
    value
    && typeof value === 'object'
    && 'canonicalRoot' in value
    && typeof value.canonicalRoot === 'string'
    && 'fingerprint' in value
    && typeof value.fingerprint === 'string'
    && 'trustedAt' in value
    && typeof value.trustedAt === 'string',
  );
}

function validMessage(value: unknown): Message {
  ensurePlainObject(value);
  if (!['system', 'user', 'assistant', 'tool'].includes(String(value.role))) throw new Error('Invalid message role.');
  if (typeof value.content !== 'string' || value.content.length > MAX_MESSAGE_CONTENT) {
    throw new Error('Invalid message content.');
  }
  if (value.toolCalls !== undefined && !Array.isArray(value.toolCalls)) throw new Error('Invalid tool calls.');
  const toolCalls = Array.isArray(value.toolCalls)
    ? value.toolCalls.map(validToolCall)
    : undefined;
  if (toolCalls && toolCalls.length > MAX_TOOL_CALLS) throw new Error('Too many tool calls in a message.');
  if (typeof value.reasoningContent === 'string' && value.reasoningContent.length > MAX_REASONING_CONTENT) {
    throw new Error('Invalid reasoning content.');
  }
  return {
    role: value.role as Message['role'],
    content: value.content,
    ...(typeof value.reasoningContent === 'string' ? { reasoningContent: value.reasoningContent } : {}),
    ...(toolCalls ? { toolCalls } : {}),
    ...(typeof value.toolCallId === 'string' ? { toolCallId: value.toolCallId } : {}),
    ...(typeof value.name === 'string' ? { name: value.name } : {}),
  };
}

function validToolCall(value: unknown): ToolCall {
  ensurePlainObject(value);
  ensurePlainObject(value.function);
  if (typeof value.id !== 'string' || !value.id || value.id.length > MAX_TOOL_CALL_ID) {
    throw new Error('Invalid tool call id.');
  }
  if (value.type !== 'function') throw new Error('Invalid tool call type.');
  if (typeof value.function.name !== 'string' || !value.function.name || value.function.name.length > MAX_TOOL_NAME) {
    throw new Error('Invalid tool call name.');
  }
  if (typeof value.function.arguments !== 'string' || value.function.arguments.length > MAX_TOOL_ARGUMENTS) {
    throw new Error('Invalid tool call arguments.');
  }
  return {
    id: value.id,
    type: 'function',
    function: { name: value.function.name, arguments: value.function.arguments },
  };
}

async function atomicWrite(filePath: string, data: string | Buffer, mode = 0o600): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const tempPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${randomUUID()}.tmp`);
  let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
  let renamed = false;
  try {
    handle = await fs.open(tempPath, 'w', mode);
    await handle.writeFile(data);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await fs.rename(tempPath, filePath);
    renamed = true;
  } finally {
    await handle?.close().catch(() => undefined);
    if (!renamed) await fs.rm(tempPath, { force: true }).catch(() => undefined);
  }
}

async function readJson(filePath: string): Promise<Record<string, unknown> | undefined> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const value = JSON.parse(raw);
    ensurePlainObject(value);
    return value;
  } catch (error: unknown) {
    if (isNodeError(error, 'ENOENT')) return undefined;
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
  public readonly credentialsRoot: string;
  public readonly workspaceStatePath: string;
  public readonly trustPath: string;
  public readonly sessionsRoot: string;

  constructor(
    root: string,
    private readonly safeStorage: SafeStorageAdapter,
    private readonly hooks: PersistenceHooks = {},
  ) {
    this.electronRoot = path.join(root, 'electron');
    this.configPath = path.join(this.electronRoot, 'runtime-config.json');
    this.credentialsRoot = path.join(this.electronRoot, 'credentials');
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
    const credentialRevision = typeof stored.credentialRevision === 'string' ? stored.credentialRevision : '';
    if (credentialRevision && !/^[a-f0-9]{64}$/.test(credentialRevision)) {
      throw new Error('Electron runtime credential revision is invalid.');
    }
    return {
      schemaVersion: 1,
      model: stored.model,
      baseURL: stored.baseURL,
      compactReasoning: stored.compactReasoning !== false,
      degenerationGuard: stored.degenerationGuard !== false,
      credentialRevision,
    };
  }

  public credentialPathForRevision(revision: string): string {
    if (!/^[a-f0-9]{64}$/.test(revision)) throw new Error('Electron runtime credential revision is invalid.');
    return path.join(this.credentialsRoot, `${revision}.bin`);
  }

  public async loadApiKey(credentialRevision?: string): Promise<string> {
    try {
      const revision = credentialRevision ?? (await readJson(this.configPath))?.credentialRevision;
      if (typeof revision !== 'string' || revision === '') return '';
      if (!this.safeStorage.isEncryptionAvailable() || this.safeStorage.backend === 'basic_text') {
        throw new Error(SAFE_STORAGE_ERROR);
      }
      const credentialPath = this.credentialPathForRevision(revision);
      let encrypted: Buffer;
      try {
        encrypted = await fs.readFile(credentialPath);
      } catch (error: unknown) {
        if (!isNodeError(error, 'ENOENT')) throw error;
        const legacyCredentialPath = path.join(this.credentialsRoot, 'api-key.bin');
        encrypted = await fs.readFile(legacyCredentialPath);
        if (createHash('sha256').update(encrypted).digest('hex') !== revision) {
          throw new Error('Electron runtime credential revision does not match the encrypted credential.');
        }
        await atomicWrite(credentialPath, encrypted);
        await fs.rm(legacyCredentialPath, { force: true }).catch(() => undefined);
      }
      if (createHash('sha256').update(encrypted).digest('hex') !== revision) {
        throw new Error('Electron runtime credential revision does not match the encrypted credential.');
      }
      return this.safeStorage.decryptString(encrypted);
    } catch (error: unknown) {
      if (isNodeError(error, 'ENOENT')) {
        throw new Error('无法读取已保存的 API 密钥，请重新输入。');
      }
      if (error instanceof Error && error.message === SAFE_STORAGE_ERROR) throw error;
      throw new Error('无法解密 API 密钥，请重新输入。');
    }
  }

  public async saveRuntimeConfig(config: Omit<PersistedRuntimeConfig, 'credentialRevision' | 'schemaVersion'>, apiKey?: string): Promise<void> {
    const stored = await readJson(this.configPath);
    const previousRevision = typeof stored?.credentialRevision === 'string' ? stored.credentialRevision : '';
    let credentialRevision = previousRevision;
    let stagedCredentialPath: string | undefined;
    let stagedCredentialCreated = false;
    if (apiKey === undefined) {
      if (credentialRevision && !/^[a-f0-9]{64}$/.test(credentialRevision)) {
        throw new Error('Electron runtime credential revision is invalid.');
      }
    } else if (apiKey) {
      if (!this.safeStorage.isEncryptionAvailable() || this.safeStorage.backend === 'basic_text') {
        throw new Error(SAFE_STORAGE_ERROR);
      }
      const encrypted = this.safeStorage.encryptString(apiKey);
      credentialRevision = createHash('sha256').update(encrypted).digest('hex');
      stagedCredentialPath = this.credentialPathForRevision(credentialRevision);
      await atomicWrite(stagedCredentialPath, encrypted);
      stagedCredentialCreated = credentialRevision !== previousRevision;
    } else if (apiKey === '') {
      credentialRevision = '';
    }
    try {
      await this.hooks.beforeRuntimeConfigCommit?.();
      await atomicWrite(this.configPath, JSON.stringify({ schemaVersion: 1, ...config, credentialRevision }, null, 2));
    } catch (error) {
      if (stagedCredentialCreated && stagedCredentialPath) await fs.rm(stagedCredentialPath, { force: true }).catch(() => undefined);
      throw error;
    }
    if (previousRevision && previousRevision !== credentialRevision) {
      await fs.rm(this.credentialPathForRevision(previousRevision), { force: true }).catch(() => undefined);
      await fs.rm(path.join(this.credentialsRoot, 'api-key.bin'), { force: true }).catch(() => undefined);
    }
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
    return stored.records.filter(isPersistedTrustRecord);
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
    } catch (error: unknown) {
      if (isNodeError(error, 'ENOENT')) return { messages: [] };
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
    } catch {
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
