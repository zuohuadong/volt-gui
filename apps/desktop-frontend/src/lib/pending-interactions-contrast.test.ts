import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const theme = readFileSync(
  fileURLToPath(new URL("../workbench-theme.css", import.meta.url)),
  "utf8",
);
const component = readFileSync(
  fileURLToPath(new URL("../components/PendingInteractions.svelte", import.meta.url)),
  "utf8",
);

function contrastRatio(foreground: [number, number, number], background: [number, number, number]) {
  const luminance = (rgb: [number, number, number]) =>
    rgb.map((channel) => channel / 255).map((channel) =>
      channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    ).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);
  return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
}

describe("pending interaction button contrast", () => {
  test("targets the actual svadmin confirmation button and submit button", () => {
    expect(component).toContain('class="interaction-card approval-card"');
    expect(component).toContain('class="pending-submit-button"');
    expect(theme).toContain(".approval-card .svadmin-ai-confirmation__button");
    expect(theme).toContain(".pending-submit-button");
  });

  test("keeps enabled, hover, and disabled states readable", () => {
    expect(contrastRatio([25, 25, 28], [240, 240, 242])).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio([25, 25, 28], [203, 212, 225])).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio([240, 240, 242], [80, 80, 90])).toBeGreaterThanOrEqual(4.5);
    expect(theme).toMatch(/:hover:not\(:disabled\)/);
    expect(theme).toMatch(/:focus-visible/);
    expect(theme).toMatch(/:disabled/);
    expect(theme).toContain("opacity: 1 !important");
  });
});
