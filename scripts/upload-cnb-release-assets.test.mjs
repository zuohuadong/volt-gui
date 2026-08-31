import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { releaseAssetPaths, uploadCnbReleaseAssets } from "./upload-cnb-release-assets.mjs";

test("resolves versioned CNB release asset paths", () => {
  assert.deepEqual(releaseAssetPaths("v0.31.2", "dist"), [
    join("dist", "anyong-windows-x64-installer-0.31.2.exe"),
    join("dist", "anyong-windows-x64-portable-0.31.2.zip"),
  ]);
});

test("uploads and verifies both CNB release assets without exposing the token", async () => {
  const fixture = mkdtempSync(join(tmpdir(), "cnb-release-assets-"));
  const dist = join(fixture, "dist");
  mkdirSync(dist);
  for (const filePath of releaseAssetPaths("v0.31.2", dist)) writeFileSync(filePath, "artifact");

  const calls = [];
  const uploads = [];
  const responses = [
    { ok: true, status: 200, json: async () => ({ id: "release-id" }) },
    { ok: true, status: 200, json: async () => ({ upload_url: "https://upload/installer", verify_url: "https://verify/installer" }) },
    { ok: true, status: 200 },
    { ok: true, status: 200, json: async () => ({ upload_url: "https://upload/portable", verify_url: "https://verify/portable" }) },
    { ok: true, status: 200 },
  ];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    return responses.shift();
  };

  const previousCwd = process.cwd();
  process.chdir(fixture);
  try {
    const uploaded = await uploadCnbReleaseAssets({
      env: {
        CNB_TOKEN: "secret-token",
        CNB_API_ENDPOINT: "https://api.cnb.cool",
        CNB_REPO_SLUG: "group/repo",
        CNB_BRANCH: "v0.31.2",
        CNB_DIST_DIR: dist,
      },
      fetchImpl,
      uploadFileImpl: async (url, filePath) => uploads.push({ url, filePath }),
    });
    assert.deepEqual(uploaded, [
      "anyong-windows-x64-installer-0.31.2.exe",
      "anyong-windows-x64-portable-0.31.2.zip",
    ]);
    assert.equal(calls.length, 5);
    assert.equal(uploads.length, 2);
    assert.equal(calls[0].url, "https://api.cnb.cool/group/repo/-/releases/tags/v0.31.2");
    assert.equal(calls[0].options.headers.Authorization, "token secret-token");
    assert.equal(calls[1].options.headers.Authorization, "Bearer secret-token");
    assert.equal(uploads[0].url, "https://upload/installer");
  } finally {
    process.chdir(previousCwd);
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("can upload one selected CNB release asset", async () => {
  const fixture = mkdtempSync(join(tmpdir(), "cnb-release-asset-"));
  const dist = join(fixture, "dist");
  mkdirSync(dist);
  for (const filePath of releaseAssetPaths("v0.31.2", dist)) writeFileSync(filePath, "artifact");

  const calls = [];
  const uploads = [];
  const responses = [
    { ok: true, status: 200, json: async () => ({ id: "release-id" }) },
    { ok: true, status: 200, json: async () => ({ upload_url: "https://upload/portable", verify_url: "https://verify/portable" }) },
    { ok: true, status: 200 },
  ];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    return responses.shift();
  };

  try {
    const uploaded = await uploadCnbReleaseAssets({
      env: {
        CNB_TOKEN: "secret-token",
        CNB_API_ENDPOINT: "https://api.cnb.cool",
        CNB_REPO_SLUG: "group/repo",
        CNB_BRANCH: "v0.31.2",
        CNB_DIST_DIR: dist,
        CNB_RELEASE_ASSET: "anyong-windows-x64-portable-0.31.2.zip",
      },
      fetchImpl,
      uploadFileImpl: async (url, filePath) => uploads.push({ url, filePath }),
    });
    assert.deepEqual(uploaded, ["anyong-windows-x64-portable-0.31.2.zip"]);
    assert.equal(calls.length, 3);
    assert.equal(uploads.length, 1);
    assert.match(uploads[0].filePath, /portable-0\.31\.2\.zip$/);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("fails closed when the temporary CNB token is absent", async () => {
  await assert.rejects(
    uploadCnbReleaseAssets({ env: {}, fetchImpl: async () => assert.fail("fetch should not run") }),
    /CNB_TOKEN is required/,
  );
});
