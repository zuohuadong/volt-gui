import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { gzipSync } from "node:zlib";
import { verifiedDuckdbExtension } from "./stage-duckdb-extension.mjs";
import lock from "./duckdb-extension.lock.json" with { type: "json" };

test("DuckDB extension pins its ABI and both archive and binary digests", () => {
  assert.equal(lock.duckdbVersion, "2.0.0");
  assert.equal(lock.platform, "windows_amd64");
  assert.equal(lock.name, "excel");
  assert.match(lock.archiveSha256, /^[a-f0-9]{64}$/u);
  assert.match(lock.binarySha256, /^[a-f0-9]{64}$/u);
  assert.equal(new URL(lock.source).protocol, "https:");
});

test("extension verification rejects corrupt archives, binaries and decompression overflow", () => {
  const binary = Buffer.from("extension test bytes");
  const archive = gzipSync(binary);
  const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
  const metadata = {
    archiveBytes: archive.length, archiveSha256: sha256(archive),
    binaryBytes: binary.length, binarySha256: sha256(binary),
  };
  assert.deepEqual(verifiedDuckdbExtension(archive, metadata), binary);
  assert.throws(() => verifiedDuckdbExtension(Buffer.from("corrupt"), metadata), /archive checksum/);
  assert.throws(() => verifiedDuckdbExtension(archive, { ...metadata, binarySha256: "0".repeat(64) }), /unpacking/);
  assert.throws(() => verifiedDuckdbExtension(archive, { ...metadata, binaryBytes: 1 }));
});
