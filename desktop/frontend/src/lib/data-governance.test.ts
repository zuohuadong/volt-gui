import { describe, expect, test } from "vitest";

import {
  MEMORY_LAYER_ORDER,
  formatKnowledgeTimestamp,
  groupScopedMemoryEntries,
  scopeLabelForMemoryLayer,
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

  test("uses readable context labels without replacing canonical scope ids", () => {
    const context: ScopedMemoryContext = {
      organizationId: "default",
      workspaceId: "workspace-opaque-hash",
      projectId: "inbox",
      threadId: "thread-tab_opaque_hash",
    };
    const labels = { workspace: "客户门户", thread: "登录流程复核" };
    expect(MEMORY_LAYER_ORDER.map((layer) => scopeLabelForMemoryLayer(context, labels, layer))).toEqual([
      "当前用户",
      "默认组织",
      "客户门户",
      "收件箱",
      "登录流程复核",
    ]);
    expect(scopeIDForMemoryLayer(context, "thread")).toBe("thread-tab_opaque_hash");
  });

  test("formats knowledge timestamps for Chinese readers without raw ISO syntax", () => {
    const now = Date.parse("2026-07-22T10:30:00+08:00");
    expect(formatKnowledgeTimestamp("2026-07-22T10:25:00+08:00", now)).toBe("5 分钟前");
    expect(formatKnowledgeTimestamp("2026-07-21T10:17:40+08:00", now)).toBe("昨天 10:17");
    expect(formatKnowledgeTimestamp("2026-07-01T08:05:00+08:00", now)).toBe("2026-07-01 08:05");
    expect(formatKnowledgeTimestamp("未记录", now)).toBe("未记录");
  });
});
