import { describe, expect, it } from "vitest";
import { VOLT_SURFACE_CATALOG, VOLT_SURFACE_CATALOG_VERSION } from "./surface-catalog";
import { parseVoltSurfaceProposal, VOLT_SURFACE_AGENT_SCHEMA } from "./surface-agent";

function spec(widgets: unknown[], dataSources: unknown[] = []): Record<string, unknown> {
  return {
    schemaVersion: VOLT_SURFACE_AGENT_SCHEMA,
    action: "propose",
    spec: {
      schemaVersion: "surface/v1",
      catalogVersion: VOLT_SURFACE_CATALOG_VERSION,
      surfaceId: "volt-surface",
      title: "Volt surface",
      layout: { type: "grid", columns: 12 },
      dataSources,
      widgets,
    },
  };
}

describe("Volt surface catalog", () => {
  it("extends the svadmin catalog with pie chart, calculator and form", () => {
    expect(VOLT_SURFACE_CATALOG.version).toBe("volt/v1");
    const types = VOLT_SURFACE_CATALOG.widgets.map((widget) => widget.type);
    for (const type of ["metric", "resource-table", "bar-chart", "line-chart", "pie-chart", "calculator", "form"]) {
      expect(types).toContain(type);
    }
  });

  it("accepts a pie chart bound to a policy-authorized source", () => {
    const result = parseVoltSurfaceProposal(spec(
      [{
        id: "channel-share",
        type: "pie-chart",
        props: { title: "渠道占比", labelField: "title", valueField: "sessionCount" },
        binding: { sourceId: "workspaces", pointer: "/items" },
      }],
      [{ id: "workspaces", type: "resource-list", resource: "workspaces", pageSize: 20 }],
    ));
    expect(result).toMatchObject({ ok: true, value: { spec: { widgets: [{ type: "pie-chart" }] } } });
  });

  it("accepts data-source-free calculator and form widgets", () => {
    const result = parseVoltSurfaceProposal(spec([
      { id: "calc", type: "calculator", props: { title: "计算器", initialValue: 0 } },
      {
        id: "leave",
        type: "form",
        props: {
          title: "请假申请",
          fields: [
            { kind: "text", name: "applicant", label: "申请人", required: true },
            { kind: "select", name: "type", label: "类型", options: [{ value: "annual", label: "年假" }] },
            { kind: "date", name: "start", label: "开始日期" },
            { kind: "number", name: "days", label: "天数", min: 0.5, step: 0.5 },
            { kind: "checkbox", name: "urgent", label: "加急" },
          ],
        },
      },
    ]));
    expect(result.ok).toBe(true);
  });

  it("fails closed for unknown field kinds, scripts and oversized forms", () => {
    const unknownKind = parseVoltSurfaceProposal(spec([{
      id: "bad",
      type: "form",
      props: { title: "坏表单", fields: [{ kind: "script", name: "x", label: "X" }] },
    }]));
    expect(unknownKind.ok).toBe(false);

    const scripted = parseVoltSurfaceProposal(spec([{
      id: "calc",
      type: "calculator",
      props: { title: "计算器", onclick: "alert(1)" },
    }]));
    expect(scripted.ok).toBe(false);

    const tooMany = parseVoltSurfaceProposal(spec([{
      id: "big",
      type: "form",
      props: {
        title: "大表单",
        fields: Array.from({ length: 13 }, (_, index) => ({ kind: "text", name: `field${index}`, label: `字段${index}` })),
      },
    }]));
    expect(tooMany.ok).toBe(false);
  });

  it("requires the exact catalog version so foreign specs cannot render", () => {
    const foreign = spec([{ id: "calc", type: "calculator", props: { title: "计算器" } }]);
    (foreign["spec"] as Record<string, unknown>)["catalogVersion"] = "svadmin/v1";
    expect(parseVoltSurfaceProposal(foreign).ok).toBe(false);
  });
});