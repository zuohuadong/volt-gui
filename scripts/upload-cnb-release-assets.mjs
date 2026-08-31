import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeDesktopVersion } from "./package-dist.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");

function requireEnv(env, name) {
  const value = String(env[name] || "").trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function apiRequest(fetchImpl, url, options, label) {
  const response = await fetchImpl(url, options);
  if (!response.ok) {
    throw new Error(`${label} failed with HTTP ${response.status}`);
  }
  return response;
}

export function releaseAssetPaths(tag, baseDir = path.join(rootDir, "dist")) {
  const version = normalizeDesktopVersion(tag);
  return [
    path.join(baseDir, `anyong-windows-x64-installer-${version}.exe`),
    path.join(baseDir, `anyong-windows-x64-portable-${version}.zip`),
  ];
}

async function resolveReleaseId({ fetchImpl, endpoint, slug, tag, token }) {
  const releaseResponse = await apiRequest(
    fetchImpl,
    `${endpoint}/${slug}/-/releases/tags/${encodeURIComponent(tag)}`,
    { headers: { Accept: "application/json", Authorization: `token ${token}` } },
    "resolve CNB release",
  );
  const release = await releaseResponse.json();
  if (!release?.id) throw new Error(`CNB release not found for tag ${tag}`);
  return release.id;
}

async function uploadReleaseAsset({ fetchImpl, endpoint, slug, releaseId, token, filePath }) {
  const file = await stat(filePath);
  const assetName = path.basename(filePath);
  const uploadInfoResponse = await apiRequest(
    fetchImpl,
    `${endpoint}/${slug}/-/releases/${releaseId}/asset-upload-url`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.cnb.api+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ asset_name: assetName, size: file.size, ttl: 0 }),
    },
    `prepare ${assetName}`,
  );
  const uploadInfo = await uploadInfoResponse.json();
  if (!uploadInfo?.upload_url || !uploadInfo?.verify_url) {
    throw new Error(`CNB upload information is incomplete for ${assetName}`);
  }

  await apiRequest(
    fetchImpl,
    uploadInfo.upload_url,
    {
      method: "PUT",
      headers: { "Content-Length": String(file.size), "Content-Type": "application/octet-stream" },
      body: createReadStream(filePath),
      duplex: "half",
    },
    `upload ${assetName}`,
  );
  await apiRequest(
    fetchImpl,
    uploadInfo.verify_url,
    { method: "POST", headers: { Accept: "application/vnd.cnb.api+json", Authorization: `Bearer ${token}` } },
    `verify ${assetName}`,
  );
  return assetName;
}

export async function uploadCnbReleaseAssets({ env = process.env, fetchImpl = fetch } = {}) {
  const token = requireEnv(env, "CNB_TOKEN");
  const endpoint = requireEnv(env, "CNB_API_ENDPOINT").replace(/\/$/, "");
  const slug = requireEnv(env, "CNB_REPO_SLUG");
  const tag = requireEnv(env, "CNB_BRANCH");
  const releaseId = await resolveReleaseId({ fetchImpl, endpoint, slug, tag, token });
  const distDir = env.CNB_DIST_DIR ? path.resolve(env.CNB_DIST_DIR) : path.join(rootDir, "dist");
  const requestedAsset = String(env.CNB_RELEASE_ASSET || "").trim();
  const assetPaths = releaseAssetPaths(tag, distDir);
  const selectedPaths = requestedAsset
    ? assetPaths.filter((filePath) => path.basename(filePath) === requestedAsset)
    : assetPaths;
  if (selectedPaths.length === 0) {
    throw new Error(`Unknown CNB release asset: ${requestedAsset}`);
  }
  const uploaded = [];
  for (const filePath of selectedPaths) {
    uploaded.push(await uploadReleaseAsset({ fetchImpl, endpoint, slug, releaseId, token, filePath }));
  }
  return uploaded;
}

async function main() {
  const uploaded = await uploadCnbReleaseAssets();
  console.log(`Uploaded CNB release assets: ${uploaded.join(", ")}`);
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
