import { describe, expect, test, vi } from "vitest";

import type { AgentView } from "./types";
import {
  resolveThreadAgentProfile,
  submitThreadMessageWithAgentProfile,
  threadAgentCapabilityLabel,
  withDeadline,
} from "./thread-agent-profile";

describe("thread Agent Profile submission", () => {
  function agentProfile(id: string, name: string): AgentView {
    return {
      id,
      name,
      role: "执行",
      runs: 0,
      status: "active",
      desc: "",
      tools: [],
      skills: [],
      coreFiles: [],
      builtIn: false,
      createdAt: "",
      updatedAt: "",
    };
  }

  test("binds the selected profile before submitting the message", async () => {
    const order: string[] = [];
    const onBound = vi.fn();

    await submitThreadMessageWithAgentProfile({
      tab: { id: "tab-1" },
      profile: { id: "reviewer", name: "交付审查", provider: "openai", model: "gpt-5.3-codex" },
      display: "检查当前 diff",
      submission: "检查当前 diff",
      setAgentProfileForTab: async (tabID, profileID) => {
        order.push(`set:${tabID}:${profileID}`);
      },
      submitDisplayToTab: async (tabID, display, submission) => {
        order.push(`submit:${tabID}:${display}:${submission}`);
      },
      onBound,
    });

    expect(order).toEqual([
      "set:tab-1:reviewer",
      "submit:tab-1:检查当前 diff:检查当前 diff",
    ]);
    expect(onBound).toHaveBeenCalledWith({
      agentProfileId: "reviewer",
      agentProfileName: "交付审查",
      agentProfileBaseModel: undefined,
    });
  });

  test("revalidates the same non-empty profile without publishing a new local binding", async () => {
    const setAgentProfileForTab = vi.fn(async () => undefined);
    const submitDisplayToTab = vi.fn(async () => undefined);
    const onBound = vi.fn();

    await submitThreadMessageWithAgentProfile({
      tab: { id: "tab-1", agentProfileId: "reviewer", agentProfileName: "交付审查" },
      profile: { id: "reviewer", name: "交付审查" },
      display: "继续",
      submission: "继续",
      setAgentProfileForTab,
      submitDisplayToTab,
      onBound,
    });

    expect(setAgentProfileForTab).toHaveBeenCalledWith("tab-1", "reviewer");
    expect(onBound).not.toHaveBeenCalled();
    expect(submitDisplayToTab).toHaveBeenCalledOnce();
  });

  test("skips profile binding when both the Thread and selection use defaults", async () => {
    const setAgentProfileForTab = vi.fn(async () => undefined);

    await submitThreadMessageWithAgentProfile({
      tab: { id: "tab-1" },
      profile: undefined,
      display: "继续",
      submission: "继续",
      setAgentProfileForTab,
      submitDisplayToTab: async () => undefined,
    });

    expect(setAgentProfileForTab).not.toHaveBeenCalled();
  });

  test("clears an existing profile when the selection is empty", async () => {
    const setAgentProfileForTab = vi.fn(async () => undefined);
    const onBound = vi.fn();

    await submitThreadMessageWithAgentProfile({
      tab: {
        id: "tab-1",
        agentProfileId: "reviewer",
        agentProfileName: "交付审查",
        agentProfileBaseModel: "openai/gpt-5.2",
      },
      profile: undefined,
      display: "使用默认配置",
      submission: "使用默认配置",
      setAgentProfileForTab,
      submitDisplayToTab: async () => undefined,
      onBound,
    });

    expect(setAgentProfileForTab).toHaveBeenCalledWith("tab-1", "");
    expect(onBound).toHaveBeenCalledWith({
      agentProfileId: undefined,
      agentProfileName: undefined,
      agentProfileBaseModel: undefined,
    });
  });

  test("does not submit when profile binding fails", async () => {
    const submitDisplayToTab = vi.fn(async () => undefined);

    await expect(submitThreadMessageWithAgentProfile({
      tab: { id: "tab-1" },
      profile: { id: "reviewer", name: "交付审查" },
      display: "检查当前 diff",
      submission: "检查当前 diff",
      setAgentProfileForTab: async () => {
        throw new Error("Agent Profile 不可用");
      },
      submitDisplayToTab,
    })).rejects.toThrow("Agent Profile 不可用");

    expect(submitDisplayToTab).not.toHaveBeenCalled();
  });

  test("does not submit after a profile-binding deadline even if the backend resolves later", async () => {
    vi.useFakeTimers();
    const submitDisplayToTab = vi.fn(async () => undefined);
    const lateBinding = new Promise<void>((resolve) => setTimeout(resolve, 50));

    const pending = submitThreadMessageWithAgentProfile({
      tab: { id: "tab-1" },
      profile: { id: "reviewer", name: "交付审查" },
      display: "检查当前 diff",
      submission: "检查当前 diff",
      setAgentProfileForTab: () => withDeadline(lateBinding, "Agent Profile 应用超时", 10),
      submitDisplayToTab,
    });

    const rejection = expect(pending).rejects.toThrow("Agent Profile 应用超时");
    await vi.advanceTimersByTimeAsync(10);
    await rejection;
    await vi.advanceTimersByTimeAsync(50);

    expect(submitDisplayToTab).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  test("uses the first available profile when a saved selection is no longer valid", () => {
    const profiles = [
      agentProfile("delivery", "交付"),
      agentProfile("review", "审查"),
    ];

    expect(resolveThreadAgentProfile(profiles, "removed")?.id).toBe("delivery");
    expect(resolveThreadAgentProfile(profiles, "review")?.id).toBe("review");
    expect(resolveThreadAgentProfile([], "review")).toBeUndefined();
  });

  test("describes inherited and restricted capability policies truthfully", () => {
    expect(threadAgentCapabilityLabel({ tools: [], skills: [] }))
      .toBe("工具继承全部 / Skill 继承全部");
    expect(threadAgentCapabilityLabel({ tools: ["bash", "read_file"], skills: ["review"] }))
      .toBe("2 个受限工具 + 核心能力 / 1 个允许 Skill");
  });
});
