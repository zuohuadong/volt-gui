import { afterEach, describe, expect, it, vi } from "vitest";
import { writeClipboard } from "./clipboard";

afterEach(() => vi.unstubAllGlobals());

describe("clipboard bridge", () => {
  it("uses the Electron bridge instead of the restricted web clipboard", async () => {
    const copyText = vi.fn(async () => ({ copied: true as const }));
    vi.stubGlobal("window", { voltDesktop: { copyText } });
    await writeClipboard("C:\\Users\\demo\\extension");
    expect(copyText).toHaveBeenCalledWith("C:\\Users\\demo\\extension");
  });

  it("falls back to the browser clipboard outside Electron", async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await writeClipboard("example");
    expect(writeText).toHaveBeenCalledWith("example");
  });
});
