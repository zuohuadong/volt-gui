import { lstat, readdir, realpath, rm } from "node:fs/promises";
import * as path from "node:path";

const SESSION_LOG_PATTERN = /^session(?:\.[vV]\d+)?\.jsonl(?:\.zstd)?$/u;

/**
 * DSH 官方 JSONL 存储把会话 ID 转义为单个安全路径段。这里保持同一转义，
 * 仅用于定位归档会话目录，不参与任何持久化写入。
 */
export function encodeSessionSegment(raw: string): string {
  if (raw.length === 0) throw new Error("会话 ID 不能为空");
  if (raw === ".") return "~002E";
  if (raw === "..") return "~002E~002E";
  let out = "";
  for (let index = 0; index < raw.length; index += 1) {
    const code = raw.charCodeAt(index);
    const char = String.fromCharCode(code);
    if (char !== "~" && /^[A-Za-z0-9._-]$/u.test(char)) out += char;
    else out += `~${code.toString(16).toUpperCase().padStart(4, "0")}`;
  }
  return out;
}

async function isDirectoryWithoutSymlink(candidate: string): Promise<boolean> {
  try {
    const stats = await lstat(candidate);
    return stats.isDirectory() && !stats.isSymbolicLink();
  } catch {
    return false;
  }
}

/** 在 DSH 会话根目录中定位某个会话的唯一目录。 */
export async function findSessionDirectories(root: string, sessionId: string): Promise<string[]> {
  if (!root.trim()) return [];
  const segment = encodeSessionSegment(sessionId);
  let projectEntries;
  try {
    projectEntries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const found: string[] = [];
  for (const entry of projectEntries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const candidate = path.join(root, entry.name, segment);
    if (await isDirectoryWithoutSymlink(candidate)) found.push(candidate);
  }
  return found;
}

/**
 * 删除一个已归档会话的磁盘日志目录。调用方必须先通过 DSH 的归档集合确认
 * 该会话已归档且没有运行中的工作；这里只做路径边界与目录形态校验。
 */
export async function removeArchivedSessionStorage(root: string, sessionId: string): Promise<boolean> {
  if (sessionId.length > 512) throw new Error("会话 ID 过长");
  const candidates = await findSessionDirectories(root, sessionId);
  if (candidates.length === 0) return false;
  const rootReal = await realpath(root);
  const segment = encodeSessionSegment(sessionId);
  let removed = false;
  for (const candidate of candidates) {
    const candidateReal = await realpath(candidate);
    if (path.basename(candidateReal) !== segment) throw new Error("会话目录名称与 ID 不匹配");
    if (!candidateReal.startsWith(`${rootReal}${path.sep}`)) throw new Error("会话目录越出存储根目录");
    if (path.dirname(candidateReal) === rootReal) throw new Error("拒绝删除会话根目录");
    const files = await readdir(candidateReal);
    if (!files.some((name) => SESSION_LOG_PATTERN.test(name))) throw new Error("目标目录不包含会话日志");
    await rm(candidateReal, { recursive: true, force: false });
    removed = true;
  }
  return removed;
}