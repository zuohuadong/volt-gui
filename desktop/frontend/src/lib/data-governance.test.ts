import { describe, expect, test } from "vitest";

import {
  MEMORY_LAYER_ORDER,
  groupScopedMemoryEntries,
  scopeIDForMemoryLayer,
  sortTrustWarnings,
  trustStatusPresentation,
} from "./data-governance";
import type {
  ScopedMemoryContext,
  ScopedMemoryEntry,
  TrustWarning,
} from "./types";

function entry(layer: ScopedMemoryEntry["layer"], id: string): ScopedMemoryEntry {
  return {
    id,
    title: id,
    body: `${id} body`,
    source: "test",
    layer,
    scopeId: `${layer}-scope`,
    owner: {},
    references: [],
    createdAt: "2026-07-13T00:00:00Z",
    updatedAt: "2026-07-13T00:00:00Z",
    isolated: false,
  };
}

describe("data governance presentation", () => {
  test("keeps trust capability states semantically distinct", () => {
    expect(trustStatusPresentation("active")).toMatchObject({ label: "已启用", tone: "active" });
    expect(trustStatusPresentation("configured")).toMatchObject({ label: "已配置", tone: "configured" });
    expect(trustStatusPresentation("possible")).toMatchObject({ label: "按需可能", tone: "possible" });
    expect(trustStatusPresentation("disabled")).toMatchObject({ label: "已停用", tone: "disabled" });
    expect(trustStatusPresentation("unknown")).toMatchObject({ label: "待确认", tone: "unknown" });
  });

  test("sorts warnings from high risk to informational", () => {
    const warnings: TrustWarning[] = [
      { id: "info", severity: "info", title: "Info", detail: "Info" },
      { id: "high", severity: "high", title: "High", detail: "High" },
      { id: "medium", severity: "medium", title: "Medium", detail: "Medium" },
    ];
    expect(sortTrustWarnings(warnings).map((warning) => warning.id)).toEqual(["high", "medium", "info"]);
  });

  test("groups all five memory layers in stable broad-to-specific order", () => {
    const groups = groupScopedMemoryEntries([
      entry("thread", "thread-memory"),
      entry("user", "user-memory"),
      entry("project", "project-memory"),
    ]);

    expect(groups.map((group) => group.layer)).toEqual(MEMORY_LAYER_ORDER);
    expect(groups.find((group) => group.layer === "workspace")?.entries).toEqual([]);
    expect(groups.find((group) => group.layer === "thread")?.entries[0]?.id).toBe("thread-memory");
  });

  test("derives scope ids from the backend-completed context", () => {
    const context: ScopedMemoryContext = {
      organizationId: "org",
      workspaceId: "workspace",
      projectId: "project",
      threadId: "thread",
    };
    expect(MEMORY_LAYER_ORDER.map((layer) => scopeIDForMemoryLayer(context, layer))).toEqual([
      "user",
      "org",
      "workspace",
      "project",
      "thread",
    ]);
  });
});
