import fs from "node:fs";
import path from "node:path";

// Keep one lightweight local-memory stack: Memorix uses its Node SQLite driver
// and Orama full-text index. These optional packages belong to the disabled
// LanceDB/transformers embedding path and are large native payloads.
export const PRUNED_RUNTIME_PACKAGES = Object.freeze([
  "@lancedb",
  "@huggingface/transformers",
  "@huggingface/jinja",
  "apache-arrow",
  "onnxruntime-node",
  "onnxruntime-web",
  "reflect-metadata",
  "better-sqlite3",
  // Office conversion is optional; users can use their installed Office/WPS or
  // let the official Office skill download the sidecar after explicit consent.
  "@deepseek-ai/libreoffice-kit-win32-x64",
  "@deepseek-ai/libreoffice-kit-win32-arm64",
  "@deepseek-ai/libreoffice-kit-darwin-x64",
  "@deepseek-ai/libreoffice-kit-darwin-arm64",
  "@deepseek-ai/libreoffice-kit-wasm",
]);

// The OCR plugin ships Windows wheels for its self-managed virtualenv. This
// desktop build uses the pinned Python 3.14 tool-runtime instead, so the wheel
// cache is dead weight; keep ocr_worker.py and the installed site-packages.
export const PRUNED_RUNTIME_PATHS = Object.freeze([
  "node_modules/dsh-ab-ocr/python/wheels",
]);

function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

export function pruneStagedRuntime(target) {
  const nodeModules = path.join(target, "node_modules");
  const removed = [];
  for (const name of PRUNED_RUNTIME_PACKAGES) {
    const candidate = path.join(nodeModules, ...name.split("/"));
    if (!inside(target, candidate) || !fs.existsSync(candidate)) continue;
    fs.rmSync(candidate, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    removed.push(`node_modules/${name}`);
  }
  for (const relative of PRUNED_RUNTIME_PATHS) {
    const candidate = path.join(target, ...relative.split("/"));
    if (!inside(target, candidate) || !fs.existsSync(candidate)) continue;
    fs.rmSync(candidate, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    removed.push(relative);
  }
  return removed;
}