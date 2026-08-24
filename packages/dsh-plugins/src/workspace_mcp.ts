import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { McpServerConfig } from './types.js';
import { createWorkspacePathPolicy } from './workspace_path.js';

const MCP_CONFIG_PATHS = ['.dsh/mcp.json', '.mcp.json', 'dsh.plugins.json'] as const;
const MAX_CONFIG_BYTES = 256 * 1024;
const MAX_SERVERS = 32;
const MAX_ARGS = 64;
const MAX_ENV = 64;
const MAX_STRING = 4096;

const PLATFORM_ENV = new Set([
  'PATH',
  'Path',
  'HOME',
  'USERPROFILE',
  'SystemRoot',
  'WINDIR',
  'COMSPEC',
  'PATHEXT',
  'TEMP',
  'TMP',
  'TMPDIR',
  'LANG',
  'LC_ALL',
  'SHELL',
]);

const LOADER_ENV = /^(NODE_OPTIONS|NODE_PATH|LD_.*|DYLD_.*|BASH_ENV|ENV|SHELLOPTS|PROMPT_COMMAND|ELECTRON_RUN_AS_NODE)$/i;
const SECRET_ENV = /(TOKEN|SECRET|PASSWORD|API_KEY|AUTH|COOKIE|SESSION|PRIVATE|CREDENTIAL|KEY)/i;
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

export interface DiscoveredMcpConfig {
  root: string;
  fingerprint: string;
  files: string[];
  servers: McpServerConfig[];
}

function plainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function boundedString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > MAX_STRING) {
    throw new Error(`Invalid MCP ${label}.`);
  }
  return value;
}

export function validateMcpConfig(value: unknown): Array<Omit<McpServerConfig, "workspaceRoot">> {
  if (!plainObject(value)) throw new Error('MCP config must be a JSON object.');
  const rawServers = value.mcpServers;
  if (rawServers === undefined) return [];
  if (!plainObject(rawServers)) throw new Error('MCP mcpServers must be an object.');

  const entries = Object.entries(rawServers);
  if (entries.length > MAX_SERVERS) throw new Error(`MCP config exceeds ${MAX_SERVERS} servers.`);

  return entries.map(([name, raw]) => {
    if (!name.trim() || name.length > 128 || !plainObject(raw)) throw new Error('Invalid MCP server entry.');
    const command = boundedString(raw.command, `command for ${name}`);
    const args = raw.args === undefined ? [] : raw.args;
    if (!Array.isArray(args) || args.length > MAX_ARGS || args.some((arg) => typeof arg !== 'string' || arg.length > MAX_STRING)) {
      throw new Error(`Invalid MCP args for ${name}.`);
    }
    const rawEnv = raw.env === undefined ? {} : raw.env;
    if (!plainObject(rawEnv) || Object.keys(rawEnv).length > MAX_ENV) throw new Error(`Invalid MCP env for ${name}.`);
    const env: Record<string, string> = {};
    for (const [key, envValue] of Object.entries(rawEnv)) {
      if (!ENV_NAME.test(key) || typeof envValue !== 'string' || envValue.length > MAX_STRING) {
        throw new Error(`Invalid MCP environment entry for ${name}.`);
      }
      env[key] = envValue;
    }
    return { name, command, args: [...args] as string[], env };
  });
}

export async function discoverWorkspaceMcp(root: string): Promise<DiscoveredMcpConfig> {
  const policy = await createWorkspacePathPolicy(root);
  const hash = createHash('sha256');
  hash.update(policy.root);
  const files: string[] = [];
  const servers: McpServerConfig[] = [];
  const names = new Set<string>();

  for (const relativePath of MCP_CONFIG_PATHS) {
    let configPath: string;
    try {
      configPath = await policy.resolveExisting(relativePath, 'file');
    } catch (error: any) {
      if (error?.code === 'ENOENT') continue;
      throw error;
    }

    const stat = await fs.stat(configPath);
    if (stat.size > MAX_CONFIG_BYTES) throw new Error(`MCP config exceeds ${MAX_CONFIG_BYTES} bytes: ${relativePath}`);
    const bytes = await fs.readFile(configPath);
    const parsed = validateMcpConfig(JSON.parse(bytes.toString('utf8')));
    for (const server of parsed) {
      if (names.has(server.name)) throw new Error(`Duplicate MCP server name: ${server.name}`);
      names.add(server.name);
      servers.push({ ...server, workspaceRoot: policy.root });
    }
    files.push(relativePath);
    hash.update('\0');
    hash.update(relativePath);
    hash.update('\0');
    hash.update(bytes);
  }

  return {
    root: policy.root,
    fingerprint: hash.digest('hex'),
    files,
    servers,
  };
}

export function buildMcpEnvironment(
  processEnv: NodeJS.ProcessEnv,
  declaredEnv: Record<string, string> = {},
): Record<string, string> {
  const environment: Record<string, string> = {};

  for (const key of PLATFORM_ENV) {
    const value = processEnv[key];
    if (typeof value === 'string') environment[key] = value;
  }

  for (const [key, value] of Object.entries(declaredEnv)) {
    if (!ENV_NAME.test(key) || typeof value !== 'string' || value.length > MAX_STRING) continue;
    if (PLATFORM_ENV.has(key) || LOADER_ENV.test(key) || SECRET_ENV.test(key)) continue;
    environment[key] = value;
  }

  return environment;
}
