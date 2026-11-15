import { describe, expect, it } from "vitest";
import { credentialStatusLabel, isBundledCredential } from "./credential-status";
import { setLocale, t } from "./i18n";

describe("凭据状态展示", () => {
  it("内置网关凭据才算内置", () => {
    expect(isBundledCredential("XG_GOMODEL_API_KEY")).toBe(true);
    expect(isBundledCredential(undefined, "xg-gomodel")).toBe(true);
    expect(isBundledCredential("DEEPSEEK_API_KEY", "deepseek")).toBe(false);
  });
  it("DeepSeek 官方密钥存在时也标注来源与未验证", () => {
    setLocale("zh-CN");
    const label = credentialStatusLabel({ configured: true, source: "file", writable: true }, { ref: "DEEPSEEK_API_KEY", provider: "deepseek" }, t);
    expect(label).toContain("未验证");
    expect(label).toContain("本地凭据文件");
    expect(label).not.toBe("已配置");
  });
  it("内置网关仍显示已配置", () => {
    setLocale("zh-CN");
    expect(credentialStatusLabel({ configured: true, source: "file", writable: true }, { ref: "XG_GOMODEL_API_KEY" }, t)).toContain("已配置");
  });
  it("未配置时显示未配置", () => {
    setLocale("zh-CN");
    expect(credentialStatusLabel({ configured: false, writable: true }, { ref: "DEEPSEEK_API_KEY" }, t)).toBe("未配置");
  });
});
