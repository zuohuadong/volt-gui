#!/usr/bin/env node

// BrowserSkill 浏览器扩展的离线 staging。
// Chrome/Edge 出于安全设计不允许程序静默安装扩展，所以这里只负责把审计过的
// 扩展目录准备好并打印绝对路径，安装动作仍由用户在内置 chrome://extensions
// 页面点击“加载已解压的扩展程序”完成。
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { crc32, inflateRawSync } from "node:zlib";

import { browserSkill, browserSkillExtension } from "./third-party-browser-tools.mjs";

const MAX_ENTRY_BYTES = 16 * 1024 * 1024;
const MAX_TOTAL_BYTES = 64 * 1024 * 1024;
const MAX_ENTRIES = 512;
const MARKER = ".browser-skill-extension.json";

export function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function readUInt64(buffer, offset) {
  return Number(buffer.readBigUInt64LE(offset));
}

/** 解析 zip 中央目录；只支持 stored/deflate 两种常见压缩方式。 */
export function readZipEntries(buffer) {
  if (buffer.length < 22) throw new Error("BrowserSkill 扩展归档过小");
  let eocd = -1;
  const floor = Math.max(0, buffer.length - 66_000);
  for (let offset = buffer.length - 22; offset >= floor; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) throw new Error("BrowserSkill 扩展归档缺少 zip 目录");
  const count = buffer.readUInt16LE(eocd + 10);
  const directoryOffset = buffer.readUInt32LE(eocd + 16);
  if (count === 0 || count > MAX_ENTRIES) throw new Error(`BrowserSkill 扩展归档条目数异常：${count}`);
  if (directoryOffset >= buffer.length) throw new Error("BrowserSkill 扩展归档目录越界");

  const entries = [];
  let total = 0;
  let cursor = directoryOffset;
  for (let index = 0; index < count; index += 1) {
    if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== 0x02014b50) {
      throw new Error("BrowserSkill 扩展归档目录损坏");
    }
    const method = buffer.readUInt16LE(cursor + 10);
    const expectedCrc = buffer.readUInt32LE(cursor + 16);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.toString("utf8", cursor + 46, cursor + 46 + nameLength);
    cursor += 46 + nameLength + extraLength + commentLength;

    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localOffset === 0xffffffff) {
      throw new Error("BrowserSkill 扩展归档不支持 zip64");
    }
    if (uncompressedSize > MAX_ENTRY_BYTES) throw new Error(`BrowserSkill 扩展条目过大：${name}`);
    total += uncompressedSize;
    if (total > MAX_TOTAL_BYTES) throw new Error("BrowserSkill 扩展归档解压后体积超出限制");

    const local = localOffset;
    if (local + 30 > buffer.length || buffer.readUInt32LE(local) !== 0x04034b50) {
      throw new Error(`BrowserSkill 扩展归档条目损坏：${name}`);
    }
    const localNameLength = buffer.readUInt16LE(local + 26);
    const localExtraLength = buffer.readUInt16LE(local + 28);
    const dataOffset = local + 30 + localNameLength + localExtraLength;
    const dataEnd = dataOffset + compressedSize;
    if (dataEnd > buffer.length) throw new Error(`BrowserSkill 扩展归档条目越界：${name}`);
    const data = buffer.subarray(dataOffset, dataEnd);

    let content;
    if (method === 0) content = Buffer.from(data);
    else if (method === 8) content = inflateRawSync(data, { maxOutputLength: MAX_ENTRY_BYTES });
    else throw new Error(`BrowserSkill 扩展归档使用不支持的压缩方式 ${method}：${name}`);
    if (content.length !== uncompressedSize) throw new Error(`BrowserSkill 扩展条目大小不符：${name}`);
    if (crc32(content) >>> 0 !== expectedCrc >>> 0) throw new Error(`BrowserSkill 扩展条目校验失败：${name}`);

    entries.push({ name, directory: name.endsWith("/"), content });
  }
  return entries;
}

/** 扩展内的相对路径必须是普通文件名，拒绝绝对路径、盘符、反斜杠和上跳。 */
export function safeExtensionPath(name) {
  if (!name || name.includes("\\") || name.includes("\0")) throw new Error(`BrowserSkill 扩展路径非法：${name}`);
  if (name.startsWith("/") || /^[A-Za-z]:/u.test(name)) throw new Error(`BrowserSkill 扩展路径非法：${name}`);
  const segments = name.split("/").filter((segment) => segment && segment !== ".");
  if (segments.length === 0) throw new Error(`BrowserSkill 扩展路径为空：${name}`);
  if (segments.some((segment) => segment === "..")) throw new Error(`BrowserSkill 扩展路径非法：${name}`);
  return segments;
}

function extractEntries(entries, destination) {
  mkdirSync(destination, { recursive: true });
  for (const entry of entries) {
    const segments = safeExtensionPath(entry.name);
    const target = path.join(destination, ...segments);
    if (entry.directory) {
      mkdirSync(target, { recursive: true });
      continue;
    }
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, entry.content, { mode: 0o644 });
  }
}

/** 校验扩展 manifest，防止归档内容与锁定版本不一致。 */
export function readExtensionManifest(directory, expectedVersion = browserSkillExtension.version) {
  const manifestPath = path.join(directory, "manifest.json");
  if (!existsSync(manifestPath)) throw new Error("BrowserSkill 扩展缺少 manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.manifest_version !== 3) throw new Error("BrowserSkill 扩展不是 Manifest V3");
  if (manifest.name !== "BrowserSkill") throw new Error(`BrowserSkill 扩展名称不符：${manifest.name}`);
  if (manifest.version !== expectedVersion) {
    throw new Error(`BrowserSkill 扩展版本不符：期望 ${expectedVersion}，实际 ${manifest.version}`);
  }
  if (manifest.background?.service_worker !== "background.js") throw new Error("BrowserSkill 扩展缺少 service worker");
  return manifest;
}

function markerMatches(directory, version, digest) {
  const markerPath = path.join(directory, MARKER);
  if (!existsSync(markerPath)) return false;
  try {
    const marker = JSON.parse(readFileSync(markerPath, "utf8"));
    return marker.package === browserSkill.packageName
      && marker.version === version
      && marker.sha256 === digest
      && existsSync(path.join(directory, "manifest.json"));
  } catch {
    return false;
  }
}

/**
 * 把已下载/已内置的扩展归档解压到目标目录。
 * 同一版本+同一哈希已存在时直接复用，避免每次启动都重写文件。
 */
export function stageBrowserSkillExtension({ archive, destination, version, sha256: expectedSha256 } = {}) {
  const wantedVersion = version ?? browserSkillExtension.version;
  const wantedSha = expectedSha256 ?? browserSkillExtension.sha256;
  if (!archive || !existsSync(archive)) throw new Error(`BrowserSkill 扩展归档不存在：${archive}`);
  if (!destination) throw new Error("BrowserSkill 扩展目标目录为空");
  const buffer = readFileSync(archive);
  const digest = sha256(buffer);
  if (wantedSha && digest !== wantedSha) {
    throw new Error(`BrowserSkill 扩展归档校验失败：期望 ${wantedSha}，实际 ${digest}`);
  }
  if (markerMatches(destination, wantedVersion, digest)) {
    return { directory: destination, version: wantedVersion, sha256: digest, changed: false };
  }

  const parent = path.dirname(destination);
  mkdirSync(parent, { recursive: true });
  const staging = mkdtempSync(path.join(parent, ".browser-skill-extension-"));
  try {
    extractEntries(readZipEntries(buffer), staging);
    readExtensionManifest(staging, wantedVersion);
    writeFileSync(path.join(staging, MARKER), `${JSON.stringify({
      package: browserSkill.packageName,
      extension: browserSkillExtension.archive,
      version: wantedVersion,
      sha256: digest,
    }, null, 2)}\n`);
    rmSync(destination, { recursive: true, force: true });
    renameSync(staging, destination);
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    throw error;
  }
  return { directory: destination, version: wantedVersion, sha256: digest, changed: true };
}

/** 把已解压的扩展同步到稳定目录，跨版本升级时保持同一绝对路径。 */
export function syncBrowserSkillExtension({ source, destination, version } = {}) {
  const wantedVersion = version ?? browserSkillExtension.version;
  if (!source) throw new Error("BrowserSkill 扩展来源目录为空");
  if (!destination) throw new Error("BrowserSkill 扩展目标目录为空");
  readExtensionManifest(source, wantedVersion);
  const digest = sha256(readFileSync(path.join(source, "manifest.json")));
  if (markerMatches(destination, wantedVersion, digest)) {
    return { directory: destination, version: wantedVersion, sha256: digest, changed: false };
  }
  const parent = path.dirname(destination);
  mkdirSync(parent, { recursive: true });
  const staging = mkdtempSync(path.join(parent, ".browser-skill-extension-"));
  try {
    copyDirectory(source, staging);
    readExtensionManifest(staging, wantedVersion);
    writeFileSync(path.join(staging, MARKER), `${JSON.stringify({
      package: browserSkill.packageName,
      extension: browserSkillExtension.archive,
      version: wantedVersion,
      sha256: digest,
    }, null, 2)}\n`);
    rmSync(destination, { recursive: true, force: true });
    renameSync(staging, destination);
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    throw error;
  }
  return { directory: destination, version: wantedVersion, sha256: digest, changed: true };
}

function copyDirectory(source, target) {
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) {
      mkdirSync(to, { recursive: true });
      copyDirectory(from, to);
    } else if (entry.isFile() && lstatSync(from).isFile()) {
      copyFileSync(from, to);
    } else {
      throw new Error(`BrowserSkill 扩展包含不支持的条目：${from}`);
    }
  }
}

export function extensionInstructions(directory) {
  return [
    `扩展目录：${directory}`,
    "安装步骤（每次全新机器只需一次）：",
    "1. 在 Chrome 或 Edge 地址栏打开 chrome://extensions（Edge 为 edge://extensions）；",
    "2. 打开右上角“开发者模式”；",
    "3. 点击“加载已解压的扩展程序”，选择上面的目录；",
    "4. 点击扩展图标，等待弹窗显示 connected。",
  ].join("\n");
}
