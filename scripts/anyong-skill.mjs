#!/usr/bin/env node

// `anyong skill` 管理内网技能包（L1：只有文档与模板）。
//
// 安装目标就是官方 `@deepseek-ai/dsh-skill-filesystem` 会扫描的用户技能根
// `$DSH_HOME/skills`，因此不需要新增 profile 行；装好即可被会话发现（带 watch）。
//
// 包来自内网 Gitea 仓库归档（tar.gz），索引 skills.index.json 记录版本与目录哈希，
// 客户端解包后本地重算哈希校验，不信任包内自述。

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { lstat, mkdir, mkdtemp, open, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { homedir } from "node:os";
import path from "node:path";
import { assertNetworkUrlAllowed, installNetworkPolicy } from "./network-policy.mjs";

const LOCK_FILE = ".anyong-skills.json";
const BACKUP_DIR = ".anyong-skills-backup";
const MAX_ARCHIVE_BYTES = 32 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 128 * 1024 * 1024;
const MAX_FILES = 2000;
const SAFE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/u;

export function resolveSkillsDir(env = process.env) {
  const explicit = env.ANYONG_SKILLS_DIR?.trim();
  if (explicit) return path.resolve(explicit);
  const dshHome = env.DSH_HOME?.trim() || path.join(homedir(), ".dsh");
  return path.join(path.resolve(dshHome), "skills");
}

export function parseIndex(document) {
  if (!document || typeof document !== "object") throw new Error("技能索引不是 JSON 对象");
  if (document.schemaVersion !== 1) throw new Error(`不支持的技能索引版本：${document.schemaVersion}`);
  if (!Array.isArray(document.skills)) throw new Error("技能索引缺少 skills 数组");
  const skills = new Map();
  for (const entry of document.skills) {
    if (!entry || typeof entry.id !== "string" || !SAFE_ID.test(entry.id)) throw new Error(`技能 id 不合法：${entry?.id}`);
    if (skills.has(entry.id)) throw new Error(`技能 id 重复：${entry.id}`);
    skills.set(entry.id, entry);
  }
  return skills;
}

// 与 anyong-skills/scripts/lib/dir-hash.mjs 保持同一实现：
// 相对路径排序，逐条拼接 "<path>\0<sha256(content)>\n"，再整体取 sha256。
export async function hashDirectory(root) {
  const files = await listFiles(root);
  const hash = createHash("sha256");
  for (const relative of files) {
    const digest = createHash("sha256").update(await readFile(path.join(root, relative))).digest("hex");
    hash.update(`${relative}\0${digest}\n`);
  }
  return { sha256: hash.digest("hex"), files };
}

async function listFiles(root, prefix = "") {
  const entries = await readdir(path.join(root, prefix), { withFileTypes: true });
  const found = [];
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      found.push(...(await listFiles(root, relative)));
      continue;
    }
    if (!entry.isFile()) throw new Error(`技能包不允许符号链接或其他特殊文件：${relative}`);
    found.push(relative);
  }
  return found.sort();
}

// 最小 ustar 读取器：只接受普通文件，拒绝符号链接/硬链接与越界路径。
export function readTarGz(buffer) {
  if (buffer.length > MAX_ARCHIVE_BYTES) throw new Error("技能归档超过压缩大小限制");
  const tar = gunzipSync(buffer, { maxOutputLength: MAX_EXPANDED_BYTES });
  const entries = [];
  let offset = 0;
  let sawHeader = false;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) {
      if (sawHeader) break;
      offset += 512;
      continue;
    }
    sawHeader = true;
    const checksum = readOctal(header, 148, 8);
    const actualChecksum = header.reduce((sum, byte, index) => sum + (index >= 148 && index < 156 ? 32 : byte), 0);
    if (checksum !== actualChecksum) throw new Error("归档头校验失败");
    const name = readString(header, 0, 100);
    const prefix = readString(header, 345, 155);
    const size = readOctal(header, 124, 12);
    const type = String.fromCharCode(header[156] || 48);
    const fullName = prefix ? `${prefix}/${name}` : name;
    offset += 512;
    if (size > MAX_EXPANDED_BYTES) throw new Error(`归档条目过大：${fullName}`);
    const data = tar.subarray(offset, offset + size);
    if (data.length !== size) throw new Error(`归档被截断：${fullName}`);
    offset += Math.ceil(size / 512) * 512;
    if (type === "5") continue; // 目录
    if (type === "0" || type === "\0" || type === "7") {
      entries.push({ name: fullName, data });
      if (entries.length > MAX_FILES) throw new Error("归档文件数量超过上限");
      continue;
    }
    if (type === "1" || type === "2") throw new Error(`归档不允许链接条目：${fullName}`);
    // 扩展元数据不作为路径使用；其他特殊条目一律拒绝。
    if (!["x", "g", "L", "K"].includes(type)) throw new Error(`归档条目类型不支持：${type}`);
  }
  return entries;
}

function readString(buffer, start, length) {
  const slice = buffer.subarray(start, start + length);
  const end = slice.indexOf(0);
  return slice.subarray(0, end === -1 ? slice.length : end).toString("utf8");
}

function readOctal(buffer, start, length) {
  const raw = readString(buffer, start, length).trim();
  if (raw === "") return 0;
  if (!/^[0-7]+$/u.test(raw)) throw new Error(`归档头字段不是八进制：${raw}`);
  return Number.parseInt(raw, 8);
}

// 从归档中取出 skills/<id>/ 下的文件，剥掉仓库前缀与技能目录前缀。
export function extractSkill(entries, id) {
  const marker = `skills/${id}/`;
  const files = [];
  for (const entry of entries) {
    const normalized = entry.name.replace(/^\.\//u, "");
    const at = normalized.indexOf(marker);
    if (at === -1) continue;
    if (/[\0\\:]/u.test(normalized)) throw new Error(`归档路径不合法：${entry.name}`);
    // macOS 打包会带 AppleDouble（._*）与 .DS_Store，Gitea 归档不会；统一丢弃。
    if (normalized.split("/").some((part) => part === ".DS_Store" || part.startsWith("._"))) continue;
    // 只接受 "<仓库归档根>/skills/<id>/..."，避免嵌套同名目录被误取。
    const archiveRoot = normalized.slice(0, at);
    if (archiveRoot.split("/").filter(Boolean).length !== 1) throw new Error(`归档路径层级不合法：${entry.name}`);
    const relative = normalized.slice(at + marker.length);
    if (!relative || relative.startsWith("/") || relative.split("/").some((part) => part === ".." || part === "." || part === "")) {
      throw new Error(`归档路径越界：${entry.name}`);
    }
    files.push({ relative, data: entry.data });
  }
  if (files.length === 0) throw new Error(`归档里没有 skills/${id}/`);
  return files;
}

// 私有 Gitea 仓库需要凭据。令牌只发给配置里的仓库/索引同源地址，
// 避免把内部 token 带给归档 URL 里出现的其他主机。
function skillAuthOrigins(repo, indexUrl) {
  const origins = new Set();
  for (const value of [repo, indexUrl]) {
    if (!value || !/^https?:\/\//u.test(value)) continue;
    try {
      origins.add(new URL(value).origin);
    } catch {
      // 配置错误留给后续请求报明确的失败信息。
    }
  }
  return origins;
}

function resolveSkillAuth({ repo, indexUrl, token }) {
  const value = (token ?? process.env.ANYONG_SKILLS_TOKEN ?? "").trim();
  if (!value) return undefined;
  return { token: value, origins: skillAuthOrigins(repo, indexUrl) };
}

function authHeaders(url, auth) {
  if (!auth?.token || !auth.origins?.size) return {};
  try {
    if (!auth.origins.has(new URL(url).origin)) return {};
  } catch {
    return {};
  }
  return { authorization: `token ${auth.token}` };
}

async function loadIndex(url, auth) {
  if (!url) return undefined;
  if (url.startsWith("file://")) {
    return parseIndex(JSON.parse((await readLimitedFile(fileURLToPath(url), 1024 * 1024)).toString("utf8")));
  }
  return parseIndex(JSON.parse((await fetchBytes(url, auth, 1024 * 1024)).toString("utf8")));
}

function defaultArchiveUrl(repo, ref) {
  const trimmed = repo.replace(/\/+$/u, "");
  return `${trimmed}/archive/${encodeURIComponent(ref)}.tar.gz`;
}

async function resolveArchive({ archive, repo, ref, auth }) {
  if (archive) {
    if (/^https?:\/\//u.test(archive)) return download(archive, auth);
    if (archive.startsWith("file://")) return readLimitedFile(fileURLToPath(archive), MAX_ARCHIVE_BYTES);
    return readLimitedFile(path.resolve(archive), MAX_ARCHIVE_BYTES);
  }
  if (!repo) throw new Error("未配置技能仓库：请设置 ANYONG_SKILLS_REPO 或使用 --repo/--archive");
  return download(defaultArchiveUrl(repo, ref), auth);
}

async function download(url, auth) {
  return fetchBytes(url, auth, MAX_ARCHIVE_BYTES);
}

async function readLimitedFile(file, limit) {
  const handle = await open(file, "r");
  try {
    if (!(await handle.stat()).isFile()) throw new Error("技能来源必须是普通文件");
    const buffer = Buffer.alloc(limit + 1);
    let bytes = 0;
    while (bytes < buffer.length) {
      const result = await handle.read(buffer, bytes, buffer.length - bytes, null);
      if (result.bytesRead === 0) break;
      bytes += result.bytesRead;
    }
    if (bytes > limit) throw new Error("技能文件超过大小限制");
    return buffer.subarray(0, bytes);
  } finally {
    await handle.close();
  }
}

async function fetchBytes(url, auth, limit) {
  const parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error("技能下载地址无效");
  if (authHeaders(url, auth).authorization && parsed.protocol !== "https:") throw new Error("技能令牌只能发送到 HTTPS 地址");
  await assertNetworkUrlAllowed(url);
  const response = await fetch(url, { redirect: "error", headers: authHeaders(url, auth), signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`技能下载失败：HTTP ${response.status}`);
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > limit) {
    await response.body?.cancel();
    throw new Error("技能下载超过大小限制");
  }
  const chunks = [];
  let bytes = 0;
  for await (const chunk of response.body ?? []) {
    bytes += chunk.byteLength;
    if (bytes > limit) throw new Error("技能下载超过大小限制");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readLock(dir) {
  try {
    const raw = JSON.parse(await readFile(path.join(dir, LOCK_FILE), "utf8"));
    if (raw?.schemaVersion !== 1 || !raw.skills || typeof raw.skills !== "object" || Array.isArray(raw.skills)) throw new Error("技能安装记录格式无效");
    return raw;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return { schemaVersion: 1, skills: {} };
  }
}

async function writeLock(dir, lock) {
  const temporary = path.join(dir, `${LOCK_FILE}.${process.pid}.tmp`);
  try {
    await writeFile(temporary, `${JSON.stringify(lock, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    await rename(temporary, path.join(dir, LOCK_FILE));
  } finally {
    await rm(temporary, { force: true });
  }
}

async function plainDirectory(dir) {
  await mkdir(dir, { recursive: true });
  const info = await lstat(dir);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("技能目录不允许使用符号链接");
}

async function withSkillMutation(dir, id, run) {
  await plainDirectory(dir);
  await plainDirectory(path.join(dir, BACKUP_DIR));
  const guard = path.join(dir, ".anyong-skills.lock");
  const handle = await open(guard, "wx", 0o600);
  try {
    for (const candidate of [path.join(dir, id), path.join(dir, BACKUP_DIR, id)]) {
      const info = await lstat(candidate).catch((error) => { if (error.code !== "ENOENT") throw error; });
      if (info && (!info.isDirectory() || info.isSymbolicLink())) throw new Error("技能目标必须是普通目录");
    }
    const lockInfo = await lstat(path.join(dir, LOCK_FILE)).catch((error) => { if (error.code !== "ENOENT") throw error; });
    if (lockInfo && !lockInfo.isFile()) throw new Error("技能安装记录必须是普通文件");
    return await run();
  }
  finally { await handle.close(); await rm(guard); }
}

// 同卷 rename 可逆执行，安装记录原子落盘成功后才清理上一份备份。
async function treeTransaction(run) {
  const moves = [];
  const move = async (from, to) => {
    await rename(from, to);
    moves.push([from, to]);
  };
  try {
    return await run(move);
  } catch (error) {
    for (const [from, to] of moves.reverse()) await rename(to, from);
    throw error;
  }
}

export async function listInstalled(dir) {
  if (!existsSync(dir)) return [];
  const lock = await readLock(dir);
  const entries = await readdir(dir, { withFileTypes: true });
  const installed = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    if (!existsSync(path.join(dir, entry.name, "SKILL.md"))) continue;
    const record = lock.skills[entry.name] ?? {};
    installed.push({
      id: entry.name,
      version: record.version ?? "unknown",
      ref: record.ref,
      sha256: record.sha256,
      installedAt: record.installedAt,
    });
  }
  return installed.sort((left, right) => left.id.localeCompare(right.id));
}

export async function installSkill({ id, version, ref = "main", dir, repo, archive, indexUrl, token }) {
  if (!SAFE_ID.test(id)) throw new Error(`技能 id 不合法：${id}`);
  return withSkillMutation(dir, id, async () => {
  const auth = resolveSkillAuth({ repo, indexUrl, token });
  const index = await loadIndex(indexUrl, auth);
  const entry = index?.get(id);
  if (index && !entry) throw new Error(`索引中没有技能 ${id}`);
  if (version && entry && entry.version !== version) {
    throw new Error(`技能 ${id} 的当前索引版本是 ${entry.version}，不是 ${version}`);
  }

  const target = path.join(dir, id);
  const stagingRoot = await mkdtemp(path.join(dir, `.anyong-skill-${id}-`));
  const staging = path.join(stagingRoot, id);
  try {
    const buffer = await resolveArchive({ archive, repo, ref, auth });
    const files = extractSkill(readTarGz(buffer), id);
    await mkdir(staging, { recursive: true });
    for (const file of files) {
      const destination = path.join(staging, file.relative);
      const relative = path.relative(staging, destination);
      if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`安装路径越界：${file.relative}`);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, file.data);
    }
    if (!existsSync(path.join(staging, "SKILL.md"))) throw new Error(`技能 ${id} 缺少 SKILL.md`);

    const { sha256, files: installedFiles } = await hashDirectory(staging);
    if (entry?.sha256 && entry.sha256 !== sha256) {
      throw new Error(`技能 ${id} 哈希不匹配：索引 ${entry.sha256}，实际 ${sha256}`);
    }

    const lock = await readLock(dir);
    const previous = lock.skills[id] ? { ...lock.skills[id], previous: undefined } : undefined;
    const backup = path.join(dir, BACKUP_DIR, id);
    return await treeTransaction(async (move) => {
      if (existsSync(backup)) await move(backup, path.join(stagingRoot, "retired"));
      if (existsSync(target)) await move(target, backup);
      await move(staging, target);
    lock.skills[id] = {
      version: entry?.version ?? version ?? "unknown",
      ref,
      sha256,
      files: installedFiles.length,
      installedAt: new Date().toISOString(),
      previous,
    };
    await writeLock(dir, lock);
    return { id, version: lock.skills[id].version, sha256, files: installedFiles.length };
    });
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
  }
  });
}

export async function removeSkill(id, dir) {
  if (!SAFE_ID.test(id)) throw new Error(`技能 id 不合法：${id}`);
  return withSkillMutation(dir, id, async () => {
  const target = path.join(dir, id);
  if (!existsSync(target)) throw new Error(`未安装技能 ${id}`);
  const lock = await readLock(dir);
  delete lock.skills[id];
  const staging = await mkdtemp(path.join(dir, ".anyong-remove-"));
  try {
    await treeTransaction(async (move) => {
      await move(target, path.join(staging, "target"));
      const backup = path.join(dir, BACKUP_DIR, id);
      if (existsSync(backup)) await move(backup, path.join(staging, "backup"));
      await writeLock(dir, lock);
    });
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
  return { id };
  });
}

export async function rollbackSkill(id, dir) {
  if (!SAFE_ID.test(id)) throw new Error(`技能 id 不合法：${id}`);
  return withSkillMutation(dir, id, async () => {
  const target = path.join(dir, id);
  const backup = path.join(dir, BACKUP_DIR, id);
  if (!existsSync(backup)) throw new Error(`技能 ${id} 没有可回滚的上一版本`);
  const { sha256 } = await hashDirectory(backup);
  const lock = await readLock(dir);
  const previous = lock.skills[id] ?? {};
  lock.skills[id] = { ...(previous.previous ?? previous), previous: { ...previous, previous: undefined }, sha256, installedAt: new Date().toISOString(), rolledBack: true };
  const staging = await mkdtemp(path.join(dir, ".anyong-rollback-"));
  const swap = path.join(staging, "target");
  try {
    await treeTransaction(async (move) => {
      if (existsSync(target)) await move(target, swap);
      await move(backup, target);
      if (existsSync(swap)) await move(swap, backup);
      await writeLock(dir, lock);
    });
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
  return { id, sha256 };
  });
}

function parseSpec(spec) {
  const [id, version] = String(spec).split("@");
  if (!id) throw new Error("请给出技能 id");
  return { id, version: version || undefined };
}

function parseArgs(argv) {
  const options = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      options._.push(arg);
      continue;
    }
    const [key, inline] = arg.slice(2).split("=");
    if (inline !== undefined) {
      options[key] = inline;
      continue;
    }
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      options[key] = next;
      index += 1;
      continue;
    }
    options[key] = true;
  }
  return options;
}

const USAGE = `用法：
  anyong skill list [--json] [--remote]
  anyong skill add <id>[@<version>] [--ref main] [--repo URL] [--index URL] [--archive 路径或URL]
  anyong skill remove <id>
  anyong skill rollback <id>

环境变量：
  ANYONG_SKILLS_DIR    安装目录（默认 $DSH_HOME/skills）
  ANYONG_SKILLS_REPO   内网 Gitea 仓库地址，安装时取 <repo>/archive/<ref>.tar.gz
  ANYONG_SKILLS_INDEX  技能索引地址（skills.index.json）
  ANYONG_SKILLS_TOKEN  私有仓库令牌（可选；只发给仓库/索引同源地址）
`;

export async function runSkillCommand(argv, env = process.env) {
  const [command, ...rest] = argv;
  const options = parseArgs(rest);
  const dir = options.dir ? path.resolve(options.dir) : resolveSkillsDir(env);
  const repo = options.repo ?? env.ANYONG_SKILLS_REPO?.trim();
  const indexUrl = options.index ?? env.ANYONG_SKILLS_INDEX?.trim();
  const token = env.ANYONG_SKILLS_TOKEN?.trim();
  const json = Boolean(options.json);

  try {
    if (!command || command === "help" || command === "--help" || command === "-h") {
      process.stdout.write(USAGE);
      return command ? 0 : 1;
    }
    if (command === "list") {
      const installed = await listInstalled(dir);
      let remote;
      if (options.remote) {
        const index = await loadIndex(indexUrl, resolveSkillAuth({ repo, indexUrl, token }));
        remote = index ? [...index.values()] : [];
      }
      if (json) {
        process.stdout.write(`${JSON.stringify({ dir, installed, remote }, null, 2)}\n`);
        return 0;
      }
      if (installed.length === 0) process.stdout.write(`技能目录 ${dir} 下还没有安装技能\n`);
      for (const skill of installed) process.stdout.write(`${skill.id}@${skill.version}	${skill.installedAt ?? ""}\n`);
      if (remote) {
        const known = new Set(installed.map((skill) => skill.id));
        for (const entry of remote) {
          if (!known.has(entry.id)) process.stdout.write(`（可安装）${entry.id}@${entry.version}	${entry.title ?? entry.name}\n`);
        }
      }
      return 0;
    }
    if (command === "add") {
      const spec = options._[0];
      if (!spec) throw new Error("请给出技能 id，例如 anyong skill add failure-analysis");
      const { id, version } = parseSpec(spec);
      if (!indexUrl && !options.index) {
        process.stderr.write("anyong skill: 未配置 ANYONG_SKILLS_INDEX，安装时不校验目录哈希\n");
      }
      const result = await installSkill({
        id,
        version,
        ref: options.ref ?? "main",
        dir,
        repo,
        archive: options.archive,
        indexUrl,
        token,
      });
      process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `已安装 ${result.id}@${result.version} → ${path.join(dir, result.id)}\n`);
      return 0;
    }
    if (command === "remove") {
      const spec = options._[0];
      if (!spec) throw new Error("请给出技能 id");
      const result = await removeSkill(spec, dir);
      process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `已移除 ${result.id}\n`);
      return 0;
    }
    if (command === "rollback") {
      const spec = options._[0];
      if (!spec) throw new Error("请给出技能 id");
      const result = await rollbackSkill(spec, dir);
      process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `已回滚 ${result.id}（sha256 ${result.sha256.slice(0, 12)}…）\n`);
      return 0;
    }
    throw new Error(`未知子命令：${command}\n\n${USAGE}`);
  } catch (error) {
    process.stderr.write(`anyong skill: ${error.message}\n`);
    return 1;
  }
}

if (path.resolve(process.argv[1] || "") === path.resolve(fileURLToPath(import.meta.url))) {
  installNetworkPolicy();
  process.exitCode = await runSkillCommand(process.argv.slice(2));
}
