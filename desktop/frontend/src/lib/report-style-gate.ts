export interface ReportStyleGatePolicy {
  disabled: boolean;
  message: string;
}

export function reportStyleGatePolicy(status: string, saving: boolean): ReportStyleGatePolicy {
  if (saving) return { disabled: true, message: "正在保存样式…" };
  if (status === "submitted") {
    return { disabled: true, message: "样式正在审批中；请先退回草稿，再修改样式。" };
  }
  if (status === "approved") {
    return { disabled: false, message: "修改样式会撤销已有批准，保存后需要重新提交审批。" };
  }
  return { disabled: false, message: "" };
}
