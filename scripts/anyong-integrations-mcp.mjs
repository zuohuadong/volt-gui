#!/usr/bin/env node

import { execFile } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { promisify } from "node:util";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { z } from "zod";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

async function loadMcpRuntime(subpath) {
  try {
    return await import(`@modelcontextprotocol/sdk/${subpath}`);
  } catch (error) {
    // pnpm may keep peer-specific SDK instances under .pnpm without a root symlink.
    const pnpmRoot = path.resolve(SCRIPT_DIR, "..", "node_modules", ".pnpm");
    const candidate = readdirSync(pnpmRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.startsWith("@modelcontextprotocol+sdk@"))
      .map((entry) => path.join(pnpmRoot, entry.name, "node_modules", "@modelcontextprotocol", "sdk", "dist", "esm", subpath.endsWith(".js") ? subpath : `${subpath}.js`))
      .find((filePath) => { try { return Boolean(statSync(filePath)); } catch { return false; } });
    if (!candidate) throw error;
    return import(pathToFileURL(candidate).href);
  }
}

const { McpServer } = await loadMcpRuntime("server/mcp.js");
const { StdioServerTransport } = await loadMcpRuntime("server/stdio.js");

const execFileAsync = promisify(execFile);
const MAX_OUTPUT_CHARS = 24_000;
const MAX_LOG_CHARS = 120_000;
const MAX_IMPORT_BYTES = 25 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 20_000;

function env(name, fallback = "") {
  const value = String(process.env[name] ?? "").trim();
  return value || fallback;
}

function enabled(name) {
  return env(name) === "1";
}

function truncate(value, max = MAX_OUTPUT_CHARS) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n...[truncated ${text.length - max} chars]`;
}

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== "object") return value;
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    if (/(token|secret|password|api[-_]?key|authorization|cookie|dsn)/iu.test(key)) {
      output[key] = "[redacted]";
    } else {
      output[key] = redact(item);
    }
  }
  return output;
}

function result(value) {
  return { content: [{ type: "text", text: truncate(redact(value)) }] };
}

function fail(message) {
  return { content: [{ type: "text", text: message }], isError: true };
}

export function validateEndpoint(raw, label, { allowLocalHttp = false } = {}) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${label} must be a valid URL`);
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname.toLowerCase());
  if (url.protocol !== "https:" && !(allowLocalHttp && url.protocol === "http:" && local)) {
    throw new Error(`${label} must use HTTPS${allowLocalHttp ? " (HTTP is allowed only for localhost)" : ""}`);
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error(`${label} must not contain credentials, query parameters, or fragments`);
  }
  return url;
}

function validateServiceEndpoint({ raw, label, defaults, overrideEnv, allowLocalHttp = false }) {
  const url = validateEndpoint(raw, label, { allowLocalHttp });
  const allowed = new Set([
    ...defaults,
    ...env(overrideEnv).split(",").map((host) => host.trim()).filter(Boolean),
  ].map((host) => host.toLowerCase()));
  if (!allowed.has(url.hostname.toLowerCase())) {
    throw new Error(`${label} host is not allowlisted; set ${overrideEnv} for an approved enterprise host`);
  }
  return url;
}

function joinUrl(base, pathname) {
  const baseText = String(base);
  const root = baseText.endsWith("/") ? baseText : `${baseText}/`;
  return new URL(pathname.replace(/^\//u, ""), root).toString();
}

function queryUrl(base, pathname, params) {
  const url = new URL(joinUrl(base, pathname));
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== null && String(value) !== "") url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function requestJson({ url, label, token, method = "GET", body, headers = {}, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`${label} failed (HTTP ${response.status})`);
    if (!text.trim()) return {};
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`${label} returned invalid JSON`);
    }
  } catch (error) {
    if (error?.name === "AbortError") throw new Error(`${label} timed out after ${timeoutMs}ms`);
    if (error instanceof Error && error.message.startsWith(`${label} `)) throw error;
    throw new Error(`${label} failed: network error`);
  } finally {
    clearTimeout(timeout);
  }
}

function githubBase() {
  return validateServiceEndpoint({ raw: env("GITHUB_API_BASE_URL", "https://api.github.com"), label: "GITHUB_API_BASE_URL", defaults: ["api.github.com", "github.com"], overrideEnv: "GITHUB_ALLOWED_HOSTS" });
}

function githubRepo(owner, repo) {
  const cleanOwner = String(owner ?? "").trim();
  const cleanRepo = String(repo ?? "").trim();
  if (!/^[A-Za-z0-9_.-]{1,100}$/u.test(cleanOwner) || !/^[A-Za-z0-9_.-]{1,100}$/u.test(cleanRepo)) {
    throw new Error("owner and repo must be simple GitHub repository identifiers");
  }
  return `${encodeURIComponent(cleanOwner)}/${encodeURIComponent(cleanRepo)}`;
}

async function githubSearchCode(args) {
  const base = githubBase();
  const q = String(args.query ?? "").trim();
  if (!q) throw new Error("query is required");
  const data = await requestJson({
    url: queryUrl(base, "/search/code", { q, per_page: Math.min(Number(args.limit) || 20, 50) }),
    label: "GitHub code search",
    token: env("GITHUB_TOKEN"),
    headers: { "X-GitHub-Api-Version": "2022-11-28" },
  });
  return result({ total_count: data.total_count, items: (data.items ?? []).map((item) => ({ name: item.name, path: item.path, sha: item.sha, html_url: item.html_url, repository: item.repository?.full_name })) });
}

async function githubListIssues(args) {
  const base = githubBase();
  const data = await requestJson({
    url: queryUrl(base, `/repos/${githubRepo(args.owner, args.repo)}/issues`, { state: args.state || "all", page: args.page || 1, per_page: Math.min(Number(args.limit) || 30, 100) }),
    label: "GitHub issue list",
    token: env("GITHUB_TOKEN"),
    headers: { "X-GitHub-Api-Version": "2022-11-28" },
  });
  return result((data ?? []).filter((item) => !item.pull_request).map((item) => ({ number: item.number, title: item.title, state: item.state, user: item.user?.login, labels: (item.labels ?? []).map((label) => label.name), comments: item.comments, created_at: item.created_at, updated_at: item.updated_at, html_url: item.html_url, body: truncate(item.body ?? "", 4_000) })));
}

async function githubListPulls(args) {
  const base = githubBase();
  const data = await requestJson({
    url: queryUrl(base, `/repos/${githubRepo(args.owner, args.repo)}/pulls`, { state: args.state || "all", page: args.page || 1, per_page: Math.min(Number(args.limit) || 30, 100) }),
    label: "GitHub pull request list",
    token: env("GITHUB_TOKEN"),
    headers: { "X-GitHub-Api-Version": "2022-11-28" },
  });
  return result((data ?? []).map((item) => ({ number: item.number, title: item.title, state: item.state, draft: item.draft, user: item.user?.login, head: item.head?.label, base: item.base?.label, created_at: item.created_at, updated_at: item.updated_at, html_url: item.html_url, body: truncate(item.body ?? "", 4_000) })));
}

async function githubGetIssue(args, kind = "issues") {
  const number = Number(args.number);
  if (!Number.isInteger(number) || number < 1) throw new Error("number must be a positive integer");
  const data = await requestJson({
    url: joinUrl(githubBase(), `/repos/${githubRepo(args.owner, args.repo)}/${kind}/${number}`),
    label: kind === "pulls" ? "GitHub pull request" : "GitHub issue",
    token: env("GITHUB_TOKEN"),
    headers: { "X-GitHub-Api-Version": "2022-11-28" },
  });
  return result({ ...data, body: truncate(data.body ?? "", 12_000), user: data.user?.login, assignee: data.assignee?.login, requested_reviewers: (data.requested_reviewers ?? []).map((item) => item.login) });
}

async function githubGetPullFiles(args) {
  const number = Number(args.number);
  if (!Number.isInteger(number) || number < 1) throw new Error("number must be a positive integer");
  const data = await requestJson({
    url: queryUrl(githubBase(), `/repos/${githubRepo(args.owner, args.repo)}/pulls/${number}/files`, { page: args.page || 1, per_page: Math.min(Number(args.limit) || 30, 100) }),
    label: "GitHub pull request files",
    token: env("GITHUB_TOKEN"),
    headers: { "X-GitHub-Api-Version": "2022-11-28" },
  });
  return result((data ?? []).map((item) => ({ filename: item.filename, status: item.status, additions: item.additions, deletions: item.deletions, changes: item.changes, patch: truncate(item.patch ?? "", 8_000), raw_url: item.raw_url })));
}

function cnbBase() {
  return validateServiceEndpoint({ raw: env("CNB_API_ENDPOINT", "https://api.cnb.cool"), label: "CNB_API_ENDPOINT", defaults: ["api.cnb.cool"], overrideEnv: "CNB_ALLOWED_HOSTS" });
}

function cnbSlug(slug) {
  const clean = String(slug ?? env("CNB_REPO_SLUG")).trim();
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)?$/u.test(clean)) throw new Error("slug must look like group/repo or org/group/repo");
  return clean.split("/").map(encodeURIComponent).join("/");
}

function cnbPath(template, values) {
  return template.replace(/\{(slug|pipelineId|buildId|jobId)\}/gu, (_match, key) => values[key] ?? "");
}

async function cnbGetBuilds(args) {
  const slug = cnbSlug(args.slug);
  const pathTemplate = env("CNB_PIPELINES_PATH", "/{slug}/-/pipelines");
  const data = await requestJson({
    url: queryUrl(cnbBase(), cnbPath(pathTemplate, { slug }), { branch: args.branch, page: args.page || 1, page_size: Math.min(Number(args.limit) || 20, 100) }),
    label: "CNB build status",
    token: env("CNB_TOKEN"),
  });
  return result(data);
}

async function cnbGetBuildLogs(args) {
  const pipelineId = String(args.pipelineId ?? "").trim();
  if (!pipelineId) throw new Error("pipelineId is required");
  const slug = cnbSlug(args.slug);
  const pathTemplate = env("CNB_LOGS_PATH", "/{slug}/-/pipelines/{pipelineId}/logs");
  const data = await requestJson({
    url: queryUrl(cnbBase(), cnbPath(pathTemplate, { slug, pipelineId: encodeURIComponent(pipelineId), jobId: args.jobId ? encodeURIComponent(String(args.jobId)) : undefined }), { job_id: args.jobId }),
    label: "CNB build logs",
    token: env("CNB_TOKEN"),
  });
  return result(typeof data === "string" ? truncate(data, MAX_LOG_CHARS) : data);
}

export function analyzeFailure(logText) {
  const text = String(logText ?? "");
  const lines = text.split(/\r?\n/u);
  const suspicious = lines.filter((line) => /(error|failed|failure|exception|fatal|panic|timeout|exit code|permission denied|unauthori[sz]ed|forbidden)/iu.test(line));
  const categories = new Map();
  for (const line of suspicious) {
    const key = /timeout/iu.test(line) ? "timeout" : /permission|unauthori[sz]ed|forbidden/iu.test(line) ? "permission" : /network|fetch|connect|dns/iu.test(line) ? "network" : /test|assert/iu.test(line) ? "test" : "build";
    categories.set(key, (categories.get(key) || 0) + 1);
  }
  return { line_count: lines.length, failure_line_count: suspicious.length, categories: Object.fromEntries(categories), excerpts: suspicious.slice(-40).map((line) => truncate(line, 800)) };
}

async function cnbAnalyzeFailure(args) {
  let logs = String(args.logs ?? "");
  if (!logs && args.pipelineId) {
    const response = await cnbGetBuildLogs({ slug: args.slug, pipelineId: args.pipelineId, jobId: args.jobId });
    logs = response.content?.[0]?.text ?? "";
  }
  if (!logs) throw new Error("logs or pipelineId is required");
  return result(analyzeFailure(logs));
}

function sentryBase() {
  return validateServiceEndpoint({ raw: env("SENTRY_BASE_URL", "https://sentry.io/api/0"), label: "SENTRY_BASE_URL", defaults: ["sentry.io"], overrideEnv: "SENTRY_ALLOWED_HOSTS" });
}

function sentryOrg(value) {
  const org = String(value ?? env("SENTRY_ORG")).trim();
  if (!/^[A-Za-z0-9_.-]{1,100}$/u.test(org)) throw new Error("organization is required and must be a simple identifier");
  return encodeURIComponent(org);
}

async function sentryListIssues(args) {
  const data = await requestJson({
    url: queryUrl(sentryBase(), `/organizations/${sentryOrg(args.organization)}/issues/`, { project: args.project, query: args.query, sort: args.sort || "date", statsPeriod: args.statsPeriod || "24h", limit: Math.min(Number(args.limit) || 25, 100) }),
    label: "Sentry issue list",
    token: env("SENTRY_AUTH_TOKEN"),
  });
  return result(data);
}

async function sentryIssueEvents(args) {
  const issue = String(args.issueId ?? "").trim();
  if (!/^\d{1,32}$/u.test(issue)) throw new Error("issueId must be a numeric Sentry issue id");
  const data = await requestJson({
    url: queryUrl(sentryBase(), `/issues/${encodeURIComponent(issue)}/events/`, { limit: Math.min(Number(args.limit) || 25, 100) }),
    label: "Sentry issue events",
    token: env("SENTRY_AUTH_TOKEN"),
  });
  return result(data);
}

async function sentrySearchEvents(args) {
  const query = String(args.query ?? "").trim();
  if (!query) throw new Error("query is required");
  const data = await requestJson({
    url: queryUrl(sentryBase(), `/organizations/${sentryOrg(args.organization)}/events/`, { query, project: args.project, field: args.field || "title", statsPeriod: args.statsPeriod || "24h", per_page: Math.min(Number(args.limit) || 25, 100) }),
    label: "Sentry event search",
    token: env("SENTRY_AUTH_TOKEN"),
  });
  return result(data);
}

function feishuBase() {
  return validateServiceEndpoint({ raw: env("FEISHU_BASE_URL", "https://open.feishu.cn/open-apis"), label: "FEISHU_BASE_URL", defaults: ["open.feishu.cn"], overrideEnv: "FEISHU_ALLOWED_HOSTS" });
}

let feishuTokenCache;
async function feishuToken() {
  const direct = env("FEISHU_TENANT_ACCESS_TOKEN");
  if (direct) return direct;
  if (feishuTokenCache) return feishuTokenCache;
  const appId = env("FEISHU_APP_ID");
  const appSecret = env("FEISHU_APP_SECRET");
  if (!appId || !appSecret) throw new Error("FEISHU_TENANT_ACCESS_TOKEN or FEISHU_APP_ID/FEISHU_APP_SECRET is required");
  const data = await requestJson({
    url: joinUrl(feishuBase(), "/auth/v3/tenant_access_token/internal"),
    label: "Feishu tenant token",
    method: "POST",
    body: { app_id: appId, app_secret: appSecret },
  });
  if (!data.tenant_access_token) throw new Error("Feishu tenant token response is missing a token");
  feishuTokenCache = data.tenant_access_token;
  return feishuTokenCache;
}

async function feishuListApprovals(args) {
  const data = await requestJson({
    url: queryUrl(feishuBase(), "/approval/v4/instances", { approval_code: args.approvalCode, start_time: args.startTime, end_time: args.endTime, page_size: Math.min(Number(args.pageSize) || 20, 100), page_token: args.pageToken }),
    label: "Feishu approval list",
    token: await feishuToken(),
  });
  return result(data);
}

async function feishuGetApproval(args) {
  const instanceCode = String(args.instanceCode ?? "").trim();
  if (!instanceCode) throw new Error("instanceCode is required");
  const data = await requestJson({
    url: joinUrl(feishuBase(), `/approval/v4/instances/${encodeURIComponent(instanceCode)}`),
    label: "Feishu approval instance",
    token: await feishuToken(),
  });
  return result(data);
}

async function feishuSendNotification(args) {
  if (!enabled("ANYONG_FEISHU_WRITE_ENABLED")) return fail("Feishu notifications are disabled; set ANYONG_FEISHU_WRITE_ENABLED=1 in an explicitly approved environment");
  if (args.confirm !== true) return fail("This sends an external Feishu message. Re-run with confirm=true after user approval.");
  const receiveId = String(args.receiveId ?? "").trim();
  const text = String(args.text ?? "").trim();
  if (!receiveId || !text) throw new Error("receiveId and text are required");
  const data = await requestJson({
    url: queryUrl(feishuBase(), "/im/v1/messages", { receive_id_type: args.receiveIdType || "open_id" }),
    label: "Feishu notification",
    method: "POST",
    token: await feishuToken(),
    headers: { "Content-Type": "application/json" },
    body: { receive_id: receiveId, msg_type: "text", content: JSON.stringify({ text: truncate(text, 4_000) }) },
  });
  return result(data);
}

function importRoot() {
  return path.resolve(env("ANYONG_IMPORT_ROOT", process.cwd()));
}

async function safeImportPath(rawPath) {
  const requested = String(rawPath ?? "").replaceAll("\\", "/");
  if (!requested || requested.includes("\0")) throw new Error("document path must stay inside ANYONG_IMPORT_ROOT");
  const segments = requested.split("/").filter((part) => part && part !== ".");
  if (path.isAbsolute(requested) || segments.some((part) => part === "..")) {
    throw new Error("document path must stay inside ANYONG_IMPORT_ROOT");
  }
  const root = await realpath(importRoot());
  const candidate = path.resolve(root, ...segments);
  const resolved = await realpath(candidate);
  const relative = path.relative(root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("document path must stay inside ANYONG_IMPORT_ROOT");
  const info = await stat(resolved);
  if (!info.isFile()) throw new Error("document path must point to a regular file");
  if (info.size > MAX_IMPORT_BYTES) throw new Error(`document exceeds ${MAX_IMPORT_BYTES} byte limit`);
  return { path: resolved, info };
}

function decodeXml(value) {
  return value.replace(/<[^>]+>/gu, " ").replace(/&amp;/gu, "&").replace(/&lt;/gu, "<").replace(/&gt;/gu, ">").replace(/&quot;/gu, '"').replace(/&#39;/gu, "'").replace(/\s+/gu, " ").trim();
}

function unzipEntries(buffer) {
  const entries = [];
  let cursor = 0;
  while (cursor + 4 <= buffer.length) {
    const signature = buffer.readUInt32LE(cursor);
    if (signature !== 0x04034b50) break;
    const method = buffer.readUInt16LE(cursor + 8);
    const compressedSize = buffer.readUInt32LE(cursor + 18);
    const nameLength = buffer.readUInt16LE(cursor + 26);
    const extraLength = buffer.readUInt16LE(cursor + 28);
    const name = buffer.toString("utf8", cursor + 30, cursor + 30 + nameLength);
    const start = cursor + 30 + nameLength + extraLength;
    const end = start + compressedSize;
    if (end > buffer.length) break;
    entries.push({ name, method, data: buffer.subarray(start, end) });
    cursor = end;
  }
  return entries;
}

async function inflateRaw(data) {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return Buffer.from(await new Response(stream).arrayBuffer());
}

async function extractOfficeText(filePath) {
  const entries = unzipEntries(await readFile(filePath));
  const xmlEntries = entries.filter((entry) => /\.(xml|rels)$/iu.test(entry.name) && (entry.name.startsWith("word/") || entry.name.startsWith("xl/") || entry.name.startsWith("ppt/")));
  const chunks = [];
  for (const entry of xmlEntries) {
    const bytes = entry.method === 8 ? await inflateRaw(entry.data) : entry.data;
    const text = decodeXml(bytes.toString("utf8"));
    if (text) chunks.push(text);
  }
  return chunks.join("\n");
}

async function runCommand(command, args, timeoutMs = 60_000) {
  try {
    const output = await execFileAsync(command, args, { timeout: timeoutMs, maxBuffer: MAX_LOG_CHARS * 2, windowsHide: true });
    return `${output.stdout ?? ""}${output.stderr ? `\n${output.stderr}` : ""}`.trim();
  } catch (error) {
    const message = error?.killed ? `command timed out after ${timeoutMs}ms` : "command failed";
    throw new Error(message);
  }
}

async function extractDocument(args) {
  const file = await safeImportPath(args.path);
  const extension = path.extname(file.path).toLowerCase();
  let text = "";
  if ([".txt", ".md", ".csv", ".json", ".log", ".yaml", ".yml"].includes(extension)) {
    text = (await readFile(file.path, "utf8")).slice(0, MAX_LOG_CHARS);
  } else if ([".docx", ".xlsx", ".pptx"].includes(extension)) {
    text = await extractOfficeText(file.path);
  } else if (extension === ".pdf") {
    try {
      text = await runCommand(env("ANYONG_PDFTOTEXT_COMMAND", "pdftotext"), ["-layout", file.path, "-"], 60_000);
    } catch {
      text = "";
    }
  }
  if (!text && args.ocr === true && env("ANYONG_OCR_COMMAND")) {
    const rawArgs = JSON.parse(env("ANYONG_OCR_ARGS_JSON", '["{{file}}"]'));
    text = await runCommand(env("ANYONG_OCR_COMMAND"), rawArgs.map((item) => String(item).replaceAll("{{file}}", file.path)), 120_000);
  }
  if (!text) throw new Error(`no text extractor available for ${extension || "this file type"}`);
  return result({ path: file.path, bytes: file.info.size, mime: extension, text: truncate(text, MAX_LOG_CHARS), truncated: text.length > MAX_LOG_CHARS });
}

async function ingestWeKnora(args) {
  if (!enabled("ANYONG_WEKNORA_INGEST_ENABLED")) return fail("WeKnora ingestion is disabled; set ANYONG_WEKNORA_INGEST_ENABLED=1 in an explicitly approved environment");
  if (args.confirm !== true) return fail("This uploads a document to WeKnora. Re-run with confirm=true after user approval.");
  const file = await safeImportPath(args.path);
  const endpointRaw = env("WEKNORA_INGEST_URL");
  if (!endpointRaw) throw new Error("WEKNORA_INGEST_URL is required for ingestion");
  const endpoint = validateServiceEndpoint({
    raw: endpointRaw,
    label: "WEKNORA_INGEST_URL",
    defaults: ["localhost", "127.0.0.1", "[::1]"],
    overrideEnv: "WEKNORA_ALLOWED_HOSTS",
    allowLocalHttp: true,
  });
  const knowledgeBaseId = String(args.knowledgeBaseId ?? "").trim();
  if (!knowledgeBaseId) throw new Error("knowledgeBaseId is required");
  const configuredIds = env("WEKNORA_KNOWLEDGE_BASE_IDS").split(",").map((id) => id.trim()).filter(Boolean);
  if (configuredIds.length > 0 && !configuredIds.includes(knowledgeBaseId)) throw new Error("knowledgeBaseId is outside the configured WeKnora allowlist");
  const form = new FormData();
  form.append("file", new Blob([await readFile(file.path)]), path.basename(file.path));
  form.append("knowledge_base_id", knowledgeBaseId);
  if (args.title) form.append("title", truncate(String(args.title), 240));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: {
        ...(env("WEKNORA_API_KEY") ? { "X-API-Key": env("WEKNORA_API_KEY") } : {}),
        ...(env("WEKNORA_TENANT_ID") ? { "X-Tenant-ID": env("WEKNORA_TENANT_ID") } : {}),
        Accept: "application/json",
      },
      body: form,
    });
    if (!response.ok) throw new Error(`WeKnora ingestion failed (HTTP ${response.status})`);
    const text = await response.text();
    let payload;
    try { payload = text ? JSON.parse(text) : {}; } catch { payload = { status: "accepted" }; }
    return result({ path: file.path, bytes: file.info.size, response: payload });
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("WeKnora ingestion timed out after 120000ms");
    if (error instanceof Error && error.message.startsWith("WeKnora ingestion")) throw error;
    throw new Error("WeKnora ingestion failed: network error");
  } finally {
    clearTimeout(timeout);
  }
}

function commonSchemas() {
  return {
    owner: z.string(),
    repo: z.string(),
    state: z.enum(["open", "closed", "all"]).optional(),
    page: z.number().int().min(1).max(100).optional(),
    limit: z.number().int().min(1).max(100).optional(),
  };
}

function createServer(scope = "all") {
  const server = new McpServer({ name: "anyong-integrations", version: "0.1.0" });
  const github = scope === "all" || scope === "github";
  const cnb = scope === "all" || scope === "cnb";
  const sentry = scope === "all" || scope === "sentry";
  const feishu = scope === "all" || scope === "feishu";
  const documents = scope === "all" || scope === "documents";

  if (github) {
    server.registerTool("github_search_code", { description: "Read-only GitHub code search", inputSchema: { query: z.string(), limit: z.number().int().min(1).max(50).optional() } }, async (args) => githubSearchCode(args));
    server.registerTool("github_list_issues", { description: "Read-only GitHub issue listing", inputSchema: commonSchemas() }, async (args) => githubListIssues(args));
    server.registerTool("github_list_pull_requests", { description: "Read-only GitHub pull request listing", inputSchema: commonSchemas() }, async (args) => githubListPulls(args));
    server.registerTool("github_get_issue", { description: "Read-only GitHub issue details", inputSchema: { ...commonSchemas(), number: z.number().int().min(1) } }, async (args) => githubGetIssue(args));
    server.registerTool("github_get_pull_request", { description: "Read-only GitHub pull request details", inputSchema: { ...commonSchemas(), number: z.number().int().min(1) } }, async (args) => githubGetIssue(args, "pulls"));
    server.registerTool("github_get_pull_request_files", { description: "Read-only GitHub pull request changed files", inputSchema: { ...commonSchemas(), number: z.number().int().min(1) } }, async (args) => githubGetPullFiles(args));
  }
  if (cnb) {
    server.registerTool("cnb_get_builds", { description: "Read-only CNB build status and pipeline metadata", inputSchema: { slug: z.string().optional(), branch: z.string().optional(), page: z.number().int().min(1).optional(), limit: z.number().int().min(1).max(100).optional() } }, async (args) => cnbGetBuilds(args));
    server.registerTool("cnb_get_build_logs", { description: "Read-only CNB build logs with bounded output", inputSchema: { slug: z.string().optional(), pipelineId: z.string(), jobId: z.string().optional() } }, async (args) => cnbGetBuildLogs(args));
    server.registerTool("cnb_analyze_failure", { description: "Analyze supplied or fetched CNB logs without performing any write", inputSchema: { logs: z.string().optional(), slug: z.string().optional(), pipelineId: z.string().optional(), jobId: z.string().optional() } }, async (args) => cnbAnalyzeFailure(args));
  }
  if (sentry) {
    server.registerTool("sentry_list_issues", { description: "Read-only Sentry issue listing", inputSchema: { organization: z.string().optional(), project: z.string().optional(), query: z.string().optional(), sort: z.string().optional(), statsPeriod: z.string().optional(), limit: z.number().int().min(1).max(100).optional() } }, async (args) => sentryListIssues(args));
    server.registerTool("sentry_get_issue_events", { description: "Read-only Sentry issue events", inputSchema: { issueId: z.string(), limit: z.number().int().min(1).max(100).optional() } }, async (args) => sentryIssueEvents(args));
    server.registerTool("sentry_search_events", { description: "Read-only Sentry event search", inputSchema: { organization: z.string().optional(), query: z.string(), project: z.string().optional(), field: z.string().optional(), statsPeriod: z.string().optional(), limit: z.number().int().min(1).max(100).optional() } }, async (args) => sentrySearchEvents(args));
  }
  if (feishu) {
    server.registerTool("feishu_list_approvals", { description: "Read-only Feishu approval instance listing", inputSchema: { approvalCode: z.string().optional(), startTime: z.string().optional(), endTime: z.string().optional(), pageSize: z.number().int().min(1).max(100).optional(), pageToken: z.string().optional() } }, async (args) => feishuListApprovals(args));
    server.registerTool("feishu_get_approval", { description: "Read-only Feishu approval instance details", inputSchema: { instanceCode: z.string() } }, async (args) => feishuGetApproval(args));
    server.registerTool("feishu_send_notification", { description: "Send a Feishu notification only after explicit confirmation", inputSchema: { receiveId: z.string(), receiveIdType: z.string().optional(), text: z.string(), confirm: z.boolean().optional() }, annotations: { destructiveHint: true, readOnlyHint: false } }, async (args) => feishuSendNotification(args));
  }
  if (documents) {
    server.registerTool("document_extract_text", { description: "Extract bounded text from PDF, Office, or OCR-enabled documents inside the workspace", inputSchema: { path: z.string(), ocr: z.boolean().optional() } }, async (args) => extractDocument(args));
    server.registerTool("weknora_ingest_document", { description: "Upload a validated document to WeKnora only after explicit confirmation", inputSchema: { path: z.string(), knowledgeBaseId: z.string(), title: z.string().optional(), confirm: z.boolean().optional() }, annotations: { destructiveHint: true, readOnlyHint: false } }, async (args) => ingestWeKnora(args));
  }
  server.registerTool("integration_status", { description: "Show enabled integration scopes without exposing credentials", inputSchema: {} }, async () => result({ scope, github: Boolean(github), cnb: Boolean(cnb), sentry: Boolean(sentry), feishu: Boolean(feishu), documents: Boolean(documents), writes: { feishu: enabled("ANYONG_FEISHU_WRITE_ENABLED"), weknoraIngest: enabled("ANYONG_WEKNORA_INGEST_ENABLED") } }));
  return server;
}

export async function startIntegrationsMcp(scope = env("ANYONG_INTEGRATIONS_SCOPE", "all")) {
  const server = createServer(scope);
  await server.connect(new StdioServerTransport());
}

export {
  cnbGetBuildLogs,
  cnbGetBuilds,
  extractDocument,
  feishuSendNotification,
  githubListIssues,
  githubGetPullFiles,
  githubSearchCode,
  ingestWeKnora,
  sentryListIssues,
};

if (path.resolve(process.argv[1] ?? "") === path.resolve(fileURLToPath(import.meta.url))) {
  await startIntegrationsMcp(process.argv.find((arg) => arg.startsWith("--scope="))?.slice("--scope=".length) || env("ANYONG_INTEGRATIONS_SCOPE", "all"));
}
