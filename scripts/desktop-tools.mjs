import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { desktopToolEnvironment, desktopToolPaths, assertDesktopTools } from "../apps/desktop-electron/src/desktop-tool-environment.ts";
import baseLock from "./desktop-tools.lock.json" with { type: "json" };
import ocrLock from "./ocr-tools.lock.json" with { type: "json" };

const lock = {
  ...baseLock,
  wheels: [...baseLock.wheels, ...ocrLock.wheels],
  pythonPackages: { ...baseLock.pythonPackages, ...Object.fromEntries(ocrLock.wheels.map(({ name, version }) => [name, version])) },
};

export { lock as desktopToolsLock };
export const desktopToolsDigest = createHash("sha256").update(JSON.stringify({ format: 3, lock })).digest("hex");

export function sha256File(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

export function inventoryDesktopTools(root) {
  const files = [];
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      const relative = path.relative(root, file).split(path.sep).join("/");
      if (relative === "runtime.json" || entry.name === ".gitkeep") continue;
      if (entry.isDirectory() && !lstatSync(file).isSymbolicLink()) visit(file);
      else if (entry.isFile()) files.push({ path: relative, sha256: sha256File(file) });
      else throw new Error(`Unsupported tool runtime entry: ${relative}`);
    }
  }
  visit(root);
  return files.sort((left, right) => left.path.localeCompare(right.path, "en"));
}

export function verifyDesktopToolInventory(root) {
  assertDesktopTools(root);
  const manifest = JSON.parse(readFileSync(path.join(root, "runtime.json"), "utf8"));
  assert.equal(manifest.inputDigest, desktopToolsDigest, "Desktop tools were staged from a different lock");
  assert.deepEqual(manifest.pythonPackages, lock.pythonPackages, "Python distribution lock mismatch");
  const actual = inventoryDesktopTools(root);
  if (!Array.isArray(manifest.files)) throw new Error("Desktop tool runtime inventory is missing");
  if (!isDeepStrictEqual(manifest.files, actual)) {
    const expected = new Map(manifest.files.map((file) => [file.path, file.sha256]));
    const present = new Map(actual.map((file) => [file.path, file.sha256]));
    const changed = [...new Set([...expected.keys(), ...present.keys()])]
      .filter((file) => expected.get(file) !== present.get(file));
    throw new Error(`Desktop tool runtime integrity mismatch: ${changed.slice(0, 5).join(", ")}`);
  }
  return manifest;
}

function runTool(executable, args, options) {
  return execFileSync(executable, args, {
    ...options, encoding: "utf8", windowsHide: true, timeout: 120_000, maxBuffer: 4 * 1024 * 1024,
  }).trim();
}

function cleanToolEnvironment(root, nodeExecutable, cleanHome) {
  const systemRoot = process.env.SystemRoot || "C:\\Windows";
  return desktopToolEnvironment(root, nodeExecutable, {
    SystemRoot: systemRoot,
    WINDIR: systemRoot,
    COMSPEC: path.join(systemRoot, "System32", "cmd.exe"),
    PATH: `${systemRoot}\\System32;${systemRoot}`,
    PATHEXT: ".COM;.EXE;.BAT;.CMD",
    HOME: cleanHome,
    USERPROFILE: cleanHome,
    APPDATA: path.join(cleanHome, "AppData", "Roaming"),
    LOCALAPPDATA: path.join(cleanHome, "AppData", "Local"),
    TEMP: cleanHome,
    TMP: cleanHome,
    COREPACK_ENABLE_NETWORK: "0",
    NPM_CONFIG_OFFLINE: "true",
    HTTP_PROXY: "http://127.0.0.1:9",
    HTTPS_PROXY: "http://127.0.0.1:9",
  });
}

export function smokeOfficialDshTools(resources, cleanHome) {
  const root = path.join(resources, "tool-runtime");
  const node = path.join(resources, "node-runtime", "node.exe");
  runTool(node, [
    path.join(import.meta.dirname, "smoke-dsh-tool-shell.mjs"),
    path.join(resources, "dsh-runtime", "node_modules"),
    path.join(import.meta.dirname, "smoke-desktop-python.py"),
    JSON.stringify(lock.pythonPackages),
  ], { cwd: cleanHome, env: cleanToolEnvironment(root, node, cleanHome) });
}

export function smokeDesktopTools(root, nodeExecutable, cleanHome) {
  verifyDesktopToolInventory(root);
  const tools = desktopToolPaths(root);
  const environment = cleanToolEnvironment(root, nodeExecutable, cleanHome);
  const options = { cwd: cleanHome, env: environment };
  assert.equal(runTool(nodeExecutable, ["--version"], options), `v${lock.nodeVersion}`);
  assert.equal(runTool(tools.python, ["-I", "-B", "--version"], options), `Python ${lock.python.version}`);
  assert.equal(runTool(tools.bun, ["--version"], options), lock.bun.version);
  assert.equal(runTool(tools.coreutils, ["--version"], options), `coreutils ${lock.coreutils.version} (multi-call binary)`);
  assert.equal(runTool(tools.powershell, ["-NoLogo", "-NoProfile", "-Command", "$PSVersionTable.PSVersion.ToString()"], options), lock.powershell.version);
  runTool(tools.python, ["-I", "-B", path.join(import.meta.dirname, "smoke-desktop-python.py"), JSON.stringify(lock.pythonPackages)], options);
  runTool(tools.python, ["-I", "-B", "-m", "pip", "check"], options);
  const discovered = JSON.parse(runTool(tools.powershell, [
    "-NoLogo", "-NoProfile", "-NonInteractive", "-Command",
    "@('node','python','bun','coreutils') | ForEach-Object { (Get-Command $_ -CommandType Application -ErrorAction Stop).Source } | ConvertTo-Json -Compress",
  ], options));
  assert.deepEqual(discovered.map((file) => path.normalize(file).toLowerCase()),
    [nodeExecutable, tools.python, tools.bun, tools.coreutils].map((file) => path.normalize(file).toLowerCase()));
  assert.equal(runTool(tools.powershell, [
    "-NoLogo", "-NoProfile", "-NonInteractive", "-Command",
    "coreutils.exe printf 'z\\na\\n' | coreutils.exe sort; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }",
  ], options).replaceAll("\r", ""), "a\nz");
  assert.throws(() => runTool(tools.powershell, [
    "-NoLogo", "-NoProfile", "-NonInteractive", "-Command",
    "coreutils.exe printf 'hello' | coreutils.exe grep missing; exit $LASTEXITCODE",
  ], options), (error) => error.status === 1, "coreutils must preserve a nonzero exit code");
  const unicodeFile = path.join(cleanHome, "\u4e2d\u6587 input.txt");
  writeFileSync(unicodeFile, "utf8-\u4e2d\u6587\n", "utf8");
  assert.equal(runTool(tools.coreutils, ["cat", unicodeFile], options), "utf8-\u4e2d\u6587");
  verifyDesktopToolInventory(root);
}
