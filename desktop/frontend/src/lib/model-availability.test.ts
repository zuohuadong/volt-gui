import { describe, expect, it } from "vitest";

import {
  clearModelConnectionFailure,
  decorateModelAvailability,
  pendingModelSelectionUnavailableReason,
  recordModelConnectionFailure,
  shouldDeferNewTaskModelSelection,
} from "./model-availability";

describe("model availability", () => {
  it("marks only connection failures and clears the marker after recovery", () => {
    const empty = {};
    expect(recordModelConnectionFailure(empty, "gateway/model", "invalid prompt", 10)).toBe(empty);

    const failed = recordModelConnectionFailure(empty, "gateway/model", "connection timed out", 10);
    expect(failed["gateway/model"]?.failedAt).toBe(10);
    expect(decorateModelAvailability([
      { name: "model", ref: "gateway/model" },
      { name: "other", ref: "gateway/other" },
    ], failed)).toEqual([
      expect.objectContaining({ ref: "gateway/model", availability: "unavailable" }),
      { name: "other", ref: "gateway/other" },
    ]);
    expect(clearModelConnectionFailure(failed, "gateway/model")).toEqual({});
  });

  it("defers model changes only for an unbound Work new-task draft", () => {
    expect(shouldDeferNewTaskModelSelection("work", "newTask", "")).toBe(true);
    expect(shouldDeferNewTaskModelSelection("work", "newTask", "tab-1")).toBe(false);
    expect(shouldDeferNewTaskModelSelection("code", "newTask", "")).toBe(false);
  });

  it("rejects a pending new-task model only when the live catalog removed it", () => {
    const models = [
      { ref: "gateway/ready", availability: "available" as const },
      { ref: "gateway/unknown", availability: "unknown" as const },
      { ref: "gateway/removed", availability: "unavailable" as const, unavailableReason: "已下线" },
    ];
    expect(pendingModelSelectionUnavailableReason(models, "gateway/ready")).toBe("");
    expect(pendingModelSelectionUnavailableReason(models, "gateway/unknown")).toBe("");
    expect(pendingModelSelectionUnavailableReason(models, "gateway/removed")).toBe("已下线");
    expect(pendingModelSelectionUnavailableReason(models, "gateway/missing")).toContain("目录下线");
  });
});
