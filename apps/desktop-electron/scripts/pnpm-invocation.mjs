import path from "node:path";

export function resolvePnpmInvocation(pnpmEntrypoint, nodeExecutable = process.execPath) {
  if (!pnpmEntrypoint) throw new Error("stage:runtime must be launched through pnpm");
  const extension = path.extname(pnpmEntrypoint).toLowerCase();
  if ([".js", ".cjs", ".mjs"].includes(extension)) {
    return { command: nodeExecutable, args: [pnpmEntrypoint] };
  }
  return { command: pnpmEntrypoint, args: [] };
}
