import { describe, expect, it } from "vitest";

import { turnEndFailure } from "./session-health";
import { classifyAuthFailure, errorText, userFacingError } from "./user-error";

// 现场：内置网关密钥完全正常，但外部知识库（WeKnora）返回 401，
// 界面却显示「XG GOModel 的 API 密钥认证失败或已失效」，把人指去重设一个
// 没问题的凭据。这里锁定「401 归属」的判定规则。
describe("auth failure attribution (#362)", () => {
  it("treats DSH's structured AUTH code as a model-route failure", () => {
    expect(classifyAuthFailure("pi-ai stream error", "AUTH")).toBe("provider");
    expect(classifyAuthFailure("anything", "auth")).toBe("provider");
  });

  it("recognizes model route text without the code", () => {
    expect(classifyAuthFailure("http://gw/v1/chat/completions answered 401; check the API key")).toBe("provider");
    expect(classifyAuthFailure('llm-pi-ai: no credential for provider route "xg-gomodel"')).toBe("provider");
    expect(classifyAuthFailure("llm-deepseek: no API key for provider route \"deepseek-official\"")).toBe("provider");
    expect(classifyAuthFailure("MISSING_CREDENTIAL")).toBe("provider");
  });

  it("never blames the model credential for a knowledge base 401", () => {
    expect(classifyAuthFailure("WeKnora HTTP 401")).toBe("weknora");
    expect(classifyAuthFailure("weknora list_knowledge_bases failed: unauthorized")).toBe("weknora");
  });

  it("treats other third-party 401s as service failures", () => {
    expect(classifyAuthFailure("CNB API returned 401")).toBe("service");
    expect(classifyAuthFailure("HTTP 403 for https://example.invalid/api")).toBe("service");
  });

  it("returns nothing for unrelated errors", () => {
    expect(classifyAuthFailure("ENOENT: no such file or directory")).toBeUndefined();
    expect(classifyAuthFailure("")).toBeUndefined();
    expect(classifyAuthFailure("timeout after 30s")).toBeUndefined();
  });

  it("maps each kind to its own business wording", () => {
    // WeKnora / 外部服务必须给出各自的可执行建议，而不是「模型密钥失效」。
    expect(userFacingError("WeKnora HTTP 401")).toContain("外部知识库");
    expect(userFacingError("CNB API returned 401")).toContain("外部服务");
    expect(userFacingError("answered 401; check the API key")).toContain("API 密钥");
  });

  it("surfaces the raw text used for attribution", () => {
    expect(errorText(new Error("WeKnora HTTP 401"))).toBe("WeKnora HTTP 401");
    expect(errorText({ error: { message: "HTTP 403" } })).toBe("HTTP 403");
  });
});

describe("turn/end failure keeps the structured code", () => {
  it("reads message and code from the DSH turn end reason", () => {
    expect(turnEndFailure({
      type: "turn/end",
      data: { reason: { kind: "error", error: { message: "pi-ai stream error", code: "AUTH" } } },
    })).toEqual({ message: "pi-ai stream error", code: "AUTH" });
  });

  it("works for plain string reasons and success turns", () => {
    expect(turnEndFailure({ type: "turn/end", data: { reason: { kind: "error", error: "boom" } } })).toEqual({ message: "boom" });
    expect(turnEndFailure({ type: "turn/end", data: { reason: { kind: "stop" } } })).toBeUndefined();
    expect(turnEndFailure({ type: "message", data: {} })).toBeUndefined();
  });

  it("classifies a knowledge tool failure as a tool error, not a provider error", () => {
    const failure = turnEndFailure({
      type: "turn/end",
      data: { reason: { kind: "error", error: { message: "WeKnora HTTP 401", code: "UNKNOWN" } } },
    });
    expect(failure).toBeDefined();
    expect(classifyAuthFailure(failure!.message, failure!.code)).toBe("weknora");
  });
});