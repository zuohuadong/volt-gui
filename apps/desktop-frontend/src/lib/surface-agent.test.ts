import { describe, expect, it } from "vitest";
import {
  buildVoltSurfacePrompt,
  isSurfaceGenerationIntent,
  parseVoltSurfaceProposal,
  VOLT_SURFACE_AGENT_SCHEMA,
  VOLT_SURFACE_CATALOG,
} from "./surface-agent";

function proposal(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: VOLT_SURFACE_AGENT_SCHEMA,
    action: "propose",
    summary: "会话运行概览",
    spec: {
      schemaVersion: "surface/v1",
      catalogVersion: VOLT_SURFACE_CATALOG.version,
      surfaceId: "session-overview",
      title: "会话概览",
      layout: { type: "grid", columns: 12, gap: "md" },
      dataSources: [{ id: "sessions", type: "resource-list", resource: "sessions", pageSize: 20 }],
      widgets: [{
        id: "session-count",
        type: "metric",
        props: { label: "会话数", format: "number" },
        binding: { sourceId: "sessions", pointer: "/total" },
        placement: { columnSpan: 4 },
      }],
    },
    ...overrides,
  };
}

describe("Volt operation surface protocol", () => {
  it("accepts a fenced, policy-valid proposal", () => {
    const result = parseVoltSurfaceProposal(`方案如下\n\n\`\`\`json\n${JSON.stringify(proposal())}\n\`\`\``);
    expect(result).toMatchObject({ ok: true, value: { spec: { surfaceId: "session-overview" } } });
  });

  it("fails closed for unknown fields and unauthorized resources", () => {
    expect(parseVoltSurfaceProposal(JSON.stringify(proposal({ html: "<script>" }))).ok).toBe(false);
    const unsafe = proposal();
    (unsafe.spec as Record<string, unknown>).dataSources = [{ id: "secrets", type: "resource-list", resource: "credentials" }];
    expect(parseVoltSurfaceProposal(JSON.stringify(unsafe)).ok).toBe(false);
  });

  it("keeps renderer and proposal validation aligned for metric currency rules", () => {
    const invalid = proposal();
    (invalid.spec as Record<string, unknown>).widgets = [{
      ...((invalid.spec as Record<string, unknown>).widgets as unknown[])[0] as Record<string, unknown>,
      props: { label: "收入", format: "currency" },
    }];
    expect(parseVoltSurfaceProposal(JSON.stringify(invalid)).ok).toBe(false);
  });

  it("detects surface intent and describes the bounded catalog", () => {
    expect(isSurfaceGenerationIntent("生成一个会话运营看板")).toBe(true);
    expect(isSurfaceGenerationIntent("把侧栏收起来")).toBe(false);
    const prompt = buildVoltSurfacePrompt("创建工作区看板");
    expect(prompt).toContain(VOLT_SURFACE_AGENT_SCHEMA);
    expect(prompt).toContain("不要生成或执行 Svelte、HTML、CSS、JavaScript");
    expect(prompt).toContain("sessions(read=id,title,cwd,running,updatedAt");
  });

  it("accepts object input and preserves the official agent schema", () => {
    const result = parseVoltSurfaceProposal(proposal());
    expect(result).toMatchObject({ ok: true, value: { schemaVersion: "surface-agent/v1" } });
  });
});
