// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import ConversationTranscript from "$components/ConversationTranscript.svelte";
import type { DshClient } from "$lib/dsh-client";
import type { TranscriptMessage } from "$lib/transcript";
import { t } from "$lib/i18n";

// 与 App 一致：用当前语言的完整内部指令做身份比对。
const CANONICAL_CONTINUATION = t("activity.continuePrompt");

// 真实渲染行为：#332 隐藏内部续接指令、#331 交付文件变成可点击入口。
function renderTranscript(messages: TranscriptMessage[], openPath = vi.fn(async () => {})) {
  const client = { openPath } as unknown as DshClient;
  render(ConversationTranscript, {
    messages,
    sending: false,
    quickActions: [],
    onPromptSelect: () => {},
    client,
    sessionId: "s1",
  });
  return { openPath };
}

const CONTINUATION = t("activity.continuePrompt");

afterEach(() => cleanup());

describe("internal continuation prompt rendering (#332)", () => {
  it("replaces the instruction with a readable hint and keeps the original in details", async () => {
    expect(CANONICAL_CONTINUATION).toBe(CONTINUATION);
    renderTranscript([{ id: "u1", role: "user", text: CONTINUATION }]);
    expect(await screen.findByText(t("transcript.continuedHint"))).toBeTruthy();
    expect(screen.getByText(t("transcript.continuedDetails"))).toBeTruthy();
    // 原文不消失，但只在折叠区里。
    const original = screen.getByText(CONTINUATION);
    expect(original.closest("details")).not.toBeNull();
  });

  it("collapses back-to-back automatic continuations into a single hint with a count", async () => {
    // 自动续跑触发两次时，会话里会有两条续接指令：只留一条提示并说明次数。
    renderTranscript([
      { id: "u1", role: "user", text: CONTINUATION },
      { id: "a1", role: "assistant", text: "第一段输出。" },
      { id: "u2", role: "user", text: CONTINUATION },
      { id: "u3", role: "user", text: CONTINUATION },
    ]);
    // 被助手输出隔开的两段续接各自成段：单独一次照常显示，连续两次合成一条。
    expect(await screen.findByText(t("transcript.continuedHintRepeat", { count: "2" }))).toBeTruthy();
    expect(screen.getAllByText(t("transcript.continuedHint"))).toHaveLength(1);
    // 三条指令只留两条提示（一段一条）。
    expect(screen.getAllByText(t("transcript.continuedDetails"))).toHaveLength(2);
  });

  it("shows a user message that merely shares the prefix as written", async () => {
    const typed = "继续当前会话尚未完成的任务，但请先用一句话说明你将做什么。";
    renderTranscript([{ id: "u1", role: "user", text: typed }]);
    expect(await screen.findByText(typed)).toBeTruthy();
    expect(screen.queryByText(t("transcript.continuedHint"))).toBeNull();
  });
});

describe("deliverable file links (#331)", () => {
  it("renders a clickable chip with the file name and opens the resolved path", async () => {
    const { openPath } = renderTranscript([
      { id: "a1", role: "assistant", text: "已生成报告：[_交付核对.md](C:\\Users\\demo\\工作区\\交付核对.md)" },
    ]);
    const chip = await screen.findByRole("button", { name: new RegExp(`交付核对\\.md.*${t("transcript.deliverableSaved")}`, "u") });
    // Markdown 源码与原始绝对路径都不出现在可见正文里。
    expect(screen.queryByText(/\]\(C:/u)).toBeNull();
    expect(await screen.findByText("已生成报告：")).toBeTruthy();
    await fireEvent.click(chip);
    await waitFor(() => expect(openPath).toHaveBeenCalledWith("C:\\Users\\demo\\工作区\\交付核对.md"));
  });

  it("reports a failure instead of silently doing nothing", async () => {
    const openPath = vi.fn(async () => { throw new Error("boom"); });
    renderTranscript([{ id: "a1", role: "assistant", text: "已保存到工作区：[交付核对.md](/work/reports/交付核对.md)" }], openPath);
    await fireEvent.click(await screen.findByRole("button", { name: new RegExp("交付核对\\.md", "u") }));
    await waitFor(() => expect(screen.getByText(t("transcript.openFileFailed"))).toBeTruthy());
  });
});