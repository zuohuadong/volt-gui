import { describe, expect, test } from "vitest";
import {
  matchesReviewPatchAck,
  matchesReviewWorkflowAck,
  reviewActionsForSource,
  reviewFileBelongsToSource,
  reviewPatchConflicts,
  reviewRevisionForAction,
} from "./review-workflow";

describe("review workflow", () => {
  test("maps exact staged and unstaged actions", () => {
    expect(reviewActionsForSource("unstaged")).toEqual(["stage", "revert"]);
    expect(reviewActionsForSource("unstaged", true)).toEqual(["stage"]);
    expect(reviewActionsForSource("staged")).toEqual(["unstage", "revert"]);
  });

  test("places dual-state files in both sources", () => {
    const file = { path: "src/App.svelte", sources: ["git"], indexStatus: "M", worktreeStatus: "M" };
    expect(reviewFileBelongsToSource(file, "staged")).toBe(true);
    expect(reviewFileBelongsToSource(file, "unstaged")).toBe(true);
    expect(reviewFileBelongsToSource({ path: "new.txt", sources: ["git"], indexStatus: "?", worktreeStatus: "?" }, "unstaged")).toBe(true);
  });

  test("requires path, action, ticket, generation, and revision for patch ACK", () => {
    const pending = {
      tabId: "tab-1",
      path: "src/App.svelte",
      action: "stage" as const,
      source: "unstaged" as const,
      ticket: 8,
      sourceGeneration: 3,
      sourceRevision: "rev-1",
    };
    const ack = { ...pending, status: "success", applied: [], skipped: [], conflicted: [], changes: { files: [], gitAvailable: true }, diff: { path: pending.path, kind: "modify", diff: "", added: 0, removed: 0, binary: false, truncated: false } };
    expect(matchesReviewPatchAck(pending, ack)).toBe(true);
    expect(matchesReviewPatchAck(pending, { ...ack, ticket: 9 })).toBe(false);
    expect(matchesReviewPatchAck(pending, { ...ack, sourceRevision: "rev-2" })).toBe(false);
    expect(reviewPatchConflicts(pending, pending.path)).toBe(true);
    expect(reviewPatchConflicts(pending, "other.ts")).toBe(false);
  });

  test("keeps workflow ACKs behind one generation gate", () => {
    const pending = { tabId: "tab-1", action: "commit" as const, ticket: 4, sourceGeneration: 9, expectedGeneration: "tree-9", message: "feat" };
    const ack = { ...pending, status: "success", changes: { files: [], gitAvailable: true } };
    expect(matchesReviewWorkflowAck(pending, ack)).toBe(true);
    expect(matchesReviewWorkflowAck(pending, { ...ack, action: "push" })).toBe(false);
    expect(matchesReviewWorkflowAck(pending, { ...ack, expectedGeneration: "tree-10" })).toBe(false);
  });

  test("selects the backend revision for the active source", () => {
    const diff = { path: "a", kind: "modify", diff: "", added: 0, removed: 0, binary: false, truncated: false, stagedRevision: "staged-1", unstagedRevision: "unstaged-1" };
    expect(reviewRevisionForAction(diff, "staged")).toBe("staged-1");
    expect(reviewRevisionForAction(diff, "unstaged")).toBe("unstaged-1");
  });
});
