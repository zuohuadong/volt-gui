import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const css = readFileSync(new URL("../app.css", import.meta.url), "utf8");
const theme = readFileSync(new URL("../workbench-theme.css", import.meta.url), "utf8");
const app = readFileSync(new URL("../App.svelte", import.meta.url), "utf8");

describe("responsive desktop renderer layout", () => {
  test("captures through the desktop bridge without hiding errors or disabling text-only model capture", () => {
    const composer = readFileSync(new URL("../components/DshPromptComposer.svelte", import.meta.url), "utf8");
    expect(composer).not.toContain("PromptInputActionAddScreenshot");
    expect(composer).toContain("await shell.captureScreen()");
    expect(composer).toContain("if (!image || destroyed || sessionId !== captureSessionId) return;");
    expect(composer).toContain('role="alert">{t("composer.screenshotFailed")}');
    expect(composer).toContain('role="status">{t("composer.capturingScreenshot")}');
    expect(composer).toContain('disabled={disabled || !sessionId || captureBusy} onselect={() => void addScreenshot()}');
    expect(composer).toContain('if (!imageInputSupported && detail.files.some(isImageAttachment)');
  });

  test("keeps knowledge immediately before settings in the sidebar footer and collapsed navigation", () => {
    const footer = app.match(/<div class="sidebar-footer">([\s\S]*?)<\/div>/)?.[1] || "";
    expect(footer).toMatch(/onclick=\{openKnowledge\}[\s\S]*nav\.knowledge[\s\S]*openManagement\("settings"\)[\s\S]*nav\.settings/);
    expect(footer).toContain('view === "knowledge"');
    expect(theme).toMatch(/\.sidebar-footer\s*{\s*display:\s*flex/);
    const collapsed = app.match(/<div class="sidebar-collapsed-actions">([\s\S]*?)<\/div>/)?.[1] || "";
    expect(collapsed).toMatch(/nav\.knowledge[\s\S]*onclick=\{openKnowledge\}[\s\S]*nav\.settings/);
  });

  test("includes reasoning-only messages and renders their expandable text separately from answers", () => {
    const transcript = readFileSync(new URL("../components/ConversationTranscript.svelte", import.meta.url), "utf8");
    expect(transcript).toContain("buildTranscriptView(nextMessages, cachedTranscriptView)");
    expect(transcript).toContain('{#if isVisibleReasoning(message.reasoning)}');
    expect(transcript).toContain('<details class="message-reasoning">');
    expect(transcript).toContain('<Response content={message.reasoning} streaming={!!message.pending}');
    expect(transcript).toContain('t("transcript.unparsedToolMarkup")');
    expect(transcript).toContain('{#if isVisibleMessageText(message.text)}');
    expect(transcript).not.toContain('message.text : "…"');
  });

  test("buffering history does not skip live turn completion", () => {
    const bufferStart = app.indexOf('if (historyLoad?.sessionId === payload.sessionId)');
    const eventEnd = app.indexOf('async function submit', bufferStart);
    const handler = app.slice(bufferStart, eventEnd);
    const buffer = handler.slice(0, handler.indexOf('} else {'));
    expect(buffer).not.toContain('return;');
    expect(handler).toContain('if (historyLoad?.sessionId !== payload.sessionId)');
    expect(handler).toContain('payload.event.type === "turn/end"');
    expect(app).toContain('const sending = $derived(sessionResponse.sending)');
    expect(handler).toContain('finishResponse(payload.sessionId)');
  });

  test("defines one theme and reserves space only for visible panels", () => {
    expect(theme.match(/:root, :root\.dark\s*{/g)).toHaveLength(1);
    expect(theme).toMatch(/\.workspace-layout\.sidebar-collapsed\s*{\s*grid-template-columns:\s*48px minmax\(0, 1fr\)/);
    expect(theme).toMatch(/\.main-grid\s*{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);/);
    expect(theme).toMatch(/\.main-grid\.activity-open\s*{\s*grid-template-columns:\s*minmax\(0, 1fr\) 292px/);
    expect(app).toContain('class:activity-open={activityOpen}');
    expect(app).toContain('class="conversation-lane"');
  });

  test("retains navigation and activity access in narrow windows", () => {
    expect(theme).toMatch(/\.sidebar\.mobile-open > \.sidebar-navigation\s*{\s*display:\s*flex/);
    expect(theme).toMatch(/\.sidebar,\s*\.sidebar\.collapsed\s*{\s*position:\s*absolute;\s*width:\s*0 !important/);
    expect(theme).toMatch(/\.sidebar\.collapsed > \.sidebar-collapsed-actions\s*{\s*display:\s*none/);
    expect(theme).toMatch(/\.sidebar:not\(\.mobile-open\) #sidebar-toggle\s*{\s*position:\s*fixed/);
    expect(theme).toMatch(/\.activity-panel\.open\s*{\s*display:\s*flex/);
    expect(app).toContain('inert={viewportWidth <= 760 && mobileSidebarOpen}');
    expect(app).toContain('event.isComposing');
    expect(theme).toMatch(/\.quick-actions\s*{\s*width:\s*100% !important/);
    expect(theme).toMatch(/\.workspace-layout\.management-active\s*{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) !important/);
    expect(theme).toMatch(/\.workspace-layout\.mobile-navigation-open \.content-area\s*{\s*grid-column:\s*1/);
  });

  test("keeps the default conversation focused on new session and composer actions", () => {
    expect(app).not.toMatch(/topbar-(new-session|refresh|activity)-btn/);
    const topbar = app.slice(app.indexOf('<header class:sidebar-collapsed'), app.indexOf('<div class:management-active'));
    expect(topbar).not.toContain("createSession()");
    expect(topbar).toContain('popovertarget="workbench-menu"');
    expect(topbar).toContain('popover="auto"');
    expect(topbar).toContain('setActivityOpen(view !== "conversation" || !activityOpen); view = "conversation"');
    expect(topbar).toContain('closeWorkbenchMenu(); openKnowledge()');
    expect(topbar).toContain('closeWorkbenchMenu(); void refresh()');
    expect(app).toContain('<ModeWatcher defaultMode="light"');
    expect(theme).toMatch(/\.sidebar-new-btn\s*\{[^}]*background:\s*var\(--workbench-hover\)/s);
    expect(app).not.toMatch(/conversation-header[^]*aria-label=\{t\("app\.management"\)\}/);
  });

  test("dismisses the top-level popover before panels and restores a visible focus target", () => {
    expect(app).toContain('if (document.getElementById("workbench-menu")?.matches(":popover-open")) return;');
    expect(app).toMatch(/function closeWorkbenchMenu\(\): void \{\s*document\.getElementById\("workbench-menu"\)\?\.hidePopover\(\);\s*document\.getElementById\("activity-toggle"\)\?\.focus\(\);/);
    const composer = readFileSync(new URL("../components/DshPromptComposer.svelte", import.meta.url), "utf8");
    expect(composer).toContain("{#if sessionId && (unsupportedImages || imageActionBlocked)}");
    expect(composer).not.toContain("{#if sessionId && !imageInputSupported}");
  });

  test("restores focus after navigation and panel transitions", () => {
    expect(app).toContain('import { onMount, tick } from "svelte"');
    expect(app).toContain('document.getElementById("workbench-content")?.focus()');
    expect(app).toContain('document.getElementById("activity-toggle")');
    expect(app).toMatch(/async function createSession[^]*?closeMobileSidebar\(\)/);
    expect(app).toContain('if (view === "settings") return;');
  });

  test("closes the composer action menu when the pointer leaves its container", () => {
    const composer = readFileSync(new URL("../components/DshPromptComposer.svelte", import.meta.url), "utf8");
    expect(composer).toContain('document.addEventListener("pointerdown", closeActionMenu)');
    expect(composer).toContain('!actionMenuRef.contains(event.target as Node)');
    expect(composer).toContain('bind:this={actionMenuRef}');
  });

  test("keeps session selection and deletion as independent native buttons", () => {
    expect(app).not.toContain('class="session-hover-action"');
    expect(app).toContain('<button class="session-delete"');
    expect(app).toContain('aria-current={session.sessionId === activeSessionId');
  });

  test("replaces the unsupported deployment action with confirmed deletion", () => {
    expect(app).not.toContain("deployUnavailable");
    expect(app).not.toContain("<Rocket");
    expect(app).toContain('t("session.deleteSession")');
    expect(app).toContain("DeleteSessionDialog");
    expect(theme).toContain(".session-item-actions button:disabled");
  });

  test("keeps the mobile conversation viewport wider than the navigation rail", () => {
    const mobileStart = css.lastIndexOf("@media (max-width: 760px)");
    expect(mobileStart).toBeGreaterThan(css.lastIndexOf(".sidebar {\n  width: 256px;"));

    const mobileRules = css.slice(mobileStart);
    expect(mobileRules).toMatch(/\.workspace-layout\s*{\s*grid-template-columns:\s*48px minmax\(0, 1fr\)/);
    expect(mobileRules).toMatch(/\.main-grid(?:,\s*\.main-grid\.activity-open)?\s*{\s*grid-template-columns:\s*minmax\(0, 1fr\)/);
    expect(css).toMatch(/\.main-grid\s*{\s*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(0, 1fr\);\s*}\s*\.main-grid\.activity-open\s*{\s*grid-template-columns:\s*minmax\(0, 1fr\)\s+292px/);
    expect(mobileRules).toMatch(/\.sidebar\s*{\s*width:\s*48px/);
    expect(mobileRules).toMatch(/\.quick-actions\s*{[^}]*flex-wrap:\s*wrap !important/s);
  });

  test("keeps narrow management tabs content-sized inside a scrollable row", () => {
    const narrowStart = css.lastIndexOf("@media (max-width: 960px)");
    const narrowRules = css.slice(narrowStart);

    expect(narrowRules).toMatch(/\.management-nav,\s*\.management-content\s*{[^}]*min-width:\s*0/s);
    expect(narrowRules).toMatch(/\.management-nav button\s*{[^}]*width:\s*auto/s);
    expect(narrowRules).toMatch(/\.management-nav button\s*{[^}]*flex:\s*0 0 auto/s);
  });

  test("does not apply legacy avatar sizing to transcript content", () => {
    expect(css).not.toMatch(/\.conversation-root \.transcript-message > :first-child/);
    expect(css).not.toMatch(/\.conversation-root \.tool-message > :first-child/);
    expect(css).toMatch(/\.conversation-root \.transcript-message > \.assistant-content/);
    expect(css).toMatch(/\.conversation-root \.transcript-message > \.user-content/);
    expect(css).toMatch(/\.conversation-root \.tool-message > \.tool-content/);
  });
});
