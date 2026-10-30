import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { closeSync, existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  altiumCommandKind,
  acquireAltiumLock,
  analyzeFailure,
  extractDocument,
  reportEvidenceFiles,
  reportGenerateDocx,
  reportPath,
  reportSections,
  reportSpec,
  feishuSendNotification,
  githubListIssues,
  githubSearchCode,
  importMaxBytes,
  ingestWeKnora,
  officeCliInvocation,
  officeControlArgs,
  officeConversionTarget,
  officeRun,
  officeRunTimeoutMs,
  officeRoots,
  resolveOfficePath,
  sentryListIssues,
  sheetCacheDir,
  sheetCellBudget,
  sheetPythonCommand,
  sheetRequest,
  sheetRowLimit,
  sheetRun,
  spreadsheetOversizeMessage,
  validateEndpoint,
} from "./anyong-integrations-mcp.mjs";

const execFileAsync = promisify(execFile);
const originalFetch = globalThis.fetch;
const savedEnv = new Map();

function setEnv(values) {
  for (const [key, value] of Object.entries(values)) {
    if (!savedEnv.has(key)) savedEnv.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = String(value);
  }
}

setEnv({ ANYONG_NETWORK_MODE: "external" });

test.after(() => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of savedEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("Altium bridge exposes only audited read and write commands", () => {
  assert.equal(altiumCommandKind("get_project_info"), "read");
  assert.equal(altiumCommandKind("get_erc_violations"), "read");
  assert.equal(altiumCommandKind("run_output_jobs"), "write");
  assert.equal(altiumCommandKind("move_components"), "write");
  assert.equal(altiumCommandKind("run_process"), "unsupported");
  assert.equal(altiumCommandKind("shell"), "unsupported");
});

test("Altium path substitution treats dollar signs literally", () => {
  const source = readFileSync(path.join(import.meta.dirname, "anyong-integrations-mcp.mjs"), "utf8");
  assert.match(source, /replaceAll\("@ANYONG_ALTIUM_EXCHANGE_DIR@", \(\) =>/u);
});

test("Altium lock recovery stays fail-closed for unknown owner probe errors", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "anyong-altium-lock-"));
  const lockPath = path.join(root, "request.lock");
  const owner = JSON.stringify({ pid: process.pid + 10_000, requestId: "existing", phase: "prepared" });
  try {
    for (const code of ["EPERM", "EINVAL", "UNKNOWN", "ESRCH"]) {
      await writeFile(lockPath, owner);
      const probe = t.mock.method(process, "kill", () => { throw Object.assign(new Error(code), { code }); });
      try {
        if (code === "ESRCH") closeSync(acquireAltiumLock(lockPath));
        else {
          assert.throws(() => acquireAltiumLock(lockPath), /busy/u);
          assert.equal(await readFile(lockPath, "utf8"), owner);
        }
      } finally {
        probe.mock.restore();
      }
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Altium never recovers a lock after a detached bridge may have started", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "anyong-altium-started-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const lockPath = path.join(root, "request.lock");
  const probe = t.mock.method(process, "kill", () => { throw Object.assign(new Error("gone"), { code: "ESRCH" }); });
  for (const phase of ["bridge-started", undefined]) {
    const owner = JSON.stringify({ pid: process.pid + 10_000, requestId: "existing", phase });
    await writeFile(lockPath, owner);
    assert.throws(() => acquireAltiumLock(lockPath), /busy/u);
    assert.equal(await readFile(lockPath, "utf8"), owner);
  }
  assert.equal(probe.mock.callCount(), 0);
});

test("Altium recovery serializes cross-process lock replacement", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "anyong-altium-recovery-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const lockPath = path.join(root, "request.lock");
  const owner = JSON.stringify({ pid: process.pid + 10_000, phase: "prepared" });
  await writeFile(lockPath, owner);
  await writeFile(`${lockPath}.recovery`, "another recoverer");
  assert.throws(() => acquireAltiumLock(lockPath), /recovery is busy/u);
  assert.equal(await readFile(lockPath, "utf8"), owner);
  await rm(`${lockPath}.recovery`);
  const probe = t.mock.method(process, "kill", () => { throw Object.assign(new Error("gone"), { code: "ESRCH" }); });
  const lock = acquireAltiumLock(lockPath);
  closeSync(lock);
  assert.equal(probe.mock.callCount(), 1);
  assert.throws(() => acquireAltiumLock(lockPath), /busy/u);
});

test("Office paths stay inside the workspace and require an existing document", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "anyong-office-"));
  try {
    await mkdir(path.join(root, "docs"));
    await writeFile(path.join(root, "docs", "report.docx"), "doc");
    assert.equal(resolveOfficePath("docs/report.docx", [root]), path.join(root, "docs", "report.docx"));
    assert.equal(resolveOfficePath(path.join(root, "docs", "new.pdf"), [root], { mustExist: false }), path.join(root, "docs", "new.pdf"));
    assert.throws(() => resolveOfficePath(path.join(root, "..", "outside.docx"), [root]), /outside/);
    assert.throws(() => resolveOfficePath("docs/missing.docx", [root]), /does not exist/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Office conversion maps only legacy binary formats to their OOXML targets", () => {
  assert.deepEqual(officeConversionTarget("report.doc"), { extension: ".docx", format: 16 });
  assert.deepEqual(officeConversionTarget("REPORT.XLS"), { extension: ".xlsx", format: 51 });
  assert.deepEqual(officeConversionTarget("slides.ppt"), { extension: ".pptx", format: 24 });
  assert.equal(officeConversionTarget("report.docx"), undefined);
  assert.equal(officeConversionTarget("report.pdf"), undefined);
});

test("explicit Office and report roots reject sibling and symlink escapes", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "anyong-path-boundary-"));
  try {
    const workspace = path.join(root, "workspace");
    const outside = path.join(root, "outside");
    await mkdir(workspace);
    await mkdir(outside);
    await writeFile(path.join(outside, "private.docx"), "private");
    await symlink(outside, path.join(workspace, "link"), process.platform === "win32" ? "junction" : "dir");
    setEnv({ ANYONG_OFFICE_ROOT: workspace, ANYONG_REPORT_ROOTS: workspace, DSH_CWD: outside });
    assert.deepEqual(officeRoots(), [workspace]);
    assert.throws(() => resolveOfficePath(path.join(outside, "private.docx"), officeRoots()), /outside/);
    assert.throws(() => resolveOfficePath("link/private.docx", officeRoots()), /outside/);
    assert.throws(() => resolveOfficePath("link/new.docx", officeRoots(), { mustExist: false }), /outside/);
    assert.throws(() => reportPath("link", { mustExist: true }), /不在允许/u);
    assert.throws(() => reportPath("link/new.docx"), /不在允许/u);
  } finally {
    setEnv({ ANYONG_OFFICE_ROOT: undefined, ANYONG_REPORT_ROOTS: undefined, DSH_CWD: undefined });
    await rm(root, { recursive: true, force: true });
  }
});

test("Office control script covers Microsoft Office and WPS without non-ASCII ambiguity", () => {
  const script = readFileSync(new URL("./office-control.ps1", import.meta.url), "utf8");
  for (const progId of ["Word.Application", "Excel.Application", "PowerPoint.Application", "KWPS.Application", "KET.Application", "KWPP.Application"]) {
    assert.match(script, new RegExp(progId.replaceAll(".", "\\."), "u"));
  }
  assert.match(script, /ExportAsFixedFormat/u);
  assert.match(script, /SaveAs2/u);
  assert.match(script, /Get-Conversion/u);
  assert.match(script, /GetTypeFromProgID/u);
  assert.equal(/[^\x00-\x7F]/u.test(script), false);
});

test("Office control isolates background work and records its own process", () => {
  const script = readFileSync(new URL("./office-control.ps1", import.meta.url), "utf8");
  // Background actions must never borrow the user's running Office instance.
  assert.match(script, /function New-AppInstance\(\[hashtable\]\$Spec, \[bool\]\$AllowAttach\)/u);
  assert.match(script, /if \(\$AllowAttach\) \{[\s\S]*GetActiveObject/u);
  assert.match(script, /if \(\$Action -eq 'convert'\)[\s\S]*?New-AppInstance \$spec \(-not \$Private\)/u);
  assert.match(script, /if \(\$Action -eq 'export-pdf'\)[\s\S]*?New-AppInstance \$spec \(-not \$Private\)/u);
  // save/close still target the document the user already has open.
  assert.match(script, /save\/close always operate on the document[\s\S]*?New-AppInstance \$spec \$true/u);
  // Modal prompts and recalculation stay off during background automation.
  for (const marker of [
    "AskToUpdateLinks = $false",
    "EnableEvents = $false",
    "ScreenUpdating = $false",
    "Calculation = -4135",
    "AutomationSecurity = 3",
    "AlertBeforeOverwriting = $false",
    "Workbooks.Open($FilePath, 0, $false)",
  ]) {
    assert.ok(script.includes(marker), marker);
  }
  // The recorded owner PID is verified before any process is stopped.
  for (const marker of [
    "'status', 'open', 'export-pdf', 'save', 'close', 'convert', 'cleanup'",
    "Get-CimInstance -ClassName Win32_Process",
    "parentProcessId = [int]$process.ParentProcessId",
    "$BeforeProcessIds -notcontains",
    "creationDate",
    "Stop-Process -Id $targetPid -Force",
  ]) {
    assert.ok(script.includes(marker), marker);
  }
});

test("Office control arguments request a private instance for background actions", () => {
  const convert = officeControlArgs("convert", { path: "C:/in.xls", output: "C:/out.xlsx", private: true, pidFile: "C:/tmp/owner.json" });
  assert.deepEqual(convert.slice(0, 2), ["-NoLogo", "-NoProfile"]);
  assert.ok(convert.includes("-Private"));
  assert.equal(convert[convert.indexOf("-PidFile") + 1], "C:/tmp/owner.json");
  const open = officeControlArgs("open", { path: "C:/doc.docx", visible: true });
  assert.ok(open.includes("-Visible"));
  assert.ok(!open.includes("-Private"));
  assert.ok(!open.includes("-PidFile"));
  const cleanup = officeControlArgs("cleanup", { pidFile: "C:/tmp/owner.json" });
  assert.equal(cleanup[cleanup.indexOf("-Action") + 1], "cleanup");
  setEnv({ ANYONG_OFFICE_TIMEOUT_MS: "240000" });
  assert.equal(officeRunTimeoutMs(), 240_000);
  setEnv({ ANYONG_OFFICE_TIMEOUT_MS: undefined });
  assert.equal(officeRunTimeoutMs(), 180_000);
});

test("Office control refuses to run outside Windows", async () => {
  if (process.platform === "win32") return;
  await assert.rejects(officeRun("status"), /only on Windows/u);
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
  // realpath keeps macOS /var -> /private/var temporary roots comparable with
  // the resolved root the guard computes internally.
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "anyong-document-")));
  try {
    await writeFile(path.join(root, "note.txt"), "line one\nline two");
    setEnv({ ANYONG_IMPORT_ROOT: root });
    const response = await extractDocument({ path: "note.txt" });
    assert.match(response.content[0].text, /line one/);
    await assert.rejects(extractDocument({ path: "..\\note.txt" }), /inside ANYONG_IMPORT_ROOT/);
    await assert.rejects(extractDocument({ path: "missing.pdf" }), (error) => {
      assert.match(error.message, /^ENOENT: no such file or directory/);
      assert.ok(error.message.includes(path.join(root, "missing.pdf")));
      return true;
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("import limits are configurable and oversize guidance is actionable", () => {
  setEnv({ ANYONG_IMPORT_MAX_BYTES: "1024" });
  assert.equal(importMaxBytes(), 1024);
  setEnv({ ANYONG_IMPORT_MAX_BYTES: undefined });
  assert.equal(importMaxBytes(), 25 * 1024 * 1024);
  setEnv({ ANYONG_SHEET_ROW_LIMIT: "77" });
  assert.equal(sheetRowLimit(), 77);
  setEnv({ ANYONG_SHEET_ROW_LIMIT: undefined });
  assert.equal(sheetRowLimit(), 2000);
  const message = spreadsheetOversizeMessage("D:/报表/明细.xlsx", "Error: Cannot open: document has more than 3,000,000 XML elements");
  assert.match(message, /超过 OfficeCLI 引擎上限/u);
  assert.match(message, /sheet_aggregate/u);
  assert.match(message, /明细\.xlsx/u);
});

test("OfficeCLI resolves to the bundled launcher without downloading", () => {
  setEnv({ ANYONG_OFFICECLI_LAUNCHER: undefined, ANYONG_OFFICECLI_COMMAND: "/opt/node-runtime/node" });
  const invocation = officeCliInvocation();
  assert.equal(invocation.command, process.execPath, "the MCP transport command is not the document reader");
  if (invocation.prefix.length > 0) assert.ok(existsSync(invocation.prefix[0]), invocation.prefix[0]);
  setEnv({ ANYONG_OFFICECLI_LAUNCHER: "/opt/bundle/officecli.js" });
  assert.deepEqual(officeCliInvocation(), { command: process.execPath, prefix: ["/opt/bundle/officecli.js"] });
});

test("sheet tools require a configured Python runtime instead of guessing one", () => {
  setEnv({ ANYONG_SHEET_PYTHON: undefined, ANYONG_PYTHON_COMMAND: undefined });
  assert.throws(() => sheetPythonCommand(), /未找到表格计算用的 Python 运行时/u);
  setEnv({ ANYONG_PYTHON_COMMAND: "/opt/bundle/python3" });
  assert.equal(sheetPythonCommand(), "/opt/bundle/python3");
  setEnv({ ANYONG_SHEET_PYTHON: "/opt/override/python3" });
  assert.equal(sheetPythonCommand(), "/opt/override/python3");
});

test("sheet requests stay inside the workspace and clamp row limits", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "anyong-sheet-"));
  try {
    await writeFile(path.join(root, "book.xlsx"), "placeholder");
    setEnv({ ANYONG_OFFICE_ROOT: root, ANYONG_SHEET_ROW_LIMIT: "50" });
    const request = sheetRequest({ path: "book.xlsx", maxRows: 10_000, limit: 10_000, sheet: " 明细 " }, "aggregate");
    assert.equal(request.maxRows, 50);
    assert.equal(request.limit, 50);
    assert.equal(request.sheet, "明细");
    assert.equal(request.cacheDir, sheetCacheDir());
    assert.equal(request.cellBudget, 10_000_000);
    assert.equal(request.reader, undefined);

    setEnv({ ANYONG_SHEET_CELL_BUDGET: "250000", ANYONG_SHEET_READER: "openpyxl" });
    assert.equal(sheetCellBudget(), 250_000);
    const overridden = sheetRequest({ path: "book.xlsx" }, "aggregate");
    assert.equal(overridden.reader, "openpyxl");
    assert.equal(overridden.cellBudget, 250_000);
    setEnv({ ANYONG_SHEET_CELL_BUDGET: undefined, ANYONG_SHEET_READER: undefined });
    assert.equal(sheetCellBudget(), 10_000_000);

    setEnv({ ANYONG_DUCKDB_EXTENSION_DIR: "/opt/ext", ANYONG_SHEET_FALLBACK: "openpyxl" });
    const slow = sheetRequest({ path: "book.xlsx" }, "aggregate");
    assert.equal(slow.extensionDirectory, "/opt/ext");
    assert.equal(slow.fallback, "openpyxl");
    setEnv({ ANYONG_DUCKDB_EXTENSION_DIR: undefined, ANYONG_SHEET_FALLBACK: undefined });
    assert.equal(sheetRequest({ path: "book.xlsx" }, "aggregate").extensionDirectory, undefined);
    assert.throws(() => sheetRequest({ path: path.join(root, "..", "outside.xlsx") }, "profile"), /outside the allowed workspace/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function resolveSheetPython() {
  const candidate = process.env.ANYONG_TEST_SHEET_PYTHON || process.env.ANYONG_PYTHON_COMMAND;
  if (!candidate || !existsSync(candidate)) return null;
  try {
    await execFileAsync(candidate, ["-c", "import openpyxl, duckdb"], { timeout: 60_000 });
    return candidate;
  } catch {
    return null;
  }
}

test("sheet engine profiles, queries and aggregates a real workbook", { timeout: 240000 }, async (t) => {
  const python = await resolveSheetPython();
  if (!python) {
    t.skip("set ANYONG_TEST_SHEET_PYTHON to a Python with openpyxl and duckdb");
    return;
  }
  const root = await mkdtemp(path.join(os.tmpdir(), "anyong-sheet-run-"));
  const workbook = path.join(root, "ledger.xlsx");
  try {
    await execFileAsync(python, ["-c", [
      "from openpyxl import Workbook",
      "import sys",
      "book = Workbook(write_only=True)",
      "sheet = book.create_sheet('明细')",
      "sheet.append(['部门', '科目', '借方'])" ,
      "for index in range(1, 2001):",
      "    sheet.append([f'部门{index % 4}', '660201', index])",
      "book.save(sys.argv[1])",
    ].join("\n"), workbook], { timeout: 120_000 });
    setEnv({
      ANYONG_OFFICE_ROOT: root,
      ANYONG_SHEET_PYTHON: python,
      ANYONG_SHEET_CACHE_DIR: path.join(root, "cache"),
    });

    const profile = await sheetRun(sheetRequest({ path: "ledger.xlsx" }, "profile"));
    assert.equal(profile.ok, true);
    assert.equal(profile.sheet, "明细");
    assert.deepEqual(profile.sheets, ["明细"]);
    assert.deepEqual(profile.dataColumns.slice(0, 3).map((column) => column.header), ["部门", "科目", "借方"]);

    const window = await sheetRun(sheetRequest({ path: "ledger.xlsx", sheet: "明细", range: "A1:C2" }, "query"));
    assert.equal(window.rowCount, 2);
    assert.deepEqual(window.rows[1].cells, ["部门1", "660201", 1]);

    const aggregate = await sheetRun(sheetRequest({
      path: "ledger.xlsx",
      sheet: "明细",
      sql: "SELECT 部门, SUM(借方) AS total FROM data GROUP BY 1 ORDER BY 1",
    }, "aggregate"));
    assert.equal(aggregate.rowCount, 4);
    assert.deepEqual(aggregate.rows.map((row) => row[0]), ["部门0", "部门1", "部门2", "部门3"]);
    assert.equal(aggregate.rows.reduce((sum, row) => sum + row[1], 0), 2001000);
    assert.ok(["calamine", "openpyxl"].includes(aggregate.reader), aggregate.reader);
    assert.equal(aggregate.cache.hit, false);
    assert.equal(aggregate.cache.parquet, true, "the first run must persist a parquet snapshot");

    // Second run must skip the workbook engine entirely.
    const cached = await sheetRun(sheetRequest({
      path: "ledger.xlsx",
      sheet: "明细",
      sql: "SELECT COUNT(*) AS rows FROM data",
    }, "aggregate"));
    assert.equal(cached.cache.hit, true);
    assert.equal(cached.reader, "cache");
    assert.equal(cached.rows[0][0], 2000);

    // A1-anchored windows are served from the snapshot, other ranges stay exact.
    const windowed = await sheetRun(sheetRequest({ path: "ledger.xlsx", sheet: "明细", range: "A1:B3" }, "query"));
    assert.equal(windowed.source, "cache");
    assert.deepEqual(windowed.columns, ["A", "B"]);
    assert.deepEqual(windowed.rows[1].cells, ["部门1", 660201]);
    const exact = await sheetRun(sheetRequest({ path: "ledger.xlsx", sheet: "明细", range: "B3:C4" }, "query"));
    assert.equal(exact.source, "openpyxl");
    assert.deepEqual(exact.rows[0].cells, ["660201", 2]);

    await assert.rejects(
      sheetRun(sheetRequest({ path: "ledger.xlsx", sheet: "明细", sql: "COPY data TO 'leak.csv'" }, "aggregate")),
      /只允许 SELECT 或 WITH/u,
    );
    await assert.rejects(
      sheetRun(sheetRequest({ path: "ledger.xlsx", sheet: "明细", sql: "SELECT * FROM read_csv_auto('/etc/passwd')" }, "aggregate")),
      /不允许的关键字/u,
    );
    await assert.rejects(
      sheetRun(sheetRequest({ path: "ledger.xlsx", sheet: "不存在" }, "profile")),
      /工作表 不存在 不存在/u,
    );

    // Above the cell budget without the duckdb extension: fail fast with guidance
    // instead of crawling through openpyxl for a minute. Use a cold cache so the
    // snapshot from the earlier assertions cannot short-circuit the check.
    const coldCache = path.join(root, "cold-cache");
    setEnv({ ANYONG_SHEET_CELL_BUDGET: "1000", ANYONG_SHEET_CACHE_DIR: coldCache });
    const started = Date.now();
    await assert.rejects(
      sheetRun({ ...sheetRequest({ path: "ledger.xlsx", sheet: "明细", sql: "SELECT COUNT(*) FROM data" }, "aggregate"), cellBudget: 1000 }),
      (error) => {
        assert.match(error.message, /超过单次转换预算/u);
        assert.match(error.message, /ANYONG_DUCKDB_EXTENSION_DIR/u);
        assert.match(error.message, /ANYONG_SHEET_FALLBACK=openpyxl/u);
        return true;
      },
    );
    assert.ok(Date.now() - started < 5_000, "oversize refusal must not wait for a slow parse");
    // The slow path stays reachable but only when explicitly requested.
    const slow = await sheetRun({
      ...sheetRequest({ path: "ledger.xlsx", sheet: "明细", sql: "SELECT COUNT(*) AS n FROM data" }, "aggregate"),
      cellBudget: 1000,
      fallback: "openpyxl",
    });
    assert.equal(slow.reader, "openpyxl");
    assert.equal(slow.rows[0][0], 2000);
    setEnv({ ANYONG_SHEET_CELL_BUDGET: undefined, ANYONG_SHEET_CACHE_DIR: undefined });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});


test("report spec keeps fixed sections and marks missing ones", () => {
  const spec = reportSpec({
    root: "/tmp/FA-26-01013",
    project: { flowNumber: "FA-26-01013", customer: "示例客户", device: "MOSFET", model: "XG-100", status: "分析中" },
    evidence: [{ fileName: "curve.pdf", evidenceType: "pdf", sizeBytes: 1024, modifiedAt: "2026-10-29T00:00:00.000Z", relativePath: "curve.pdf" }],
    sections: { summary: "概述正文", rootCause: "   " },
    output: "/tmp/out.docx",
    generatedAt: "2026-10-29T00:00:00.000Z",
  });
  assert.match(spec.title, /^FA-26-01013 失效分析报告（草稿）$/u);
  assert.match(spec.notice, /未经审核、批准与签发/u);
  assert.deepEqual(spec.identifiers.map((item) => item.label), [
    "流程单号", "客户", "器件/型号", "状态", "资料目录",
  ]);
  assert.equal(spec.sections.length, 6);
  assert.equal(spec.sections.find((item) => item.key === "summary").body, "概述正文");
  assert.match(spec.sections.find((item) => item.key === "rootCause").body, /待补充/u);
  assert.match(spec.source, /未上传任何资料/u);
  assert.deepEqual(reportSections({ summary: " 正文 " }), { summary: "正文" });
  assert.throws(() => reportSections({ unknown: "x" }), /未知的报告章节/u);
  assert.throws(() => reportSections({ summary: "x".repeat(12001) }), /超过 12000/u);
  assert.throws(() => reportSections({ summary: "   " }), /至少需要一个报告章节/u);
});

test("report paths stay inside the configured local roots", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "anyong-report-root-"));
  try {
    setEnv({ ANYONG_REPORT_ROOTS: root });
    const inside = reportPath("资料/2026", { mustExist: false });
    assert.equal(inside, path.join(root, "资料/2026"));
    assert.equal(reportPath(root, { mustExist: true }), root);
    assert.throws(() => reportPath("../escape", { mustExist: false }), /不在允许的本地资料根目录内/u);
    assert.throws(() => reportPath("/etc", { mustExist: false }), /不在允许的本地资料根目录内/u);
    assert.throws(() => reportPath("missing", { mustExist: true }), /不存在、不可读或不是文件夹/u);
  } finally {
    await rm(root, { recursive: true, force: true });
    setEnv({ ANYONG_REPORT_ROOTS: undefined });
  }
});

test("report evidence scan is bounded, ordered and skips dependencies", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "anyong-report-scan-"));
  try {
    await mkdir(path.join(root, "曲线"), { recursive: true });
    await mkdir(path.join(root, "node_modules", "pkg"), { recursive: true });
    await mkdir(path.join(root, ".git"), { recursive: true });
    await writeFile(path.join(root, "curve.pdf"), "pdf");
    await writeFile(path.join(root, "曲线", "xray.png"), "png");
    await writeFile(path.join(root, "notes.txt"), "text");
    await writeFile(path.join(root, "ignore.exe"), "bin");
    await writeFile(path.join(root, ".hidden.pdf"), "pdf");
    await writeFile(path.join(root, "node_modules", "pkg", "index.pdf"), "pdf");
    await writeFile(path.join(root, ".git", "config.pdf"), "pdf");
    const files = reportEvidenceFiles(root);
    assert.deepEqual(files.map((item) => item.relativePath).sort(), [
      "curve.pdf", "notes.txt", "曲线/xray.png",
    ]);
    assert.equal(files.find((item) => item.relativePath === "curve.pdf").evidenceType, "pdf");
    assert.equal(files.find((item) => item.relativePath === "曲线/xray.png").evidenceType, "image");
    assert.ok(files.every((item) => item.sizeBytes > 0 && typeof item.modifiedAt === "string"));
    assert.equal(reportEvidenceFiles(root, { maxFiles: 1 }).length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("report docx generation stays offline and refuses to overwrite by default", { timeout: 120000 }, async (t) => {
  const python = process.env.ANYONG_TEST_REPORT_PYTHON || "python3";
  try {
    await execFileAsync(python, ["-c", "import docx"], { timeout: 20000 });
  } catch {
    t.skip(`set ANYONG_TEST_REPORT_PYTHON to a Python with python-docx (tried ${python})`);
    return;
  }
  const root = await mkdtemp(path.join(os.tmpdir(), "anyong-report-gen-"));
  try {
    await mkdir(path.join(root, "evidence"), { recursive: true });
    await writeFile(path.join(root, "evidence", "curve.pdf"), "pdf");
    await writeFile(path.join(root, "evidence", "xray.png"), "png");
    setEnv({ ANYONG_REPORT_ROOTS: root, ANYONG_REPORT_PYTHON: python });
    globalThis.fetch = async () => {
      throw new Error("report generation must not use the network");
    };
    const response = await reportGenerateDocx({
      root,
      output: "out/FA-26-01013-draft.docx",
      project: { flowNumber: "FA-26-01013", customer: "示例客户" },
      sections: { summary: "概述正文", conclusion: "结论正文" },
      gaps: ["缺少 X-Ray 原始图"],
    });
    const receipt = JSON.parse(response.content[0].text);
    assert.equal(receipt.draft, true);
    assert.match(receipt.notice, /未经审核/u);
    assert.equal(receipt.sections, 6);
    assert.equal(receipt.evidence, 2);
    const filePath = path.join(root, "out/FA-26-01013-draft.docx");
    const bytes = await readFile(filePath);
    assert.equal(bytes.subarray(0, 2).toString("utf8"), "PK");
    assert.equal(createHash("sha256").update(bytes).digest("hex"), receipt.sha256);
    assert.equal(receipt.bytes, bytes.length);

    await assert.rejects(
      reportGenerateDocx({ root, output: "out/FA-26-01013-draft.docx", sections: { summary: "x" } }),
      /已存在.*overwrite/u,
    );
    const noEvidence = await reportGenerateDocx({
      root,
      output: "out/empty.docx",
      sections: { summary: "仅正文" },
      includeEvidence: false,
    });
    assert.equal(JSON.parse(noEvidence.content[0].text).evidence, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
    setEnv({ ANYONG_REPORT_ROOTS: undefined, ANYONG_REPORT_PYTHON: undefined });
  }
});
