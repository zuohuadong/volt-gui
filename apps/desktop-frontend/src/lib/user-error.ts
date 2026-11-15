import { t } from "./i18n";
import { browserSkillErrorMessage } from "./browser-skill-error";

function extractMissingPath(raw: string): string {
  const candidates = [
    /['"`]([^'"`\r\n]+)['"`]/u,
    /(?:enoent[^:\r\n]*:\s*)([^\r\n]+)/iu,
    /(?:no such file or directory,?\s*)(?:open\s+)?['"]?([^'"\r\n]+)/iu,
  ];
  for (const pattern of candidates) {
    const match = raw.match(pattern);
    const value = match?.[1]?.trim();
    if (value && /[\\/]/u.test(value)) return value;
  }
  return "";
}

// 上游把 5xx/4xx 的响应体整段塞进错误信息里（例如
// `503: {"code":null,"message":"circuit breaker is open ...","type":"provider_error"}`）。
// 直接把 JSON 甩给用户既看不懂，也掩盖了真实类型，所以这里先解析再决定文案。
function parseUpstreamError(
  raw: string,
): { status?: number; message: string; type: string } | null {
  const statusMatch = raw.match(/^\s*(\d{3})\s*:\s*([\s\S]*)$/u);
  const body = statusMatch ? statusMatch[2]!.trim() : raw.trim();
  if (!body.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    const nested =
      parsed.error && typeof parsed.error === "object"
        ? (parsed.error as Record<string, unknown>)
        : undefined;
    const message =
      typeof parsed.message === "string"
        ? parsed.message
        : typeof nested?.message === "string"
          ? nested.message
          : "";
    const type = typeof parsed.type === "string" ? parsed.type : "";
    const status = statusMatch ? Number(statusMatch[1]) : undefined;
    if (!message && !type && status === undefined) return null;
    return { ...(status !== undefined ? { status } : {}), message, type };
  } catch {
    return null;
  }
}

const UPSTREAM_MESSAGE_KEYS: Array<[RegExp, string]> = [
  [
    /circuit breaker is open|provider temporarily unavailable/iu,
    "errors.providerUnavailable",
  ],
  [/rate[ _-]?limit|too many requests|429/iu, "errors.rateLimited"],
  [
    /insufficient (?:balance|quota)|quota exceeded|arrearage/iu,
    "errors.insufficientQuota",
  ],
  [
    /(?:model|deployment) .*not (?:found|exist)|no such model/iu,
    "errors.modelUnavailable",
  ],
  [/context length|too many tokens|maximum context/iu, "errors.contextTooLong"],
];

function upstreamProviderName(raw: string): string {
  if (/deepseek/iu.test(raw)) return "DeepSeek";
  if (/gomodel|xg-|西谷/iu.test(raw)) return "西谷内网网关";
  return "";
}

function mappedUpstreamError(raw: string): string | undefined {
  const parsed = parseUpstreamError(raw);
  if (!parsed) return undefined;
  const probe = `${parsed.type} ${parsed.message}`;
  for (const [pattern, key] of UPSTREAM_MESSAGE_KEYS) {
    if (!pattern.test(probe)) continue;
    const provider = upstreamProviderName(raw);
    return provider ? t(key, { provider: `（${provider}）` }) : t(key, { provider: "" });
  }
  return undefined;
}

function looksLikeRawJson(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return false;
  return trimmed.length > 40;
}

export type AuthFailureKind = "provider" | "weknora" | "service";

/**
 * 401/403 到底是谁拒的（#362）。
 *
 * 之前任何 401 都被映射成「模型 API 密钥认证失败」，于是外部知识库（WeKnora）
 * 或其它工具服务返回 401 时，界面上会变成「XG GOModel 的 API 密钥已失效」——
 * 内置密钥其实完全正常，用户被指去重设一个没问题的凭据。
 */
export function classifyAuthFailure(raw: string, code?: string): AuthFailureKind | undefined {
  const text = String(raw ?? "");
  const normalized = text.toLowerCase();
  const authCode = code?.trim().toLowerCase() === "auth";
  const isAuth = authCode
    || /\b(?:401|403)\b/u.test(text)
    || normalized.includes("unauthorized")
    || normalized.includes("invalid_api_key")
    || normalized.includes("authentication failed")
    || normalized.includes("no api key")
    || normalized.includes("no credential for provider route")
    || normalized.includes("missing_credential")
    || normalized.includes("check the api key");
  if (!isAuth) return undefined;
  if (normalized.includes("weknora")) return "weknora";
  // 只有模型路由（pi-ai / deepseek 适配器）的拒绝才算「模型凭据」问题。
  // OpenAI 风格的错误体（authentication_error / invalid_api_key）来自模型路由。
  if (authCode
    || normalized.includes("authentication_error")
    || normalized.includes("invalid_api_key")
    || normalized.includes("incorrect api key")
    || normalized.includes("check the api key")
    || normalized.includes("no api key for provider route")
    || normalized.includes("missing_credential")
    || normalized.includes("llm-pi-ai")
    || normalized.includes("llm-deepseek")
    || normalized.includes("credentials service")
    || normalized.includes("answered 401")
    || normalized.includes("answered 403")) return "provider";
  return "service";
}

/** 把任意错误还原成原始文本（不做本地化映射），供 401 归属判断使用。 */
export function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const candidate = error as Record<string, unknown>;
    if (typeof candidate.message === "string") return candidate.message;
    if (candidate.error && typeof candidate.error === "object"
      && typeof (candidate.error as Record<string, unknown>).message === "string") {
      return (candidate.error as Record<string, unknown>).message as string;
    }
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error ?? "");
}

export function userFacingError(error: unknown): string {
  let raw = "";
  if (error instanceof Error) {
    raw = error.message;
  } else if (typeof error === "string") {
    raw = error;
  } else if (error && typeof error === "object") {
    const candidate = error as Record<string, unknown>;
    if (typeof candidate.message === "string") {
      raw = candidate.message;
    } else if (
      candidate.error &&
      typeof candidate.error === "object" &&
      typeof (candidate.error as Record<string, unknown>).message === "string"
    ) {
      raw = (candidate.error as Record<string, unknown>).message as string;
    } else {
      try {
        raw = JSON.stringify(error);
      } catch {
        raw = String(error);
      }
    }
  } else {
    raw = String(error ?? "");
  }
  const normalized = raw.toLowerCase();
  if (
    normalized.includes("durable parent address") ||
    normalized.includes("owned by subagent routing") ||
    normalized.includes("subagent does not belong") ||
    normalized.includes("subagent mode does not match")
  ) {
    return t("errors.subagentAddress");
  }
  if (
    normalized.includes("subagent parent session is unavailable") ||
    /parent session .* is not live/.test(normalized)
  )
    return t("subagents.parentUnavailable");
  if (normalized.includes("官方 dsh 已停止"))
    return t("errors.runtimeConnection");
  if (
    normalized.includes("weknora_disabled") ||
    normalized.includes("weknora tool_disabled")
  )
    return t("errors.weknoraDisabled");
  if (normalized.includes("weknora_credential_missing"))
    return t("errors.weknoraCredentialMissing");
  const browserSkillMessage = browserSkillErrorMessage(raw, t);
  if (browserSkillMessage) return browserSkillMessage;
  if (
    normalized.includes("enoent") ||
    normalized.includes("no such file or directory")
  ) {
    const file = extractMissingPath(raw);
    return file
      ? t("errors.fileNotFound", { path: file })
      : t("errors.fileNotFoundNoPath");
  }
  if (
    normalized.includes("workspace_unsafe") ||
    normalized.includes("windows acl temp root") ||
    normalized.includes("aclsandbox private temp directory")
  )
    return t("errors.workspaceUnsafe");
  if (normalized.includes("workspace_unavailable"))
    return t("errors.workspaceUnavailable");
  if (
    normalized.includes("unknown or unparseable tool invocation") ||
    normalized.includes("unparseable tool") ||
    normalized.includes("invalid tool invocation") ||
    normalized.includes("tool call could not be parsed")
  )
    return t("errors.toolInvocation");
  if (
    normalized.includes("glob search failed") ||
    normalized.includes("io error for operation on")
  )
    return t("errors.searchIncomplete");
  if (
    normalized.includes("dsh_connection_lost") ||
    (normalized.includes("desktop:dsh-request") &&
      /fetch failed|failed to fetch|networkerror/.test(normalized))
  ) {
    return t("errors.runtimeConnection");
  }

  const isAuthFailure =
    normalized.includes("authentication failed") ||
    normalized.includes("authentication fails") ||
    normalized.includes("authentication failure") ||
    normalized.includes("authentication_error") ||
    normalized.includes("authentication error") ||
    normalized.includes("auth failed") ||
    normalized.includes("auth fails") ||
    normalized.includes("invalid_api_key") ||
    normalized.includes("invalid api key") ||
    normalized.includes("incorrect api key") ||
    normalized.includes("unauthorized") ||
    normalized.includes("401") ||
    (/api[_\s-]?key/i.test(normalized) &&
      /invalid|incorrect|expire|unauthorized/i.test(normalized)) ||
    (/token/i.test(normalized) &&
      /invalid|incorrect|expire|unauthorized/i.test(normalized));

  if (isAuthFailure) {
    switch (classifyAuthFailure(raw)) {
      case "weknora": return t("errors.weknoraAuthFailed");
      case "service": return t("errors.serviceAuthFailed");
      default: return t("errors.authFailed");
    }
  }

  if (
    normalized.includes("no api key") ||
    normalized.includes("no api_key") ||
    normalized.includes("missing api key") ||
    normalized.includes("api_key is required") ||
    normalized.includes("credentials service") ||
    (normalized.includes("not configured") &&
      /api|key|credential/i.test(normalized))
  ) {
    return t("errors.noApiKey");
  }

  if (
    normalized.includes("does not support reasoning effort") ||
    normalized.includes("reasoning effort")
  ) {
    return t("errors.reasoningEffortUnsupported");
  }
  // 熔断 / 限流 / 配额这类上游拒绝，必须先于"超时"判断：
  // 503 circuit breaker 的文案里常带 timeout 字样，误判会让用户以为重试就能好。
  const upstream = mappedUpstreamError(raw);
  if (upstream) return upstream;
  // 结构化上游响应但类型未知：不猜关键字，交给诊断信息。
  if (parseUpstreamError(raw)) return t("errors.upstreamUnreadable");
  if (/dsh-ab-ocr|\bocr\b/iu.test(normalized)) {
    return normalized.includes("timeout") || normalized.includes("timed out")
      ? t("errors.ocrTimeout")
      : t("errors.ocrFailed");
  }
  if (
    normalized.includes("timeout") ||
    normalized.includes("timed out") ||
    normalized.includes("etimedout") ||
    normalized.includes("请求超时") ||
    normalized.includes("响应超时")
  ) {
    return t("errors.requestTimeout");
  }
  if (
    normalized.includes("agent preset is fixed") ||
    normalized.includes("has already started")
  ) {
    return t("errors.presetFixed");
  }
  if (
    normalized.includes("needs the browse capability") ||
    normalized.includes("browse capability")
  ) {
    return t("errors.browseCapabilityNeeded");
  }
  if (normalized.includes("not configured") && normalized.includes("api")) {
    return t("errors.credentialNotConfigured");
  }
  // 长 JSON / 未识别的原始响应不再直接展示给用户；诊断信息里另有原始内容。
  if (looksLikeRawJson(raw)) return t("errors.upstreamUnreadable");
  return raw || t("errors.generalError");
}
