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
    } else if (candidate.error && typeof candidate.error === "object" && typeof (candidate.error as Record<string, unknown>).message === "string") {
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
  if (normalized.includes("durable parent address") || normalized.includes("owned by subagent routing")
    || normalized.includes("subagent does not belong") || normalized.includes("subagent mode does not match")) {
    return t("errors.subagentAddress");
  }
  if (normalized.includes("subagent parent session is unavailable") || /parent session .* is not live/.test(normalized)) return t("subagents.parentUnavailable");
  if (normalized.includes("官方 dsh 已停止")) return t("errors.runtimeConnection");
  if (normalized.includes("weknora_disabled") || normalized.includes("weknora tool_disabled")) return t("errors.weknoraDisabled");
  if (normalized.includes("weknora_credential_missing")) return t("errors.weknoraCredentialMissing");
  const browserSkillMessage = browserSkillErrorMessage(raw, t);
  if (browserSkillMessage) return browserSkillMessage;
  if (normalized.includes("enoent") || normalized.includes("no such file or directory")) {
    const file = extractMissingPath(raw);
    return file ? t("errors.fileNotFound", { path: file }) : t("errors.fileNotFoundNoPath");
  }
  if (normalized.includes("workspace_unsafe") || normalized.includes("windows acl temp root")
    || normalized.includes("aclsandbox private temp directory")) return t("errors.workspaceUnsafe");
  if (normalized.includes("workspace_unavailable")) return t("errors.workspaceUnavailable");
  if (normalized.includes("glob search failed") || normalized.includes("io error for operation on")) return t("errors.searchIncomplete");
  if (normalized.includes("dsh_connection_lost")
    || (normalized.includes("desktop:dsh-request")
      && /fetch failed|failed to fetch|networkerror/.test(normalized))) {
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
    (/api[_\s-]?key/i.test(normalized) && /invalid|incorrect|expire|unauthorized/i.test(normalized)) ||
    (/token/i.test(normalized) && /invalid|incorrect|expire|unauthorized/i.test(normalized));

  if (isAuthFailure) {
    return t("errors.authFailed");
  }

  if (
    normalized.includes("no api key") ||
    normalized.includes("no api_key") ||
    normalized.includes("missing api key") ||
    normalized.includes("api_key is required") ||
    normalized.includes("credentials service") ||
    (normalized.includes("not configured") && /api|key|credential/i.test(normalized))
  ) {
    return t("errors.noApiKey");
  }

  if (normalized.includes("does not support reasoning effort") || normalized.includes("reasoning effort")) {
    return t("errors.reasoningEffortUnsupported");
  }
  if (normalized.includes("timeout") || normalized.includes("timed out") || normalized.includes("etimedout") || normalized.includes("请求超时") || normalized.includes("响应超时")) {
    return t("errors.requestTimeout");
  }
  if (normalized.includes("agent preset is fixed") || normalized.includes("has already started")) {
    return t("errors.presetFixed");
  }
  if (normalized.includes("needs the browse capability") || normalized.includes("browse capability")) {
    return t("errors.browseCapabilityNeeded");
  }
  if (normalized.includes("not configured") && normalized.includes("api")) {
    return t("errors.credentialNotConfigured");
  }
  return raw || t("errors.generalError");
}
