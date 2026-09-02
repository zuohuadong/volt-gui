import { t } from "./i18n";

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
