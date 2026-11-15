import { describe, expect, it } from "vitest";

import {
  diffRows,
  fileChangeLabel,
  isChangedFile,
  isChangesSummary,
  isFileDiff,
  latestChangesAnnouncement,
  summaryLabel,
  type ChangesSummary,
} from "./workspace-changes";

const file = { path: "src/a.ts", display: "src/a.ts", added: 3, deleted: 1 };
const summary: ChangesSummary = { turn: 2, files: [file], total: 1, added: 3, deleted: 1 };

describe("summary validation", () => {
  it("accepts the served shape", () => {
    expect(isChangedFile(file)).toBe(true);
    expect(isChangesSummary(summary)).toBe(true);
  });

  it("rejects rows without paths, counts or with a wrong shape", () => {
    expect(isChangedFile({ ...file, path: "" })).toBe(false);
    expect(isChangedFile({ ...file, added: -1 })).toBe(false);
    expect(isChangedFile({ ...file, binary: false })).toBe(false);
    expect(isChangesSummary({ ...summary, turn: 0 })).toBe(false);
    expect(isChangesSummary({ ...summary, files: [{ path: "x" }] })).toBe(false);
    expect(isChangesSummary({ ...summary, files: "nope" })).toBe(false);
  });
});

describe("diff validation", () => {
  const diff = {
    kind: "text", path: "a", display: "a", before: true, after: true, coarse: false,
    hunks: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 2, lines: ["-a", "+b", " c"] }],
  };

  it("accepts a valid text diff and the two non-text kinds", () => {
    expect(isFileDiff(diff)).toBe(true);
    expect(isFileDiff({ kind: "binary", path: "a", display: "a" })).toBe(true);
    expect(isFileDiff({ kind: "oversized", path: "a", display: "a" })).toBe(true);
  });

  it("rejects malformed hunks and unknown kinds", () => {
    expect(isFileDiff({ ...diff, hunks: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: ["a"] }] })).toBe(false);
    expect(isFileDiff({ ...diff, hunks: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: [""] }] })).toBe(false);
    expect(isFileDiff({ ...diff, kind: "patch" })).toBe(false);
    expect(isFileDiff({ kind: "binary", display: "a" })).toBe(false);
  });
});

describe("labels", () => {
  it("renders per-file and whole-summary counts", () => {
    expect(fileChangeLabel(file)).toBe("+3 −1");
    expect(fileChangeLabel({ ...file, binary: true })).toBe("binary");
    expect(fileChangeLabel({ ...file, oversized: true })).toBe("oversized");
    expect(summaryLabel({ ...summary, total: 3, files: [file] })).toEqual({ files: 3, added: 3, deleted: 1, omitted: 2 });
  });
});

describe("diffRows", () => {
  it("keeps the official prefix semantics and inserts a hunk marker", () => {
    const rows = diffRows({
      kind: "text", path: "a", display: "a", before: true, after: true, coarse: false,
      hunks: [{ oldStart: 4, oldLines: 2, newStart: 4, newLines: 3, lines: [" same", "-old", "+new", "+more"] }],
    });
    expect(rows).toEqual([
      { kind: "meta", text: "@@ -4,2 +4,3 @@" },
      { kind: "context", text: "same" },
      { kind: "remove", text: "old" },
      { kind: "add", text: "new" },
      { kind: "add", text: "more" },
    ]);
  });

  it("returns no rows for binary or oversized comparisons", () => {
    expect(diffRows({ kind: "binary", path: "a", display: "a" })).toEqual([]);
    expect(diffRows({ kind: "oversized", path: "a", display: "a" })).toEqual([]);
  });
});

describe("latestChangesAnnouncement", () => {
  it("keeps the latest announcement per history order", () => {
    const entries = [
      { event: { type: "workspace/changes", seq: 12, data: { turn: 1 } } },
      { event: { type: "turn/end", seq: 13 } },
      { event: { type: "workspace/changes", seq: 21, data: { turn: 2 } } },
    ];
    expect(latestChangesAnnouncement(entries)).toEqual({ seq: 21, turn: 2 });
  });

  it("ignores malformed announcements", () => {
    expect(latestChangesAnnouncement([{ event: { type: "workspace/changes", seq: 1, data: { turn: 0 } } }])).toBeNull();
    expect(latestChangesAnnouncement([])).toBeNull();
  });
});