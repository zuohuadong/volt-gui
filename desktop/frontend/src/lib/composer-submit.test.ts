import { describe, expect, test } from "vitest";

import { composerSubmission } from "./composer-submit";

describe("composer submission", () => {
  test("keeps project and permission UI state out of the model prompt", () => {
    expect(composerSubmission({
      text: "比较两家供应商",
      attachmentPaths: ["/workspace/报价.xlsx"],
    })).toEqual({
      displayText: "比较两家供应商 @/workspace/报价.xlsx",
      submitText: "比较两家供应商 @/workspace/报价.xlsx",
    });
  });

  test("supports attachment-only turns without adding hidden metadata", () => {
    expect(composerSubmission({ text: "", attachmentPaths: ["/workspace/说明.md"] })).toEqual({
      displayText: "@/workspace/说明.md",
      submitText: "@/workspace/说明.md",
    });
  });
});
