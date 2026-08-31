import { describe, expect, it } from "vitest";
import { userFacingError } from "./user-error";

describe("userFacingError", () => {
  it("maps provider credential failures without exposing runtime details", () => {
    expect(userFacingError(new Error("llm-deepseek: no API key for provider route 'deepseek-official'")))
      .toContain("管理 > 设置与凭据");
    expect(userFacingError(new Error("llm-deepseek: no API key for provider route 'deepseek-official'")))
      .not.toContain("deepseek-official");
  });

  it("maps locked preset and unsupported reasoning errors", () => {
    expect(userFacingError("session \"session-1\" has already started; its agent preset is fixed"))
      .toContain("Agent 预设已锁定");
    expect(userFacingError("provider x model vlm does not support reasoning effort high"))
      .toContain("不支持所选推理强度");
  });
});
