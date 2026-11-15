// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/svelte";
import ConversationTranscript from "$components/ConversationTranscript.svelte";
import DeleteSessionDialog from "$components/DeleteSessionDialog.svelte";
import { t } from "$lib/i18n";
import { isSurfaceGenerationIntent } from "$lib/surface-agent";
import { stripInternalProtocol } from "$lib/internal-protocol";
import type { TranscriptMessage } from "$lib/transcript";

const read = (relative: string) => readFileSync(join(process.cwd(), relative), "utf8");
const zh = read("src/lib/i18n/zh-CN.ts");
const en = read("src/lib/i18n/en-US.ts");
const app = read("src/App.svelte");
const theme = read("src/workbench-theme.css");

function props(messages: TranscriptMessage[]) {
  return {
    messages,
    sending: false,
    quickActions: [],
    onPromptSelect: () => {},
  } as const;
}

describe("#366 surface proposals need a real interface request", () => {
  it("does not treat a long document question as interface intent", () => {
    const material = "请阅读这段资料，只回答里面记载的验收口令：暗涌平台的验收口令是蓝色灯塔，共 4 个字。";
    expect(isSurfaceGenerationIntent(material)).toBe(false);
    expect(isSurfaceGenerationIntent("帮我总结这份 DSH桌面端启动问题反馈.docx")).toBe(false);
  });

  it("keeps proposal cards in business language instead of i18n keys", () => {
    for (const source of [zh, en]) {
      expect(source).toContain("proposalWidgetsCount:");
      expect(source).toContain("proposalDataSourcesCount:");
    }
    expect(zh).not.toMatch(/proposalWidgetsCount: "surface\./u);
    expect(app).toContain('t("surface.proposalWidgetsCount"');
    expect(app).toContain('t("surface.proposalDataSourcesCount"');
  });

  it("ignores proposals that arrive without an interface request", () => {
    expect(app).toContain("if (!lastUserPromptText || !isSurfaceGenerationIntent(lastUserPromptText)) return;");
    // 新提问会收起上一轮提案，面板不再常驻首屏。
    expect(app).toContain("if (surfaceDraft) surfaceDraft = undefined;");
  });
});

describe("#363 internal protocol never reaches the transcript", () => {
  it("strips schema fields before the assistant text is rendered", () => {
    const raw = '{"schemaVersion": "surface-agent/v2", "additionalProperties": false}\n我先列出四步计划，等你确认后再动手。';
    const stripped = stripInternalProtocol(raw);
    expect(stripped.text).toBe("我先列出四步计划，等你确认后再动手。");
    // 渲染层必须真的用了过滤器，而不是只把它放着。
    expect(read("src/components/ConversationTranscript.svelte")).toContain("stripInternalProtocol(visiblePayload)");
  });

  it("degrades to one business sentence when everything was protocol", () => {
    expect(zh).toContain("internalProtocolHidden:");
  });
});

describe("#370/#372 session delete entries", () => {
  it("exposes archive and delete as separate actions in the sidebar", () => {
    expect(app).toContain('aria-label={`${t("session.deleteForever")}: ${sessionTitle(session)}`}');
    expect(app).toContain("confirmingDeleteSessionId = session.sessionId");
    expect(app).toContain("async function deleteSessionPermanently(sessionId: string)");
  });

  it("writes the irreversible scope into the confirm dialog", () => {
    expect(zh).toContain("deleteForeverConfirm:");
    expect(zh).toMatch(/deleteForeverConfirm: ".*无法恢复.*项目记忆不受影响/u);
    expect(app).toContain('heading={t("session.deleteForever")}');
  });

  it("separates bulk cleanup from single-session deletion", () => {
    expect(zh).toMatch(/cleanupConfirm: ".*\{count\}.*单条删除/u);
    expect(app).toContain('message={t("session.cleanupConfirm", { count: archivedSessions.length })}');
    expect(zh).toContain('cleanupArchived: "批量清理已归档"');
  });
});

describe("#371 archive guidance and undo", () => {
  it("tells the user where to restore or delete after archiving", () => {
    expect(zh).toMatch(/archiveConfirm: ".*已归档会话.*恢复.*永久删除/u);
    expect(zh).toMatch(/archiveSuccess: ".*已归档会话/u);
    expect(zh).toMatch(/archivedListDesc: ".*恢复.*永久删除/u);
  });

  it("offers undo and an archived list in the sidebar", () => {
    expect(app).toContain("async function undoArchiveSession()");
    expect(app).toContain('id="sidebar-archived-list"');
    expect(app).toContain("archivedSectionExpand");
    expect(theme).toContain(".archived-item");
  });
});

describe("#373 message actions and clear conversation", () => {
  it("renders a copy action on every finished message", async () => {
    render(ConversationTranscript, { props: props([{ id: "u1", role: "user", text: "帮我整理清单" }]) });
    expect(await screen.findByRole("button", { name: t("transcript.copyMessage") })).toBeTruthy();
  });

  it("offers regenerate on the last assistant reply when a handler exists", async () => {
    const onRegenerate = () => {};
    render(ConversationTranscript, {
      props: {
        ...props([
          { id: "u1", role: "user", text: "问题" },
          { id: "a1", role: "assistant", text: "回答" },
        ]),
        onRegenerate,
      },
    });
    expect(await screen.findByRole("button", { name: t("transcript.regenerate") })).toBeTruthy();
  });

  it("keeps the clear-conversation action out of reach without a transcript", () => {
    expect(app).toContain('t("session.clearConversation")');
    expect(app).toContain("confirmingClearConversation = true");
    expect(zh).toMatch(/clearConversationConfirm: ".*工作区文件与项目记忆不受影响/u);
  });

  it("labels the surface card removal by its real target", () => {
    expect(app).toContain('t("surface.removeThisSurface")');
    expect(zh).toContain('removeThisSurface: "移除此界面"');
  });
});

describe("delete dialog supports non-session irreversible actions", () => {
  it("uses the custom heading and confirm text", async () => {
    render(DeleteSessionDialog, {
      props: {
        title: "x",
        heading: "清空本对话",
        confirmText: "清空本对话",
        description: "确认清空当前对话？",
        disabled: false,
        onConfirm: () => {},
        onCancel: () => {},
      },
    });
    expect(await screen.findByText("清空本对话", { selector: "button" })).toBeTruthy();
  });
});