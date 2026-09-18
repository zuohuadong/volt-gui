import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultPath = path.join(rootDir, "apps", "desktop-electron", "build", "bundled.env");
const requestedPath = process.argv[2] ? path.resolve(process.argv[2]) : defaultPath;
const bundledPath = fs.existsSync(requestedPath) && fs.statSync(requestedPath).isDirectory()
  ? path.join(requestedPath, "bundled.env")
  : requestedPath;

function fail(message) {
  throw new Error(message);
}

if (!fs.existsSync(bundledPath)) fail(`发布包缺少内置模型凭据 sidecar: ${bundledPath}`);

const values = {};
for (const rawLine of fs.readFileSync(bundledPath, "utf8").split(/\r?\n/u)) {
  const line = rawLine.trim();
  if (!line || line.startsWith("#")) continue;
  const separator = line.indexOf("=");
  if (separator <= 0) continue;
  values[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
}

const endpoint = values.XG_MODEL_BASE_URL || values.XG_GOMODEL_ENDPOINT;
const apiKey = values.XG_GOMODEL_API_KEY;
if (!endpoint || !apiKey) fail("发布包内置模型凭据不完整：bundled.env 必须同时包含 endpoint 和 XG_GOMODEL_API_KEY");
if (/\r|\n/u.test(endpoint) || /\r|\n/u.test(apiKey)) fail("发布包内置模型凭据不能包含换行符");
let parsed;
try {
  parsed = new URL(endpoint);
} catch {
  fail("发布包内置模型 endpoint 不是合法 URL");
}
if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname) {
  fail("发布包内置模型 endpoint 必须是绝对 HTTP(S) URL");
}

console.log(`已验证内置模型凭据 sidecar: ${bundledPath}`);
