import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { crc32, deflateRawSync } from "node:zlib";

import {
  extensionInstructions,
  readExtensionManifest,
  readZipEntries,
  safeExtensionPath,
  sha256,
  stageBrowserSkillExtension,
  syncBrowserSkillExtension,
} from "./browser-skill-extension.mjs";

const roots = [];
function scratch() {
  const root = mkdtempSync(path.join(tmpdir(), "bsk-extension-test-"));
  roots.push(root);
  return root;
}
after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

/** 只实现测试需要的最小 zip 写入器（stored + deflate）。 */
function writeZip(files, { deflate = true } = {}) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const nameBuffer = Buffer.from(name, "utf8");
    const raw = Buffer.from(text, "utf8");
    const data = deflate ? deflateRawSync(raw) : raw;
    const method = deflate ? 8 : 0;
    const checksum = crc32(raw) >>> 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    locals.push(local, nameBuffer, data);

    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(method, 10);
    header.writeUInt32LE(checksum, 16);
    header.writeUInt32LE(data.length, 20);
    header.writeUInt32LE(raw.length, 24);
    header.writeUInt16LE(nameBuffer.length, 28);
    header.writeUInt32LE(offset, 42);
    central.push(header, nameBuffer);
    offset += local.length + nameBuffer.length + data.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

function manifest(version = "0.4.0") {
  return JSON.stringify({
    manifest_version: 3,
    name: "BrowserSkill",
    version,
    background: { service_worker: "background.js" },
  });
}

function archiveFixture(files = { "manifest.json": manifest(), "background.js": "console.log(1)" }, options) {
  const root = scratch();
  const archive = path.join(root, "extension.zip");
  writeFileSync(archive, writeZip(files, options));
  return { root, archive, sha256: sha256(readFileSync(archive)) };
}

test("stages the bundled extension archive and is idempotent", () => {
  const { root, archive, sha256: digest } = archiveFixture();
  const destination = path.join(root, "browser-extension");
  const first = stageBrowserSkillExtension({ archive, destination, version: "0.4.0", sha256: digest });
  assert.equal(first.changed, true);
  assert.equal(readExtensionManifest(destination).version, "0.4.0");
  assert.equal(readFileSync(path.join(destination, "background.js"), "utf8"), "console.log(1)");

  const second = stageBrowserSkillExtension({ archive, destination, version: "0.4.0", sha256: digest });
  assert.equal(second.changed, false);
});

test("rejects an archive whose digest does not match the lock", () => {
  const { root, archive } = archiveFixture();
  assert.throws(
    () => stageBrowserSkillExtension({ archive, destination: path.join(root, "out"), version: "0.4.0", sha256: "0".repeat(64) }),
    /校验失败/u,
  );
});

test("rejects a version drift between lock and extension manifest", () => {
  const { root, archive, sha256: digest } = archiveFixture({ "manifest.json": manifest("0.3.1") });
  assert.throws(
    () => stageBrowserSkillExtension({ archive, destination: path.join(root, "out"), version: "0.4.0", sha256: digest }),
    /版本不符/u,
  );
});

test("rejects path traversal entries before writing outside the target", () => {
  const { root, archive, sha256: digest } = archiveFixture({
    "manifest.json": manifest(),
    "../escape.js": "console.log('escape')",
  });
  assert.throws(
    () => stageBrowserSkillExtension({ archive, destination: path.join(root, "out"), version: "0.4.0", sha256: digest }),
    /路径非法/u,
  );
});

test("rejects absolute and backslash paths", () => {
  assert.throws(() => safeExtensionPath("/etc/passwd"), /路径非法/u);
  assert.throws(() => safeExtensionPath("C:/Windows/system32"), /路径非法/u);
  assert.throws(() => safeExtensionPath("dir\\file.js"), /路径非法/u);
  assert.throws(() => safeExtensionPath(""), /路径非法/u);
  assert.deepEqual(safeExtensionPath("assets/app.js"), ["assets", "app.js"]);
});

test("supports stored entries as well as deflate", () => {
  const { root, archive, sha256: digest } = archiveFixture(
    { "manifest.json": manifest(), "background.js": "stored" },
    { deflate: false },
  );
  stageBrowserSkillExtension({ archive, destination: path.join(root, "out"), version: "0.4.0", sha256: digest });
  assert.equal(readFileSync(path.join(root, "out", "background.js"), "utf8"), "stored");
});

test("rejects a corrupted stored payload via CRC mismatch", () => {
  const { archive } = archiveFixture({ "manifest.json": "{\"name\":\"BrowserSkill\"}" }, { deflate: false });
  const data = Buffer.from(readFileSync(archive));
  const nameLength = data.readUInt16LE(26);
  data[30 + nameLength] ^= 0xff;
  assert.throws(() => readZipEntries(data), /校验失败/u);
});

test("syncs a staged directory into the stable user directory", () => {
  const { root, archive, sha256: digest } = archiveFixture();
  const staged = path.join(root, "resources", "extension");
  stageBrowserSkillExtension({ archive, destination: staged, version: "0.4.0", sha256: digest });
  const target = path.join(root, "userData", "browser-extension");
  const first = syncBrowserSkillExtension({ source: staged, destination: target, version: "0.4.0" });
  assert.equal(first.changed, true);
  const marker = JSON.parse(readFileSync(path.join(target, ".browser-skill-extension.json"), "utf8"));
  assert.equal(marker.version, "0.4.0");
  const second = syncBrowserSkillExtension({ source: staged, destination: target, version: "0.4.0" });
  assert.equal(second.changed, false);
});

test("sync refuses a source directory with a different manifest version", () => {
  const { root, archive, sha256: digest } = archiveFixture();
  const staged = path.join(root, "staged");
  stageBrowserSkillExtension({ archive, destination: staged, version: "0.4.0", sha256: digest });
  assert.throws(
    () => syncBrowserSkillExtension({ source: staged, destination: path.join(root, "target"), version: "0.3.4" }),
    /版本不符/u,
  );
});

test("instructions keep the manual load step explicit", () => {
  const text = extensionInstructions("C:\\Users\\demo\\AppData\\Roaming\\Anyong\\browser-extension");
  assert.match(text, /chrome:\/\/extensions/u);
  assert.match(text, /加载已解压的扩展程序/u);
  assert.equal(createHash("sha256").update("BrowserSkill").digest("hex").length, 64);
});
