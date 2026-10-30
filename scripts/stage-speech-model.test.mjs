import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { speechAssetPlan } from "./stage-speech-model.mjs";

test("speech staging selects the int8 model, tokens, and VAD with pinned digests", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "anyong-speech-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "runtime"));
  fs.writeFileSync(path.join(root, "runtime", "assets.json"), JSON.stringify({
    models: { int8: { name: "model.int8.onnx", url: "https://example.test/model", bytes: 10, sha256: "a".repeat(64) } },
    tokens: { name: "tokens.txt", url: "https://example.test/tokens", bytes: 2, sha256: "b".repeat(64) },
    vad: { name: "silero_vad.onnx", url: "https://example.test/vad", bytes: 3, sha256: "c".repeat(64) },
  }));
  const plan = speechAssetPlan(root);
  assert.deepEqual(plan.map((file) => file.name), ["model.int8.onnx", "tokens.txt", "silero_vad.onnx"]);
  assert.equal(plan[0].sha256, "a".repeat(64));
});

test("speech staging rejects an incomplete or unpinned manifest", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "anyong-speech-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "runtime"));
  fs.writeFileSync(path.join(root, "runtime", "assets.json"), JSON.stringify({
    models: { int8: { name: "model.int8.onnx", url: "https://example.test/model", bytes: 10, sha256: "not-a-digest" } },
    tokens: { name: "tokens.txt", url: "https://example.test/tokens", bytes: 2, sha256: "b".repeat(64) },
    vad: { name: "silero_vad.onnx", url: "https://example.test/vad", bytes: 3, sha256: "c".repeat(64) },
  }));
  assert.throws(() => speechAssetPlan(root), /manifest is invalid/);
});
