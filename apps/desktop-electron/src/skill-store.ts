import { parse } from "yaml";
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// 官方凭据存储文件名（与 @deepseek-ai/dsh-credentials-local 一致）。
const DSH_CREDENTIALS_FILENAME = ".credentials.yaml";
export const SKILL_TOKEN_REF = "ANYONG_SKILLS_TOKEN";

// 技能 id 与 CLI 的 SAFE_ID 一致：只允许小写字母、数字与连字符。
const SAFE_SKILL_ID = /^[a-z0-9][a-z0-9-]{0,63}$/u;
// ref 只接受分支/标签形式，拒绝空白、协议与路径穿越。
const SAFE_SKILL_REF = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,119}$/u;

export const DEFAULT_SKILL_REPO = "https://git.ai.xigu.team/xg/anyong-skills";
export const DEFAULT_SKILL_INDEX = `${DEFAULT_SKILL_REPO}/raw/branch/main/skills.index.json`;

export interface SkillStoreConfig {
  repo?: string;
  indexUrl?: string;
  token?: string;
}

export interface SkillStoreEntry {
  id: string;
  version: string;
  title?: string;
  description?: string;
  whenToUse?: string;
  tags?: string[];
  sha256?: string;
  installedAt?: string;
  ref?: string;
  installed: boolean;
  updateAvailable: boolean;
  /**
   * 以下字段由索引可选提供。老索引没有这些字段时保持 undefined，
   * 由前端按 id/标签推断分类，保证向后兼容（技能商店重构 P0）。
   */
  category?: string;
  updatedAt?: string;
  maintainer?: string;
  sizeBytes?: number;
  scenarios?: string[];
}

export interface SkillStoreState {
  available: boolean;
  directory?: string;
  skills: SkillStoreEntry[];
  error?: string;
  /** 远程索引不可用时，本地已安装列表仍然返回。 */
  remoteError?: string;
  tokenConfigured: boolean;
}

export interface SkillStoreCommandResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  code: number;
}

export function skillStoreScriptPath(runtimeRoot: string): string {
  return path.join(runtimeRoot, "scripts", "anyong-skill.mjs");
}

export function parseCredentialScalar(text: string, ref: string): string | undefined {
  const document: unknown = parse(text);
  if (!document || typeof document !== "object" || Array.isArray(document) || !Object.hasOwn(document, ref)) return undefined;
  const value = (document as Record<string, unknown>)[ref];
  return typeof value === "string" ? value : undefined;
}

/** 从官方 DSH 凭据存储读取技能仓库令牌；环境变量优先由调用方处理。 */
export function readSkillTokenFromCredentials(
  dshHome: string,
  ref: string = SKILL_TOKEN_REF,
): string | undefined {
  try {
    const file = path.join(dshHome, DSH_CREDENTIALS_FILENAME);
    if (!existsSync(file)) return undefined;
    const value = parseCredentialScalar(readFileSync(file, "utf8"), ref)?.trim();
    return value || undefined;
  } catch {
    return undefined;
  }
}

export function assertSkillId(id: unknown): string {
  if (typeof id !== "string" || !SAFE_SKILL_ID.test(id)) throw new Error(`技能 id 不合法：${String(id)}`);
  return id;
}

export function assertSkillRef(ref: unknown): string {
  if (typeof ref !== "string" || !SAFE_SKILL_REF.test(ref) || ref.includes("..")) {
    throw new Error(`技能版本引用不合法：${String(ref)}`);
  }
  return ref;
}

export function resolveSkillStoreConfig(
  config: SkillStoreConfig,
  env: NodeJS.ProcessEnv = process.env,
): { repo: string; indexUrl: string; token?: string } {
  const repo = (config.repo ?? env.ANYONG_SKILLS_REPO ?? DEFAULT_SKILL_REPO).trim().replace(/\/+$/u, "");
  const indexUrl = (config.indexUrl ?? env.ANYONG_SKILLS_INDEX ?? DEFAULT_SKILL_INDEX).trim();
  const token = (config.token ?? env.ANYONG_SKILLS_TOKEN ?? "").trim();
  return token ? { repo, indexUrl, token } : { repo, indexUrl };
}

export function skillStoreEnv(
  baseEnv: NodeJS.ProcessEnv,
  config: { repo: string; indexUrl: string; token?: string },
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...baseEnv,
    ANYONG_SKILLS_REPO: config.repo,
    ANYONG_SKILLS_INDEX: config.indexUrl,
  };
  for (const key of Object.keys(env)) {
    if (["NODE_OPTIONS", "NODE_PATH", "NODE_TLS_REJECT_UNAUTHORIZED", "ELECTRON_RUN_AS_NODE", "ANYONG_SKILLS_TOKEN"]
      .includes(key.toUpperCase())) delete env[key];
  }
  if (config.token) env.ANYONG_SKILLS_TOKEN = config.token;
  return env;
}

export async function runSkillStoreCommand(
  scriptPath: string,
  args: string[],
  options: { env: NodeJS.ProcessEnv; executable?: string; timeoutMs?: number },
): Promise<SkillStoreCommandResult> {
  try {
    const { stdout, stderr } = await execFileAsync(options.executable ?? process.execPath, [scriptPath, ...args], {
      env: options.env,
      timeout: options.timeoutMs ?? 120_000,
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true,
    });
    return { ok: true, stdout, stderr, code: 0 };
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; code?: number; message?: string };
    return {
      ok: false,
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? failure.message ?? "技能命令执行失败",
      code: typeof failure.code === "number" ? failure.code : 1,
    };
  }
}

interface RawInstalled {
  id?: unknown;
  version?: unknown;
  ref?: unknown;
  sha256?: unknown;
  installedAt?: unknown;
}

interface RawRemote {
  id?: unknown;
  version?: unknown;
  title?: unknown;
  description?: unknown;
  whenToUse?: unknown;
  tags?: unknown;
  sha256?: unknown;
  category?: unknown;
  updatedAt?: unknown;
  maintainer?: unknown;
  sizeBytes?: unknown;
  scenarios?: unknown;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return items.length > 0 ? items : undefined;
}

export function mergeSkillLists(
  installed: RawInstalled[] | undefined,
  remote: RawRemote[] | undefined,
): SkillStoreEntry[] {
  const entries = new Map<string, SkillStoreEntry>();
  for (const item of installed ?? []) {
    if (typeof item?.id !== "string") continue;
    entries.set(item.id, {
      id: item.id,
      version: typeof item.version === "string" ? item.version : "unknown",
      sha256: typeof item.sha256 === "string" ? item.sha256 : undefined,
      ref: typeof item.ref === "string" ? item.ref : undefined,
      installedAt: typeof item.installedAt === "string" ? item.installedAt : undefined,
      installed: true,
      updateAvailable: false,
    });
  }
  for (const item of remote ?? []) {
    if (typeof item?.id !== "string") continue;
    const current = entries.get(item.id);
    const version = typeof item.version === "string" ? item.version : "unknown";
    const merged: SkillStoreEntry = {
      id: item.id,
      version: current ? current.version : version,
      title: typeof item.title === "string" ? item.title : undefined,
      description: typeof item.description === "string" ? item.description : undefined,
      whenToUse: typeof item.whenToUse === "string" ? item.whenToUse : undefined,
      tags: Array.isArray(item.tags) ? item.tags.filter((tag): tag is string => typeof tag === "string") : undefined,
      category: optionalString(item.category),
      updatedAt: optionalString(item.updatedAt),
      maintainer: optionalString(item.maintainer),
      sizeBytes: typeof item.sizeBytes === "number" && Number.isFinite(item.sizeBytes) && item.sizeBytes >= 0
        ? item.sizeBytes
        : undefined,
      scenarios: optionalStringList(item.scenarios),
      sha256: typeof item.sha256 === "string" ? item.sha256 : current?.sha256,
      ref: current?.ref,
      installedAt: current?.installedAt,
      installed: Boolean(current),
      // 索引版本与已装版本不一致时提示可更新（哈希变化也视为更新）。
      updateAvailable: Boolean(current) && (current?.version !== version
        || (typeof item.sha256 === "string" && Boolean(current?.sha256) && current?.sha256 !== item.sha256)),
    };
    entries.set(item.id, merged);
  }
  return [...entries.values()].sort((left, right) => {
    if (left.installed !== right.installed) return left.installed ? -1 : 1;
    return left.id.localeCompare(right.id);
  });
}

export function parseSkillListJson(stdout: string): { dir?: string; installed: RawInstalled[]; remote: RawRemote[] } {
  const raw = JSON.parse(stdout) as { dir?: unknown; installed?: unknown; remote?: unknown };
  return {
    dir: typeof raw.dir === "string" ? raw.dir : undefined,
    installed: Array.isArray(raw.installed) ? raw.installed as RawInstalled[] : [],
    remote: Array.isArray(raw.remote) ? raw.remote as RawRemote[] : [],
  };
}

export function parseSkillActionJson(stdout: string): { id?: string; version?: string; sha256?: string } {
  const raw = JSON.parse(stdout) as { id?: unknown; version?: unknown; sha256?: unknown };
  return {
    id: typeof raw.id === "string" ? raw.id : undefined,
    version: typeof raw.version === "string" ? raw.version : undefined,
    sha256: typeof raw.sha256 === "string" ? raw.sha256 : undefined,
  };
}
