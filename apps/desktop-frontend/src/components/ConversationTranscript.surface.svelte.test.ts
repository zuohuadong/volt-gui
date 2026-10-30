// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DshClient } from "$lib/dsh-client";
import type { SurfaceInteractionEvent } from "@svadmin/surface";
import ConversationTranscript from "$components/ConversationTranscript.svelte";
import type { TranscriptMessage } from "$lib/transcript";
import { VOLT_SURFACE_AGENT_SCHEMA, VOLT_SURFACE_CATALOG_VERSION } from "$lib/surface-agent";

const client = {
  async listSessions() {
    return { items: [
      { sessionId: "s1", updatedAt: 2, running: true, blank: false, cwd: "/work", projections: { values: { title: "修复登录" } } },
      { sessionId: "s2", updatedAt: 1, running: false, blank: false, cwd: "/other" },
    ] };
  },
  async listWorkspaces() { return { items: [], archivedSessionIds: [] }; },
  async listSubagents() { return { entries: [] }; },
} as unknown as DshClient;

function surfaceReply(streaming = false): string {
  const proposal = {
    schemaVersion: VOLT_SURFACE_AGENT_SCHEMA,
    action: "propose",
    summary: "会话列表",
    spec: {
      schemaVersion: "surface/v1",
      catalogVersion: VOLT_SURFACE_CATALOG_VERSION,
      surfaceId: "sessions-inline",
      title: "会话概览",
      layout: { type: "grid", columns: 12 },
      dataSources: [{ id: "sessions", type: "resource-list", resource: "sessions", pageSize: 10 }],
      widgets: [{
        id: "session-table",
        type: "resource-table",
        props: { title: "会话列表", columns: [{ field: "title", label: "标题" }, { field: "running", label: "运行中", format: "boolean" }] },
        binding: { sourceId: "sessions", pointer: "/items" },
      }],
    },
  };
  return streaming
    ? `正在整理。\n\n\`\`\`surface\n{"schemaVersion":"surface-agent/v1"`
    : `下面是一个界面。\n\n\`\`\`surface\n${JSON.stringify(proposal)}\n\`\`\`\n`;
}

function messages(text: string, pending = false): TranscriptMessage[] {
  return [
    { id: "u1", role: "user", text: "生成一个会话看板" },
    { id: "a1", role: "assistant", text, pending },
  ];
}

function renderTranscript(text: string, options: { pending?: boolean; onInteraction?: (event: SurfaceInteractionEvent, spec: unknown) => void } = {}) {
  return render(ConversationTranscript, {
    messages: messages(text, options.pending ?? false),
    sending: options.pending ?? false,
    quickActions: [],
    onPromptSelect: () => {},
    client,
    sessionId: "s1",
    ...(options.onInteraction === undefined ? {} : { onSurfaceInteraction: options.onInteraction }),
  });
}

afterEach(() => cleanup());

describe("conversation surface rendering", () => {
  it("renders the prose and an inline read-only card with data", async () => {
    renderTranscript(surfaceReply());
    expect(await screen.findByText("下面是一个界面。")).toBeTruthy();
    expect(await screen.findByText("会话概览")).toBeTruthy();
    expect(await screen.findByRole("table", { name: "会话列表" })).toBeTruthy();
    await waitFor(() => expect(screen.getAllByText("修复登录").length).toBeGreaterThan(0));
  });

  it("turns a row selection into a scoped record event without undeclared fields", async () => {
    const onInteraction = vi.fn();
    renderTranscript(surfaceReply(), { onInteraction });
    const button = await screen.findByRole("button", { name: /会话列表.*1$/ });
    button.click();
    await waitFor(() => expect(onInteraction).toHaveBeenCalledTimes(1));
    const [event, spec] = onInteraction.mock.calls[0] ?? [];
    expect(event).toMatchObject({
      type: "select-record",
      surfaceId: "sessions-inline",
      widgetId: "session-table",
      sourceId: "sessions",
      record: { title: "修复登录", running: true },
    });
    expect(spec).toMatchObject({ title: "会话概览" });
    expect(Object.keys(event.record).sort()).toEqual(["running", "title"]);
  });

  it("shows a placeholder instead of partial JSON while the proposal streams", async () => {
    renderTranscript(surfaceReply(true), { pending: true });
    expect(await screen.findByText("正在整理。")).toBeTruthy();
    expect(await screen.findByText("正在生成界面…")).toBeTruthy();
    expect(screen.queryByRole("table", { name: "会话列表" })).toBeNull();
  });

  it("rejects a proposal that fails policy validation", async () => {
    const invalid = surfaceReply().replace('"sessions"', '"credentials"');
    renderTranscript(invalid);
    expect(await screen.findByText("界面提案未通过校验，已拒绝渲染。")).toBeTruthy();
  });
});
