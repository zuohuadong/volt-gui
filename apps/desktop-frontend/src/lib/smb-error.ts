import { t } from "./i18n";

const SMB_ERROR_KEYS: Record<string, string> = {
  VOLT_SMB_INVALID_ID: "smb.invalidId",
  VOLT_SMB_INVALID_DRIVE: "smb.invalidDrive",
  VOLT_SMB_INVALID_UNC: "smb.invalidUnc",
  VOLT_SMB_INVALID_REQUEST: "smb.operationFailed",
  VOLT_SMB_MISSING: "smb.missingConfig",
  VOLT_SMB_NOT_MOUNTED: "smb.notMounted",
  VOLT_SMB_INVALID_DISPLAY_NAME: "smb.invalidDisplayName",
  VOLT_SMB_UNSUPPORTED_OPEN: "smb.unsupportedOpen",
  VOLT_SMB_OPERATION_FAILED: "smb.operationFailed",
};

export function smbUserFacingError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const text = raw.trim();
  if (!text) return t("smb.operationFailed");
  const code = text.match(/^(VOLT_[A-Z0-9_]+)/u)?.[1];
  const detail = code ? text.slice(code.length).replace(/^:\s*/u, "") : text;
  if (code === "VOLT_SMB_MAPPED_ELSEWHERE") {
    const mapped = detail.match(/^(.+?) 已映射到其他网络路径/) || detail.match(/^(.+?) is already mapped to a different network path/i);
    return t("smb.mappedElsewhere", { path: mapped?.[1] || detail || "?" });
  }
  if (code && SMB_ERROR_KEYS[code]) return t(SMB_ERROR_KEYS[code]);
  if (text.includes("SMB 配置 ID 无效") || /invalid smb configuration id/i.test(text)) return t("smb.invalidId");
  if (text.includes("本地路径必须是 Windows 盘符") || /must be a windows drive letter/i.test(text)) return t("smb.invalidDrive");
  if (text.includes("远程路径必须是 SMB UNC") || /must be an smb unc path/i.test(text)) return t("smb.invalidUnc");
  if (text.includes("Windows SMB 操作失败") || /windows smb operation failed/i.test(text)) return t("smb.operationFailed");
  const mapped = text.match(/^(.+?) 已映射到其他网络路径/) || text.match(/^(.+?) is already mapped to a different network path/i);
  if (mapped) return t("smb.mappedElsewhere", { path: mapped[1] });
  if (text.includes("SMB 配置不存在") || /smb configuration does not exist/i.test(text)) return t("smb.missingConfig");
  if (text.includes("SMB 共享尚未挂载") || /smb share is not mounted/i.test(text)) return t("smb.notMounted");
  if (text.includes("显示名称不能为空") || /display name is required/i.test(text)) return t("smb.invalidDisplayName");
  if (text.includes("当前平台不支持打开 SMB") || /cannot open an smb drive letter/i.test(text)) return t("smb.unsupportedOpen");
  return text;
}
