import { describe, expect, it } from "vitest";
import { externalImportCancelAction, externalImportDismissAction } from "./external-data-import-ui";

describe("externalImportDismissAction", () => {
  it("keeps the dialog dismissible while an import continues in the background", () => {
    expect(externalImportDismissAction(true)).toEqual({
      enabled: true,
      label: "在后台继续",
      status: "导入仍在后台进行；可先返回资源中心，完成后会刷新结果。",
    });
  });

  it("uses the ordinary cancel action before an import begins", () => {
    expect(externalImportDismissAction(false)).toEqual({
      enabled: true,
      label: "取消",
      status: "不兼容项目不会写入，已有同名技能不会被覆盖。",
    });
  });

  it("offers a real cancel action only while an import is active", () => {
    expect(externalImportCancelAction(true, false)).toEqual({ visible: true, enabled: true, label: "取消导入" });
    expect(externalImportCancelAction(true, true)).toEqual({ visible: true, enabled: false, label: "正在取消…" });
    expect(externalImportCancelAction(false, false)).toEqual({ visible: false, enabled: false, label: "取消导入" });
  });
});
