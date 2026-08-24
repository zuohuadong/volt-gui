import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ElectronPersistence, persistenceErrors } from "./persistence.js";

const storage = (available = true) => ({ backend: "keychain", isEncryptionAvailable: () => available, encryptString: (value: string) => Buffer.from(`encrypted:${value}`), decryptString: (value: Buffer) => value.toString().replace(/^encrypted:/, "") });

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "voltui-persistence-"));
  return { root, persistence: new ElectronPersistence(root, storage()) };
}

test("API keys are encrypted and omitted from runtime config", async () => {
  const { root, persistence } = await fixture();
  try {
    const config = { model: "deepseek-chat", baseURL: "https://api.deepseek.com", compactReasoning: true, degenerationGuard: true };
    await persistence.saveRuntimeConfig(config, "top-secret");
    const stored = JSON.parse(await fs.readFile(persistence.configPath, "utf8"));
    assert.doesNotMatch(JSON.stringify(stored), /top-secret/);
    assert.equal(await fs.readFile(persistence.credentialPathForRevision(stored.credentialRevision), "utf8"), "encrypted:top-secret");
    assert.equal(await persistence.loadApiKey(), "top-secret");
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test("undefined key update preserves the encrypted credential", async () => {
  const { root, persistence } = await fixture();
  try {
    const config = { model: "deepseek-chat", baseURL: "https://api.deepseek.com", compactReasoning: true, degenerationGuard: true };
    await persistence.saveRuntimeConfig(config, "top-secret");
    const first = JSON.parse(await fs.readFile(persistence.configPath, "utf8"));
    await persistence.saveRuntimeConfig({ ...config, model: "deepseek-reasoner" });
    const second = JSON.parse(await fs.readFile(persistence.configPath, "utf8"));
    assert.equal(second.credentialRevision, first.credentialRevision);
    assert.equal(await persistence.loadApiKey(), "top-secret");
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test("safe storage failure rejects without writing plaintext", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "voltui-persistence-"));
  const persistence = new ElectronPersistence(root, storage(false));
  try {
    await assert.rejects(persistence.saveRuntimeConfig({ model: "deepseek-chat", baseURL: "https://api.deepseek.com", compactReasoning: true, degenerationGuard: true }, "top-secret"), new RegExp(persistenceErrors.SAFE_STORAGE_ERROR));
    await assert.rejects(fs.access(persistence.credentialsRoot));
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test("legacy encrypted credentials migrate to the revision path", async () => {
  const { root, persistence } = await fixture();
  try {
    const encrypted = Buffer.from("encrypted:legacy-secret");
    const credentialRevision = createHash("sha256").update(encrypted).digest("hex");
    const legacyCredentialPath = path.join(persistence.credentialsRoot, "api-key.bin");
    await fs.mkdir(persistence.credentialsRoot, { recursive: true });
    await fs.writeFile(legacyCredentialPath, encrypted);
    await fs.writeFile(persistence.configPath, JSON.stringify({
      schemaVersion: 1,
      model: "deepseek-chat",
      baseURL: "https://api.deepseek.com",
      compactReasoning: true,
      degenerationGuard: true,
      credentialRevision,
    }));

    assert.equal(await persistence.loadApiKey(credentialRevision), "legacy-secret");
    assert.equal(await fs.readFile(persistence.credentialPathForRevision(credentialRevision), "utf8"), encrypted.toString());
    await assert.rejects(fs.access(legacyCredentialPath));
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test("runtime config commit failure keeps the previous endpoint and credential paired", async () => {
  const { root, persistence } = await fixture();
  try {
    const original = { model: "deepseek-chat", baseURL: "https://old.example", compactReasoning: true, degenerationGuard: true };
    await persistence.saveRuntimeConfig(original, "old-secret");
    const failingPersistence = new ElectronPersistence(root, storage(), {
      beforeRuntimeConfigCommit: async () => { throw new Error("injected config commit failure"); },
    });
    await assert.rejects(
      failingPersistence.saveRuntimeConfig({ ...original, baseURL: "https://new.example" }, "new-secret"),
      /injected config commit failure/,
    );

    assert.equal((await persistence.loadRuntimeConfig(original)).baseURL, "https://old.example");
    assert.equal(await persistence.loadApiKey(), "old-secret");
    const rejectedRevision = createHash("sha256").update(Buffer.from("encrypted:new-secret")).digest("hex");
    await assert.rejects(fs.access(persistence.credentialPathForRevision(rejectedRevision)));
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test("corrupt session is quarantined and workspaces are isolated", async () => {
  const { root, persistence } = await fixture();
  try {
    await persistence.saveSession("/workspace-a", [{ role: "user", content: "A" }]);
    await persistence.saveSession("/workspace-b", [{ role: "user", content: "B" }]);
    assert.equal((await persistence.loadSession("/workspace-b")).messages[0]?.content, "B");
    const corruptPath = persistence.sessionPath("/workspace-a");
    await fs.writeFile(corruptPath, "{not-json}\\n");
    const loaded = await persistence.loadSession("/workspace-a");
    assert.deepEqual(loaded.messages, []);
    assert.match(loaded.warning ?? "", /损坏备份/);
    assert.equal((await persistence.loadSession("/workspace-b")).messages[0]?.content, "B");
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test("malformed nested tool calls quarantine the session", async () => {
  const { root, persistence } = await fixture();
  try {
    const sessionPath = persistence.sessionPath("/workspace-a");
    await fs.mkdir(path.dirname(sessionPath), { recursive: true });
    await fs.writeFile(sessionPath, `${JSON.stringify({
      schemaVersion: 1,
      message: {
        role: "assistant",
        content: "unsafe history",
        toolCalls: [{ id: "call-1", type: "function", function: { name: "read_file", arguments: { path: "secret" } } }],
      },
    })}\n`);

    const loaded = await persistence.loadSession("/workspace-a");
    assert.deepEqual(loaded.messages, []);
    assert.match(loaded.warning ?? "", /损坏备份/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
