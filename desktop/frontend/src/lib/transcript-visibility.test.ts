import { describe, expect, test } from "vitest";

import { stripInternalTranscriptBlocks } from "./transcript-visibility";

describe("transcript visibility", () => {
  test("removes internal capability routing blocks before rendering", () => {
    const value = `<capability-route version="1">\nroute: internal\n</capability-route>\n\n请检查这个文件。`;
    expect(stripInternalTranscriptBlocks(value)).toBe("请检查这个文件。");
  });

  test("removes repeated internal blocks while preserving user content", () => {
    const value = `<<capability-route version="1">hidden</capability-route>\n<active-goal>hidden</active-goal>\n用户问题`;
    expect(stripInternalTranscriptBlocks(value)).toBe("用户问题");
  });
});
