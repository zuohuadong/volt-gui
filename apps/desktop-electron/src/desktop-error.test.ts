import assert from "node:assert/strict";
import test from "node:test";

import { DesktopErrorCode, desktopError, desktopErrorMessage, parseDesktopErrorCode } from "./desktop-error.ts";

test("desktop errors keep a stable code in the IPC message", () => {
  const error = desktopError(DesktopErrorCode.DSH_NOT_STARTED, "官方 DSH 尚未启动");
  assert.equal(error.message, "VOLT_DSH_NOT_STARTED: 官方 DSH 尚未启动");
  assert.equal(parseDesktopErrorCode(error.message), DesktopErrorCode.DSH_NOT_STARTED);
  assert.equal(desktopErrorMessage(DesktopErrorCode.UNTRUSTED_IPC), "VOLT_UNTRUSTED_IPC");
  assert.equal(parseDesktopErrorCode("random failure"), undefined);
});
