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
