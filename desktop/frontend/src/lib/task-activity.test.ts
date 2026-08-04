import { describe, expect, test } from "vitest";

import { describeTaskFailure } from "./task-activity";

describe("task activity failure presentation", () => {
  test("turns an unknown Agent model into an actionable profile fix", () => {
    expect(describeTaskFailure('agent profile "code-review" uses unknown model "OpenAl/GPT-4o"')).toEqual({
      title: "Agent 模型不可用",
      detail: "code-review 绑定的 OpenAl/GPT-4o 不在当前模型渠道中。",
      primaryAction: "open-agent",
      primaryLabel: "修复 Agent",
    });
  });

  test("routes missing providers to model-channel configuration", () => {
    expect(describeTaskFailure('agent profile "reviewer" model is unavailable because provider "openai" is not added')).toEqual({
      title: "Agent 渠道未添加",
      detail: "reviewer 依赖的 openai 渠道当前不可用。",
      primaryAction: "open-models",
      primaryLabel: "添加渠道",
    });
  });

  test("keeps unknown errors recoverable without exposing raw details", () => {
    expect(describeTaskFailure("network timeout")).toEqual({
      title: "本轮执行失败",
      detail: "模型服务连接失败或响应超时，请检查网络和渠道状态后重试。",
      primaryAction: "retry",
      primaryLabel: "重试",
    });
  });

  test("routes provider authentication failures to model settings", () => {
    expect(describeTaskFailure("401 invalid_api_key")).toEqual({
      title: "模型认证失败",
      detail: "API Key 无效或未配置，请前往模型设置检查对应渠道。",
      primaryAction: "open-models",
      primaryLabel: "前往模型设置",
    });
  });

  test("restores an oversized draft instead of retrying it unchanged", () => {
    expect(describeTaskFailure("maximum context length exceeded")).toEqual({
      title: "对话上下文已满",
      detail: "当前对话已超出模型上下文限制，请压缩对话或新建会话后重试。",
      primaryAction: "restore-draft",
      primaryLabel: "缩短后重发",
    });
  });

  test("routes sanitized Agent failures to the same recovery surfaces", () => {
    expect(describeTaskFailure("Agent 绑定的模型当前不可用，请检查 Agent 配置。").primaryAction).toBe("open-agent");
    expect(describeTaskFailure("Agent 依赖的模型渠道尚未添加，请前往模型设置。").primaryAction).toBe("open-models");
    expect(describeTaskFailure("Agent 基础模型当前不可用，请前往模型设置。").primaryAction).toBe("open-models");
  });
});
