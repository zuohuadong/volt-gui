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

  test("keeps unknown errors recoverable without hiding the original cause", () => {
    expect(describeTaskFailure("network timeout")).toEqual({
      title: "本轮执行失败",
      detail: "network timeout",
      primaryAction: "retry",
      primaryLabel: "重试",
    });
  });
});
