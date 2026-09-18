import { describe, expect, it } from "vitest";
import { smbUserFacingError } from "./smb-error";
import { setLocale, t } from "./i18n";

describe("smbUserFacingError", () => {
  it("maps desktop SMB validation errors to the active locale", () => {
    setLocale("en-US");
    expect(smbUserFacingError("SMB 配置 ID 无效")).toBe(t("smb.invalidId"));
    expect(smbUserFacingError("本地路径必须是 Windows 盘符，例如 Z:")).toBe(t("smb.invalidDrive"));
    expect(smbUserFacingError("Z: 已映射到其他网络路径")).toBe(t("smb.mappedElsewhere", { path: "Z:" }));
    expect(smbUserFacingError("当前平台不支持打开 SMB 盘符")).toBe(t("smb.unsupportedOpen"));

    setLocale("zh-CN");
    expect(smbUserFacingError("Invalid SMB configuration ID")).toBe(t("smb.invalidId"));
    expect(smbUserFacingError("This platform cannot open an SMB drive letter")).toBe(t("smb.unsupportedOpen"));
  });

  it("maps stable SMB error codes", () => {
    setLocale("en-US");
    expect(smbUserFacingError("VOLT_SMB_INVALID_ID: SMB 配置 ID 无效")).toBe(t("smb.invalidId"));
    expect(smbUserFacingError("VOLT_SMB_MAPPED_ELSEWHERE: Z: 已映射到其他网络路径")).toBe(t("smb.mappedElsewhere", { path: "Z:" }));
    expect(smbUserFacingError("VOLT_SMB_UNSUPPORTED_OPEN: 当前平台不支持打开 SMB 盘符")).toBe(t("smb.unsupportedOpen"));
  });
});
