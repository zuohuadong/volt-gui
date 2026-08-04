import { describe, expect, test } from "vitest";

import { formatProviderModelFetchError } from "./provider-model-error";

describe("provider model discovery errors", () => {
  test("reports safe actionable categories", () => {
    expect(formatProviderModelFetchError("fetch models: status 401")).toContain("API Key");
    expect(formatProviderModelFetchError("fetch models: request failed: context deadline exceeded")).toContain("网络不可达");
    expect(formatProviderModelFetchError("fetch models: status 404")).toContain("不支持当前 /models 接口");
    expect(formatProviderModelFetchError("fetch models: decode response: invalid character '<'")).toContain("数据格式不兼容");
  });

  test("does not expose response bodies or credentials", () => {
    const message = formatProviderModelFetchError("fetch models: status 500: Authorization Bearer sk-secret /internal/path");
    expect(message).toBe("模型列表获取失败：渠道服务暂时异常，请稍后重试。");
    expect(message).not.toContain("sk-secret");
    expect(message).not.toContain("/internal/path");
  });
});
