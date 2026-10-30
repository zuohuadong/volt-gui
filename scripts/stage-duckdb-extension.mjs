import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import lock from "./duckdb-extension.lock.json" with { type: "json" };

const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function verifiedDuckdbExtension(archive, metadata = lock) {
  if (archive.length !== metadata.archiveBytes || digest(archive) !== metadata.archiveSha256) {
    throw new Error("duckdb extension archive checksum mismatch");
  }
  const binary = gunzipSync(archive, { maxOutputLength: metadata.binaryBytes });
  if (binary.length !== metadata.binaryBytes || digest(binary) !== metadata.binarySha256) {
    throw new Error("duckdb extension checksum mismatch after unpacking");
  }
  return binary;
}

export async function stageDuckdbExtension(destination) {
  const target = path.join(destination, `v${lock.duckdbVersion}`, lock.platform, `${lock.name}.duckdb_extension`);
  try {
    if (digest(readFileSync(target)) === lock.binarySha256) return target;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const response = await fetch(lock.source, { signal: AbortSignal.timeout(180_000) });
  if (!response.ok) throw new Error(`duckdb extension download failed: HTTP ${response.status}`);
  const binary = verifiedDuckdbExtension(Buffer.from(await response.arrayBuffer()));
  mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  try {
    writeFileSync(temporary, binary, { flag: "wx" });
    if (digest(readFileSync(temporary)) !== lock.binarySha256) throw new Error("duckdb extension checksum mismatch after copy");
    renameSync(temporary, target);
  } finally {
    rmSync(temporary, { force: true });
  }
  return target;
}
