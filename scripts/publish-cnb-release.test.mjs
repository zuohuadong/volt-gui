import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { publishCnbRelease } from "./publish-cnb-release.mjs";
import { releaseAssetPaths } from "./upload-cnb-release-assets.mjs";

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "cnb-publish-"));
  const dist = join(root, "dist");
  mkdirSync(dist);
  const [installer, portable] = releaseAssetPaths("v0.31.15", dist);
  writeFileSync(installer, "installer");
  writeFileSync(portable, "portable");
  return { root, dist, installer, portable };
}

test("publishes a draft only after both verified assets are present", async () => {
  const f = fixture();
  const calls = [];
  const uploads = [];
  const installerHash = sha256(f.installer);
  const portableHash = sha256(f.portable);
  const responses = [
    { status: 404, ok: false },
    { status: 201, ok: true, json: async () => ({ id: "release-id", draft: true }) },
    { status: 201, ok: true, json: async () => ({ upload_url: "https://upload/installer", verify_url: "https://verify/installer" }) },
    { status: 200, ok: true },
    { status: 201, ok: true, json: async () => ({ upload_url: "https://upload/portable", verify_url: "https://verify/portable" }) },
    { status: 200, ok: true },
    {
      status: 200,
      ok: true,
      json: async () => ({
        id: "release-id",
        tag_name: "v0.31.15",
        draft: true,
        prerelease: false,
        is_latest: false,
        assets: [
          { name: "anyong-windows-x64-installer-0.31.15.exe", size: 9, hash_algo: "sha256", hash_value: installerHash },
          { name: "anyong-windows-x64-portable-0.31.15.zip", size: 8, hash_algo: "sha256", hash_value: portableHash },
        ],
      }),
    },
    { status: 200, ok: true },
    {
      status: 200,
      ok: true,
      json: async () => ({
        id: "release-id",
        tag_name: "v0.31.15",
        draft: false,
        prerelease: false,
        is_latest: true,
        assets: [
          { name: "anyong-windows-x64-installer-0.31.15.exe", size: 9, hash_algo: "sha256", hash_value: installerHash },
          { name: "anyong-windows-x64-portable-0.31.15.zip", size: 8, hash_algo: "sha256", hash_value: portableHash },
        ],
      }),
    },
  ];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    return responses.shift();
  };
  try {
    const release = await publishCnbRelease({
      env: {
        CNB_TOKEN: "secret",
        CNB_API_ENDPOINT: "https://api.cnb.cool",
        CNB_REPO_SLUG: "group/repo",
        CNB_BRANCH: "v0.31.15",
        CNB_BRANCH_SHA: "candidate-sha",
        CNB_COMMIT_SHA: "legacy-sha",
        CNB_DIST_DIR: f.dist,
      },
      fetchImpl,
      uploadFileImpl: async (url, filePath) => uploads.push({ url, filePath }),
    });
    assert.equal(release.is_latest, true);
    assert.deepEqual(uploads.map((item) => item.url), ["https://upload/installer", "https://upload/portable"]);
    assert.equal(calls[1].options.method, "POST");
    assert.match(calls[1].options.body, /"draft":true/);
    assert.match(calls[1].options.body, /"target_commitish":"candidate-sha"/);
    assert.equal(calls[7].options.method, "PATCH");
    assert.match(calls[7].options.body, /"draft":false/);
    assert.match(calls[7].options.body, /"make_latest":"true"/);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("deletes a newly created draft when publishing fails", async () => {
  const f = fixture();
  const methods = [];
  const responses = [
    { status: 404, ok: false },
    { status: 201, ok: true, json: async () => ({ id: "release-id", draft: true }) },
    { status: 500, ok: false },
    { status: 200, ok: true, json: async () => ({ id: "release-id", draft: true }) },
    { status: 200, ok: true },
  ];
  try {
    await assert.rejects(
      publishCnbRelease({
        env: { CNB_TOKEN: "secret", CNB_API_ENDPOINT: "https://api.cnb.cool", CNB_REPO_SLUG: "group/repo", CNB_BRANCH: "v0.31.15", CNB_DIST_DIR: f.dist },
        fetchImpl: async (_url, options = {}) => {
          methods.push(options.method || "GET");
          return responses.shift();
        },
        uploadFileImpl: async () => {},
      }),
      /prepare anyong-windows-x64-installer-0\.31\.15\.exe failed with HTTP 500/,
    );
    assert.deepEqual(methods, ["GET", "POST", "POST", "GET", "DELETE"]);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("returns an already published release without mutating it", async () => {
  const f = fixture();
  const calls = [];
  const publishedRelease = {
    id: "release-id",
    tag_name: "v0.31.15",
    draft: false,
    prerelease: false,
    is_latest: true,
    assets: [
      { name: "anyong-windows-x64-installer-0.31.15.exe", size: 9, hash_algo: "sha256", hash_value: sha256(f.installer) },
      { name: "anyong-windows-x64-portable-0.31.15.zip", size: 8, hash_algo: "sha256", hash_value: sha256(f.portable) },
    ],
  };
  try {
    const release = await publishCnbRelease({
      env: { CNB_TOKEN: "secret", CNB_API_ENDPOINT: "https://api.cnb.cool", CNB_REPO_SLUG: "group/repo", CNB_BRANCH: "v0.31.15", CNB_DIST_DIR: f.dist },
      fetchImpl: async (url, options = {}) => {
        calls.push({ url, options });
        return { status: 200, ok: true, json: async () => publishedRelease };
      },
      uploadFileImpl: async () => assert.fail("published releases must not upload assets"),
    });
    assert.equal(release, publishedRelease);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.method, undefined);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("removes a stale draft before creating the release again", async () => {
  const f = fixture();
  const methods = [];
  const installerHash = sha256(f.installer);
  const portableHash = sha256(f.portable);
  const assets = [
    { name: "anyong-windows-x64-installer-0.31.15.exe", size: 9, hash_algo: "sha256", hash_value: installerHash },
    { name: "anyong-windows-x64-portable-0.31.15.zip", size: 8, hash_algo: "sha256", hash_value: portableHash },
  ];
  const responses = [
    { status: 200, ok: true, json: async () => ({ id: "stale-id", draft: true }) },
    { status: 200, ok: true },
    { status: 201, ok: true, json: async () => ({ id: "new-id", draft: true }) },
    { status: 201, ok: true, json: async () => ({ upload_url: "https://upload/installer", verify_url: "https://verify/installer" }) },
    { status: 200, ok: true },
    { status: 201, ok: true, json: async () => ({ upload_url: "https://upload/portable", verify_url: "https://verify/portable" }) },
    { status: 200, ok: true },
    { status: 200, ok: true, json: async () => ({ id: "new-id", draft: true, prerelease: false, is_latest: false, assets }) },
    { status: 200, ok: true },
    { status: 200, ok: true, json: async () => ({ id: "new-id", draft: false, prerelease: false, is_latest: true, assets }) },
  ];
  try {
    const release = await publishCnbRelease({
      env: { CNB_TOKEN: "secret", CNB_API_ENDPOINT: "https://api.cnb.cool", CNB_REPO_SLUG: "group/repo", CNB_BRANCH: "v0.31.15", CNB_DIST_DIR: f.dist },
      fetchImpl: async (_url, options = {}) => {
        methods.push(options.method || "GET");
        return responses.shift();
      },
      uploadFileImpl: async () => {},
    });
    assert.equal(release.id, "new-id");
    assert.deepEqual(methods.slice(0, 3), ["GET", "DELETE", "POST"]);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("preserves the release when published state cannot be confirmed", async () => {
  const f = fixture();
  const methods = [];
  const installerHash = sha256(f.installer);
  const portableHash = sha256(f.portable);
  const responses = [
    { status: 404, ok: false },
    { status: 201, ok: true, json: async () => ({ id: "release-id", draft: true }) },
    { status: 201, ok: true, json: async () => ({ upload_url: "https://upload/installer", verify_url: "https://verify/installer" }) },
    { status: 200, ok: true },
    { status: 201, ok: true, json: async () => ({ upload_url: "https://upload/portable", verify_url: "https://verify/portable" }) },
    { status: 200, ok: true },
    {
      status: 200,
      ok: true,
      json: async () => ({
        id: "release-id",
        draft: true,
        prerelease: false,
        is_latest: false,
        assets: [
          { name: "anyong-windows-x64-installer-0.31.15.exe", size: 9, hash_algo: "sha256", hash_value: installerHash },
          { name: "anyong-windows-x64-portable-0.31.15.zip", size: 8, hash_algo: "sha256", hash_value: portableHash },
        ],
      }),
    },
    { status: 200, ok: true },
    { status: 500, ok: false },
    { status: 500, ok: false },
  ];
  try {
    await assert.rejects(
      publishCnbRelease({
        env: { CNB_TOKEN: "secret", CNB_API_ENDPOINT: "https://api.cnb.cool", CNB_REPO_SLUG: "group/repo", CNB_BRANCH: "v0.31.15", CNB_DIST_DIR: f.dist },
        fetchImpl: async (_url, options = {}) => {
          methods.push(options.method || "GET");
          return responses.shift();
        },
        uploadFileImpl: async () => {},
      }),
      /release state could not be confirmed.*draft was preserved for manual inspection/,
    );
    assert.equal(methods.includes("DELETE"), false);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("recovers successfully when publish succeeded but the PATCH response failed", async () => {
  const f = fixture();
  const methods = [];
  const installerHash = sha256(f.installer);
  const portableHash = sha256(f.portable);
  const publishedRelease = {
    id: "release-id",
    tag_name: "v0.31.15",
    draft: false,
    prerelease: false,
    is_latest: true,
    assets: [
      { name: "anyong-windows-x64-installer-0.31.15.exe", size: 9, hash_algo: "sha256", hash_value: installerHash },
      { name: "anyong-windows-x64-portable-0.31.15.zip", size: 8, hash_algo: "sha256", hash_value: portableHash },
    ],
  };
  const responses = [
    { status: 404, ok: false },
    { status: 201, ok: true, json: async () => ({ id: "release-id", draft: true }) },
    { status: 201, ok: true, json: async () => ({ upload_url: "https://upload/installer", verify_url: "https://verify/installer" }) },
    { status: 200, ok: true },
    { status: 201, ok: true, json: async () => ({ upload_url: "https://upload/portable", verify_url: "https://verify/portable" }) },
    { status: 200, ok: true },
    {
      status: 200,
      ok: true,
      json: async () => ({
        id: "release-id",
        draft: true,
        prerelease: false,
        is_latest: false,
        assets: publishedRelease.assets,
      }),
    },
    { status: 500, ok: false },
    { status: 200, ok: true, json: async () => publishedRelease },
  ];
  try {
    const release = await publishCnbRelease({
      env: { CNB_TOKEN: "secret", CNB_API_ENDPOINT: "https://api.cnb.cool", CNB_REPO_SLUG: "group/repo", CNB_BRANCH: "v0.31.15", CNB_DIST_DIR: f.dist },
      fetchImpl: async (_url, options = {}) => {
        methods.push(options.method || "GET");
        return responses.shift();
      },
      uploadFileImpl: async () => {},
    });
    assert.equal(release, publishedRelease);
    assert.equal(methods.includes("DELETE"), false);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});
