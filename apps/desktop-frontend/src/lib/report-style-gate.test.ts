import { describe, expect, it } from "vitest";

import { reportStyleGatePolicy } from "./report-style-gate";

describe("report style gate policy", () => {
  it("allows an approved report to choose another style and explains reapproval", () => {
    expect(reportStyleGatePolicy("approved", false)).toEqual({
      disabled: false,
      message: "修改样式会撤销已有批准，保存后需要重新提交审批。",
    });
  });

  it("locks a submitted report with an actionable reason", () => {
    expect(reportStyleGatePolicy("submitted", false)).toEqual({
      disabled: true,
      message: "样式正在审批中；请先退回草稿，再修改样式。",
    });
  });

  it("only reports saving for transient draft writes", () => {
    expect(reportStyleGatePolicy("draft", true)).toEqual({
      disabled: true,
      message: "正在保存样式…",
    });
    expect(reportStyleGatePolicy("draft", false)).toEqual({ disabled: false, message: "" });
  });
});
