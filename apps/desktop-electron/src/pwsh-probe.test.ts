import assert from "node:assert/strict";
import { test } from "node:test";

import { describePwshProbe, isBundledUnstartable, isCetHardFailure, probeCommand, selectPowerShell } from "./pwsh-probe.ts";

test("probe captures a successful one-shot command", async () => {
  const result = await probeCommand(process.execPath, ["-e", "console.log('7.4.21')"]);
  assert.deepEqual(result, { ok: true, version: "7.4.21", exitCode: 0 });
});

test("probe reports the exit code of a failing command", async () => {
  const result = await probeCommand(process.execPath, ["-e", "console.error('boom'); process.exit(3)"]);
  assert.equal(result.ok, false);
  assert.equal(result.exitCode, 3);
  assert.match(result.error ?? "", /boom/u);
});

test("probe fails closed when the executable is missing", async () => {
  const result = await probeCommand("definitely-not-a-real-pwsh", ["-NoLogo"]);
  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /ENOENT|not found|no such file/iu);
});

test("describePwshProbe summarizes success", () => {
  const line = describePwshProbe({ ok: true, version: "7.4.21", exitCode: 0 }, "C:\\Anyong\\pwsh.exe");
  assert.equal(line, "[Electron] PowerShell probe ok version=7.4.21 executable=C:\\Anyong\\pwsh.exe");
});

test("describePwshProbe explains the CET hard failure", () => {
  const line = describePwshProbe(
    { ok: false, exitCode: -2146233082, error: "Fatal error. Your Windows doesn't fully support CET." },
    "C:\\Anyong\\pwsh.exe",
  );
  assert.match(line, /exit=-2146233082/u);
  assert.match(line, /CET 自检失败/u);
});

test("describePwshProbe keeps unrelated failures short", () => {
  const line = describePwshProbe({ ok: false, exitCode: 5, error: "boom" }, "pwsh");
  assert.match(line, /exit=5/u);
  assert.doesNotMatch(line, /CET/u);
});
const cetFailure = { ok: false as const, exitCode: -2146233082, error: "Fatal error. Your Windows doesn't fully support CET." };

test("isCetHardFailure accepts signed and unsigned Windows exit codes", () => {
  assert.equal(isCetHardFailure({ ok: false, exitCode: -2146233082 }), true);
  assert.equal(isCetHardFailure({ ok: false, exitCode: 0x80131506 }), true);
  assert.equal(isCetHardFailure({ ok: false, exitCode: 2148734214 }), true);
  assert.equal(isCetHardFailure({ ok: false, exitCode: null, error: "Your Windows doesn't fully support CET." }), true);
  assert.equal(isCetHardFailure({ ok: false, exitCode: 1, error: "boom" }), false);
  assert.equal(isCetHardFailure({ ok: true, version: "7.4.21" }), false);
});

test("selection keeps the bundled shell when it works", async () => {
  const selection = await selectPowerShell({
    bundled: "C:\\bundled\\pwsh.exe",
    system: "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
    probe: async (executable) => ({ ok: true, version: executable.includes("bundled") ? "7.4.21" : "5.1.22621" }),
  });
  assert.equal(selection.source, "bundled");
  assert.equal(selection.path, "C:\\bundled\\pwsh.exe");
  assert.match(selection.reason, /7\.4\.21/u);
});

test("selection falls back to Windows PowerShell only on a CET hard failure", async () => {
  const calls: string[] = [];
  const selection = await selectPowerShell({
    bundled: "bundled",
    system: "system",
    probe: async (executable) => {
      calls.push(executable);
      return executable === "bundled" ? cetFailure : { ok: true, version: "5.1.22621" };
    },
  });
  assert.deepEqual(calls, ["bundled", "system"]);
  assert.equal(selection.source, "system");
  assert.equal(selection.path, "system");
  assert.match(selection.reason, /cannot start/u);
});

test("missing VC++ runtime and invalid images also fall back", async () => {
  for (const exitCode of [3221225781, 3221225595]) {
    const calls: string[] = [];
    const selection = await selectPowerShell({
      bundled: "bundled",
      system: "system",
      probe: async (executable) => {
        calls.push(executable);
        return executable === "bundled" ? { ok: false, exitCode } : { ok: true, version: "5.1.22621" };
      },
    });
    assert.equal(isBundledUnstartable({ ok: false, exitCode }), true);
    assert.equal(selection.source, "system");
  }
});

test("non-CET failures never change the PowerShell implementation", async () => {
  const calls: string[] = [];
  const selection = await selectPowerShell({
    bundled: "bundled",
    system: "system",
    probe: async (executable) => {
      calls.push(executable);
      return { ok: false, exitCode: 1, error: "unexpected" };
    },
  });
  assert.deepEqual(calls, ["bundled"]);
  assert.equal(selection.source, "bundled");
});

test("ANYONG_PWSH_FALLBACK=0 disables the fallback", async () => {
  const calls: string[] = [];
  const selection = await selectPowerShell({
    bundled: "bundled",
    system: "system",
    enabled: false,
    probe: async (executable) => {
      calls.push(executable);
      return executable === "bundled" ? cetFailure : { ok: true, version: "5.1.22621" };
    },
  });
  assert.deepEqual(calls, ["bundled"]);
  assert.equal(selection.source, "bundled");
});

test("selection reports both-failed instead of pretending success", async () => {
  const selection = await selectPowerShell({
    bundled: "bundled",
    system: "system",
    probe: async () => cetFailure,
  });
  assert.equal(selection.source, "bundled");
  assert.equal(selection.probe.ok, false);
  assert.match(selection.reason, /both/u);
});
