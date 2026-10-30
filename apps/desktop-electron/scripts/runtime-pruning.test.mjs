import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  PRUNED_RUNTIME_PACKAGES,
  PRUNED_RUNTIME_PATHS,
  pruneStagedRuntime,
} from "./runtime-pruning.mjs";

test("prunes optional memory, OCR wheel cache, and bundled Office conversion payloads", async (t) => {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), "anyong-runtime-prune-"));
  t.after(() => fs.rmSync(target, { recursive: true, force: true }));

  const keep = [
    "node_modules/memorix/package.json",
    "node_modules/@orama/orama/package.json",
    "node_modules/dsh-ab-ocr/python/ocr_worker.py",
    "node_modules/@officecli/officecli/officecli.js",
    "node_modules/@deepseek-ai/dsh-skill-office/package.json",
    "node_modules/@deepseek-ai/libreoffice-kit/package.json",
    "node_modules/sharp/package.json",
  ];
  for (const relative of keep) {
    const file = path.join(target, ...relative.split("/"));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "keep");
  }
  for (const name of PRUNED_RUNTIME_PACKAGES) {
    const file = path.join(target, "node_modules", ...name.split("/"), "package.json");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "remove");
  }
  for (const relative of PRUNED_RUNTIME_PATHS) {
    fs.mkdirSync(path.join(target, ...relative.split("/")), { recursive: true });
    fs.writeFileSync(path.join(target, ...relative.split("/"), "wheel.whl"), "remove");
  }

  const removed = pruneStagedRuntime(target);

  for (const name of PRUNED_RUNTIME_PACKAGES) {
    assert.equal(fs.existsSync(path.join(target, "node_modules", ...name.split("/"))), false, name);
    assert.ok(removed.includes(`node_modules/${name}`), name);
  }
  for (const relative of PRUNED_RUNTIME_PATHS) {
    assert.equal(fs.existsSync(path.join(target, ...relative.split("/"))), false, relative);
    assert.ok(removed.includes(relative), relative);
  }
  for (const relative of keep) {
    assert.equal(fs.existsSync(path.join(target, ...relative.split("/"))), true, relative);
  }
});

test("is idempotent when a package was already absent", (t) => {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), "anyong-runtime-prune-"));
  t.after(() => fs.rmSync(target, { recursive: true, force: true }));
  assert.deepEqual(pruneStagedRuntime(target), []);
});