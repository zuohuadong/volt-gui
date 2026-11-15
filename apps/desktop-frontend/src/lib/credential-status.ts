/**
 * 凭据状态展示（issue #305）。
 *
 * 只有随包分发的内置凭据（西谷内网网关）才可以直接显示"已配置"。
 * 其他 Provider 的凭据即使存在，也可能来自环境变量或上次安装残留——
 * 直接显示"已配置"会让人误以为自己配好了，从而在 401 时排错方向全错。
 */
import type { CredentialView } from "./dsh-client";

export const BUNDLED_CREDENTIAL_REFS: ReadonlySet<string> = new Set(["XG_GOMODEL_API_KEY"]);

const BUILTIN_PROVIDERS: ReadonlySet<string> = new Set(["xg-gomodel"]);

export function isBundledCredential(ref: string | undefined, provider?: string): boolean {
  if (ref && BUNDLED_CREDENTIAL_REFS.has(ref)) return true;
  return !!provider && BUILTIN_PROVIDERS.has(provider);
}

// 与 i18n 的 t 签名保持结构化兼容（参数类型更宽时不收窄调用点）。
export type CredentialTranslator = (
  key: string,
  values?: Record<string, string | number>,
) => string;

export function credentialSourceLabel(
  credential: CredentialView | undefined,
  t: CredentialTranslator,
): string {
  const source = credential?.source;
  if (source === "env") return t("settings.sourceEnvironment");
  if (source === "file") return t("settings.sourceFile");
  return source || t("settings.userLayerShort");
}

export function credentialStatusLabel(
  credential: CredentialView | undefined,
  options: { readonly ref?: string; readonly provider?: string },
  t: CredentialTranslator,
): string {
  if (!credential?.configured) return t("settings.notConfigured");
  const source = credentialSourceLabel(credential, t);
  if (isBundledCredential(options.ref, options.provider)) {
    return `${t("settings.configured")} · ${source}`;
  }
  return t("settings.configuredFromSource", { source });
}
