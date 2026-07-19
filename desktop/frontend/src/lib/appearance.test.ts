import { describe, expect, it } from "vitest";
import { APPEARANCE_STYLES, normalizeAppearanceStyle } from "./appearance";
import { normalizeTypographyPreferences, sanitizeCustomFontName } from "./typography-preferences";

describe("Volt appearance preferences", () => {
  it("keeps only supported surface styles", () => {
    expect(APPEARANCE_STYLES).toContain("graphite");
    expect(normalizeAppearanceStyle("not-a-style")).toBe("graphite");
    expect(normalizeAppearanceStyle("glacier")).toBe("glacier");
  });

  it("clamps regional typography and rejects CSS injection characters", () => {
    const preferences = normalizeTypographyPreferences({
      conversation: { followGlobal: false, fontFamily: "noto", fontSize: 999 },
      code: { followGlobal: false, fontFamily: "custom", customFontName: "JetBrains; color:red", fontSize: 1 },
    });
    expect(preferences.conversation.fontSize).toBe(22);
    expect(preferences.code.fontSize).toBe(10);
    expect(preferences.code.customFontName).toBe("");
    expect(sanitizeCustomFontName("  PingFang   SC  ")).toBe("PingFang SC");
    expect(sanitizeCustomFontName("url(https://example.test/font.woff2)")).toBe("");
  });
});
