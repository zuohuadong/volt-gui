import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createServer } from "node:http";
import { gzipSync } from "node:zlib";
import { pathToFileURL } from "node:url";

import {
  extractSkill,
  hashDirectory,
  installSkill,
  listInstalled,
  parseIndex,
  readTarGz,
  removeSkill,
  rollbackSkill,
  runSkillCommand,
} from "./anyong-skill.mjs";

function header({ name, size }) {
  const block = Buffer.alloc(512, 0);
  block.write(name, 0, 100, "utf8");
  block.write("0000644\0", 100, 8, "ascii");
  block.write("0000000\0", 108, 8, "ascii");
  block.write("0000000\0", 116, 8, "ascii");
  block.write(`${size.toString(8).padStart(11, "0")}\0`, 124, 12, "ascii");
  block.write("00000000000\0", 136, 12, "ascii");
  block.write("        ", 148, 8, "ascii");
  block.write("0", 156, 1, "ascii");
  block.write("ustar\0", 257, 6, "ascii");
  block.write("00", 263, 2, "ascii");
  let checksum = 0;
  for (const byte of block) checksum += byte;
  block.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, 8, "ascii");
  return block;
}

function makeTarGz(entries) {
  const blocks = [];
  for (const [name, content] of entries) {
    const data = Buffer.from(content, "utf8");
    blocks.push(header({ name, size: data.length }), data);
    const padding = (512 - (data.length % 512)) % 512;
    if (padding > 0) blocks.push(Buffer.alloc(padding, 0));
  }
  blocks.push(Buffer.alloc(1024, 0));
  return gzipSync(Buffer.concat(blocks));
}

const SKILL_ID = "demo-skill";
const SKILL_MD = `---\nname: demo-skill\ndescription: 演示技能\nmetadata:\n  version: 1.0.0\n  tags: [demo]\n---\n\n# 演示\n`;

async function makeSkillTree(root, { body = SKILL_MD } = {}) {
  const dir = path.join(root, "tree", "skills", SKILL_ID);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "SKILL.md"), body);
  await writeFile(path.join(dir, "package.json"), `${JSON.stringify({ name: `@anyong/skill-${SKILL_ID}`, version: "1.0.0" }, null, 2)}\n`);
  return dir;
}

async function makeWorkspace({ body } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "anyong-skill-test-"));
  const skillDir = await makeSkillTree(root, body ? { body } : {});
  const { sha256 } = await hashDirectory(skillDir);
  const index = {
    schemaVersion: 1,
    skills: [{ id: SKILL_ID, name: SKILL_ID, title: "演示", description: "演示技能", version: "1.0.0", sha256 }],
  };
  const indexPath = path.join(root, "skills.index.json");
  await writeFile(indexPath, JSON.stringify(index));
  const archive = makeTarGz([
    [`anyong-skills-main/skills/${SKILL_ID}/SKILL.md`, await readFile(path.join(skillDir, "SKILL.md"), "utf8")],
    [`anyong-skills-main/skills/${SKILL_ID}/package.json`, await readFile(path.join(skillDir, "package.json"), "utf8")],
    ["anyong-skills-main/README.md", "repo readme"],
  ]);
  const archivePath = path.join(root, "archive.tar.gz");
  await writeFile(archivePath, archive);
  return { root, archivePath, indexPath, index, installDir: path.join(root, "installed") };
}

test("安装：解包 skills/<id>/、校验哈希并写锁", async () => {
  const ws = await makeWorkspace();
  try {
    const result = await installSkill({
      id: SKILL_ID,
      dir: ws.installDir,
      archive: ws.archivePath,
      indexUrl: pathToFileURL(ws.indexPath).href,
    });
    assert.equal(result.version, "1.0.0");
    assert.equal(result.sha256, ws.index.skills[0].sha256);
    assert.ok(existsSync(path.join(ws.installDir, SKILL_ID, "SKILL.md")));
    assert.ok(!existsSync(path.join(ws.installDir, SKILL_ID, "README.md")));
    const lock = JSON.parse(await readFile(path.join(ws.installDir, ".anyong-skills.json"), "utf8"));
    assert.equal(lock.skills[SKILL_ID].sha256, ws.index.skills[0].sha256);
    assert.deepEqual(await listInstalled(ws.installDir), [
      { id: SKILL_ID, version: "1.0.0", ref: "main", sha256: ws.index.skills[0].sha256, installedAt: lock.skills[SKILL_ID].installedAt },
    ]);
  } finally {
    await rm(ws.root, { recursive: true, force: true });
  }
});

test("哈希不匹配时拒绝安装，且保留已装版本", async () => {
  const ws = await makeWorkspace();
  try {
    await installSkill({ id: SKILL_ID, dir: ws.installDir, archive: ws.archivePath, indexUrl: pathToFileURL(ws.indexPath).href });
    const tampered = path.join(ws.root, "tampered.tar.gz");
    await writeFile(tampered, makeTarGz([[`anyong-skills-main/skills/${SKILL_ID}/SKILL.md`, `${SKILL_MD}\n改动\n`]]));
    await assert.rejects(
      installSkill({ id: SKILL_ID, dir: ws.installDir, archive: tampered, indexUrl: pathToFileURL(ws.indexPath).href }),
      /哈希不匹配/u,
    );
    assert.match(await readFile(path.join(ws.installDir, SKILL_ID, "SKILL.md"), "utf8"), /# 演示/u);
  } finally {
    await rm(ws.root, { recursive: true, force: true });
  }
});

test("rollback 交换上一版本，remove 清理目录与锁", async () => {
  const ws = await makeWorkspace();
  const next = await makeWorkspace({ body: `${SKILL_MD}\n第二版\n` });
  try {
    await installSkill({ id: SKILL_ID, dir: ws.installDir, archive: ws.archivePath, indexUrl: pathToFileURL(ws.indexPath).href });
    await installSkill({ id: SKILL_ID, dir: ws.installDir, archive: next.archivePath, indexUrl: pathToFileURL(next.indexPath).href });
    assert.match(await readFile(path.join(ws.installDir, SKILL_ID, "SKILL.md"), "utf8"), /第二版/u);
    await rollbackSkill(SKILL_ID, ws.installDir);
    assert.doesNotMatch(await readFile(path.join(ws.installDir, SKILL_ID, "SKILL.md"), "utf8"), /第二版/u);
    await removeSkill(SKILL_ID, ws.installDir);
    assert.equal(existsSync(path.join(ws.installDir, SKILL_ID)), false);
    const lock = JSON.parse(await readFile(path.join(ws.installDir, ".anyong-skills.json"), "utf8"));
    assert.deepEqual(lock.skills, {});
  } finally {
    await rm(ws.root, { recursive: true, force: true });
    await rm(next.root, { recursive: true, force: true });
  }
});

test("归档路径越界、链接与错误层级都被拒绝", () => {
  const evil = makeTarGz([[`anyong-skills-main/skills/${SKILL_ID}/../../etc/passwd`, "x"]]);
  assert.throws(() => extractSkill(readTarGz(evil), SKILL_ID), /越界|层级/u);

  const nested = makeTarGz([[`anyong-skills-main/x/skills/${SKILL_ID}/SKILL.md`, "x"]]);
  assert.throws(() => extractSkill(readTarGz(nested), SKILL_ID), /层级/u);

  const body = Buffer.alloc(512, 0);
  body.write(`anyong-skills-main/skills/${SKILL_ID}/link`, 0, 100, "utf8");
  body.write("0000644\0", 100, 8, "ascii");
  body.write("00000000000\0", 124, 12, "ascii");
  body.write("2", 156, 1, "ascii");
  body.write("ustar\0", 257, 6, "ascii");
  let sum = 0;
  for (const [index, byte] of body.entries()) sum += index >= 148 && index < 156 ? 32 : byte;
  body.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148, 8, "ascii");
  const linked = gzipSync(Buffer.concat([body, Buffer.alloc(1024, 0)]));
  assert.throws(() => readTarGz(linked), /链接/u);
});

test("macOS AppleDouble 与 .DS_Store 条目被忽略", () => {
  const archive = makeTarGz([
    [`anyong-skills-main/skills/${SKILL_ID}/._SKILL.md`, "junk"],
    [`anyong-skills-main/skills/${SKILL_ID}/.DS_Store`, "junk"],
    [`anyong-skills-main/skills/${SKILL_ID}/SKILL.md`, SKILL_MD],
  ]);
  const files = extractSkill(readTarGz(archive), SKILL_ID);
  assert.deepEqual(files.map((file) => file.relative), ["SKILL.md"]);
});

test("索引校验拒绝重复与非法 id", () => {
  assert.throws(() => parseIndex({ schemaVersion: 1, skills: [{ id: "a" }, { id: "a" }] }), /重复/u);
  assert.throws(() => parseIndex({ schemaVersion: 1, skills: [{ id: "../x" }] }), /不合法/u);
  assert.throws(() => parseIndex({ schemaVersion: 2, skills: [] }), /版本/u);
});

test("CLI 在缺少仓库配置时给出明确错误", async () => {
  const code = await runSkillCommand(["add", SKILL_ID], { ANYONG_SKILLS_DIR: path.join(tmpdir(), "anyong-skill-cli-test") });
  assert.equal(code, 1);
});

test("私有仓库：HTTP 不发送令牌", async () => {
  const ws = await makeWorkspace();
  const seen = [];
  const server = createServer((request, response) => {
    seen.push({ url: request.url, auth: request.headers.authorization ?? "" });
    if (request.url === "/skills.index.json") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(ws.index));
      return;
    }
    if (request.url === "/archive/main.tar.gz") {
      response.writeHead(200, { "content-type": "application/gzip" });
      response.end(buffer);
      return;
    }
    response.writeHead(404);
    response.end();
  });
  let buffer;
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    buffer = await readFile(ws.archivePath);
    const base = `http://127.0.0.1:${server.address().port}`;
    await assert.rejects(installSkill({ id: SKILL_ID, dir: ws.installDir, repo: base, indexUrl: `${base}/skills.index.json`, token: "test-token" }), /HTTPS/u);
    assert.deepEqual(seen, []);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(ws.root, { recursive: true, force: true });
  }
});

test("HTTPS 仓库只向配置的同源地址发送令牌", async (t) => {
  const ws = await makeWorkspace();
  t.after(() => rm(ws.root, { recursive: true, force: true }));
  const buffer = await readFile(ws.archivePath);
  const seen = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    seen.push({ url, auth: options.headers.authorization });
    return new Response(url.endsWith(".json") ? JSON.stringify(ws.index) : buffer);
  });
  const repo = "https://127.0.0.1";
  await installSkill({ id: SKILL_ID, dir: ws.installDir, repo, indexUrl: `${repo}/skills.index.json`, token: "test-token" });
  assert.deepEqual(seen.map(item => item.auth), ["token test-token", "token test-token"]);
  assert.ok(existsSync(path.join(ws.installDir, SKILL_ID, "SKILL.md")));
});

test("连续升级只保留上一版本，回滚恢复其版本和哈希", async (t) => {
  const first = await makeWorkspace();
  const second = await makeWorkspace({ body: `${SKILL_MD}\n第二版\n` });
  const third = await makeWorkspace({ body: `${SKILL_MD}\n第三版\n` });
  t.after(() => Promise.all([first, second, third].map(ws => rm(ws.root, { recursive: true, force: true }))));
  for (const [index, ws] of [first, second, third].entries()) {
    ws.index.skills[0].version = `${index + 1}.0.0`;
    await writeFile(ws.indexPath, JSON.stringify(ws.index));
    await installSkill({ id: SKILL_ID, dir: first.installDir, archive: ws.archivePath, indexUrl: pathToFileURL(ws.indexPath).href });
  }
  await rollbackSkill(SKILL_ID, first.installDir);
  const [installed] = await listInstalled(first.installDir);
  assert.equal(installed.version, "2.0.0");
  assert.equal(installed.sha256, second.index.skills[0].sha256);
  assert.match(await readFile(path.join(first.installDir, SKILL_ID, "SKILL.md"), "utf8"), /第二版/u);
});

test("拒绝符号链接目录、冒号路径和损坏的归档头", async (t) => {
  const ws = await makeWorkspace();
  t.after(() => rm(ws.root, { recursive: true, force: true }));
  await mkdir(ws.installDir);
  const linked = path.join(ws.root, "linked");
  await symlink(ws.installDir, linked, process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(installSkill({ id: SKILL_ID, dir: linked, archive: ws.archivePath }), /符号链接/u);
  assert.throws(() => extractSkill([{ name: `root/skills/${SKILL_ID}/file:stream`, data: Buffer.from("x") }], SKILL_ID), /不合法/u);
  const corrupted = header({ name: "root/file", size: 0 });
  corrupted[0] = 0;
  assert.throws(() => readTarGz(gzipSync(corrupted)), /校验/u);
});

test("安装记录提交失败时，remove 和 rollback 均保留文件及记录", async (t) => {
  const ws = await makeWorkspace();
  const next = await makeWorkspace({ body: `${SKILL_MD}\n第二版\n` });
  t.after(() => Promise.all([ws, next].map(item => rm(item.root, { recursive: true, force: true }))));
  for (const source of [ws, next]) {
    await installSkill({ id: SKILL_ID, dir: ws.installDir, archive: source.archivePath, indexUrl: pathToFileURL(source.indexPath).href });
  }
  const lockPath = path.join(ws.installDir, ".anyong-skills.json");
  const original = await readFile(lockPath, "utf8");
  const blockedTemporary = `${lockPath}.${process.pid}.tmp`;
  for (const action of [removeSkill, rollbackSkill]) {
    await mkdir(blockedTemporary);
    await assert.rejects(action(SKILL_ID, ws.installDir));
    assert.equal(await readFile(lockPath, "utf8"), original);
    assert.match(await readFile(path.join(ws.installDir, SKILL_ID, "SKILL.md"), "utf8"), /第二版/u);
    assert.equal(await readFile(path.join(ws.installDir, ".anyong-skills-backup", SKILL_ID, "SKILL.md"), "utf8"), SKILL_MD);
    await rm(blockedTemporary, { recursive: true, force: true });
  }
});
test("跨源归档不携带仓库令牌", async () => {
  const ws = await makeWorkspace();
  const archiveAuth = [];
  const archiveServer = createServer((request, response) => {
    archiveAuth.push(request.headers.authorization ?? "");
    response.writeHead(200, { "content-type": "application/gzip" });
    response.end(archiveBuffer);
  });
  let archiveBuffer;
  await new Promise((resolve) => archiveServer.listen(0, "127.0.0.1", resolve));
  try {
    archiveBuffer = await readFile(ws.archivePath);
    const external = `http://127.0.0.1:${archiveServer.address().port}/archive.tar.gz`;
    const repo = "http://127.0.0.1:1";
    await installSkill({ id: SKILL_ID, dir: ws.installDir, archive: external, indexUrl: pathToFileURL(ws.indexPath).href, repo, token: "secret-token" });
    assert.deepEqual(archiveAuth, [""]);
    assert.ok(existsSync(path.join(ws.installDir, SKILL_ID, "SKILL.md")));
  } finally {
    await new Promise((resolve) => archiveServer.close(resolve));
    await rm(ws.root, { recursive: true, force: true });
  }
});
