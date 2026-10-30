import { describe, expect, it } from "vitest";
import { isSelectable, normalizeDragRect, toImageSelection } from "./screenshot-selection";

const bounds = { left: 100, top: 50, right: 900, bottom: 650 };

describe("normalizeDragRect", () => {
  it("keeps forward drags and normalizes backwards drags", () => {
    expect(normalizeDragRect({ x: 200, y: 120 }, { x: 400, y: 320 }, bounds))
      .toEqual({ left: 200, top: 120, right: 400, bottom: 320 });
    expect(normalizeDragRect({ x: 400, y: 320 }, { x: 200, y: 120 }, bounds))
      .toEqual({ left: 200, top: 120, right: 400, bottom: 320 });
  });

  it("clamps drags that leave the image area", () => {
    expect(normalizeDragRect({ x: 0, y: 0 }, { x: 10_000, y: 10_000 }, bounds))
      .toEqual({ left: 100, top: 50, right: 900, bottom: 650 });
  });
});

describe("toImageSelection", () => {
  it("maps css pixels onto the screenshot pixels when the preview is downscaled", () => {
    // 3840×2160 的截图被缩小成 800×450 显示：缩放比是 4.8。
    const selection = toImageSelection(
      { left: 200, top: 100, right: 400, bottom: 200 },
      { rect: { left: 100, top: 50, right: 900, bottom: 500 }, natural: { width: 3840, height: 2160 } },
    );
    expect(selection).toEqual({ x: 480, y: 240, width: 960, height: 480 });
  });

  it("keeps 1:1 selections exact when the preview is not scaled", () => {
    const selection = toImageSelection(
      { left: 150, top: 100, right: 350, bottom: 300 },
      { rect: { left: 100, top: 50, right: 900, bottom: 650 }, natural: { width: 800, height: 600 } },
    );
    expect(selection).toEqual({ x: 50, y: 50, width: 200, height: 200 });
  });

  it("refuses selections that fall outside the image", () => {
    const selection = toImageSelection(
      { left: 0, top: 0, right: 20, bottom: 20 },
      { rect: bounds, natural: { width: 800, height: 600 } },
    );
    expect(selection).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });
});

describe("isSelectable", () => {
  it("requires a minimum edge in css pixels", () => {
    expect(isSelectable({ left: 0, top: 0, right: 7, bottom: 100 })).toBe(false);
    expect(isSelectable({ left: 0, top: 0, right: 8, bottom: 8 })).toBe(true);
  });
});