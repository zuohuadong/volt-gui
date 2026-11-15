import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { filterSessionsByQuery, matchesSessionQuery, normalizeSessionQuery } from "./session-search";

const app = readFileSync(new URL("../App.svelte", import.meta.url), "utf8");
const theme = readFileSync(new URL("../workbench-theme.css", import.meta.url), "utf8");
const en = readFileSync(new URL("./i18n/en-US.ts", import.meta.url), "utf8");
const zh = readFileSync(new URL("./i18n/zh-CN.ts", import.meta.url), "utf8");

describe("session search filtering", () => {
  const sessions = [
    { id: "a", title: "季度报告整理", cwd: "/Users/demo/reports" },
    { id: "b", title: "Quarterly Report", cwd: null },
    { id: "c", title: "浏览器自动化", cwd: "/Users/demo/code/bsk" },
  ];
  const accessors = { title: (item: (typeof sessions)[number]) => item.title, cwd: (item: (typeof sessions)[number]) => item.cwd };

  it("returns every session for an empty or whitespace-only query", () => {
    expect(filterSessionsByQuery(sessions, "", accessors)).toBe(sessions);
    expect(filterSessionsByQuery(sessions, "   ", accessors)).toBe(sessions);
    expect(matchesSessionQuery(sessions[0], "  ", accessors)).toBe(true);
  });

  it("matches titles and working directories case-insensitively", () => {
    expect(filterSessionsByQuery(sessions, "report", accessors).map((item) => item.id)).toEqual(["a", "b"]);
    expect(filterSessionsByQuery(sessions, "CODE", accessors).map((item) => item.id)).toEqual(["c"]);
    expect(filterSessionsByQuery(sessions, "报告", accessors).map((item) => item.id)).toEqual(["a"]);
  });

  it("trims the query before matching and reports no results for unknown terms", () => {
    expect(normalizeSessionQuery("  BSK  ")).toBe("bsk");
    expect(filterSessionsByQuery(sessions, "  bsk  ", accessors).map((item) => item.id)).toEqual(["c"]);
    expect(filterSessionsByQuery(sessions, "no-such-session", accessors)).toEqual([]);
  });
});

// 会话列表搜索是可逆的临时筛选：#351 要求 Esc/清除入口都能恢复完整列表，
// 长关键词仍能看清输入内容，空结果状态必须给出恢复方式。
describe("sidebar session search", () => {
  it("clears the query and restores the full list with Escape", () => {
    expect(app).toMatch(/onkeydown=\{\(event\) => \{ if \(event\.key === "Escape" && sessionQuery\) \{ event\.stopPropagation\(\); sessionQuery = ""; \} \}\}/u);
  });

  it("keeps the clear button available and refocuses the input after clearing", () => {
    expect(app).toMatch(/class="search-clear"[\s\S]{0,220}sessionQuery = ""; sessionSearchInput\?\.focus\(\)/u);
    expect(theme).toContain(".search-clear:hover");
  });

  it("keeps long keywords readable through a full-text title and start-aligned scroll", () => {
    expect(app).toMatch(/title=\{sessionQuery \|\| undefined\}/u);
    expect(app).toMatch(/onblur=\{\(event\) => \{ event\.currentTarget\.scrollLeft = 0; \}\}/u);
  });

  it("offers an explicit recovery path in the empty result state", () => {
    expect(app).toMatch(/\{#if sessionQuery\}<small>\{t\("session\.noSearchResultsDesc"\)\}<\/small><button class="search-empty-clear"/u);
    expect(theme).toContain(".search-empty-clear");
  });

  it("keeps both locales in sync for the new strings", () => {
    expect(zh).toContain('noSearchResultsDesc: "清除搜索可查看全部会话。"');
    expect(zh).toContain('clearSearch: "清除搜索"');
    expect(en).toContain('noSearchResultsDesc: "Clear the search to see all sessions."');
    expect(en).toContain('clearSearch: "Clear search"');
  });
});

// #350：界面定制载荷（schemaVersion/composerRows 等）不再出现在对话流与确认卡片正文里。
describe("ui customization exposure", () => {
  const transcript = readFileSync(new URL("../components/ConversationTranscript.svelte", import.meta.url), "utf8");

  it("strips the machine payload before rendering assistant text", () => {
    expect(transcript).toContain('stripUiCustomizationPayload(message.text ?? "")');
  });

  it("shows business-language changes and keeps JSON behind a collapsed detail", () => {
    expect(app).toContain("describeUiCustomizationPatch(customizationDraft)");
    expect(app).toContain('<details class="customization-technical">');
    expect(app).toContain('t("customization.changeComposerRows"');
  });
});

// #332：自动续接的内部指令只显示一句业务提示，原文默认收起在技术详情里。
describe("internal continuation messages", () => {
  const transcript = readFileSync(new URL("../components/ConversationTranscript.svelte", import.meta.url), "utf8");

  it("never renders the raw continuation instruction as a normal message", () => {
    expect(transcript).toContain('{#if isInternalContinuationPrompt(message.displayText ?? message.text, t("activity.continuePrompt"))}');
    expect(transcript).toContain('t("transcript.continuedHint")');
    expect(transcript).toContain('<details class="message-system-hint__details">');
  });

  it("hides the hint text behind a collapsed technical detail", () => {
    expect(theme).toContain(".message-system-hint__details summary");
    expect(zh).toContain('continuedHint: "已接着上次的进度继续处理。"');
    expect(en).toContain('continuedHint: "Continuing from where the last run stopped."');
  });
});

// #343：界面设置默认收起、状态用完整句子、术语去研发化。
describe("interface settings panel", () => {
  it("keeps the panel collapsed and auto-dismissed on session switch", () => {
    expect(app).toMatch(/let customizationOpen = \$state\(false\);/u);
    expect(app).toContain("if (customizationSessionId && current !== customizationSessionId) {");
    expect(app).toContain("customizationOpen = false;");
    expect(app).toContain("if (customizationOpen && !customizationDraft) customizationOpen = false;");
    // 待确认的方案不跨会话保留。
    expect(app).toContain("customizationDraft = undefined;");
    expect(app).toContain("if (customizationOpen && !customizationDraft) customizationOpen = false;");
  });

  it("describes the current state as a sentence instead of a chip snapshot", () => {
    expect(app).toContain('t("customization.summarySentence"');
    expect(theme).toContain(".customization-summary__sentence");
    expect(app).toContain('t("customization.undoHint")');
  });

  it("drops design-internal wording from the visible labels", () => {
    expect(zh).not.toContain('title: "对话式界面定制"');
    expect(zh).not.toContain("用自然语言改变工作台");
    expect(zh).toContain('title: "界面设置"');
    expect(en).not.toContain('title: "Conversational UI Customization"');
    expect(en).toContain('title: "Interface settings"');
  });
});

// #335：提交后立即把新消息滚进视野；用户向上翻阅时不抢滚动。
describe("transcript autoscroll", () => {
  it("scrolls to the latest message on submit without hijacking a scrolled-up reader", () => {
    expect(app).toContain("scrollTranscriptToLatest();");
    expect(app).toContain('scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 120');
    expect(app).toContain('document.querySelector<HTMLElement>(".conversation-root .message-scroll")');
  });

  it("keeps the existing new-message affordance for scrolled-up readers", () => {
    const transcript = readFileSync(new URL("../components/ConversationTranscript.svelte", import.meta.url), "utf8");
    expect(transcript).toContain("ConversationScrollButton");
  });
});

// #333：主界面只留业务语言，版本号与研发态术语退出日常界面。
describe("main interface identifiers", () => {
  it("keeps the app version out of the topbar", () => {
    expect(app).not.toContain('class="app-version"');
    expect(app).toContain('t("updates.currentVersion", { version: appVersion })');
  });

  it("stops repeating the default session type under every title", () => {
    // 标题下的小字只放项目名；唯一例外是"这条会话需要新版本打开"（降级安装），
    // 那时必须说明原因，否则用户只会看到一条点不开的会话。
    expect(app).toContain('{health === "migration-required" ? t("session.statusMigrationRequired") : projectNameForSession(session)}');
  });

  it("uses a clear status word instead of the bare activity label", () => {
    const composer = readFileSync(new URL("../components/DshPromptComposer.svelte", import.meta.url), "utf8");
    expect(composer).toContain('loading ? t("composer.activityRunning") : t("composer.activityIdle")');
    expect(zh).toContain('activityRunning: "正在处理"');
    expect(zh).toContain('activityIdle: "空闲"');
  });

  it("rewrites permission labels in business language", () => {
    expect(zh).toContain('permissionWrite: "可以帮你改文件"');
    expect(zh).toContain('permissionReadOnly: "只看不改"');
    expect(en).toContain('permissionWrite: "Can edit your files"');
    expect(en).toContain('permissionReadOnly: "View only"');
  });
});

// #349：用户消息逐字保真，连续空格与反斜杠不被折叠。
describe("user message fidelity", () => {
  it("renders user text with preserved whitespace", () => {
    expect(theme).toContain(".message-text { white-space: pre-wrap; }");
    const transcript = readFileSync(new URL("../components/ConversationTranscript.svelte", import.meta.url), "utf8");
    expect(transcript).toContain('{message.displayText ?? message.text}');
  });
});
