export type ExternalImportDismissAction = {
  enabled: boolean;
  label: string;
  status: string;
};

export type ExternalImportCancelAction = {
  visible: boolean;
  enabled: boolean;
  label: string;
};

export function externalImportDismissAction(loading: boolean): ExternalImportDismissAction {
  if (loading) {
    return {
      enabled: true,
      label: "在后台继续",
      status: "导入仍在后台进行；可先返回资源中心，完成后会刷新结果。",
    };
  }
  return {
    enabled: true,
    label: "取消",
    status: "不兼容项目不会写入，已有同名技能不会被覆盖。",
  };
}

export function externalImportCancelAction(importing: boolean, cancelRequested: boolean): ExternalImportCancelAction {
  if (!importing) return { visible: false, enabled: false, label: "取消导入" };
  if (cancelRequested) return { visible: true, enabled: false, label: "正在取消…" };
  return { visible: true, enabled: true, label: "取消导入" };
}
