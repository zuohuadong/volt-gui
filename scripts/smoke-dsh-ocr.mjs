import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

// 验收直接挂载官方服务，不实现替代的权限、进程或文件系统。
const [modules, python] = process.argv.slice(2);
const require = createRequire(path.join(path.resolve(modules), "_ocr-smoke.cjs"));
const load = (name) => import(pathToFileURL(require.resolve(name)).href);
const { Context } = await load("@deepseek-ai/cordis");
const context = new Context();
const temporary = mkdtempSync(path.join(os.tmpdir(), "anyong-dsh-ocr-"));
const workspace = path.join(temporary, "workspace");
mkdirSync(workspace);
const mounted = [];
try {
  for (const [name, config] of [
    ["@deepseek-ai/dsh-session-projection", {}],
    ["@deepseek-ai/dsh-system-prompt", {}],
    ["@deepseek-ai/dsh-tools", {}],
    ["@deepseek-ai/dsh-sandbox-policy", { mode: "workspace-write", workspaceRoot: workspace }],
    ["@deepseek-ai/dsh-fs-sandbox", { cwd: workspace }],
    ["@deepseek-ai/dsh-subprocess-local", {}],
    ["@deepseek-ai/dsh-sandbox-local", {}],
  ]) {
    mounted.push(await context.plugin((await load(name)).default, config));
  }
  const plugin = await load("dsh-ab-ocr");
  mounted.push(await context.plugin(plugin, {
    pythonPath: path.resolve(python), dpi: 200, maxPixels: 12000000, maxPages: 50,
    maxDocuments: 3, timeoutMs: 90000, startupTimeoutMs: 30000,
    maxOutlineCandidates: 400, engineLifetime: "perDocument", writePageFiles: true,
    detectHeadings: false, removePageNumbers: false, removeRunningHeads: false,
    joinAcrossPages: false, joinWrappedLines: false,
  }));
  const tool = context.tools.get("ocr");
  assert.ok(tool, "official tool registry must discover OCR");
  // A tiny digital PDF exercises the full official process/file path without model variability.
  const stream = "BT /F1 18 Tf 40 100 Td (Offline OCR integration) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}`;
  pdf += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  writeFileSync(path.join(workspace, "sample.pdf"), pdf);
  const result = await tool.execute({ path: path.join(workspace, "sample.pdf") }, { signal: new AbortController().signal });
  assert.deepEqual(result.failures, []);
  assert.equal(result.documents.length, 1);
  assert.match(readFileSync(result.documents[0].output, "utf8"), /Offline OCR integration/);
  assert.ok(result.documents[0].pageDir);
  // 与独立 worker smoke 共用素材，但识别必须经过实际官方沙箱。
  const worker = path.resolve(modules, "dsh-ab-ocr/python/ocr_worker.py");
  execFileSync(path.resolve(python), [
    "-I", "-B", path.join(import.meta.dirname, "smoke-desktop-ocr.py"),
    worker, "--fixtures-only", workspace,
  ], { timeout: 30000, stdio: "pipe" });
  for (const filename of ["chinese.png", "scan.pdf"]) {
    const recognized = await tool.execute({ path: path.join(workspace, filename) }, { signal: new AbortController().signal });
    assert.deepEqual(recognized.failures, []);
    assert.equal(recognized.documents.length, 1);
    const markdown = readFileSync(recognized.documents[0].output, "utf8").replace(/\s/g, "");
    assert.match(markdown, /办公文档识别测试/);
    assert.match(markdown, /InvoiceTotal12345/);
    console.log(`${filename}: official sandbox OCR and artifact writes verified`);
  }
  const writeProbe = [
    "import sys",
    "for target in sys.argv[1:]:",
    "    try:",
    "        with open(target, 'xb') as stream: stream.write(b'forbidden')",
    "    except PermissionError: pass",
    "    else: raise AssertionError('read-only process obtained write access')",
  ].join("\n");
  const confined = await context.sandbox.confine([
    path.resolve(python), "-E", "-s", "-B", "-c", writeProbe,
    path.join(workspace, "worker-write.txt"), path.join(temporary, "temp-write.txt"),
  ], { mode: "read-only", workspaceRoot: workspace }, new AbortController().signal);
  assert.ok(["full", "partial"].includes(confined.enforcement));
  execFileSync(confined.argv[0], confined.argv.slice(1), {
    cwd: workspace, timeout: 30000, stdio: "pipe", windowsHide: true,
  });
  console.log("Read-only process cannot write workspace or temporary files");
  const cancelled = AbortSignal.abort();
  await assert.rejects(tool.execute({ path: path.join(workspace, "sample.pdf") }, { signal: cancelled }));
  await assert.rejects(tool.execute({ path: path.join(workspace, "sample.pdf"), levels: "h1=1" }, { signal: new AbortController().signal }), /disabled/);
  console.log("Official DSH registry, bounded snapshots, Windows sandbox, subprocess and OCR artifact writes passed.");
} finally {
  for (const plugin of mounted.reverse()) await plugin.dispose();
  rmSync(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
