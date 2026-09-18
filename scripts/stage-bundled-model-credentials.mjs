import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const target = path.join(rootDir, "apps", "desktop-electron", "build", "bundled.env");
const desktopRequire = createRequire(path.join(rootDir, "apps", "desktop-electron", "package.json"));
const { parseDocument } = desktopRequire("yaml");

export function parseModelBuildVariables(source) {
  const document = parseDocument(source);
  // YAML 错误包含源文本，不能把可能含有密钥的解析器消息写入构建日志。
  if (document.errors.length > 0) throw new Error("模型构建变量 YAML 格式无效");
  const variables = document.toJS();
  if (variables === null || typeof variables !== "object" || Array.isArray(variables)) {
    throw new Error("模型构建变量必须是 YAML 映射");
  }
  return Object.fromEntries(Object.entries(variables).filter(([, value]) => typeof value === "string"));
}

export function resolveBundledModelCredentialInputs(env = process.env) {
  const rawBaseURL = env.XG_MODEL_BASE_URL || env.XG_GOMODEL_ENDPOINT || env.XIGU_MODEL_BASE_URL
    || env.volt_MODEL_BASE_URL || env.VOLT_MODEL_BASE_URL
    || "http://192.168.1.47:9010/v1";
  const rawApiKey = env.XG_GOMODEL_API_KEY || env.XIGU_API_KEY
    || env.volt_API_KEY || env.VOLT_API_KEY || "";
  return { rawBaseURL: String(rawBaseURL).trim(), rawApiKey: String(rawApiKey).trim() };
}

export function stageBundledModelCredentials() {
  const { rawBaseURL, rawApiKey } = resolveBundledModelCredentialInputs();
  const baseURL = rawBaseURL;
  const apiKey = rawApiKey;
  fs.rmSync(target, { force: true });
  if (!baseURL || !apiKey) {
    if (process.env.REQUIRE_XG_MODEL_BUNDLE === "1") {
      throw new Error("内置模型构建凭据缺失：请在 GitHub Actions secrets 中配置 XG_GOMODEL_API_KEY，并可选配置 XG_GOMODEL_ENDPOINT");
    }
    console.log("未提供完整的内置模型构建凭据，跳过 bundled.env");
    return;
  }
  if (/[\r\n]/u.test(baseURL) || /[\r\n]/u.test(apiKey)) {
    throw new Error("内置模型构建凭据不能包含换行符");
  }
  let parsed;
  try {
    parsed = new URL(baseURL);
  } catch {
    throw new Error("XG_MODEL_BASE_URL 必须是绝对 HTTP(S) URL");
  }
  if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname
    || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("XG_MODEL_BASE_URL 必须是不含凭据、查询参数或片段的 HTTP(S) URL");
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const contents = [
    "# Build-time OEM model gateway settings. User-saved DSH credentials take priority.",
    `XG_MODEL_BASE_URL=${baseURL.replace(/\/+$/u, "")}`,
    `XG_GOMODEL_API_KEY=${apiKey}`,
    "",
  ].join("\n");
  fs.writeFileSync(target, contents, { encoding: "utf8", mode: 0o600, flag: "wx" });
  console.log("已生成 Electron 内置模型凭据 sidecar（不输出 Key 内容）");
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  stageBundledModelCredentials();
}
