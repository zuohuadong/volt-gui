import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

describe("trusted intranet approval UI", () => {
  test("offers only one-time, permanent, and deny choices for the fresh approval", () => {
    const source = readFileSync(new URL("../src/components/Transcript.svelte", import.meta.url), "utf8");
    expect(source).toContain('approval.tool === "trusted_intranet_access"');
    expect(source).toContain("仅本次允许");
    expect(source).toContain("永久允许");
    expect(source).toContain("拒绝");
  });

  test("settings component lists exact host, CIDR, port and exposes revoke", () => {
    const source = readFileSync(new URL("../src/components/TrustedIntranetSettings.svelte", import.meta.url), "utf8");
    expect(source).toContain("可信内网站点");
    expect(source).toContain("site.cidrs");
    expect(source).toContain("site.ports");
    expect(source).toContain("撤销授权");
  });
});
