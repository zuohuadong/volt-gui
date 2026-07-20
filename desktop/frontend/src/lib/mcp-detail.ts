export type MCPConnectionTone = "success" | "danger" | "warning" | "neutral";

export interface MCPConnectionPresentation {
  tone: MCPConnectionTone;
  title: string;
  summary: string;
  actionLabel: string;
}

export function mcpStatusLabel(status: string): string {
  switch (status.trim().toLowerCase()) {
    case "connected":
      return "已连接";
    case "deferred":
      return "待连接";
    case "initializing":
      return "连接中";
    case "failed":
      return "连接失败";
    case "disabled":
      return "已停用";
    default:
      return status.trim() || "未知";
  }
}

export function mcpConnectionPresentation(status: string, error = ""): MCPConnectionPresentation {
  const normalizedStatus = status.trim().toLowerCase();
  const missingBundledComputerUse = /module not found/i.test(error) && /computer-use-mcp/i.test(error);

  if (missingBundledComputerUse) {
    return {
      tone: "danger",
      title: "内置组件缺失",
      summary: "Computer Use 运行组件不完整。请使用完整安装包，或重新运行桌面构建后再重试。",
      actionLabel: "重试连接",
    };
  }
  if (normalizedStatus === "connected") {
    return {
      tone: "success",
      title: "连接正常",
      summary: "服务已就绪，工具会按当前权限规则提供给 Agent。",
      actionLabel: "重新连接",
    };
  }
  if (normalizedStatus === "initializing") {
    return {
      tone: "warning",
      title: "正在连接",
      summary: "正在启动服务并读取工具清单，请稍候。",
      actionLabel: "重新连接",
    };
  }
  if (normalizedStatus === "deferred") {
    return {
      tone: "neutral",
      title: "等待首次使用",
      summary: "服务已启用，将在首次调用时自动连接；也可以现在进行一次连接检查。",
      actionLabel: "立即连接",
    };
  }
  if (normalizedStatus === "disabled") {
    return {
      tone: "neutral",
      title: "服务已停用",
      summary: "启用后才会连接服务并读取可用工具。",
      actionLabel: "连接检查",
    };
  }
  return {
    tone: "danger",
    title: "连接失败",
    summary: "服务未能完成启动。请重试；如仍失败，可展开技术详情排查。",
    actionLabel: "重试连接",
  };
}

export function shouldShowMCPTrust(status: string, trustedTools: string[]): boolean {
  return status.trim().toLowerCase() === "connected" || trustedTools.length > 0;
}

export function mcpConfigurationEnabled(status: string): boolean {
  return status.trim().toLowerCase() !== "disabled";
}
