import { describe, expect, test } from "vitest";

import { addDiffReviewComment, buildDiffFixPrompt, diffRevision, parsePersistedDiffComments } from "./diff-review";

describe("diff review comments", () => {
  test("attaches a review comment to an exact file and diff line", () => {
    const comments = addDiffReviewComment([], {
      id: "comment-1",
      tabId: "tab-1",
      path: "src/App.svelte",
      revision: "rev-1",
      line: 42,
      body: "这里需要保留失败后的草稿。",
      createdAtMs: 100,
    });

    expect(comments).toEqual([expect.objectContaining({ path: "src/App.svelte", line: 42, status: "open" })]);
  });

  test("builds a bounded fix request from open comments only", () => {
    const prompt = buildDiffFixPrompt("src/App.svelte", "rev-1", [
      { id: "a", tabId: "tab-1", path: "src/App.svelte", revision: "rev-1", line: 12, body: "补充空状态。", status: "open", createdAtMs: 1 },
      { id: "b", tabId: "tab-1", path: "src/App.svelte", revision: "rev-1", line: 30, body: "已处理。", status: "resolved", createdAtMs: 2 },
      { id: "c", tabId: "tab-1", path: "src/App.svelte", revision: "rev-old", line: 4, body: "旧 Diff 评论。", status: "open", createdAtMs: 0 },
    ]);

    expect(prompt).toContain("src/App.svelte");
    expect(prompt).toContain("Diff 第 12 行：补充空状态。");
    expect(prompt).not.toContain("已处理");
    expect(prompt).not.toContain("旧 Diff 评论");
  });

  test("drops malformed persisted comments", () => {
    const comments = parsePersistedDiffComments(JSON.stringify([
      { id: "valid", tabId: "tab-1", path: "src/a.ts", revision: "rev-1", line: 3, body: "修复这里", status: "open", createdAtMs: 1 },
      { id: "invalid", path: "", line: -1, body: "" },
    ]));
    expect(comments.map((comment) => comment.id)).toEqual(["valid"]);
  });

  test("fingerprints the exact diff so stale line comments cannot drive a new repair", () => {
    expect(diffRevision("@@ -1 +1 @@\n-old\n+new")).toBe(diffRevision("@@ -1 +1 @@\n-old\n+new"));
    expect(diffRevision("@@ -1 +1 @@\n-old\n+new")).not.toBe(diffRevision("@@ -1 +1 @@\n-old\n+newer"));
  });
});
