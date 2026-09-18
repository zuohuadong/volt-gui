#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { smokePackagedDshRuntime } from "./smoke-packaged-dsh-runtime.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function realpathNearestExisting(value) {
  let current = path.resolve(value);
  for (;;) {
    try {
      lstatSync(current);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      const parent = path.dirname(current);
      if (parent === current) throw error;
      current = parent;
      continue;
    }
    return realpathSync(current);
  }
}

export function assertTempStagedResourcesDestination(dest, tmpRoot = os.tmpdir()) {
  const resolved = path.resolve(dest);
  const relative = path.relative(path.resolve(tmpRoot), resolved);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Refusing to assemble staged resources outside the temp directory: ${resolved}`);
  }
  const realParent = realpathNearestExisting(path.dirname(resolved));
  const realRelative = path.relative(realpathSync(tmpRoot), realParent);
  if (realRelative === ".." || realRelative.startsWith(`..${path.sep}`) || path.isAbsolute(realRelative)) {
    throw new Error(`Refusing to assemble staged resources through a link outside the temp directory: ${resolved}`);
  }
  return resolved;
}

export function assembleStagedPackagedResources(
  dest = path.join(os.tmpdir(), `voltui-staged-resources-${randomUUID()}`),
  sourceRoot = root,
) {
  const target = assertTempStagedResourcesDestination(dest);
  const sourceDesktop = path.join(sourceRoot, "apps", "desktop-electron");
  const staged = {
    nodeRuntime: path.join(sourceDesktop, ".node-runtime"),
    dshModules: path.join(sourceDesktop, ".dsh-runtime", "node_modules"),
    dshScripts: path.join(sourceDesktop, ".dsh-runtime", "scripts"),
    browserSkill: path.join(sourceDesktop, ".browser-skill-runtime"),
    profile: path.join(sourceRoot, "profiles", "anyong.yml"),
  };
  // Only clean up directories created exclusively by this invocation.
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  assertTempStagedResourcesDestination(target);
  mkdirSync(target, { mode: 0o700 });
  try {
    for (const [name, file] of Object.entries(staged)) {
      if (!existsSync(file)) {
        throw new Error(`Staged ${name} is missing at ${file}. Run pnpm --dir apps/desktop-electron run stage:runtime first.`);
      }
    }
    mkdirSync(path.join(target, "dsh-runtime"));
    mkdirSync(path.join(target, "profiles"));
    const linkType = process.platform === "win32" ? "junction" : "dir";
    symlinkSync(staged.nodeRuntime, path.join(target, "node-runtime"), linkType);
    symlinkSync(staged.dshModules, path.join(target, "dsh-runtime", "node_modules"), linkType);
    symlinkSync(staged.dshScripts, path.join(target, "dsh-runtime", "scripts"), linkType);
    symlinkSync(staged.browserSkill, path.join(target, "browser-skill-runtime"), linkType);
    writeFileSync(path.join(target, "profiles", "anyong.yml"), readFileSync(staged.profile));
    return target;
  } catch (error) {
    rmSync(target, { recursive: true, force: true });
    throw error;
  }
}

if (import.meta.url === pathToFileURL(path.resolve(process.argv[1] || "")).href) {
  const resources = assembleStagedPackagedResources(process.argv[2]);
  try {
    await smokePackagedDshRuntime(resources);
  } finally {
    rmSync(resources, { recursive: true, force: true });
  }
}
