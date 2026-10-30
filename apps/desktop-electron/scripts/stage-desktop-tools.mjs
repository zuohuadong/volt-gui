import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { desktopToolsDigest, desktopToolsLock as lock, inventoryDesktopTools, sha256File, smokeDesktopTools } from "../../../scripts/desktop-tools.mjs";
import { assertWindowsX64PeExecutable } from "../../../scripts/native-executable.mjs";

const appDir = path.resolve(import.meta.dirname, "..");
const DOWNLOAD_ATTEMPTS_PER_SOURCE = 2;
const DOWNLOAD_TIMEOUT_MS = 900_000;

function isTransientDownloadError(error) {
  const details = [error, error?.cause].filter(Boolean);
  return details.some((entry) => {
    const code = entry?.code;
    return entry instanceof TypeError
      || entry?.name === "TimeoutError"
      || ["ECONNRESET", "ECONNREFUSED", "EAI_AGAIN", "ENETUNREACH", "ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT"].includes(code)
      || /connect timeout|fetch failed|network|socket|timed out/iu.test(String(entry?.message || entry));
  });
}

function assetUrls(asset) {
  const fallbackUrls = asset.fallbackUrls ?? [];
  const urls = [asset.url, ...(Array.isArray(fallbackUrls) ? fallbackUrls : [])];
  if (urls.some((url) => typeof url !== "string" || !url.startsWith("https://"))) {
    throw new Error("Invalid locked desktop tool asset URL");
  }
  if (!Array.isArray(fallbackUrls)) throw new Error("Invalid locked desktop tool fallback URLs");
  return [...new Set(urls)];
}

async function readToolResponse(response, label) {
  const reader = response.body?.getReader();
  if (!reader) return Buffer.from(await response.arrayBuffer());
  const chunks = [];
  let total = 0;
  let lastHeartbeat = Date.now();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = Buffer.from(value);
    chunks.push(chunk);
    total += chunk.length;
    if (Date.now() - lastHeartbeat >= 15_000) {
      // CNB 以 10 分钟无输出判定卡死；下载大文件时必须持续发出心跳。
      console.log(`${label}: ${(total / 1_048_576).toFixed(1)} MiB received`);
      lastHeartbeat = Date.now();
    }
  }
  return Buffer.concat(chunks, total);
}

async function fetchToolAsset(asset) {
  const failures = [];
  const label = path.basename(new URL(assetUrls(asset)[0]).pathname);
  for (const url of assetUrls(asset)) {
    for (let attempt = 1; attempt <= DOWNLOAD_ATTEMPTS_PER_SOURCE; attempt += 1) {
      try {
        console.log(`Downloading locked desktop asset: ${label} from ${new URL(url).hostname} (attempt ${attempt})`);
        const response = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
        if (!response.ok) {
          const error = new Error(`HTTP ${response.status}`);
          if (response.status < 500 && response.status !== 408 && response.status !== 429) throw error;
          throw error;
        }
        const bytes = await readToolResponse(response, label);
        const digest = createHash("sha256").update(bytes).digest("hex");
        if (digest !== asset.sha256) throw new Error(`Tool asset checksum mismatch: ${url}`);
        return bytes;
      } catch (error) {
        failures.push({ url, error });
        const retryable = isTransientDownloadError(error)
          || /HTTP (?:408|429|5\d\d)/u.test(String(error));
        if (!retryable) break;
        if (attempt < DOWNLOAD_ATTEMPTS_PER_SOURCE) {
          await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
        }
      }
    }
  }
  const lastFailure = failures.at(-1);
  throw new Error(`Desktop tool download failed from ${failures.length} source attempt(s): ${lastFailure?.error?.message || "unknown error"}`, {
    cause: lastFailure?.error,
  });
}

export async function downloadToolAsset(asset, cache) {
  if (!/^[a-f0-9]{64}$/.test(asset.sha256)) {
    throw new Error("Invalid locked desktop tool asset");
  }
  const urls = assetUrls(asset);
  mkdirSync(cache, { recursive: true });
  const destination = path.join(cache, asset.sha256);
  if (existsSync(destination)) {
    if (sha256File(destination) !== asset.sha256) throw new Error(`Corrupt tool cache: ${destination}`);
    return destination;
  }
  const temporary = `${destination}.${process.pid}.download`;
  try {
    writeFileSync(temporary, await fetchToolAsset(asset), { flag: "wx" });
    if (sha256File(temporary) !== asset.sha256) {
      throw new Error(`Tool asset checksum mismatch: ${urls.join(", ")}`);
    }
    renameSync(temporary, destination);
    return destination;
  } finally {
    rmSync(temporary, { force: true });
  }
}

export function validateArchiveListing(names, details) {
  for (const name of names.trim().split(/\r?\n/u)) {
    const normalized = name.replaceAll("\\", "/");
    if (!normalized || normalized.startsWith("/") || normalized.includes(":")
      || normalized.split("/").some((part) => part === ".." || part === ".")) {
      throw new Error(`Unsafe tool archive path: ${name}`);
    }
  }
  if (details.trim().split(/\r?\n/u).some((line) => !/^[d-]/u.test(line))) {
    throw new Error("Tool archives must contain only ordinary files and directories");
  }
}

function extractToolAsset(archive, destination) {
  const options = { encoding: "utf8", windowsHide: true, timeout: 120_000, maxBuffer: 16 * 1024 * 1024 };
  // Windows 自带 bsdtar 同时支持 ZIP/wheel 和 tar.gz；解压前拒绝链接和越界路径。
  const tar = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe");
  validateArchiveListing(execFileSync(tar, ["-tf", archive], options), execFileSync(tar, ["-tvf", archive], options));
  mkdirSync(destination, { recursive: true });
  execFileSync(tar, ["-xf", archive, "-C", destination], options);
}

function prunePythonCaches(root) {
  const candidates = [];
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "__pycache__") candidates.push(file);
        else visit(file);
      } else if (entry.isFile() && /\.(?:pyc|pyo)$/u.test(entry.name)) {
        candidates.push(file);
      }
    }
  }
  visit(root);
  for (const file of candidates) rmSync(file, { recursive: true, force: true });
}

async function stagePython(payload, cache) {
  extractToolAsset(await downloadToolAsset(lock.python, cache), payload);
  const sitePackages = path.join(payload, "python", "Lib", "site-packages");
  for (const wheel of lock.wheels) extractToolAsset(await downloadToolAsset(wheel, cache), sitePackages);
  prunePythonCaches(path.join(payload, "python"));
}

async function stageBun(payload, scratch, cache) {
  const extracted = path.join(scratch, "bun");
  extractToolAsset(await downloadToolAsset(lock.bun, cache), extracted);
  const source = path.join(extracted, lock.bun.archiveRoot, "bun.exe");
  const destination = path.join(payload, "bun");
  mkdirSync(destination, { recursive: true });
  copyFileSync(source, path.join(destination, "bun.exe"));
}

export const bundledPowerShellArchiveDirectory = path.resolve(import.meta.dirname, "..", "..", "..", "vendor", "powershell");
const GIT_LFS_POINTER_PREFIX = "version https://git-lfs.github.com/spec/";

function readFilePrefix(file, length = 128) {
  const handle = openSync(file, "r");
  try {
    const buffer = Buffer.alloc(length);
    const read = readSync(handle, buffer, 0, length, 0);
    return buffer.subarray(0, read);
  } finally {
    closeSync(handle);
  }
}

/**
 * 解析仓库内自带的 PowerShell 归档。
 * - 存在且哈希匹配：离线构建直接使用；
 * - Git LFS 指针（克隆时未拉取对象）：上报状态，调用方回落到下载/缓存，不阻塞构建；
 * - 哈希不符：视为供应链异常，必须失败，不能静默改用网络。
 */
export function resolveVendoredPowerShellArchive(directory = bundledPowerShellArchiveDirectory, asset = lock.powershell) {
  const file = path.join(directory, `PowerShell-${asset.version}-win-x64.zip`);
  if (!existsSync(file)) return { status: "missing", file };
  if (readFilePrefix(file, GIT_LFS_POINTER_PREFIX.length + 8).toString("utf8").startsWith(GIT_LFS_POINTER_PREFIX)) {
    return { status: "lfs-pointer", file };
  }
  const digest = sha256File(file);
  if (digest !== asset.sha256) return { status: "hash-mismatch", file, digest };
  return { status: "ok", file, digest };
}

/** 依次尝试显式覆盖、仓库自带归档、下载缓存；返回可解压的本地归档路径。 */
export async function resolvePowerShellArchive(cache, options = {}) {
  const asset = options.asset ?? lock.powershell;
  const explicit = options.explicit ?? process.env.ANYONG_POWERSHELL_ARCHIVE?.trim();
  if (explicit) {
    if (!existsSync(explicit)) throw new Error(`ANYONG_POWERSHELL_ARCHIVE does not exist: ${explicit}`);
    const digest = sha256File(explicit);
    if (digest !== asset.sha256) throw new Error(`ANYONG_POWERSHELL_ARCHIVE checksum mismatch: ${digest}`);
    console.log(`Using PowerShell ${asset.version} from ANYONG_POWERSHELL_ARCHIVE.`);
    return explicit;
  }
  const vendored = resolveVendoredPowerShellArchive(options.vendorDirectory ?? bundledPowerShellArchiveDirectory, asset);
  if (vendored.status === "ok") {
    console.log(`Using vendored PowerShell ${asset.version} archive (offline).`);
    return vendored.file;
  }
  if (vendored.status === "hash-mismatch") {
    throw new Error(`Vendored PowerShell archive checksum mismatch: expected ${asset.sha256}, got ${vendored.digest} (${vendored.file})`);
  }
  if (vendored.status === "lfs-pointer") {
    console.log(`Vendored PowerShell archive is a Git LFS pointer; falling back to download or cache (${vendored.file}).`);
  }
  return downloadToolAsset(asset, cache);
}

export function verifyPowerShellLayout(powershellDirectory) {
  assertWindowsX64PeExecutable(path.join(powershellDirectory, "pwsh.exe"), "PowerShell");
  for (const file of ["pwsh.dll", "pwsh.deps.json", "pwsh.runtimeconfig.json", "System.Management.Automation.dll"]) {
    if (!existsSync(path.join(powershellDirectory, file))) throw new Error(`Bundled PowerShell layout is incomplete: ${file}`);
  }
}

async function stageWindowsTools(payload, scratch, cache) {
  const coreutils = path.join(scratch, "coreutils");
  extractToolAsset(await downloadToolAsset(lock.coreutils, cache), coreutils);
  mkdirSync(path.join(payload, "coreutils"));
  copyFileSync(path.join(coreutils, `coreutils-${lock.coreutils.version}-x64`, "coreutils.exe"),
    path.join(payload, "coreutils", "coreutils.exe"));
  copyFileSync(path.join(import.meta.dirname, "licenses", "coreutils.txt"), path.join(payload, "coreutils", "LICENSE"));
  const powershell = path.join(payload, "powershell");
  extractToolAsset(await resolvePowerShellArchive(cache), powershell);
  verifyPowerShellLayout(powershell);
}

export function assertDesktopToolTarget(platform, arch) {
  if (`${platform}-${arch}` !== lock.target) throw new Error(`No audited desktop tool payload for ${platform}-${arch}`);
}

export function replaceDesktopToolPayload(payload, destination, previous, move = renameSync) {
  const movedPrevious = existsSync(destination);
  if (movedPrevious) move(destination, previous);
  try {
    move(payload, destination);
  } catch (error) {
    if (movedPrevious) {
      if (existsSync(destination)) throw new Error(`Replacement failed; previous runtime retained at ${previous}`, { cause: error });
      try {
        move(previous, destination);
      } catch (recoveryError) {
        throw new AggregateError([error, recoveryError], `Previous runtime retained at ${previous}`);
      }
    }
    throw error;
  }
}

export async function stageDesktopTools() {
  assertDesktopToolTarget(process.platform, process.arch);
  const cache = path.resolve(process.env.ANYONG_RUNTIME_CACHE || path.join(appDir, ".runtime-cache"));
  const scratch = mkdtempSync(path.join(appDir, ".tool-runtime-build-"));
  const payload = path.join(scratch, "payload");
  const previous = path.join(scratch, "previous-tool-runtime");
  let published = false;
  mkdirSync(payload);
  try {
    await stagePython(payload, cache);
    await stageBun(payload, scratch, cache);
    await stageWindowsTools(payload, scratch, cache);
    const manifest = {
      schemaVersion: 1,
      target: lock.target,
      inputDigest: desktopToolsDigest,
      versions: {
        node: lock.nodeVersion,
        ...Object.fromEntries(["python", "bun", "coreutils", "powershell"].map((name) => [name, lock[name].version])),
      },
      pythonPackages: lock.pythonPackages,
      files: inventoryDesktopTools(payload),
    };
    writeFileSync(path.join(payload, "runtime.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    const cleanHome = path.join(scratch, "clean home");
    mkdirSync(cleanHome);
    smokeDesktopTools(payload, path.join(appDir, ".node-runtime", "node.exe"), cleanHome);
    const destination = path.join(appDir, ".tool-runtime");
    if (path.dirname(destination) !== appDir) throw new Error("Refusing to replace tool runtime outside desktop workspace");
    replaceDesktopToolPayload(payload, destination, previous);
    published = true;
    console.log(`Staged offline desktop tools: Python ${lock.python.version}, Bun ${lock.bun.version}, PowerShell ${lock.powershell.version}, Microsoft coreutils ${lock.coreutils.version}.`);
  } finally {
    if (path.dirname(scratch) !== appDir || !path.basename(scratch).startsWith(".tool-runtime-build-")) {
      throw new Error("Refusing to clean unexpected desktop tool staging directory");
    }
    // 恢复也失败时保留旧资源，避免清理暂存目录造成二次丢失。
    if (!published && existsSync(previous)) console.error(`Preserved desktop runtime recovery files: ${scratch}`);
    else rmSync(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await stageDesktopTools();
