import { describe, expect, it } from "vitest";
import type { SurfaceSpec } from "@svadmin/surface";
import type { SurfaceInteractionEvent } from "@svadmin/surface";
import { buildSurfaceFollowUpMessage, SURFACE_FOLLOW_UP_RECORD_LIMIT } from "./surface-interaction";

const spec = {
  schemaVersion: "surface/v1",
  catalogVersion: "svadmin/v1",
  surfaceId: "sessions-overview",
  title: "会话概览",
  layout: { type: "grid", columns: 12 },
  dataSources: [{ id: "sessions", type: "resource-list", resource: "sessions", pageSize: 20 }],
  widgets: [
    {
      id: "session-table",
      type: "resource-table",
      props: { title: "会话列表", columns: [{ field: "title", label: "标题" }] },
      binding: { sourceId: "sessions", pointer: "/items" },
    },
    {
      id: "untitled",
      type: "resource-table",
      props: { columns: [{ field: "title", label: "标题" }] },
      binding: { sourceId: "sessions", pointer: "/items" },
    },
  ],
} as SurfaceSpec;

type SelectEvent = Extract<SurfaceInteractionEvent, { type: "select-record" }>;

function event(overrides: Partial<SelectEvent> = {}): SelectEvent {
  return {
    type: "select-record",
    surfaceId: "sessions-overview",
    widgetId: "session-table",
    sourceId: "sessions",
    record: { title: "修复登录", running: false },
    ...overrides,
  };
}

const translate = (key: string, params?: Record<string, string | number>) =>
  `${key}|${params?.surface}|${params?.widget}|${params?.record ?? params?.values}`;

describe("surface follow-up message", () => {
  it("names the surface and widget and serializes the selected record", () => {
    expect(buildSurfaceFollowUpMessage(event(), spec, translate))
      .toBe('surface.followUpMessage|会话概览|会话列表|{"title":"修复登录","running":false}');
  });

  it("falls back to the widget id when the widget has no title", () => {
    expect(buildSurfaceFollowUpMessage(event({ widgetId: "untitled" }), spec, translate))
      .toContain("|untitled|");
  });

  it("truncates records that would flood the conversation", () => {
    const message = buildSurfaceFollowUpMessage(
      event({ record: { note: "x".repeat(SURFACE_FOLLOW_UP_RECORD_LIMIT * 2) } }),
      spec,
      translate,
    );
    const serialized = message.split("|").at(-1) ?? "";
    expect(serialized.length).toBe(SURFACE_FOLLOW_UP_RECORD_LIMIT + 1);
    expect(serialized.endsWith("…")).toBe(true);
  });

  it("fails closed on records that cannot be serialized", () => {
    const circular: Record<string, unknown> = {};
    circular["self"] = circular;
    const record = circular as unknown as SelectEvent["record"];
    expect(buildSurfaceFollowUpMessage(event({ record }), spec, translate)).toContain("|{}");
  });
});

describe("surface value submissions", () => {
  it("serializes submitted form values into a follow-up message", () => {
    const message = buildSurfaceFollowUpMessage(
      {
        type: "submit-values",
        surfaceId: "sessions-overview",
        widgetId: "session-table",
        values: { applicant: "Ada", days: 2 },
      },
      spec,
      translate,
    );
    expect(message).toBe('surface.submitValuesMessage|会话概览|会话列表|{"applicant":"Ada","days":2}');
  });

  it("keeps the record wording for record selections", () => {
    expect(buildSurfaceFollowUpMessage(event(), spec, translate)).toContain("surface.followUpMessage|");
  });
});
