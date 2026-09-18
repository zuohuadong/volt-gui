import { describe, expect, it } from "vitest";
import { isCredentialSettingsError, shouldOfferCredentialSettingsAction, userFacingError } from "./user-error";
import { setLocale, t } from "./i18n";

describe("userFacingError", () => {
  it("maps provider credential failures without exposing runtime details", () => {
    setLocale("zh-CN");
    expect(userFacingError(new Error("llm-deepseek: no API key for provider route 'deepseek-official'")))
      .toContain("管理 > 设置与凭据");
    expect(userFacingError(new Error("llm-deepseek: no API key for provider route 'deepseek-official'")))
      .not.toContain("deepseek-official");
  });

  it("maps 401 authentication failed error to localized friendly message", () => {
    setLocale("zh-CN");
    const raw401 = '401: {"code":null,"message":"authentication failed","param":null,"type":"authentication_error"}';
    const translatedZh = userFacingError(raw401);
    expect(translatedZh).toContain("认证失败");
    expect(translatedZh).toContain("管理 > 设置与凭据");
    expect(translatedZh).not.toContain("authentication_error");
    expect(translatedZh).not.toContain('"code":null');

    // Object-wrapped or escaped error payload
    expect(userFacingError({ message: '401: {"code":null,"message":"authentication failed","param":null,"type":"authentication\\_error"}' }))
      .toContain("认证失败");
    expect(userFacingError(new Error("401 Unauthorized: invalid_api_key")))
      .toContain("认证失败");

    setLocale("en-US");
    const translatedEn = userFacingError(raw401);
    expect(translatedEn).toContain("authentication failed");
    expect(translatedEn).toContain("Management > Settings & Credentials");
    expect(translatedEn).not.toContain("authentication_error");
  });

  it("maps invalid api key errors including provider variations", () => {
    setLocale("zh-CN");
    expect(userFacingError("Authentication Fails, Your api key: ****umAA is invalid"))
      .toContain("认证失败或已失效（401）");
    expect(userFacingError(new Error("Your API key is invalid")))
      .toContain("认证失败或已失效（401）");
    expect(userFacingError({ error: { message: "Invalid API Key provided" } }))
      .toContain("认证失败或已失效（401）");

    setLocale("en-US");
    expect(userFacingError("Authentication Fails, Your api key: ****umAA is invalid"))
      .toContain("authentication failed or expired (401)");
  });

  it("maps locked preset and unsupported reasoning errors", () => {
    setLocale("zh-CN");
    expect(userFacingError("session \"session-1\" has already started; its agent preset is fixed"))
      .toContain("Agent 预设已锁定");
    expect(userFacingError("provider x model vlm does not support reasoning effort high"))
      .toContain("不支持所选推理强度");
    expect(userFacingError("needs the browse capability to explore directories"))
      .toContain("未授予目录浏览权限");
  });

  it("maps request timeouts to a retryable localized message", () => {
    setLocale("zh-CN");
    expect(userFacingError("Request timed out")).toBe("服务响应超时，请重试。");
    setLocale("en-US");
    expect(userFacingError("ETIMEDOUT while waiting for response")).toBe("The service took too long to respond. Please try again.");
  });

  it("returns localized error messages in English when en-US is active", () => {
    setLocale("en-US");
    expect(userFacingError(new Error("no API key")))
      .toContain("Settings & Credentials");
    expect(userFacingError("agent preset is fixed"))
      .toContain("preset is locked");
  });

  it("classifies localized credential errors without hardcoded language fragments", () => {
    setLocale("zh-CN");
    expect(isCredentialSettingsError(userFacingError("no API key"))).toBe(true);
    expect(isCredentialSettingsError(userFacingError("401 Unauthorized"))).toBe(true);
    expect(isCredentialSettingsError(t("models.missingApiKeyRuntime", { credentialRef: "XG_GOMODEL_API_KEY" }))).toBe(true);
    expect(isCredentialSettingsError(t("models.requireKeyNotice", { ref: "XG_GOMODEL_API_KEY" }))).toBe(true);
    expect(isCredentialSettingsError(t("errors.providerAuthFailed", { provider: "DeepSeek" }))).toBe(true);
    expect(isCredentialSettingsError(t("errors.requestTimeout"))).toBe(false);

    setLocale("en-US");
    expect(isCredentialSettingsError(userFacingError("no API key"))).toBe(true);
    expect(isCredentialSettingsError(userFacingError("authentication failed"))).toBe(true);
    expect(isCredentialSettingsError(t("models.missingApiKeyRuntime", { credentialRef: "XG_GOMODEL_API_KEY" }))).toBe(true);
    expect(isCredentialSettingsError(t("models.requireKeyNotice", { ref: "XG_GOMODEL_API_KEY" }))).toBe(true);
    expect(isCredentialSettingsError(t("errors.providerAuthFailed", { provider: "DeepSeek" }))).toBe(true);
    expect(isCredentialSettingsError(t("errors.requestTimeout"))).toBe(false);
    expect(isCredentialSettingsError("random failure")).toBe(false);
  });

  it("offers a credential-settings action outside the settings tab", () => {
    setLocale("zh-CN");
    const notice = t("models.requireKeyNotice", { ref: "XG_GOMODEL_API_KEY" });
    expect(shouldOfferCredentialSettingsAction(notice, "models")).toBe(true);
    expect(shouldOfferCredentialSettingsAction(notice, "mcp")).toBe(true);
    expect(shouldOfferCredentialSettingsAction(notice, "settings")).toBe(false);
    expect(shouldOfferCredentialSettingsAction(t("errors.requestTimeout"), "models")).toBe(false);

    setLocale("en-US");
    const authFailed = userFacingError("401 Unauthorized");
    expect(shouldOfferCredentialSettingsAction(authFailed, "overview")).toBe(true);
    expect(shouldOfferCredentialSettingsAction(authFailed, "settings")).toBe(false);
  });

  it("maps desktop runtime and IPC failures without leaking Chinese internals", () => {
    setLocale("en-US");
    expect(userFacingError("官方 DSH 尚未启动")).toBe(t("errors.dshNotStarted"));
    expect(userFacingError("官方 DSH 已停止：code=1 signal=null")).toBe(t("errors.dshStopped"));
    expect(userFacingError("不允许的 DSH 方法：settings.mutate")).toBe(t("errors.dshMethodDenied"));
    expect(userFacingError("拒绝来自非受信任前端入口的桌面 IPC 请求")).toBe(t("errors.untrustedIpc"));
    expect(userFacingError("DSH 请求参数不能包含循环引用")).toBe(t("errors.circularRpcPayload"));
    expect(userFacingError("DSH 请求失败")).toBe(t("errors.dshRequestFailed"));

    setLocale("zh-CN");
    expect(userFacingError("Official DSH has not started")).toBe(t("errors.dshNotStarted"));
    expect(userFacingError("The DSH request failed")).toBe(t("errors.dshRequestFailed"));
  });

  it("maps stable desktop error codes without leaking Chinese internals", () => {
    setLocale("en-US");
    expect(userFacingError("VOLT_DSH_NOT_STARTED: 官方 DSH 尚未启动")).toBe(t("errors.dshNotStarted"));
    expect(userFacingError("VOLT_DSH_STARTUP_FAILED: Official DSH exited before startup: code=1 signal=null")).toBe(t("errors.dshStartupFailed"));
    expect(userFacingError("VOLT_BUNDLED_CREDENTIAL_OVERRIDDEN: 内置模型凭据被启动环境覆盖")).toBe(t("errors.bundledCredentialOverride"));
    expect(userFacingError("VOLT_UNTRUSTED_IPC")).toBe(t("errors.untrustedIpc"));
    expect(userFacingError("VOLT_SESSION_ID_INVALID: 会话 ID 无效")).toBe(t("errors.invalidSessionId"));
    expect(userFacingError("VOLT_DSH_REQUEST_FAILED: DSH 业务响应失败")).toBe(t("errors.dshRequestFailed"));
    expect(isCredentialSettingsError(userFacingError("VOLT_BUNDLED_CREDENTIAL_OVERRIDDEN"))).toBe(true);
  });

  it("maps English official DSH startup failures for the Chinese UI", () => {
    setLocale("zh-CN");
    expect(userFacingError("Official DSH did not publish its loopback URL within 180000ms.")).toBe(t("errors.dshStartupFailed"));
    expect(userFacingError("Official DSH launcher is missing: /tmp/dsh")).toBe(t("errors.dshStartupFailed"));
  });

  it("normalizes Electron runtime errors before displaying them", async () => {
    const source = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../App.svelte", import.meta.url), "utf8"));
    expect(source).toContain("applyRuntimeConnectionError(message)");
    expect(source).toContain("applyRuntimeConnectionError(info.startupError");
    expect(source).toContain("surfaceNotice = userFacingError(message)");
    expect(source).not.toMatch(/onRuntimeError\(\(message\) => \{\s*runtimeConnectionError = message;/);
  });

  it("localizes permission and generated-surface failures before display", async () => {
    const permission = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../components/PermissionSelector.svelte", import.meta.url), "utf8"));
    const surface = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../components/GeneratedSurface.svelte", import.meta.url), "utf8"));
    expect(permission).toContain("userFacingError(error)");
    expect(permission).not.toMatch(/error instanceof Error \? error\.message/);
    expect(surface).toContain("userFacingError(error.error)");
    expect(surface).not.toMatch(/onError\?\(error\.error\.message\)/);
  });
});
