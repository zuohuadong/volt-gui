import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { releaseAssetPaths } from "./upload-cnb-release-assets.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");

function requireEnv(env, name) {
  const value = String(env[name] || "").trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function apiRequest({ fetchImpl, url, options, label, expectedStatus = [200] }) {
  const response = await fetchImpl(url, options);
  if (!expectedStatus.includes(response.status) || !response.ok) {
    throw new Error(`${label} failed with HTTP ${response.status}`);
  }
  return response;
}

async function readJson(response) {
  return response.json();
}

async function hashFile(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

async function uploadFileWithCurl(url, filePath) {
  await new Promise((resolve, reject) => {
    const child = spawn(
      "curl.exe",
      ["--fail", "--show-error", "--progress-bar", "--request", "PUT", "--header", "Content-Type: application/octet-stream", "--upload-file", filePath, url],
      { stdio: ["ignore", "inherit", "inherit"], windowsHide: true },
    );
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`curl upload failed with ${signal ? `signal ${signal}` : `exit code ${code}`}`));
    });
  });
}

function releaseUrl(endpoint, slug, tag) {
  return `${endpoint}/${slug}/-/releases/tags/${encodeURIComponent(tag)}`;
}

async function resolveRelease({ fetchImpl, endpoint, slug, tag, token }) {
  const response = await fetchImpl(releaseUrl(endpoint, slug, tag), {
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`resolve CNB release failed with HTTP ${response.status}`);
  const release = await readJson(response);
  if (!release?.id) throw new Error(`CNB release has no id for tag ${tag}`);
  return release;
}

async function createDraftRelease({ fetchImpl, endpoint, slug, tag, token, commitish }) {
  const response = await apiRequest({
    fetchImpl,
    url: `${endpoint}/${slug}/-/releases`,
    options: {
      method: "POST",
      headers: {
        Accept: "application/vnd.cnb.api+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tag_name: tag,
        target_commitish: commitish,
        name: tag,
        body: `Unsigned Windows x64 release for ${tag}`,
        draft: true,
        prerelease: false,
        make_latest: "false",
      }),
    },
    label: "create CNB draft release",
    expectedStatus: [201],
  });
  const release = await readJson(response);
  if (!release?.id) throw new Error(`CNB draft release has no id for tag ${tag}`);
  return release;
}

async function deleteRelease({ fetchImpl, endpoint, slug, releaseId, token, label = "cleanup CNB draft release" }) {
  await apiRequest({
    fetchImpl,
    url: `${endpoint}/${slug}/-/releases/${releaseId}`,
    options: { method: "DELETE", headers: { Accept: "application/vnd.cnb.api+json", Authorization: `Bearer ${token}` } },
    label,
    expectedStatus: [200, 204],
  });
}

async function uploadAsset({ fetchImpl, uploadFileImpl, endpoint, slug, releaseId, token, filePath }) {
  const file = await stat(filePath);
  const assetName = path.basename(filePath);
  const infoResponse = await apiRequest({
    fetchImpl,
    url: `${endpoint}/${slug}/-/releases/${releaseId}/asset-upload-url`,
    options: {
      method: "POST",
      headers: {
        Accept: "application/vnd.cnb.api+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ asset_name: assetName, size: file.size, ttl: 0 }),
    },
    label: `prepare ${assetName}`,
    expectedStatus: [201],
  });
  const info = await readJson(infoResponse);
  if (!info?.upload_url || !info?.verify_url) throw new Error(`CNB upload information is incomplete for ${assetName}`);
  await uploadFileImpl(info.upload_url, filePath);
  await apiRequest({
    fetchImpl,
    url: info.verify_url,
    options: { method: "POST", headers: { Accept: "application/vnd.cnb.api+json", Authorization: `Bearer ${token}` } },
    label: `verify ${assetName}`,
  });
  return { name: assetName, size: file.size, sha256: await hashFile(filePath) };
}

function assertAssetSet(release, expected, label) {
  const assets = Array.isArray(release.assets) ? release.assets : [];
  const byName = new Map(assets.map((asset) => [asset.name, asset]));
  if (assets.length !== expected.length || expected.some((item) => !byName.has(item.name))) {
    throw new Error(`${label} assets do not match expected set: ${expected.map((item) => item.name).join(", ")}`);
  }
  for (const item of expected) {
    const asset = byName.get(item.name);
    if (Number(asset.size) !== item.size) throw new Error(`${label} asset size mismatch for ${item.name}`);
    if (String(asset.hash_algo || "").toLowerCase() !== "sha256" || String(asset.hash_value || "").toLowerCase() !== item.sha256) {
      throw new Error(`${label} asset SHA-256 mismatch for ${item.name}`);
    }
  }
}

function assertPublishedAssets(release, expected) {
  if (!release || release.draft !== false || release.prerelease === true || release.is_latest !== true) {
    throw new Error("CNB release did not publish with latest=true and non-draft/non-prerelease state");
  }
  assertAssetSet(release, expected, "CNB release");
}

function assertDraftAssets(release, expected) {
  if (!release || release.draft !== true || release.prerelease === true) {
    throw new Error("CNB release is not an unpublished draft");
  }
  assertAssetSet(release, expected, "CNB draft");
}

async function expectedAssets(assetPaths) {
  return Promise.all(
    assetPaths.map(async (filePath) => {
      const file = await stat(filePath);
      return { name: path.basename(filePath), size: file.size, sha256: await hashFile(filePath) };
    }),
  );
}

async function recoverCreatedRelease({ request, releaseId, expected, originalError }) {
  let current;
  try {
    current = await resolveRelease(request);
  } catch (stateError) {
    throw new Error(`${originalError.message}; release state could not be confirmed: ${stateError.message}; draft was preserved for manual inspection`);
  }
  if (!current) throw originalError;
  if (current.id !== releaseId) {
    throw new Error(`${originalError.message}; tag now resolves to a different release; no cleanup was attempted`);
  }
  if (current.draft === false) {
    assertPublishedAssets(current, expected);
    return current;
  }
  if (current.draft !== true) {
    throw new Error(`${originalError.message}; release draft state is ambiguous; no cleanup was attempted`);
  }
  try {
    await deleteRelease({ ...request, releaseId });
  } catch (cleanupError) {
    throw new Error(`${originalError.message}; cleanup failed: ${cleanupError.message}`);
  }
  throw originalError;
}

async function uploadDraftAssets({ request, releaseId, assetPaths, uploadFileImpl }) {
  const uploadFile = uploadFileImpl || uploadFileWithCurl;
  for (const filePath of assetPaths) {
    await uploadAsset({ ...request, uploadFileImpl: uploadFile, releaseId, filePath });
  }
}

async function publishDraftRelease({ request, releaseId, expected }) {
  const { fetchImpl, endpoint, slug, tag, token } = request;
  const draftResponse = await apiRequest({
    fetchImpl,
    url: releaseUrl(endpoint, slug, tag),
    options: { headers: { Accept: "application/json", Authorization: `Bearer ${token}` } },
    label: "verify CNB draft release",
  });
  assertDraftAssets(await readJson(draftResponse), expected);
  await apiRequest({
    fetchImpl,
    url: `${endpoint}/${slug}/-/releases/${releaseId}`,
    options: {
      method: "PATCH",
      headers: { Accept: "application/vnd.cnb.api+json", Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ draft: false, prerelease: false, make_latest: "true" }),
    },
    label: "publish CNB release",
  });
  const publishedResponse = await apiRequest({
    fetchImpl,
    url: releaseUrl(endpoint, slug, tag),
    options: { headers: { Accept: "application/json", Authorization: `Bearer ${token}` } },
    label: "verify published CNB release",
  });
  const publishedRelease = await readJson(publishedResponse);
  assertPublishedAssets(publishedRelease, expected);
  return publishedRelease;
}

export async function publishCnbRelease({ env = process.env, fetchImpl = fetch, uploadFileImpl, commitish = env.CNB_BRANCH_SHA || env.CNB_COMMIT_SHA || env.CNB_BRANCH } = {}) {
  const token = requireEnv(env, "CNB_TOKEN");
  const endpoint = requireEnv(env, "CNB_API_ENDPOINT").replace(/\/$/, "");
  const slug = requireEnv(env, "CNB_REPO_SLUG");
  const tag = requireEnv(env, "CNB_BRANCH");
  const distDir = env.CNB_DIST_DIR ? path.resolve(env.CNB_DIST_DIR) : path.join(rootDir, "dist");
  const assetPaths = releaseAssetPaths(tag, distDir);
  const expected = await expectedAssets(assetPaths);
  const request = { fetchImpl, endpoint, slug, tag, token };

  let release = await resolveRelease(request);
  if (release && release.draft === false) {
    assertPublishedAssets(release, expected);
    return release;
  }
  if (release) {
    if (release.draft !== true) throw new Error("Existing CNB release draft state is ambiguous; no cleanup was attempted");
    await deleteRelease({ fetchImpl, endpoint, slug, releaseId: release.id, token, label: "remove stale CNB draft release" });
  }
  release = await createDraftRelease({ ...request, commitish });
  try {
    await uploadDraftAssets({ request, releaseId: release.id, assetPaths, uploadFileImpl });
    return await publishDraftRelease({ request, releaseId: release.id, expected });
  } catch (error) {
    return recoverCreatedRelease({ request, releaseId: release.id, expected, originalError: error });
  }
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  publishCnbRelease()
    .then((release) => console.log(`Published CNB release ${release.tag_name}`))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
