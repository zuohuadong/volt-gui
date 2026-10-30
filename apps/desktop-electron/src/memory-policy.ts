import { statSync } from "node:fs";
import path from "node:path";

export type MemoryStatus = "active" | "disabled" | "requiresGit";

/** Memorix walks parent directories, so mirror its .git detection here. */
export function hasGitWorkspace(workspace: string): boolean {
  if (!workspace.trim()) return false;
  let directory = path.resolve(workspace);
  const root = path.parse(directory).root;
  for (;;) {
    try {
      const marker = statSync(path.join(directory, ".git"));
      if (marker.isDirectory() || marker.isFile()) return true;
    } catch {
      // Keep walking: the marker may live in a parent project directory.
    }
    if (directory === root) return false;
    const parent = path.dirname(directory);
    if (parent === directory) return false;
    directory = parent;
  }
}

export function resolveMemoryStatus(workspace: string, disabledByEnvironment: boolean): MemoryStatus {
  if (disabledByEnvironment) return "disabled";
  return hasGitWorkspace(workspace) ? "active" : "requiresGit";
}
