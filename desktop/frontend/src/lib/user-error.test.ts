import { describe, expect, test } from "vitest";

import { errorText, formatUserError, isModelAuthenticationError } from "./user-error";

describe("user-facing errors", () => {
  test("unwraps nested provider JSON without exposing it", () => {
    const raw = JSON.stringify({ error: { message: "invalid_api_key: rejected" } });
    expect(errorText(raw)).toBe("invalid_api_key: rejected");
    expect(formatUserError(raw)).toBe("API Key 无效或未配置，请前往模型设置检查对应渠道。");
    expect(isModelAuthenticationError(raw)).toBe(true);
  });

  test("turns context and output-token failures into one recovery path", () => {
    expect(formatUserError("maximum context length exceeded")).toContain("新建会话");
    expect(formatUserError("max_tokens must be greater than 0")).toContain("上下文限制");
  });

  test("turns tool JSON and network errors into actionable Chinese", () => {
    expect(formatUserError("write_file arguments JSON parse: unexpected end of JSON input")).toContain("工具参数不完整");
    expect(formatUserError("connection refused: dial tcp 127.0.0.1:9000")).toContain("模型服务连接失败");
  });

  test("does not expose unknown paths or setup commands", () => {
    const message = formatUserError("open /Users/tester/.env: run reasonix setup --debug");
    expect(message).toBe("操作失败，请稍后重试；若问题持续，请查看任务日志。");
    expect(message).not.toContain("/Users/tester");
    expect(message).not.toContain("reasonix setup");
  });

  test("keeps ordinary authorization failures out of model settings", () => {
    expect(formatUserError("HTTP 403: project permission denied")).toContain("操作失败");
    expect(isModelAuthenticationError("HTTP 403: project permission denied")).toBe(false);
    expect(formatUserError("权限不足，服务返回 403")).toContain("操作失败");
    expect(isModelAuthenticationError("权限不足，服务返回 403")).toBe(false);
    expect(isModelAuthenticationError("401 Unauthorized")).toBe(false);
    expect(isModelAuthenticationError("model provider returned 403 Forbidden")).toBe(true);
  });

  test("does not pass through credentials, URLs, or non-home absolute paths", () => {
    const message = formatUserError("保存失败：Authorization Bearer sk-secret-value /var/lib/volt/state");
    expect(message).toBe("操作失败，请稍后重试；若问题持续，请查看任务日志。");
    expect(message).not.toContain("sk-secret-value");
    expect(message).not.toContain("/var/lib");
  });

  test("fails closed for unknown Chinese provider and system details", () => {
    const details = [
      "报告审批失败：POST https://internal.example/v1 returned status 500",
      "读取失败：/opt/volt/secrets/provider.json",
      "读取失败：D:\\Volt\\secrets\\provider.json",
      "读取失败：\\\\fileserver\\private\\provider.json",
      '请求失败：{"error":{"message":"internal"}}',
      "执行失败：reasonix setup --debug",
    ];

    for (const detail of details) {
      expect(formatUserError(detail)).toBe("操作失败，请稍后重试；若问题持续，请查看任务日志。");
    }
  });

  test("maps known business errors to fixed safe messages", () => {
    expect(formatUserError("项目名称已存在：/internal/project.json")).toBe("项目名称已存在，请换一个名称。");
    expect(formatUserError("报告尚未通过审批，暂不能导出。")).toBe("报告尚未通过审批，暂不能导出。");
  });

  test("normalizes Go cancellation variants", () => {
    expect(formatUserError("context canceled")).toBe("操作已取消。");
    expect(formatUserError("operation cancelled")).toBe("操作已取消。");
  });

  test("distinguishes the turn protection limit from a model network timeout", () => {
    expect(formatUserError("turn reached the configured protection limit; completed results were kept"))
      .toBe("本次任务已达到运行保护上限并自动停止；已完成结果已保留，可继续当前任务。");
  });

  test("is idempotent for already-safe recovery messages", () => {
    for (const message of [
      "工具参数不完整，本次调用已停止，请重试；若仍失败，请缩短要写入的内容。",
      "模型服务连接失败或响应超时，请检查网络和渠道状态后重试。",
      "上一轮任务仍在运行，请等待完成或停止后重试。",
    ]) {
      expect(formatUserError(message)).toBe(message);
    }
  });

  test("keeps Agent recovery routing without exposing provider diagnostics", () => {
    expect(formatUserError('agent profile "reviewer" uses unknown model "provider/model"')).toBe("Agent 绑定的模型当前不可用，请检查 Agent 配置。");
    expect(formatUserError('agent profile "reviewer" model is unavailable because provider "openai" is not added')).toBe("Agent 依赖的模型渠道尚未添加，请前往模型设置。");
  });
});
