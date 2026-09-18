import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { SmbMountManager } from "./smb-mounts.ts";

test("non-Windows platforms degrade to unsupported without invoking PowerShell", async () => {
  let calls = 0;
  const manager = new SmbMountManager({
    platform: "darwin",
    configPath: path.join(await mkdtemp(path.join(tmpdir(), "voltui-smb-")), "mounts.json"),
    run: async () => { calls += 1; return { stdout: "", stderr: "" }; },
  });
  const result = await manager.mount({ displayName: "工程共享", remotePath: "\\\\nas\\engineering", localPath: "z:" });
  assert.equal(result.status, "unsupported");
  assert.equal(calls, 0);
  assert.equal((await manager.list())[0].remotePath, "\\\\nas\\engineering");
});

test("mount requests validate paths and never persist credentials", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "voltui-smb-"));
  const calls: string[][] = [];
  const manager = new SmbMountManager({
    platform: "win32",
    configPath: path.join(root, "mounts.json"),
    run: async (file, args) => { calls.push([file, ...args]); return { stdout: "", stderr: "" }; },
  });
  const result = await manager.mount({ id: "engineering", displayName: "工程共享", remotePath: "\\\\nas\\engineering", localPath: "z:", autoMount: true });
  assert.equal(result.status, "mounted");
  assert.equal(calls.some((call) => call.join(" ").includes("New-SmbMapping")), true);
  assert.equal(calls.some((call) => call.join(" ").includes("-Persistent $true")), true);
  const stored = await readFile(path.join(root, "mounts.json"), "utf8");
  assert.doesNotMatch(stored, /password|credential|secret/i);
  await assert.rejects(() => manager.mount({ displayName: "bad", remotePath: "https://example.com", localPath: "Y:" }));
  await assert.rejects(() => manager.mount({ displayName: "bad", remotePath: "\\\\nas\\engineering", localPath: "not-a-drive" }));
});

test("existing mappings are idempotent and configured paths can be opened", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "voltui-smb-"));
  let newMappingCalls = 0;
  const manager = new SmbMountManager({
    platform: "win32",
    configPath: path.join(root, "mounts.json"),
    run: async (_file, args) => {
      const command = args.at(-1) ?? "";
      if (command.includes("New-SmbMapping")) newMappingCalls += 1;
      return command.includes("Get-SmbMapping")
        ? { stdout: '{"LocalPath":"Z:","RemotePath":"\\\\\\\\nas\\\\engineering"}', stderr: "" }
        : { stdout: "", stderr: "" };
    },
  });
  const result = await manager.mount({ displayName: "Engineering Share", remotePath: "\\\\nas\\engineering", localPath: "Z:" });
  assert.equal(result.status, "mounted");
  assert.equal(newMappingCalls, 0);
  assert.equal(await manager.resolveOpenPath("z:"), "Z:");
});

test("mapping conflicts do not overwrite the saved definition", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "voltui-smb-"));
  const manager = new SmbMountManager({
    platform: "win32",
    configPath: path.join(root, "mounts.json"),
    run: async (_file, args) => {
      const command = args.at(-1) ?? "";
      return command.includes("Get-SmbMapping")
        ? { stdout: JSON.stringify({ LocalPath: "Z:", RemotePath: "\\\\nas\\other-share" }), stderr: "" }
        : { stdout: "", stderr: "" };
    },
  });
  const result = await manager.mount({ id: "engineering", displayName: "工程共享", remotePath: "\\\\nas\\engineering", localPath: "Z:" });
  assert.equal(result.status, "error");
  assert.match(result.lastError ?? "", /已映射到其他网络路径/);
  assert.deepEqual(await manager.list(), []);
});

test("removing a mounted definition unmaps the drive before deleting it", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "voltui-smb-"));
  const commands: string[] = [];
  const manager = new SmbMountManager({
    platform: "win32",
    configPath: path.join(root, "mounts.json"),
    run: async (_file, args) => {
      const command = args.at(-1) ?? "";
      commands.push(command);
      return command.includes("Get-SmbMapping")
        ? { stdout: JSON.stringify({ LocalPath: "Z:", RemotePath: "\\\\nas\\engineering" }), stderr: "" }
        : { stdout: "", stderr: "" };
    },
  });
  await manager.mount({ id: "engineering", displayName: "工程共享", remotePath: "\\\\nas\\engineering", localPath: "Z:" });
  await manager.remove("engineering");
  assert.equal(commands.some((command) => command.includes("Remove-SmbMapping")), true);
  assert.deepEqual(await manager.list(), []);
});

test("mapping query failures surface as an offline status", async () => {
  const manager = new SmbMountManager({
    platform: "win32",
    configPath: path.join(await mkdtemp(path.join(tmpdir(), "voltui-smb-")), "mounts.json"),
    run: async (_file, args) => {
      if ((args.at(-1) ?? "").includes("Get-SmbMapping")) throw new Error("network timeout");
      return { stdout: "", stderr: "" };
    },
  });
  await manager.mount({ id: "engineering", displayName: "工程共享", remotePath: "\\\\nas\\engineering", localPath: "Z:" });
  const [view] = await manager.list();
  assert.equal(view.status, "offline");
  assert.match(view.lastError ?? "", /network timeout/);
});

test("SMB errors are classified for actionable UI states", async () => {
  const manager = new SmbMountManager({
    platform: "win32",
    configPath: path.join(await mkdtemp(path.join(tmpdir(), "voltui-smb-")), "mounts.json"),
    run: async () => { throw new Error("System error 1326: logon failure"); },
  });
  const result = await manager.mount({ displayName: "工程共享", remotePath: "\\\\nas\\engineering", localPath: "Z:" });
  assert.equal(result.status, "requires_credentials");
});

test("UNC paths reject traversal and Windows-invalid segments", async () => {
  const manager = new SmbMountManager({
    platform: "darwin",
    configPath: path.join(await mkdtemp(path.join(tmpdir(), "voltui-smb-")), "mounts.json"),
  });
  await assert.rejects(() => manager.mount({ displayName: "bad", remotePath: "\\\\nas\\..\\secret", localPath: "Z:" }));
  await assert.rejects(() => manager.mount({ displayName: "bad", remotePath: "\\\\nas\\share:name", localPath: "Z:" }));
});
