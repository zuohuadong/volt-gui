import { describe, expect, it } from "vitest";
import { userFacingError } from "./user-error";
import { setLocale } from "./i18n";

describe("userFacingError", () => {
  it.each(["Subagent Sessions require their durable parent address.",
    'Error invoking desktop:dsh-request: session "secret-id" is owned by subagent routing'])(
    "explains child ownership without internal identifiers: %s", (raw) => {
      setLocale("zh-CN");
      const message = userFacingError(raw);
      expect(message).toContain("所属主会话");
      expect(message).not.toMatch(/secret-id|desktop:dsh-request|routing/);
    });
  it("redacts stopped-runtime and unavailable-parent implementation details", () => {
    setLocale("zh-CN");
    expect(userFacingError("官方 DSH 已停止：code=1 signal=null")).not.toMatch(/code|signal|DSH/);
    expect(userFacingError('parent session "internal-parent-id" is not live')).not.toContain("internal-parent-id");
  });
  it("explains unsafe workspaces and partial searches without exposing local paths", () => {
    setLocale("zh-CN");
    expect(userFacingError("Windows ACL temp root must be outside the workspace: workspace=C:\\Users\\demo")).toContain("具体项目文件夹");
    expect(userFacingError("[WORKSPACE_UNAVAILABLE] internal")).toContain("不存在或无法访问");
    expect(userFacingError("glob search failed (exit 2): IO error for operation on secret")).toContain("可能不完整");
    expect(userFacingError("glob search failed (exit 2): secret")).not.toContain("secret");
    setLocale("en-US");
    expect(userFacingError("[WORKSPACE_UNSAFE]")).toContain("specific project folder");
  });
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
      .toContain("智能体预设已锁定");
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
  it("maps renderer fetch failures to a retryable runtime message", () => {
    setLocale("zh-CN");
    expect(userFacingError("Error invoking remote method 'desktop:dsh-request': TypeError: fetch failed"))
      .toBe("无法连接到桌面运行服务，请重试；如果问题持续，请重启应用。");
    expect(userFacingError(new Error("[DSH_CONNECTION_LOST] internal")))
      .toBe("无法连接到桌面运行服务，请重试；如果问题持续，请重启应用。");
    expect(userFacingError("llm-provider: fetch failed")).toBe("llm-provider: fetch failed");
  });

  it("explains disabled knowledge retrieval and missing documents with the requested path", () => {
    setLocale("zh-CN");
    expect(userFacingError("Error: WEKNORA_DISABLED")).toContain("知识库检索服务未启用");
    expect(userFacingError("WEKNORA_DISABLED")).not.toContain("WEKNORA");
    const missing = userFacingError("ENOENT: no such file or directory, realpath 'D:\\27852\\Anyong Workspace\\FA-26-00491 委托单.pdf'");
    expect(missing).toContain("找不到文件");
    expect(missing).toContain("FA-26-00491 委托单.pdf");
    expect(userFacingError("no such file or directory, open '/tmp/missing.pdf'")).toContain("/tmp/missing.pdf");
    setLocale("en-US");
    expect(userFacingError("WEKNORA_DISABLED")).toContain("Knowledge base retrieval is not enabled");
    expect(userFacingError("ENOENT: no such file or directory, open '/tmp/missing.pdf'")).toContain("File not found");
  });

  it("returns localized error messages in English when en-US is active", () => {
    setLocale("en-US");
    expect(userFacingError(new Error("no API key")))
      .toContain("Settings & Credentials");
    expect(userFacingError("agent preset is fixed"))
      .toContain("preset is locked");
  });
});
