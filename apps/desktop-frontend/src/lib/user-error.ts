export function userFacingError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const normalized = raw.toLowerCase();

  if (normalized.includes("no api key") || normalized.includes("api_key") || normalized.includes("credentials service")) {
    return "当前模型尚未配置 API Key，请前往“管理 > 设置与凭据”保存对应凭据。";
  }
  if (normalized.includes("does not support reasoning effort") || normalized.includes("reasoning effort")) {
    return "当前模型不支持所选推理强度，已改用默认设置，请重试。";
  }
  if (normalized.includes("agent preset is fixed") || normalized.includes("has already started")) {
    return "当前会话已启动，Agent 预设已锁定，请新建会话后再应用其他预设。";
  }
  if (normalized.includes("not configured") && normalized.includes("api")) {
    return "当前模型凭据未配置，请前往“管理 > 设置与凭据”完成设置。";
  }
  return raw || "操作未完成，请稍后重试。";
}
