import assert from "node:assert/strict";
import test from "node:test";
import { cropCapture, normalizeCropSelection } from "./screenshot-crop.ts";

const image = { width: 1600, height: 900 };

test("keeps an in-bounds selection as integer image pixels", () => {
  // 两侧边界各自取整，因此宽高可能比传入值多一像素，符合裁剪的实际像素范围。
  assert.deepEqual(normalizeCropSelection({ x: 10.4, y: 20.6, width: 300.2, height: 200.9 }, image), {
    x: 10, y: 21, width: 301, height: 201,
  });
});

test("clamps selections that run past the edge instead of throwing", () => {
  assert.deepEqual(normalizeCropSelection({ x: 1500, y: 800, width: 400, height: 400 }, image), {
    x: 1500, y: 800, width: 100, height: 100,
  });
  assert.deepEqual(normalizeCropSelection({ x: -40, y: -30, width: 200, height: 100 }, image), {
    x: 0, y: 0, width: 160, height: 70,
  });
});

test("rejects selections that cannot produce a meaningful image", () => {
  assert.throws(() => normalizeCropSelection(null, image), /框选区域无效/u);
  assert.throws(() => normalizeCropSelection({ x: 1, y: 1, width: 0, height: 10 }, image), /框选区域无效/u);
  assert.throws(() => normalizeCropSelection({ x: 1, y: 1, width: Number.NaN, height: 10 }, image), /框选区域无效/u);
  assert.throws(() => normalizeCropSelection({ x: 5, y: 5, width: 5, height: 5 }, image), /至少选择 8 × 8/u);
  assert.throws(() => normalizeCropSelection({ x: 4000, y: 4000, width: 50, height: 50 }, image), /超出截图范围/u);
});

test("crop returns a png data url of the requested rectangle", () => {
  const requests: unknown[] = [];
  const png = cropCapture({
    getSize: () => image,
    crop: (rectangle) => {
      requests.push(rectangle);
      return { toPNG: () => Buffer.from("cropped") };
    },
  }, { x: 100, y: 100, width: 320, height: 240 });
  assert.deepEqual(requests, [{ x: 100, y: 100, width: 320, height: 240 }]);
  assert.equal(png, `data:image/png;base64,${Buffer.from("cropped").toString("base64")}`);
});

test("empty or oversized crops are refused", () => {
  assert.throws(() => cropCapture({
    getSize: () => image,
    crop: () => ({ toPNG: () => Buffer.alloc(0) }),
  }, { x: 10, y: 10, width: 100, height: 100 }), /截图区域为空/u);
  assert.throws(() => cropCapture({
    getSize: () => image,
    crop: () => ({ toPNG: () => Buffer.alloc(33 * 1024 * 1024) }),
  }, { x: 10, y: 10, width: 100, height: 100 }), /请缩小框选范围/u);
});