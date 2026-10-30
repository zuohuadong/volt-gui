import assert from "node:assert/strict";
import fs from "node:fs";
import { assertSourceOrder } from "../../../scripts/source-order.mjs";
import test from "node:test";
import type { DesktopCapturerSource } from "electron";
import { captureScreen } from "./screen-capture.ts";

const displays = [
  { id: 11, size: { width: 1920, height: 1080 }, scaleFactor: 1 },
  { id: 22, size: { width: 2560, height: 1440 }, scaleFactor: 2 },
];
function source(displayId: string, content: string, empty = false): DesktopCapturerSource {
  return {
    display_id: displayId,
    thumbnail: { isEmpty: () => empty, toPNG: () => Buffer.from(content) },
  } as DesktopCapturerSource;
}

test("captures the selected display at physical resolution without opening a media stream", async () => {
  const png = await captureScreen({
    displays,
    chooseDisplay: async (labels) => { assert.equal(labels.length, 2); return 1; },
    isAvailable: () => true,
    getSources: async (options) => {
      assert.deepEqual(options.thumbnailSize, { width: 5120, height: 2880 });
      assert.deepEqual(options.types, ["screen"]);
      return [source("11", "wrong"), source("22", "selected")];
    },
  });
  assert.equal(png, `data:image/png;base64,${Buffer.from("selected").toString("base64")}`);
});

test("cancel and destroyed owners never capture a screen", async () => {
  for (const [selected, available] of [[null, true], [0, false]] as const) {
    assert.equal(await captureScreen({
      displays,
      chooseDisplay: async () => selected,
      isAvailable: () => available,
      getSources: async () => { assert.fail("must not capture"); },
    }), null);
  }
});

test("discards capture when the owner closes while sources are loading", async () => {
  let available = true;
  assert.equal(await captureScreen({
    displays,
    chooseDisplay: async () => 0,
    isAvailable: () => available,
    getSources: async () => { available = false; return [source("11", "discard")]; },
  }), null);
});

test("never substitutes another monitor for a missing multi-screen selection", async () => {
  await assert.rejects(captureScreen({
    displays, chooseDisplay: async () => 1, isAvailable: () => true,
    getSources: async () => [source("11", "wrong")],
  }), /屏幕捕获失败/);
});

test("rejects an explicitly different screen even on a single-monitor host", async () => {
  await assert.rejects(captureScreen({
    displays: displays.slice(0, 1), chooseDisplay: async () => 0, isAvailable: () => true,
    getSources: async () => [source("22", "unselected")],
  }), /屏幕捕获失败/);
});

test("rejects empty, oversized and unavailable screen captures", async () => {
  for (const capture of [source("11", "", true), source("11", ""), source("11", "x".repeat(32 * 1024 * 1024 + 1))]) {
    await assert.rejects(captureScreen({
      displays, chooseDisplay: async () => 0, isAvailable: () => true,
      getSources: async () => [capture],
    }));
  }
  await assert.rejects(captureScreen({
    displays: [], chooseDisplay: async () => 0, isAvailable: () => true,
    getSources: async () => [],
  }), /没有可用的屏幕/);
});

test("uses a single source without a display id only on a single-monitor host", async () => {
  assert.ok(await captureScreen({
    displays: displays.slice(0, 1), chooseDisplay: async () => 0, isAvailable: () => true,
    getSources: async () => [source("", "single")],
  }));
});

test("capture is exposed only through trusted IPC and only microphone media is allowed", () => {
  const main = fs.readFileSync(new URL("./main.ts", import.meta.url), "utf8");
  assert.match(main, /handleTrustedIpc\("desktop:capture-screen"/);
  assert.match(main, /setPermissionCheckHandler\(\(webContents, permission, _requestingOrigin, details\) =>/);
  assert.match(main, /isTrustedMicrophonePermission\(webContents, permission, details\)/);
  assert.match(main, /setDisplayMediaRequestHandler\(\(_request, callback\) => callback\(null\)\)/);
  assert.match(main, /dialog\.showMessageBox\(owner/);
  // 只在该 IPC 处理器内部比较顺序，避免命中文件顶部的变量声明。
  const handlerStart = main.indexOf('handleTrustedIpc("desktop:capture-screen"');
  assert.ok(handlerStart > 0, "未找到截图 IPC 注册");
  const handlerEnd = main.indexOf("\nhandleTrustedIpc(", handlerStart + 1);
  const handler = main.slice(handlerStart, handlerEnd < 0 ? undefined : handlerEnd);
  assertSourceOrder(handler, [
    { needle: "screenCaptureBusy = true;", label: "占用屏幕捕获" },
    { needle: "screenCaptureBusy = false;", label: "释放屏幕捕获" },
  ], "屏幕捕获必须先占用、结束后释放");
});
