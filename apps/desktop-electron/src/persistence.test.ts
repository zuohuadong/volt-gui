import assert from "node:assert/strict";
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
    assert.doesNotMatch(await fs.readFile(persistence.configPath, "utf8"), /top-secret/);
    assert.equal(await fs.readFile(persistence.credentialPath, "utf8"), "encrypted:top-secret");
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
    await assert.rejects(fs.readFile(persistence.credentialPath));
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
