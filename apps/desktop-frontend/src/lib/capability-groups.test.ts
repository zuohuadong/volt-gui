import { describe, expect, it } from "vitest";

import { describeCapabilityGroups, enabledCapabilityCount } from "./capability-groups";
import { summarizeToolStates, toolSummaryKind } from "./tool-summary";

describe("extension capability groups (#352 / #360)", () => {
  it("lists the same switches as the settings page instead of an empty shell", () => {
    const groups = describeCapabilityGroups({
      capabilities: { computerUse: true },
      browserSkillVersion: "0.4.2",
    });
    const byId = new Map(groups.map((group) => [group.id, group]));
    const desktop = byId.get("desktop");
    expect(desktop?.entries.map((entry) => entry.key)).toContain("computerUse");
    expect(desktop?.entries.find((entry) => entry.key === "computerUse")?.enabled).toBe(true);
    // 内置浏览器扩展也要列出来，否则用户无法解释桌面上还有什么在用。
    expect(desktop?.entries.find((entry) => entry.key === "browserSkill")?.builtin).toBe(true);
    expect(desktop?.highRiskCount).toBe(2);
    expect(byId.get("documents")?.entries.map((entry) => entry.key)).toEqual(["documentImport", "report"]);
    // 四组都至少有一项：不再出现「此类暂无扩展」。
    expect(groups.every((group) => group.entries.length > 0)).toBe(true);
  });

  it("counts enabled capabilities for the navigation badge", () => {
    expect(enabledCapabilityCount({})).toBe(0);
    expect(enabledCapabilityCount({ computerUse: true, documentImport: true })).toBe(2);
  });

  it("marks high risk and restart requirements without inventing switches", () => {
    const groups = describeCapabilityGroups({ capabilities: {} });
    const entries = groups.flatMap((group) => group.entries);
    expect(entries.filter((entry) => entry.builtin)).toHaveLength(0);
    expect(entries.find((entry) => entry.key === "computerUse")?.highRisk).toBe(true);
    expect(entries.find((entry) => entry.key === "computerUse")?.restartRequired).toBe(true);
    expect(entries.every((entry) => entry.titleKey.startsWith("settings.capability.") || entry.titleKey.startsWith("extensions.capability."))).toBe(true);
  });
});

describe("activity summary wording (#358)", () => {
  it("treats a single failed operation as partial, not whole-run failure", () => {
    const summary = summarizeToolStates([...Array.from({ length: 10 }, () => "success"), "error"]);
    expect(summary).toEqual({ total: 11, running: 0, failed: 1, interrupted: 0, completed: 10 });
    expect(toolSummaryKind(summary)).toBe("partial");
  });

  it("uses the failure style only when nothing succeeded", () => {
    expect(toolSummaryKind(summarizeToolStates(["success", "success"]))).toBe("all-success");
    expect(toolSummaryKind(summarizeToolStates(["error", "interrupted"]))).toBe("failed");
    expect(toolSummaryKind(summarizeToolStates(["error", "running"]))).toBe("running");
    expect(toolSummaryKind(summarizeToolStates([]))).toBe("empty");
  });
});