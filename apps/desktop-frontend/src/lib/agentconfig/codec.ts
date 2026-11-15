import type {
  AcbBundle,
  AcbBundleInput,
  AcbPayload,
  AcbProviderSecret,
  AcbPublic,
  AcbSecret,
  AcbTrustMode,
} from "./types";

/**
 * ACB v1 编解码（最小实现）。
 *
 * 只用平台 crypto（Web Crypto / node:crypto），不引入新算法：
 * PBKDF2-HMAC-SHA256(100k–1M) + AES-256-GCM，与规范 §4.1 完全一致。
 */

export const ACB_SCHEMA_ID = "agentconfig-bundle" as const;
export const ACB_VERSION = 1 as const;
export const ACB_FILE_EXTENSION = ".acfg";
export const ACB_MIME_TYPE = "application/x-agentconfig+json";
export const ACB_DEEP_LINK_SCHEME = "agentconfig";
export const ACB_MAX_BUNDLE_BYTES = 1_000_000;
export const ACB_DEEP_LINK_MAX_CHARS = 20_000;
export const ACB_PBKDF2_MIN_ITERATIONS = 100_000;
export const ACB_PBKDF2_MAX_ITERATIONS = 1_000_000;
export const ACB_KNOWN_CAPABILITIES = ["mcp", "models", "skills", "prompts", "agents", "resources"] as const;

const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]*$/u;
const TRUST_MODES: readonly AcbTrustMode[] = ["self", "shared", "managed"];

export class AgentConfigError extends Error {
  constructor(readonly code: AgentConfigErrorCode, message: string) {
    super(message);
    this.name = "AgentConfigError";
  }
}

export type AgentConfigErrorCode =
  | "not-a-bundle"
  | "unsupported-version"
  | "too-large"
  | "invalid-base64"
  | "invalid-payload"
  | "unsupported-algorithm"
  | "invalid-iterations"
  | "wrong-password"
  | "trust-violation"
  | "invalid-deep-link"
  | "invalid-secret";

function fail(code: AgentConfigErrorCode, message: string): never {
  throw new AgentConfigError(code, message);
}

const utf8 = (value: string): Uint8Array<ArrayBuffer> => {
  const encoded = new TextEncoder().encode(value);
  const copy = new Uint8Array(new ArrayBuffer(encoded.byteLength));
  copy.set(encoded);
  return copy;
};

/** Web Crypto 要求 ArrayBuffer 支撑的视图；从 atob 拿到的字节先复制一份。 */
const toBufferSource = (bytes: Uint8Array): Uint8Array<ArrayBuffer> => {
  if (bytes.buffer instanceof ArrayBuffer && bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength) {
    return bytes as Uint8Array<ArrayBuffer>;
  }
  const copy = new Uint8Array(new ArrayBuffer(bytes.byteLength));
  copy.set(bytes);
  return copy;
};
const fromUtf8 = (bytes: Uint8Array): string => new TextDecoder("utf-8", { fatal: true }).decode(bytes);

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string, field = "base64"): Uint8Array {
  if (!BASE64_PATTERN.test(value)) fail("invalid-base64", `${field} is not canonical base64`);
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  if (!BASE64URL_PATTERN.test(value)) fail("invalid-base64", "deep link bundle is not base64url");
  const padded = value.replace(/-/gu, "+").replace(/_/gu, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  return base64ToBytes(padded, "deep link bundle");
}

function byteLength(value: unknown): number {
  return utf8(JSON.stringify(value)).byteLength;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 结构化解析：拒绝不认识的 schema/版本，保留未知字段。 */
export function parseBundle(raw: unknown): AcbBundle {
  if (!isRecord(raw)) fail("not-a-bundle", "Bundle must be a JSON object");
  if (raw.schema !== ACB_SCHEMA_ID) fail("not-a-bundle", "Not an AgentConfig bundle");
  if (raw.v !== ACB_VERSION) fail("unsupported-version", `Unsupported bundle version: ${String(raw.v)}`);
  if (byteLength(raw) > ACB_MAX_BUNDLE_BYTES) fail("too-large", "Bundle exceeds 1,000,000 bytes");
  const trust = raw.trust ?? "shared";
  if (typeof trust !== "string" || !TRUST_MODES.includes(trust as AcbTrustMode)) {
    fail("invalid-payload", `Unknown trust mode: ${String(trust)}`);
  }
  if (!isRecord(raw.payload)) fail("invalid-payload", "Bundle payload is missing");
  const payload = parsePayload(raw.payload);
  // 结构校验 fail closed：畸形包不能被"当成空包"接受，那样后面的计划阶段只会
  // 抛一个普通 TypeError，用户看到的是崩溃而不是"这个包不合法"。
  if (raw.pub !== undefined && !isRecord(raw.pub)) fail("invalid-payload", "Bundle pub must be an object");
  const pub = (raw.pub ?? {}) as AcbPublic;
  if (raw.capabilities !== undefined) {
    if (!Array.isArray(raw.capabilities) || raw.capabilities.some((item) => typeof item !== "string")) {
      fail("invalid-payload", "Bundle capabilities must be a string array");
    }
  }
  const capabilities: string[] = Array.isArray(raw.capabilities) ? [...raw.capabilities as string[]] : [];
  if (raw.created !== undefined && typeof raw.created !== "number") fail("invalid-payload", "Bundle created must be a number");
  assertSections(pub);
  assertAgentPromptReferences(pub);
  return {
    ...(raw as object),
    schema: ACB_SCHEMA_ID,
    v: ACB_VERSION,
    created: typeof raw.created === "number" ? raw.created : 0,
    trust: trust as AcbTrustMode,
    capabilities,
    payload,
    pub,
  } as AcbBundle;
}

/**
 * 每个 section 必须是数组，条目必须带规范要求的字符串 id/键。
 * 不认识的字段一律保留（规范要求导入方忽略而不是拒绝），但已知字段的类型必须对。
 */
function assertSections(pub: AcbPublic): void {
  for (const name of ACB_KNOWN_CAPABILITIES) {
    if (name === "resources") continue;
    const section = (pub as Record<string, unknown>)[name];
    if (section !== undefined && !Array.isArray(section)) fail("invalid-payload", `pub.${name} must be an array`);
  }
  const requireId = (name: string, items: unknown, key: string) => {
    if (!Array.isArray(items)) return;
    for (const item of items) {
      if (!isRecord(item) || typeof item[key] !== "string" || !item[key]) {
        fail("invalid-payload", `pub.${name} entries need a non-empty ${key}`);
      }
    }
  };
  requireId("models", pub.models, "id");
  requireId("skills", pub.skills, "id");
  requireId("prompts", pub.prompts, "id");
  requireId("agents", pub.agents, "id");
  requireId("mcp", pub.mcp, "name");
  if (pub.models !== undefined) {
    for (const entry of pub.models) {
      if (typeof entry.provider !== "string" || !entry.provider) fail("invalid-payload", "pub.models entries need a non-empty provider");
    }
  }
  if (pub.resources !== undefined && !Array.isArray(pub.resources)) fail("invalid-payload", "pub.resources must be an array");
  if (Array.isArray(pub.resources)) {
    for (const entry of pub.resources) {
      if (!isRecord(entry) || typeof entry.uri !== "string" || !entry.uri) fail("invalid-payload", "pub.resources entries need a non-empty uri");
    }
  }
}

/**
 * Draft v1.5 §5.5：`agents[].promptId` 必须指向 `pub.prompts` 里的某个 id。
 * 是"包本身不合法"而不是"导入时跳过"，所以这里直接判无效。
 */
function assertAgentPromptReferences(pub: AcbPublic): void {
  const promptIds = new Set((pub.prompts ?? []).map((prompt) => prompt.id));
  for (const agent of pub.agents ?? []) {
    if (agent.promptId !== undefined && !promptIds.has(agent.promptId)) {
      fail("invalid-payload", `agent "${agent.id}" promptId "${agent.promptId}" does not match an entry in prompts`);
    }
  }
}

function parsePayload(raw: Record<string, unknown>): AcbPayload {
  if (raw.alg === "none") {
    if (typeof raw.ct !== "string") fail("invalid-payload", "Plain payload is missing ct");
    // 规范要求在使用前校验 base64，而不是等到 JSON.parse 才炸。
    if (!BASE64_PATTERN.test(raw.ct)) fail("invalid-base64", "payload.ct is not canonical base64");
    return raw as unknown as AcbPayload;
  }
  if (raw.alg === "PBKDF2-SHA256-AES-256-GCM") {
    const iterations = raw.iterations;
    if (typeof iterations !== "number" || !Number.isInteger(iterations)
      || iterations < ACB_PBKDF2_MIN_ITERATIONS || iterations > ACB_PBKDF2_MAX_ITERATIONS) {
      fail("invalid-iterations", `PBKDF2 iterations out of range: ${String(iterations)}`);
    }
    for (const field of ["salt", "iv", "ct"] as const) {
      if (typeof raw[field] !== "string") fail("invalid-payload", `Encrypted payload is missing ${field}`);
    }
    return raw as unknown as AcbPayload;
  }
  return fail("unsupported-algorithm", `Unsupported payload algorithm: ${String(raw.alg)}`);
}

/** 解出 secret 段；`none` 直接解 base64，加密载荷用密码解密。 */
export async function revealSecret(bundle: AcbBundle, password?: string): Promise<AcbSecret> {
  if (bundle.payload.alg === "none") {
    const secret = JSON.parse(fromUtf8(base64ToBytes(bundle.payload.ct, "payload.ct")));
    return validateSecret(secret);
  }
  if (!password) fail("wrong-password", "A password is required for this bundle");
  const { iterations, salt, iv, ct } = bundle.payload;
  const saltBytes = toBufferSource(base64ToBytes(salt, "payload.salt"));
  const ivBytes = toBufferSource(base64ToBytes(iv, "payload.iv"));
  const cipherBytes = toBufferSource(base64ToBytes(ct, "payload.ct"));
  if (saltBytes.byteLength !== 16) fail("invalid-payload", "payload.salt must be 16 bytes");
  if (ivBytes.byteLength !== 12) fail("invalid-payload", "payload.iv must be 12 bytes");
  if (cipherBytes.byteLength < 16) fail("invalid-payload", "payload.ct is shorter than the GCM tag");
  const keyMaterial = await crypto.subtle.importKey("raw", utf8(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: toBufferSource(saltBytes), iterations },
    keyMaterial,
    256,
  );
  const key = await crypto.subtle.importKey("raw", bits, "AES-GCM", false, ["decrypt"]);
  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ivBytes, tagLength: 128 }, key, cipherBytes);
  } catch {
    return fail("wrong-password", "Wrong password or tampered payload");
  }
  return validateSecret(JSON.parse(fromUtf8(new Uint8Array(plain))));
}

function validateSecret(raw: unknown): AcbSecret {
  if (!isRecord(raw)) fail("invalid-secret", "Secret section must be an object");
  const secret = raw as AcbSecret;
  if (secret.secrets !== undefined && !isRecord(secret.secrets)) fail("invalid-secret", "secrets must be an object");
  if (secret.customPrompts !== undefined && !isRecord(secret.customPrompts)) {
    fail("invalid-secret", "customPrompts must be an object");
  }
  return secret;
}

/** 信任模式与凭据的一致性检查（规范 §7.4 / §7.5）。 */
export function assertTrust(bundle: AcbBundle, secret?: AcbSecret): void {
  const hasSecrets = !!secret && Object.keys(secret.secrets ?? {}).length > 0;
  if (!hasSecrets) return;
  if (bundle.trust === "shared") {
    fail("trust-violation", "A shared bundle must not carry credentials");
  }
  if (bundle.payload.alg === "none") {
    fail("trust-violation", "Credentials require a password-encrypted payload");
  }
}

export type SecretTotals = {
  readonly providers: number;
  readonly credentials: number;
  readonly promptBodies: number;
  readonly endpoints: number;
};

export function countSecrets(secret: AcbSecret | undefined): SecretTotals {
  const providers = Object.keys(secret?.secrets ?? {});
  let credentials = 0;
  for (const name of providers) {
    const entry: AcbProviderSecret = secret?.secrets?.[name] ?? {};
    if (entry.apiKey) credentials += 1;
    credentials += Object.keys(entry.env ?? {}).length;
    credentials += Object.keys(entry.headers ?? {}).length;
    if (entry.oauth) credentials += 1;
  }
  return {
    providers: providers.length,
    credentials,
    promptBodies: Object.keys(secret?.customPrompts ?? {}).length,
    endpoints: Object.keys(secret?.endpoints ?? {}).length,
  };
}

/** `agentconfig://import?v=1&bundle=<base64url>` */
export function bundleToDeepLink(bundle: AcbBundle): string {
  const json = JSON.stringify(bundle);
  if (utf8(json).byteLength > ACB_MAX_BUNDLE_BYTES) fail("too-large", "Bundle exceeds 1,000,000 bytes");
  const encoded = bytesToBase64Url(utf8(json));
  if (encoded.length > ACB_DEEP_LINK_MAX_CHARS) {
    fail("too-large", "Bundle is too large for a deep link; use an .acfg file");
  }
  return `${ACB_DEEP_LINK_SCHEME}://import?v=1&bundle=${encoded}`;
}

export function extractBundleFromDeepLink(link: string): AcbBundle {
  const trimmed = link.trim();
  if (!trimmed.toLowerCase().startsWith(`${ACB_DEEP_LINK_SCHEME}://`)) {
    fail("invalid-deep-link", "Not an agentconfig link");
  }
  const url = new URL(trimmed);
  if (url.host !== "import") fail("invalid-deep-link", "Only agentconfig://import is supported");
  const version = url.searchParams.get("v");
  if (version !== "1") fail("invalid-deep-link", `Unsupported deep link version: ${String(version)}`);
  const encoded = url.searchParams.get("bundle");
  if (!encoded) fail("invalid-deep-link", "Deep link has no bundle");
  if (encoded.length > ACB_DEEP_LINK_MAX_CHARS) fail("too-large", "Deep link payload exceeds 20,000 characters");
  const bytes = base64UrlToBytes(encoded);
  if (bytes.byteLength > ACB_MAX_BUNDLE_BYTES) fail("too-large", "Bundle exceeds 1,000,000 bytes");
  return parseBundle(JSON.parse(fromUtf8(bytes)));
}

/** 读取一份 bundle 文本（.acfg 文件内容或 JSON 字符串）。 */
export function parseBundleText(text: string): AcbBundle {
  const trimmed = text.trim();
  if (!trimmed) fail("not-a-bundle", "Empty bundle");
  if (trimmed.toLowerCase().startsWith(`${ACB_DEEP_LINK_SCHEME}://`)) return extractBundleFromDeepLink(trimmed);
  if (utf8(trimmed).byteLength > ACB_MAX_BUNDLE_BYTES) fail("too-large", "Bundle exceeds 1,000,000 bytes");
  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch {
    return fail("not-a-bundle", "Bundle is not valid JSON");
  }
  return parseBundle(raw);
}

/** 组装一个可供分享的 bundle；shared 模式永远不会写入 secrets。 */
export async function buildBundle(input: {
  trust?: AcbTrustMode;
  label?: string;
  hint?: string;
  src?: string;
  pub: AcbPublic;
  secret?: AcbSecret;
  password?: string;
  iterations?: number;
  now?: number;
}): Promise<AcbBundle> {
  const trust = input.trust ?? "shared";
  const secret = input.secret;
  const hasSecrets = !!secret && Object.keys(secret.secrets ?? {}).length > 0;
  if (trust === "shared" && hasSecrets) fail("trust-violation", "A shared bundle must not carry credentials");
  if (hasSecrets && !input.password) fail("trust-violation", "Credentials require a password");
  const exists = (key: keyof AcbPublic) => (input.pub[key]?.length ?? 0) > 0;
  const capabilities = [
    ...ACB_KNOWN_CAPABILITIES.filter((name) => exists(name as keyof AcbPublic)),
    ...Object.keys(input.pub).filter((key) => !ACB_KNOWN_CAPABILITIES.includes(key as never)),
  ];
  return {
    schema: ACB_SCHEMA_ID,
    v: ACB_VERSION,
    created: input.now ?? Date.now(),
    ...(input.label ? { label: input.label.slice(0, 80) } : {}),
    ...(input.src ? { src: input.src.slice(0, 32) } : {}),
    trust,
    capabilities,
    ...(input.hint ? { hint: input.hint.slice(0, 80) } : {}),
    payload: await sealPayload(input.pub, secret, input.password, input.iterations),
    pub: input.pub,
  };
}

async function sealPayload(
  pub: AcbPublic,
  secret: AcbSecret | undefined,
  password: string | undefined,
  iterations = ACB_PBKDF2_MIN_ITERATIONS,
): Promise<AcbPayload> {
  void pub;
  const plaintext = JSON.stringify(normalizeSecret(secret));
  if (!password) return { alg: "none", ct: bytesToBase64(utf8(plaintext)) };
  if (!Number.isInteger(iterations) || iterations < ACB_PBKDF2_MIN_ITERATIONS || iterations > ACB_PBKDF2_MAX_ITERATIONS) {
    fail("invalid-iterations", `PBKDF2 iterations out of range: ${String(iterations)}`);
  }
  const salt = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16)));
  const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)));
  const keyMaterial = await crypto.subtle.importKey("raw", utf8(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: toBufferSource(salt), iterations },
    keyMaterial,
    256,
  );
  const key = await crypto.subtle.importKey("raw", bits, "AES-GCM", false, ["encrypt"]);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, tagLength: 128 }, key, utf8(plaintext)));
  return {
    alg: "PBKDF2-SHA256-AES-256-GCM",
    iterations,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ct: bytesToBase64(cipher),
  };
}

function normalizeSecret(secret: AcbSecret | undefined): AcbSecret {
  return {
    endpoints: secret?.endpoints ?? {},
    customPrompts: secret?.customPrompts ?? {},
    providerHints: secret?.providerHints ?? [],
    secrets: secret?.secrets ?? {},
  };
}

export type { AcbBundle, AcbBundleInput };