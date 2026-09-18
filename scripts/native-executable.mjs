import { closeSync, cpSync, existsSync, mkdirSync, openSync, readdirSync, readSync, statSync } from "node:fs";
import path from "node:path";

export const IMAGE_FILE_MACHINE_AMD64 = 0x8664;
export const IMAGE_FILE_MACHINE_ARM64 = 0xaa64;

export function windowsX64PeStub() {
  const buf = Buffer.alloc(0x48);
  buf.write("MZ", 0, "ascii");
  buf.writeUInt32LE(0x40, 0x3C);
  buf.write("PE\0\0", 0x40, "latin1");
  buf.writeUInt16LE(IMAGE_FILE_MACHINE_AMD64, 0x44);
  return buf;
}

export function windowsPeStub(machine) {
  const buf = windowsX64PeStub();
  buf.writeUInt16LE(machine, 0x44);
  return buf;
}

export function readFileMagic(file, length = 2) {
  const fd = openSync(file, "r");
  try {
    const magic = Buffer.alloc(length);
    const bytesRead = readSync(fd, magic, 0, length, 0);
    return magic.subarray(0, bytesRead);
  } finally {
    closeSync(fd);
  }
}

export function readWindowsPeMachine(file) {
  const fd = openSync(file, "r");
  try {
    const dos = Buffer.alloc(0x40);
    if (readSync(fd, dos, 0, 0x40, 0) < 0x40) return null;
    if (dos[0] !== 0x4d || dos[1] !== 0x5a) return null;
    const eLfanew = dos.readUInt32LE(0x3C);
    if (eLfanew < 0x40 || eLfanew > 0x1000) return null;
    const pe = Buffer.alloc(6);
    if (readSync(fd, pe, 0, 6, eLfanew) < 6) return null;
    if (pe.subarray(0, 4).toString("latin1") !== "PE\0\0") return null;
    return pe.readUInt16LE(4);
  } finally {
    closeSync(fd);
  }
}

export function isWindowsX64PeExecutable(file) {
  return existsSync(file) && statSync(file).size > 0 && readWindowsPeMachine(file) === IMAGE_FILE_MACHINE_AMD64;
}

export function assertWindowsX64PeExecutable(file, label = file) {
  const machine = existsSync(file) ? readWindowsPeMachine(file) : null;
  if (machine !== IMAGE_FILE_MACHINE_AMD64) {
    const detail = machine == null ? "not a Windows PE image" : `PE machine 0x${machine.toString(16)}`;
    throw new Error(`${label} is not a Windows x64 PE executable (${detail}): ${file}`);
  }
}

export function koffiWin32X64PackageRelative() {
  return path.join("node_modules", "@koromix", "koffi-win32-x64");
}

export function nodePtyWin32X64Relative() {
  return path.join("node_modules", "node-pty", "prebuilds", "win32-x64");
}

export const NODE_PTY_WIN32_X64_FILES = Object.freeze([
  "conpty.node",
  "conpty_console_list.node",
  path.join("conpty", "conpty.dll"),
  path.join("conpty", "OpenConsole.exe"),
]);

function pnpmPackageDirs(root, folderPrefix, innerRelative) {
  const pnpmDir = path.join(root, "node_modules", ".pnpm");
  if (!existsSync(pnpmDir)) return [];
  const dirs = [];
  for (const entry of readdirSync(pnpmDir, { withFileTypes: true })) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    if (!entry.name.startsWith(folderPrefix)) continue;
    dirs.push(path.join(pnpmDir, entry.name, "node_modules", innerRelative));
  }
  return dirs;
}

function firstMatchingDirectory(candidates, isValid) {
  return candidates.find((candidate) => isValid(candidate));
}

function hasWindowsX64PeFiles(directory, relativeFiles) {
  return relativeFiles.every((relativeFile) => isWindowsX64PeExecutable(path.join(directory, relativeFile)));
}

export function windowsRuntimeNativeBinaries(runtimeRoot) {
  const pty = path.join(runtimeRoot, nodePtyWin32X64Relative());
  return [
    [path.join(pty, "conpty.node"), "node-pty"],
    [path.join(pty, "conpty_console_list.node"), "node-pty console list"],
    [path.join(pty, "conpty", "conpty.dll"), "ConPTY"],
    [path.join(pty, "conpty", "OpenConsole.exe"), "OpenConsole"],
    [path.join(runtimeRoot, koffiWin32X64PackageRelative(), "win32_x64", "koffi.node"), "Koffi"],
  ];
}

export function ensureWindowsKoffiPackage(targetRoot, searchRoots = [], label = "Windows x64 Koffi") {
  const destPkg = path.join(targetRoot, koffiWin32X64PackageRelative());
  const destNode = path.join(destPkg, "win32_x64", "koffi.node");
  const candidates = [
    destPkg,
    ...searchRoots.map((root) => path.join(root, koffiWin32X64PackageRelative())),
    ...searchRoots.flatMap((root) => pnpmPackageDirs(root, "@koromix+koffi-win32-x64@", path.join("@koromix", "koffi-win32-x64"))),
  ];
  const sourcePkg = firstMatchingDirectory(candidates, (pkg) => isWindowsX64PeExecutable(path.join(pkg, "win32_x64", "koffi.node")));
  if (!sourcePkg) throw new Error(`${label} is missing or not a Windows x64 PE image`);
  if (path.resolve(sourcePkg) !== path.resolve(destPkg)) {
    mkdirSync(path.dirname(destPkg), { recursive: true });
    cpSync(sourcePkg, destPkg, { recursive: true, force: true });
  }
  assertWindowsX64PeExecutable(destNode, label);
  return destNode;
}

export function ensureWindowsNodePtyPrebuild(targetRoot, searchRoots = [], label = "Windows x64 node-pty") {
  const destDir = path.join(targetRoot, nodePtyWin32X64Relative());
  const candidates = [
    destDir,
    ...searchRoots.map((root) => path.join(root, nodePtyWin32X64Relative())),
    ...searchRoots.flatMap((root) => pnpmPackageDirs(root, "node-pty@", path.join("node-pty", "prebuilds", "win32-x64"))),
  ];
  const sourceDir = firstMatchingDirectory(candidates, (directory) => hasWindowsX64PeFiles(directory, NODE_PTY_WIN32_X64_FILES));
  if (!sourceDir) throw new Error(`${label} is missing or not a Windows x64 PE image`);
  if (path.resolve(sourceDir) !== path.resolve(destDir)) {
    mkdirSync(path.dirname(destDir), { recursive: true });
    cpSync(sourceDir, destDir, { recursive: true, force: true });
  }
  for (const relativeFile of NODE_PTY_WIN32_X64_FILES) {
    assertWindowsX64PeExecutable(path.join(destDir, relativeFile), `${label} ${relativeFile}`);
  }
  return destDir;
}

export const WINDOWS_DSH_NODE_MODULES_FILTER = Object.freeze([
  "**/*",
  "!**/prebuilds/darwin-*/**",
  "!**/prebuilds/linux-*/**",
  "!**/prebuilds/win32-arm64/**",
  "!**/prebuilds/win32-ia32/**",
  "!**/*.pdb",
  "!**/@koromix/koffi-darwin-*/**",
  "!**/@koromix/koffi-linux-*/**",
  "!**/@koromix/koffi-freebsd-*/**",
  "!**/@koromix/koffi-openbsd-*/**",
  "!**/@koromix/koffi-win32-arm64/**",
  "!**/@koromix/koffi-win32-ia32/**",
]);

export const WINDOWS_PACKAGED_FOREIGN_NATIVE_PATHS = Object.freeze([
  path.join("node_modules", "node-pty", "prebuilds", "darwin-arm64"),
  path.join("node_modules", "node-pty", "prebuilds", "darwin-x64"),
  path.join("node_modules", "node-pty", "prebuilds", "linux-arm64"),
  path.join("node_modules", "node-pty", "prebuilds", "linux-x64"),
  path.join("node_modules", "node-pty", "prebuilds", "win32-arm64"),
  path.join("node_modules", "node-pty", "prebuilds", "win32-x64", "conpty.pdb"),
  path.join("node_modules", "node-pty", "prebuilds", "win32-x64", "conpty_console_list.pdb"),
  path.join("node_modules", "@koromix", "koffi-darwin-arm64"),
  path.join("node_modules", "@koromix", "koffi-darwin-x64"),
  path.join("node_modules", "@koromix", "koffi-win32-arm64"),
  path.join("node_modules", "@koromix", "koffi-win32-ia32"),
]);

const PACKAGED_NATIVE_FILE = /\.(?:node|dll|exe|pdb|dylib|so)$/i;

function directoryContainsNativeBinary(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true, recursive: true })) {
    if (entry.isFile() && PACKAGED_NATIVE_FILE.test(entry.name)) return true;
  }
  return false;
}

function isPresentForbiddenNative(file) {
  if (!existsSync(file)) return false;
  const stats = statSync(file);
  if (stats.isFile()) return true;
  return stats.isDirectory() && directoryContainsNativeBinary(file);
}

export function assertWindowsPackagedRuntimeNatives(runtimeRoot) {
  const found = WINDOWS_PACKAGED_FOREIGN_NATIVE_PATHS
    .map((relativePath) => path.join(runtimeRoot, relativePath))
    .filter((file) => isPresentForbiddenNative(file));
  if (found.length > 0) {
    throw new Error(`Windows packaged DSH runtime contains foreign or debug native files:\n${found.map((file) => `- ${file}`).join("\n")}`);
  }
}
