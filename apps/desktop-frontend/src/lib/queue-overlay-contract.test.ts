import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

describe("queued-message action overlay", () => {
  test("hides the back-to-top control while an action menu is open", () => {
    const queue = readFileSync(resolve("src/components/ThreadQueue.svelte"), "utf8");
    const composer = readFileSync(resolve("src/components/Composer.svelte"), "utf8");
    const app = readFileSync(resolve("src/App.svelte"), "utf8");

    expect(queue).toContain("handleMenuToggle(event, message.id)");
    expect(queue).toContain("onMenuOpenChange?.(next.size > 0)");
    expect(queue).toContain("bottom: calc(100% + 5px)");
    expect(composer).toContain("onMenuOpenChange={onQueueActionMenuOpenChange}");
    expect(app).toContain("visible={backToTopVisible && !queueActionMenuOpen}");
  });
});

describe("queued-message list bounds", () => {
  test("collapses long queues behind an expand toggle so template cards keep their layout", () => {
    const queue = readFileSync(resolve("src/components/ThreadQueue.svelte"), "utf8");

    expect(queue).toContain("COLLAPSED_VISIBLE_COUNT");
    expect(queue).toContain("visibleMessages");
    expect(queue).toContain("展开剩余");
    expect(queue).toContain("overflow: visible");
  });

  test("keeps one rolling queue notice per thread instead of stacking duplicates", () => {
    const app = readFileSync(resolve("src/App.svelte"), "utf8");

    expect(app).toContain("`queue-notice-${tabID}`");
    expect(app).toContain("updateTranscriptItem(noticeId, { body: noticeBody })");
  });

  test("retargets pending follow-ups when a conversation rebinds to a new tab id", () => {
    const app = readFileSync(resolve("src/App.svelte"), "utf8");

    expect(app).toContain("retargetQueuedMessages(queuedMessages, previousTabId, meta.id)");
  });
});
