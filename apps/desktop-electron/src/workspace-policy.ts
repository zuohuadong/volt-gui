import { mkdirSync, realpathSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export const UNSAFE_WORKSPACE_MESSAGE = "[WORKSPACE_UNSAFE] 当前目录范围过大或与系统临时目录重叠，请选择具体项目文件夹。";
export const INVALID_WORKSPACE_MESSAGE = "[WORKSPACE_UNAVAILABLE] 工作区不存在或无法访问，请选择有效的项目文件夹。";
type WorkspaceRoots = { home: string; temp: string; platform: NodeJS.Platform };

function contains(root: string, candidate: string, paths: typeof path): boolean {
  const relative = paths.relative(root, candidate);
  return relative === "" || (!paths.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${paths.sep}`));
}

export function unsafeWorkspacePath(workspace: string, roots: WorkspaceRoots): boolean {
  const paths = roots.platform === "win32" ? path.win32 : path.posix;
  return paths.resolve(workspace) === paths.parse(paths.resolve(workspace)).root
    || contains(workspace, roots.home, paths)
    || (roots.platform === "win32" && (contains(workspace, roots.temp, paths) || contains(roots.temp, workspace, paths)));
}

export function canonicalProjectDirectory(
  candidate: string,
  roots = { home: os.homedir(), temp: os.tmpdir(), platform: process.platform },
): string {
  if (!candidate.trim() || !path.isAbsolute(candidate)) throw new Error(INVALID_WORKSPACE_MESSAGE);
  try {
    const workspace = realpathSync.native(candidate);
    if (!statSync(workspace).isDirectory()) throw new Error(INVALID_WORKSPACE_MESSAGE);
    if (unsafeWorkspacePath(workspace, {
      ...roots, home: realpathSync.native(roots.home), temp: realpathSync.native(roots.temp),
    })) throw new Error(UNSAFE_WORKSPACE_MESSAGE);
    return workspace;
  } catch (error) {
    if (error instanceof Error && error.message === UNSAFE_WORKSPACE_MESSAGE) throw error;
    throw new Error(INVALID_WORKSPACE_MESSAGE);
  }
}

export function defaultWorkspaceBase(
  documentsPath: string,
  homePath: string,
  platform: NodeJS.Platform = process.platform,
): string {
  const paths = platform === "win32" ? path.win32 : path.posix;
  const documents = paths.resolve(documentsPath);
  const home = paths.resolve(homePath);
  const root = paths.parse(documents).root;
  const looksLikeMisplacedProfile = paths.dirname(documents) === root
    && paths.basename(documents).toLowerCase() === paths.basename(home).toLowerCase();
  // Windows may report the profile directory itself when Documents is missing or redirected.
  // A workspace directly beside the drive root is not a safe default, so anchor it under home.
  if (documents === root || documents === home || looksLikeMisplacedProfile) {
    return paths.join(home, "Documents");
  }
  return documents;
}

export function createDefaultWorkspace(documentsPath: string, homePath = documentsPath): string {
  const workspace = path.join(defaultWorkspaceBase(documentsPath, homePath), "Anyong Workspace");
  mkdirSync(workspace, { recursive: true });
  return canonicalProjectDirectory(workspace);
}

export function workspaceSafetyError(candidate: string): string {
  try { canonicalProjectDirectory(candidate); return ""; }
  catch (error) { return error instanceof Error ? error.message : INVALID_WORKSPACE_MESSAGE; }
}
