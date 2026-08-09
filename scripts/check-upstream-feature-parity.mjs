#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const [, , baseCommit = "", upstreamHead = ""] = process.argv;
const manifestPath = join(process.cwd(), "scripts", "upstream-feature-parity.json");
const syncScriptPath = join(process.cwd(), "scripts", "upstream-sync.sh");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

if (!upstreamHead) {
  console.error("upstream feature parity: missing upstream head");
  process.exit(2);
}

const syncScript = readFileSync(syncScriptPath, "utf8");
const syncPathsBlock = syncScript.match(/SYNC_PATHS=\(\n([\s\S]*?)\n\)/)?.[1] ?? "";
const syncPathspecs = [...syncPathsBlock.matchAll(/^\s+'([^']+)'\s*$/gm)].map((match) => match[1]);
const syncExcludedPathspecs = [...syncScript.matchAll(/^\s+'(\:\(exclude(?:,glob)?\)[^']+)'\s*$/gm)].map((match) => match[1]);
const reviewedPathspecs = manifest.syncExcludedPathspecs ?? [];
const listChangedFiles = (pathspecs = []) => execFileSync("git", baseCommit
  ? ["diff", "--name-only", baseCommit, upstreamHead, ...(pathspecs.length > 0 ? ["--", ...pathspecs] : [])]
  : ["diff-tree", "--no-commit-id", "--name-only", "-r", upstreamHead, ...(pathspecs.length > 0 ? ["--", ...pathspecs] : [])], { encoding: "utf8" })
  .split("\n")
  .map((filePath) => filePath.trim())
  .filter(Boolean);
const allChangedFiles = listChangedFiles();
const syncedFiles = new Set(listChangedFiles(syncPathspecs));
const changedFiles = allChangedFiles.filter((filePath) => !syncedFiles.has(filePath));

const featureEntries = manifest.features ?? [];
const reviewedHead = manifest.reviewedUpstreamHead ?? "";
const unmatchedFiles = changedFiles.filter((filePath) => !featureEntries.some((feature) =>
  (feature.paths ?? []).some((prefix) => filePath === prefix || filePath.startsWith(prefix)),
));
const unresolvedFeatures = featureEntries.filter((feature) =>
  changedFiles.some((filePath) => (feature.paths ?? []).some((prefix) => filePath === prefix || filePath.startsWith(prefix)))
  && !["integrated", "reviewed-deferred"].includes(feature.status),
);
const changedFeatures = featureEntries.filter((feature) =>
  changedFiles.some((filePath) => (feature.paths ?? []).some((prefix) => filePath === prefix || filePath.startsWith(prefix))),
);
const invalidEvidenceFeatures = changedFeatures.filter((feature) => {
  const evidence = feature.evidence ?? [];
  return evidence.length === 0 || evidence.some((filePath) => !existsSync(join(process.cwd(), filePath)));
});
const errors = [];
const missingReviewedPathspecs = syncExcludedPathspecs.filter((pathspec) => !reviewedPathspecs.includes(pathspec));
const staleReviewedPathspecs = reviewedPathspecs.filter((pathspec) => !syncExcludedPathspecs.includes(pathspec));
if (missingReviewedPathspecs.length > 0) {
  errors.push(`sync exclusions missing from manifest: ${missingReviewedPathspecs.join(", ")}`);
}
if (staleReviewedPathspecs.length > 0) {
  errors.push(`manifest exclusions no longer used by sync: ${staleReviewedPathspecs.join(", ")}`);
}
if (reviewedHead !== upstreamHead) {
  errors.push(`manifest reviewedUpstreamHead=${reviewedHead || "<empty>"}, expected ${upstreamHead}`);
}
if (unmatchedFiles.length > 0) {
  errors.push(`unmapped excluded files: ${unmatchedFiles.join(", ")}`);
}
if (unresolvedFeatures.length > 0) {
  errors.push(`features require an explicit disposition: ${unresolvedFeatures.map((feature) => feature.id).join(", ")}`);
}
if (invalidEvidenceFeatures.length > 0) {
  errors.push(`features require existing evidence paths: ${invalidEvidenceFeatures.map((feature) => feature.id).join(", ")}`);
}

if (errors.length > 0) {
  console.error("upstream feature parity: BLOCKED");
  for (const error of errors) console.error(`- ${error}`);
  console.error("Update scripts/upstream-feature-parity.json after reviewing the excluded upstream changes; do not advance the marker implicitly.");
  process.exit(1);
}

if (changedFiles.length === 0) {
  console.log("upstream feature parity: no excluded capability changes");
  process.exit(0);
}

console.log(`upstream feature parity: reviewed ${changedFiles.length} excluded file(s) at ${upstreamHead}`);
