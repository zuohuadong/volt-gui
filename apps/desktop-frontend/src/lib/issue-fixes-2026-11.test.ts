import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), "utf8");

const app = read("../App.svelte");
const extensionPage = read("../components/ExtensionCapabilities.svelte");
const toolGroup = read("../components/ToolCallGroup.svelte");
const activityPanel = read("../components/ActivityPanel.svelte");
const transcript = read("../components/ConversationTranscript.svelte");

describe("extension capabilities read the same list as settings (#352)", () => {
  it("renders capability switches instead of an empty shell", () => {
    expect(extensionPage).toContain("describeCapabilityGroups");
    expect(extensionPage).toContain("enabledTotal");
    expect(extensionPage).toContain("onToggle");
    expect(extensionPage).not.toContain("groupEmpty");
    // 读取失败必须说出来，不能显示肯定式空态。
    expect(extensionPage).toContain('role="alert"');
    expect(extensionPage).toContain('t("common.retry")');
  });

  it("wires the page to the settings capability state and toggle", () => {
    expect(app).toContain("<ExtensionCapabilitiesComponent");
    expect(app).toContain("{capabilities}");
    expect(app).toContain("onToggle={(key: CapabilityKey) => toggleCapability(key as DesktopCapabilityKey)}");
    expect(app).toContain("error={managementError}");
  });
});

describe("extensions have a first-class entry (#360)", () => {
  it("adds a navigation entry with an enabled-count badge", () => {
    expect(app).toContain("function openExtensions()");
    expect(app).toContain("{t(\"nav.extensions\")}<span class=\"count-badge\">{capabilitiesEnabledCount}</span>");
    expect(app).toContain("onclick={openExtensions}");
    expect(app).toContain("const extensionsViewActive = $derived(view === \"settings\" && managementTab === \"extensions\");");
  });

  it("removes the second switch list from settings", () => {
    expect(app).not.toContain("CAPABILITY_ROWS");
    expect(app).toContain('t("settings.capabilitiesSummary", { count: capabilitiesEnabledCount })');
    expect(app).toContain('t("settings.capabilitiesOpen")');
  });
});

describe("knowledge search keeps results on the page (#353)", () => {
  it("does not navigate back to the conversation while submitting a search", () => {
    expect(app).toContain("if (!options.keepView) view = \"conversation\";");
    expect(app).toContain("await submit(prompt, [], [], activeSessionId, { keepView: true });");
    expect(app).toContain('t("knowledge.querying")');
    expect(app).toContain('t("knowledge.queryEmpty")');
  });
});

describe("internal retrieval prompts stay out of the transcript (#354)", () => {
  it("filters injected prompts and strips the machine report before rendering", () => {
    expect(app).toContain("isInternalKnowledgePrompt(message.text)");
    expect(app).toContain("stripKnowledgeArtifacts(message.text)");
    expect(app).toContain("messages={visibleMessages}");
    expect(app).toContain("<ActivityPanel messages={visibleMessages}");
  });
});

describe("file references render without placeholders (#355)", () => {
  it("strips bracketed placeholders and offers a clickable entry for bare names", () => {
    expect(transcript).toContain("extractBareFileMentions(deliverable.text)");
    expect(transcript).toContain("onOpenBareFile?.(name)");
    expect(app).toContain("async function openWorkspaceFileByName(name: string)");
    expect(app).toContain('t("transcript.openFileFailed")');
  });
});

describe("runtime diagnostics agree with the overview (#356)", () => {
  it("derives one status for both pages and never shows a question mark", () => {
    expect(app).toContain("const runtimeStatusKind = $derived(runtimeConnectionError ? \"unavailable\"");
    expect(app).toContain('t("runtime.statusUnavailable")');
    expect(app).toContain('t("runtime.valueUnavailable")');
    expect(app).toContain('t("runtime.lastSyncedAt"');
    expect(app).toContain("runtimeLastSyncedAt = Date.now()");
    expect(app).not.toContain("runtimeConnectionError ? \"?\" : runningTools.length");
  });
});

describe("activity records use business language (#357 / #358)", () => {
  it("summarises partial failures instead of calling the run failed", () => {
    expect(toolGroup).toContain("summarizeToolStates");
    expect(toolGroup).toContain('t("transcript.toolSummaryPartial"');
    expect(toolGroup).toContain('t("transcript.toolSummaryAllSuccess"');
    // 失败不再自动展开整块技术细节。
    expect(toolGroup).not.toContain("open={failed > 0}");
    expect(activityPanel).not.toContain('open={tool.state === "error"}');
  });

  it("hides tool names, command lines and English errors behind technical details", () => {
    expect(toolGroup).toContain("toolBusinessLabel(name)");
    expect(toolGroup).toContain("safeToolDetail(tool.args");
    expect(toolGroup).toContain('t("transcript.toolTechnicalDetails")');
    expect(activityPanel).toContain("toolBusinessLabel(name)");
    expect(activityPanel).toContain('t("transcript.toolErrorImpact"');
  });
});

describe("settings advanced configuration avoids developer terms (#359)", () => {
  it("describes capabilities by purpose, not by internal component names", () => {
    expect(app).not.toContain("按需加载外部 MCP 连接器");
    expect(app).not.toContain("MCP 连接器");
  });
});

describe("model specifications share one number format (#361)", () => {
  it("formats token counts through the shared helper", () => {
    expect(app).toContain("formatTokenSpec(model.contextWindow)");
    expect(app).toContain("formatTokenSpec(model.maxTokens)");
    expect(app).toContain('t("models.outputLimitVaries")');
    // 同页混用点号/逗号千分位的问题源就在这里。
    expect(app).not.toContain('t("models.contextWindow", { count: model.contextWindow.toLocaleString() })');
    expect(app).not.toContain('t("models.maxTokens", { count: model.maxTokens.toLocaleString() })');
  });
});