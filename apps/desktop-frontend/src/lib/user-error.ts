import { t } from "./i18n";

const DESKTOP_ERROR_KEYS: Record<string, string> = {
  VOLT_UNTRUSTED_IPC: "errors.untrustedIpc",
  VOLT_DSH_NOT_STARTED: "errors.dshNotStarted",
  VOLT_DSH_STOPPED: "errors.dshStopped",
  VOLT_DSH_NOT_AUTHENTICATED: "errors.dshNotStarted",
  VOLT_DSH_AUTH_FAILED: "errors.dshRequestFailed",
  VOLT_DSH_REQUEST_FAILED: "errors.dshRequestFailed",
  VOLT_DSH_RESPONSE_INVALID: "errors.dshRequestFailed",
  VOLT_DSH_METHOD_DENIED: "errors.dshMethodDenied",
  VOLT_DSH_METHOD_UNSUPPORTED: "errors.dshMethodDenied",
  VOLT_DSH_METHOD_INVALID: "errors.dshMethodDenied",
  VOLT_DSH_FOLLOW_REPLACED: "errors.dshRequestFailed",
  VOLT_DSH_FOLLOW_EMPTY: "errors.dshRequestFailed",
  VOLT_DSH_STREAM_EMPTY: "errors.dshRequestFailed",
  VOLT_DSH_STREAM_NOT_READY: "errors.dshRequestFailed",
  VOLT_DSH_EXPORT_FAILED: "errors.dshRequestFailed",
  VOLT_DSH_START_URL_INVALID: "errors.dshStartupFailed",
  VOLT_DSH_STARTUP_FAILED: "errors.dshStartupFailed",
  VOLT_EXTERNAL_URL_INVALID: "errors.invalidExternalUrl",
  VOLT_EXTERNAL_URL_DENIED: "errors.invalidExternalUrl",
  VOLT_SESSION_ID_INVALID: "errors.invalidSessionId",
  VOLT_CREDENTIAL_PROVISION_FAILED: "errors.noApiKey",
  VOLT_BUNDLED_ENDPOINT_INVALID: "errors.dshStartupFailed",
  VOLT_BUNDLED_CREDENTIAL_INVALID: "errors.noApiKey",
  VOLT_BUNDLED_CREDENTIAL_OVERRIDDEN: "errors.bundledCredentialOverride",
};

function extractRawError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const candidate = error as Record<string, unknown>;
    if (typeof candidate.message === "string") return candidate.message;
    if (candidate.error && typeof candidate.error === "object" && typeof (candidate.error as Record<string, unknown>).message === "string") {
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

function desktopErrorKey(raw: string): string | undefined {
  const code = raw.trim().match(/^(VOLT_[A-Z0-9_]+)/u)?.[1];
  return code ? DESKTOP_ERROR_KEYS[code] : undefined;
}

export function userFacingError(error: unknown): string {
  const raw = extractRawError(error);
  const mappedKey = desktopErrorKey(raw);
  if (mappedKey) return t(mappedKey);

  const normalized = raw.toLowerCase();

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
  if (
    normalized.includes("official dsh failed after one automatic retry")
    || normalized.includes("official dsh exited before startup")
    || normalized.includes("did not publish its loopback url")
    || normalized.includes("official dsh launcher is missing")
    || normalized.includes("official dsh profile patch is missing")
    || normalized.includes("official dsh workspace is unavailable")
    || normalized.includes("official dsh home is unavailable")
    || normalized.includes("official dsh is already running")
    || normalized.includes("official dsh settings")
    || normalized.includes("official dsh package version")
    || normalized.includes("内置模型网关地址")
  ) {
    return t("errors.dshStartupFailed");
  }
  if (normalized.includes("could not be stopped") || normalized.includes("官方 dsh 已停止")) {
    return t("errors.dshStopped");
  }
  if (normalized.includes("内置模型凭据被启动环境覆盖") || normalized.includes("bundled model credential is blocked")) {
    return t("errors.bundledCredentialOverride");
  }
  if (normalized.includes("dsh 请求失败") || normalized.includes("the dsh request failed") || normalized.includes("the agent runtime request failed")) {
    return t("errors.dshRequestFailed");
  }
  if (normalized.includes("官方 dsh 尚未启动") || normalized.includes("official dsh has not started") || normalized.includes("the agent runtime has not started")) {
    return t("errors.dshNotStarted");
  }
  if (normalized.includes("官方 dsh 已停止") || normalized.includes("official dsh stopped") || normalized.includes("the agent runtime stopped")) {
    return t("errors.dshStopped");
  }
  if (normalized.includes("不允许的 dsh 方法") || normalized.includes("dsh method is not allowed")) {
    return t("errors.dshMethodDenied");
  }
  if (normalized.includes("非受信任前端") || normalized.includes("untrusted desktop ipc") || normalized.includes("untrusted frontend")) {
    return t("errors.untrustedIpc");
  }
  if (normalized.includes("循环引用") || normalized.includes("circular reference") || normalized.includes("request payload is invalid")) {
    return t("errors.circularRpcPayload");
  }
  if (normalized.includes("仅允许打开不含凭据") || normalized.includes("credential-free http")) {
    return t("errors.invalidExternalUrl");
  }
  return raw || t("errors.generalError");
}

function matchesInterpolatedMessage(text: string, translated: string): boolean {
  const [prefix, suffix] = translated.split("\u0001");
  return Boolean(prefix && text.startsWith(prefix) && (!suffix || text.endsWith(suffix)));
}

export function isCredentialSettingsError(message: string | undefined | null): boolean {
  const text = String(message ?? "").trim();
  if (!text) return false;
  const settingsLabel = t("nav.settings");
  if (settingsLabel && text.includes(settingsLabel)) return true;
  if (matchesInterpolatedMessage(text, t("models.missingApiKeyRuntime", { credentialRef: "\u0001" }))) return true;
  if (matchesInterpolatedMessage(text, t("models.requireKeyNotice", { ref: "\u0001" }))) return true;
  if (matchesInterpolatedMessage(text, t("errors.providerAuthFailed", { provider: "\u0001" }))) return true;
  return (
    text === t("errors.noApiKey") ||
    text === t("errors.authFailed") ||
    text === t("errors.credentialNotConfigured") ||
    text === t("errors.bundledCredentialOverride") ||
    text === t("models.missingProviderKey")
  );
}

export function shouldOfferCredentialSettingsAction(
  message: string | undefined | null,
  currentTab?: string,
): boolean {
  return isCredentialSettingsError(message) && currentTab !== "settings";
}
