import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  analyzeFailure,
  extractDocument,
  feishuSendNotification,
  githubListIssues,
  githubSearchCode,
  ingestWeKnora,
  sentryListIssues,
  validateEndpoint,
} from "./anyong-integrations-mcp.mjs";

const originalFetch = globalThis.fetch;
const savedEnv = new Map();

function setEnv(values) {
  for (const [key, value] of Object.entries(values)) {
    if (!savedEnv.has(key)) savedEnv.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = String(value);
  }
}

test.after(() => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of savedEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("external endpoints require HTTPS and reject embedded credentials", () => {
  assert.throws(() => validateEndpoint("http://example.com", "endpoint"), /HTTPS/);
  assert.throws(() => validateEndpoint("https://user:pass@example.com", "endpoint"), /credentials/);
  assert.equal(validateEndpoint("http://localhost:8080/api", "endpoint", { allowLocalHttp: true }).hostname, "localhost");
});

test("GitHub adapter maps read-only issue data and never returns the token", async () => {
  setEnv({ GITHUB_TOKEN: "secret-token", GITHUB_API_BASE_URL: "https://api.github.test", GITHUB_ALLOWED_HOSTS: "api.github.test" });
  globalThis.fetch = async (url, options) => {
    assert.match(String(url), /repos\/owner\/repo\/issues/);
    assert.equal(options.headers.Authorization, "Bearer secret-token");
    return new Response(JSON.stringify([{ number: 4, title: "Bug", state: "open", body: "details", user: { login: "alice" }, labels: [{ name: "bug" }] }]), { status: 200 });
  };
  const response = await githubListIssues({ owner: "owner", repo: "repo", state: "open" });
  assert.match(response.content[0].text, /Bug/);
  assert.doesNotMatch(response.content[0].text, /secret-token/);
});

test("GitHub search uses bounded result count", async () => {
  setEnv({ GITHUB_TOKEN: "", GITHUB_API_BASE_URL: "https://api.github.test", GITHUB_ALLOWED_HOSTS: "api.github.test" });
  globalThis.fetch = async (url) => {
    assert.match(String(url), /per_page=50/);
    return new Response(JSON.stringify({ total_count: 1, items: [{ name: "a.ts", path: "a.ts", sha: "abc", repository: { full_name: "o/r" } }] }), { status: 200 });
  };
  const response = await githubSearchCode({ query: "repo:o/r test", limit: 200 });
  assert.match(response.content[0].text, /a\.ts/);
});

test("blank profile values preserve built-in service defaults", async () => {
  setEnv({ GITHUB_TOKEN: "", GITHUB_API_BASE_URL: "", GITHUB_ALLOWED_HOSTS: "" });
  globalThis.fetch = async (url) => {
    assert.match(String(url), /^https:\/\/api\.github\.com\/search\/code/);
    return new Response(JSON.stringify({ total_count: 0, items: [] }), { status: 200 });
  };
  await githubSearchCode({ query: "repo:o/r test" });
});

test("Sentry adapter preserves read-only API semantics", async () => {
  setEnv({ SENTRY_AUTH_TOKEN: "sentry-secret", SENTRY_BASE_URL: "https://sentry.example.test/api/0", SENTRY_ALLOWED_HOSTS: "sentry.example.test", SENTRY_ORG: "acme" });
  globalThis.fetch = async (url, options) => {
    assert.match(String(url), /organizations\/acme\/issues/);
    assert.equal(options.headers.Authorization, "Bearer sentry-secret");
    return new Response(JSON.stringify([{ id: "1", title: "Failure" }]), { status: 200 });
  };
  const response = await sentryListIssues({});
  assert.match(response.content[0].text, /Failure/);
  assert.doesNotMatch(response.content[0].text, /sentry-secret/);
});

test("Feishu notification is fail-closed by default", async () => {
  setEnv({ ANYONG_FEISHU_WRITE_ENABLED: undefined });
  let called = false;
  globalThis.fetch = async () => { called = true; return new Response("{}", { status: 200 }); };
  const response = await feishuSendNotification({ receiveId: "ou_1", text: "hello", confirm: true });
  assert.equal(response.isError, true);
  assert.equal(called, false);
});

test("failure analysis groups bounded excerpts", () => {
  const summary = analyzeFailure("ok\nERROR network timeout\npermission denied\nassert failed");
  assert.equal(summary.failure_line_count, 3);
  assert.equal(summary.categories.timeout, 1);
  assert.equal(summary.categories.permission, 1);
  assert.equal(summary.categories.test, 1);
  assert.equal(summary.excerpts.length, 3);
});

test("WeKnora ingestion refuses writes before reading a path", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "anyong-integrations-"));
  try {
    await mkdir(root, { recursive: true });
    await writeFile(path.join(root, "doc.txt"), "hello");
    setEnv({ ANYONG_WEKNORA_INGEST_ENABLED: undefined, ANYONG_IMPORT_ROOT: root });
    const response = await ingestWeKnora({ path: "doc.txt", knowledgeBaseId: "kb", confirm: true });
    assert.equal(response.isError, true);
    assert.match(response.content[0].text, /disabled/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("document extraction stays inside the configured import root", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "anyong-document-"));
  try {
    await writeFile(path.join(root, "note.txt"), "line one\nline two");
    setEnv({ ANYONG_IMPORT_ROOT: root });
    const response = await extractDocument({ path: "note.txt" });
    assert.match(response.content[0].text, /line one/);
    await assert.rejects(extractDocument({ path: "..\\note.txt" }), /inside ANYONG_IMPORT_ROOT/);
    await assert.rejects(extractDocument({ path: "/etc/passwd" }), /inside ANYONG_IMPORT_ROOT/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
