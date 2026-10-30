import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import test from "node:test";

import { encodeSessionSegment, findSessionDirectories, removeArchivedSessionStorage } from "./session-storage.ts";

async function fixture(): Promise<{ root: string; project: string; session: string }> {
  const root = await mkdtemp(path.join(tmpdir(), "voltui-session-storage-"));
  const project = path.join(root, "--workspace--");
  const session = path.join(project, encodeSessionSegment("session:1"));
  await mkdir(session, { recursive: true });
  await writeFile(path.join(session, "session.v3.jsonl.zstd"), "data");
  return { root, project, session };
}

test("encodes session ids as one safe path segment", () => {
  assert.equal(encodeSessionSegment("session:1"), "session~003A1");
  assert.equal(encodeSessionSegment(".."), "~002E~002E");
  assert.equal(encodeSessionSegment("a/b"), "a~002Fb");
});

test("finds and removes the archived session directory without touching its project", async (t) => {
  const { root, session } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));

  assert.deepEqual(await findSessionDirectories(root, "session:1"), [session]);
  assert.equal(await removeArchivedSessionStorage(root, "session:1"), true);
  assert.deepEqual(await findSessionDirectories(root, "session:1"), []);
  assert.equal(await findSessionDirectories(root, "session:2").then((items) => items.length), 0);
  assert.deepEqual(await findSessionDirectories(root, "session:1"), []);
});

test("returns false for an unknown session and refuses symlinked directories", async (t) => {
  const { root, project, session } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));

  assert.equal(await removeArchivedSessionStorage(root, "missing"), false);

  const link = path.join(project, encodeSessionSegment("session:link"));
  await symlink(session, link, "dir");
  assert.deepEqual(await findSessionDirectories(root, "session:link"), []);
});

test("refuses a directory that does not contain a session log", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "voltui-session-storage-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const project = path.join(root, "--workspace--");
  const session = path.join(project, encodeSessionSegment("session:empty"));
  await mkdir(session, { recursive: true });

  await assert.rejects(() => removeArchivedSessionStorage(root, "session:empty"), /不包含会话日志/u);
});