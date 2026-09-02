import { describe, expect, it } from "vitest";
import { userFacingError } from "./user-error";
import { setLocale } from "./i18n";

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

  it("returns localized error messages in English when en-US is active", () => {
    setLocale("en-US");
    expect(userFacingError(new Error("no API key")))
      .toContain("Settings & Credentials");
    expect(userFacingError("agent preset is fixed"))
      .toContain("preset is locked");
  });
});
