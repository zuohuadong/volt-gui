import { t } from "./i18n";

export function userFacingError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const normalized = raw.toLowerCase();

  if (normalized.includes("no api key") || normalized.includes("api_key") || normalized.includes("credentials service")) {
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
