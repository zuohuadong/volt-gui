import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { downloadToolAsset, verifyPowerShellLayout, resolvePowerShellArchive, resolveVendoredPowerShellArchive, validateArchiveListing, assertDesktopToolTarget, replaceDesktopToolPayload } from "../apps/desktop-electron/scripts/stage-desktop-tools.mjs";
import { desktopToolsDigest, desktopToolsLock, inventoryDesktopTools, verifyDesktopToolInventory } from "./desktop-tools.mjs";
import { desktopToolRequiredFiles } from "../apps/desktop-electron/src/desktop-tool-environment.ts";

const fixtures = [];
afterEach(() => {
  for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true });
});
function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "anyong-tool-test-"));
  fixtures.push(root);
  return root;
}
function assetFor(bytes) {
  return { url: "https://example.invalid/locked.zip", sha256: createHash("sha256").update(bytes).digest("hex") };
}
function payload() {
  const root = fixture();
  for (const relative of desktopToolRequiredFiles) {
    const file = path.join(root, relative);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, "fixture");
  }
  const manifest = {
    schemaVersion: 1, target: `${process.platform}-${process.arch}`, inputDigest: desktopToolsDigest,
    pythonPackages: desktopToolsLock.pythonPackages, files: inventoryDesktopTools(root),
  };
  writeFileSync(path.join(root, "runtime.json"), JSON.stringify(manifest));
  return root;
}

test("rejects unaudited targets before downloading or executing tools", () => {
  assert.doesNotThrow(() => assertDesktopToolTarget("win32", "x64"));
  for (const [platform, arch] of [["win32", "arm64"], ["linux", "x64"], ["darwin", "x64"]]) {
    assert.throws(() => assertDesktopToolTarget(platform, arch), /No audited/);
  }
});

test("payload replacement restores the previous runtime on publish failure", () => {
  const root = fixture();
  const destination = path.join(root, "current");
  const incoming = path.join(root, "incoming");
  const previous = path.join(root, "previous");
  mkdirSync(destination);
  mkdirSync(incoming);
  writeFileSync(path.join(destination, "version"), "old");
  assert.throws(() => replaceDesktopToolPayload(incoming, destination, previous, (from, to) => {
    if (from === incoming) throw new Error("locked");
    renameSync(from, to);
  }), /locked/);
  assert.equal(readFileSync(path.join(destination, "version"), "utf8"), "old");
  assert.equal(existsSync(previous), false);
  replaceDesktopToolPayload(incoming, destination, previous);
  assert.equal(readFileSync(path.join(previous, "version"), "utf8"), "old");
  assert.equal(existsSync(incoming), false);
});

test("failed recovery retains the old runtime instead of deleting it", () => {
  const root = fixture();
  const destination = path.join(root, "current");
  const incoming = path.join(root, "incoming");
  const previous = path.join(root, "previous");
  mkdirSync(destination);
  mkdirSync(incoming);
  writeFileSync(path.join(destination, "version"), "old");
  assert.throws(() => replaceDesktopToolPayload(incoming, destination, previous, (from, to) => {
    if (from !== destination) throw new Error("locked");
    renameSync(from, to);
  }), /Previous runtime retained/);
  assert.equal(readFileSync(path.join(previous, "version"), "utf8"), "old");
  assert.equal(existsSync(incoming), true);
});

test("cached artifacts are hash-verified rather than trusted by existence", async () => {
  const root = fixture();
  const asset = assetFor("verified");
  const destination = path.join(root, asset.sha256);
  writeFileSync(destination, "verified");
  assert.equal(await downloadToolAsset(asset, root), destination);
  writeFileSync(destination, "corrupt");
  await assert.rejects(downloadToolAsset(asset, root), /Corrupt tool cache/);
});

test("downloads publish only complete hash-verified files", async (t) => {
  const root = fixture();
  const asset = assetFor("verified");
  t.mock.method(globalThis, "fetch", async () => new Response("verified"));
  const destination = await downloadToolAsset(asset, root);
  assert.equal(readFileSync(destination, "utf8"), "verified");
  assert.equal(existsSync(`${destination}.${process.pid}.download`), false);
});

test("retries transient failures and falls back to the next locked source", async (t) => {
  const root = fixture();
  const asset = { ...assetFor("verified"), fallbackUrls: ["https://mirror.invalid/locked.zip"] };
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    calls.push(url);
    if (calls.length === 1) throw Object.assign(new TypeError("fetch failed"), {
      cause: Object.assign(new Error("connect timeout"), { code: "UND_ERR_CONNECT_TIMEOUT" }),
    });
    if (calls.length === 2) return new Response("wrong");
    return new Response("verified");
  });
  const destination = await downloadToolAsset(asset, root);
  assert.equal(readFileSync(destination, "utf8"), "verified");
  assert.deepEqual(calls, [
    "https://example.invalid/locked.zip",
    "https://example.invalid/locked.zip",
    "https://mirror.invalid/locked.zip",
  ]);
});

test("checksum mismatch and interrupted downloads never become cached assets", async (t) => {
  const root = fixture();
  const asset = assetFor("verified");
  const mocked = t.mock.method(globalThis, "fetch", async () => new Response("wrong"));
  await assert.rejects(downloadToolAsset(asset, root), /checksum mismatch/);
  mocked.mock.mockImplementation(async () => { throw new Error("interrupted"); });
  await assert.rejects(downloadToolAsset(asset, root), (error) => error.cause?.message === "interrupted");
  assert.equal(existsSync(path.join(root, asset.sha256)), false);
  assert.equal(existsSync(path.join(root, `${asset.sha256}.${process.pid}.download`)), false);
});

test("rejects archive traversal, absolute paths and links before extraction", () => {
  assert.doesNotThrow(() => validateArchiveListing("python/\npython/python.exe\n", "drwx root python/\n-rw root python/python.exe\n"));
  for (const name of ["../escape", "python/../../escape", "C:/escape", "/absolute", "\\\\host\\share", "file:stream"]) {
    assert.throws(() => validateArchiveListing(name, "-rw root file"), /Unsafe/);
  }
  assert.throws(() => validateArchiveListing("link", "lrwx root link -> ../outside"), /ordinary files/);
});

test("final payload verification detects corrupt files, additions and lock drift", () => {
  const root = payload();
  assert.doesNotThrow(() => verifyDesktopToolInventory(root));
  const manifestPath = path.join(root, "runtime.json");
  const original = readFileSync(manifestPath, "utf8");
  const manifest = JSON.parse(original);
  manifest.inputDigest = "stale";
  writeFileSync(manifestPath, JSON.stringify(manifest));
  assert.throws(() => verifyDesktopToolInventory(root), /different lock/);
  writeFileSync(manifestPath, original);
  writeFileSync(path.join(root, "injected.dll"), "unlocked");
  assert.throws(() => verifyDesktopToolInventory(root), /integrity mismatch/);
  rmSync(path.join(root, "injected.dll"));
  writeFileSync(path.join(root, "python", "python314.dll"), "corrupt");
  assert.throws(() => verifyDesktopToolInventory(root), /integrity mismatch/);
});

test("placeholder .gitkeep files are excluded from the packaged inventory", () => {
  const root = payload();
  const placeholder = path.join(root, "python", "Lib", "site-packages", "rapidocr", "models", ".gitkeep");
  mkdirSync(path.dirname(placeholder), { recursive: true });
  writeFileSync(placeholder, "");
  assert.equal(inventoryDesktopTools(root).some(({ path: file }) => file.endsWith("/.gitkeep")), false);
  assert.doesNotThrow(() => verifyDesktopToolInventory(root));
});

test("inventory refuses directory junctions without reading outside the payload", () => {
  const root = fixture();
  const outside = fixture();
  symlinkSync(outside, path.join(root, "escape"), process.platform === "win32" ? "junction" : "dir");
  assert.throws(() => inventoryDesktopTools(root), /Unsupported/);
});

// .NET 9/10 默认启用 CET 影子栈，在 CET 支持不完整的 Windows 上 pwsh 会在 CoreCLR
// 自检阶段直接 FailFast（0x80131506），且该状态不会被启动器策略传给孙进程。
// 因此 PowerShell 必须停留在 .NET 8 的 7.4 LTS 线，升级前先在目标 Windows 上验收嵌套 pwsh。
test("bundled PowerShell stays on the .NET 8 LTS line", () => {
  assert.match(desktopToolsLock.powershell.version, /^7\.4\./u);
});

test("lock pins every archive, the Bun binary and the complete official Python library set", () => {
  assert.equal(desktopToolsLock.nodeVersion, "26.13.0");
  for (const asset of [
    desktopToolsLock.python, desktopToolsLock.bun,
    desktopToolsLock.coreutils, desktopToolsLock.powershell, ...desktopToolsLock.wheels,
  ]) {
    assert.match(asset.sha256, /^[a-f0-9]{64}$/);
    for (const url of [asset.url, ...(asset.fallbackUrls || [])]) {
      assert.equal(new URL(url).protocol, "https:");
      assert.doesNotMatch(url, /\/latest\//);
    }
  }
  for (const name of ["numpy", "pandas", "python-docx", "python-pptx", "openpyxl", "Pillow", "lxml", "XlsxWriter", "duckdb", "python-calamine"]) {
    assert.ok(desktopToolsLock.pythonPackages[name]);
  }
});

test("native Python wheels and required DLL match the locked interpreter ABI", () => {
  const [major, minor] = desktopToolsLock.python.version.split(".");
  const abi = `cp${major}${minor}`;
  assert.ok(desktopToolRequiredFiles.includes(`python/python${major}${minor}.dll`));
  for (const wheel of desktopToolsLock.wheels) {
    const name = new URL(wheel.url).pathname.split("/").at(-1);
    // abi3 wheels target an older CPython ABI but stay importable on the locked
    // interpreter, so any cp3N-abi3 build is acceptable here.
    const compatible = name.endsWith("-none-any.whl") || name.endsWith(`-${abi}-${abi}-win_amd64.whl`)
      || name.endsWith("-py3-none-win_amd64.whl")
      || /-cp3\d+-abi3-win_amd64\.whl$/u.test(name);
    assert.ok(compatible, name);
  }
});

test("vendored PowerShell archive is detected by name and digest", () => {
  const root = fixture();
  const bytes = Buffer.from("PK\x03\x04fake-powershell-archive");
  const asset = { version: "9.9.9", sha256: createHash("sha256").update(bytes).digest("hex") };
  assert.equal(resolveVendoredPowerShellArchive(root, asset).status, "missing");
  const file = path.join(root, "PowerShell-9.9.9-win-x64.zip");
  writeFileSync(file, bytes);
  assert.deepEqual(resolveVendoredPowerShellArchive(root, asset), { status: "ok", file, digest: asset.sha256 });
  writeFileSync(file, "tampered");
  const mismatch = resolveVendoredPowerShellArchive(root, asset);
  assert.equal(mismatch.status, "hash-mismatch");
  assert.notEqual(mismatch.digest, asset.sha256);
});

test("a Git LFS pointer is reported instead of being treated as an archive", () => {
  const root = fixture();
  const asset = { version: "9.9.9", sha256: "0".repeat(64) };
  writeFileSync(
    path.join(root, "PowerShell-9.9.9-win-x64.zip"),
    "version https://git-lfs.github.com/spec/v1\noid sha256:abc\nsize 112005985\n",
  );
  assert.equal(resolveVendoredPowerShellArchive(root, asset).status, "lfs-pointer");
});

test("archive resolution prefers explicit and vendored sources and fails closed on a bad hash", async () => {
  const root = fixture();
  const bytes = Buffer.from("explicit-archive-bytes");
  const asset = { version: "9.9.9", sha256: createHash("sha256").update(bytes).digest("hex") };
  const explicit = path.join(root, "explicit.zip");
  writeFileSync(explicit, bytes);
  assert.equal(await resolvePowerShellArchive(path.join(root, "cache"), { asset, explicit }), explicit);

  const bad = path.join(root, "bad.zip");
  writeFileSync(bad, "wrong");
  await assert.rejects(() => resolvePowerShellArchive(path.join(root, "cache"), { asset, explicit: bad }), /checksum mismatch/u);

  const vendorDirectory = path.join(root, "vendor");
  mkdirSync(vendorDirectory);
  writeFileSync(path.join(vendorDirectory, "PowerShell-9.9.9-win-x64.zip"), bytes);
  assert.equal(
    await resolvePowerShellArchive(path.join(root, "cache"), { asset, explicit: "", vendorDirectory }),
    path.join(vendorDirectory, "PowerShell-9.9.9-win-x64.zip"),
  );

  writeFileSync(path.join(vendorDirectory, "PowerShell-9.9.9-win-x64.zip"), "corrupt");
  await assert.rejects(
    () => resolvePowerShellArchive(path.join(root, "cache"), { asset, explicit: "", vendorDirectory }),
    /Vendored PowerShell archive checksum mismatch/u,
  );
});

test("PowerShell layout keeps the official executable and assemblies side by side", () => {
  const root = fixture();
  const directory = path.join(root, "powershell");
  mkdirSync(path.join(directory, "Modules"), { recursive: true });
  const official = Buffer.alloc(512);
  official.write("MZ");
  official.writeUInt32LE(0x80, 0x3c);
  official.write("PE\0\0", 0x80);
  official.writeUInt16LE(0x8664, 0x84);
  official.writeUInt16LE(0x20b, 0x98);
  writeFileSync(path.join(directory, "pwsh.exe"), official);
  writeFileSync(path.join(directory, "Modules", "canary.txt"), "module");
  for (const file of ["pwsh.dll", "pwsh.deps.json", "pwsh.runtimeconfig.json", "System.Management.Automation.dll"]) {
    writeFileSync(path.join(directory, file), "assembly");
  }
  assert.doesNotThrow(() => verifyPowerShellLayout(directory));
  assert.deepEqual(readFileSync(path.join(directory, "pwsh.exe")), official);
  assert.equal(readFileSync(path.join(directory, "Modules", "canary.txt"), "utf8"), "module");
  rmSync(path.join(directory, "pwsh.dll"));
  assert.throws(() => verifyPowerShellLayout(directory), /incomplete/);
});

test("PowerShell layout rejects missing or non-Windows binaries", () => {
  const root = fixture();
  const directory = path.join(root, "powershell");
  mkdirSync(directory);
  assert.throws(() => verifyPowerShellLayout(directory));
  writeFileSync(path.join(directory, "pwsh.exe"), "not a pe");
  assert.throws(() => verifyPowerShellLayout(directory), /PE|Windows|executable/i);
  assert.equal(existsSync(path.join(directory, "runtime")), false);
});
