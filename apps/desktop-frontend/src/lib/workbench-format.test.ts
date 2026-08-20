import { describe, expect, test } from "vitest";

import { compactIdentifier, formatWorkbenchDateTime } from "./workbench-format";

describe("workbench display formatting", () => {
  test("shortens long identifiers while preserving short values", () => {
    expect(compactIdentifier("12345678")).toBe("12345678");
    expect(compactIdentifier("1234567890abcdef")).toBe("12345678…");
  });

  test("formats timestamps in the local Chinese workbench format", () => {
    const localTimestamp = new Date(2026, 6, 22, 8, 30).getTime();
    expect(formatWorkbenchDateTime(localTimestamp)).toBe("2026-07-22 08:30");
    expect(formatWorkbenchDateTime("刚刚")).toBe("刚刚");
    expect(formatWorkbenchDateTime(undefined)).toBe("未记录");
  });
});
