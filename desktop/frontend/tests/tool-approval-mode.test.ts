import { describe, expect, test } from "bun:test";

import {
  backendToolApprovalModeToComposer,
  composerToolApprovalModeToBackend,
} from "../src/lib/tool-approval-mode";

describe("Composer tool approval mode mapping", () => {
  test.each([
    ["ask", "ask"],
    ["auto-approve", "auto"],
    ["full-access", "yolo"],
  ] as const)("maps Composer %s to backend %s", (composerMode, backendMode) => {
    expect(composerToolApprovalModeToBackend(composerMode)).toBe(backendMode);
    expect(backendToolApprovalModeToComposer(backendMode)).toBe(composerMode);
  });
});
