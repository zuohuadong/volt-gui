import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(createRequire(import.meta.url).resolve("@voltui/dsh-mcp-apps"));
const { Client } = await import(pathToFileURL(require.resolve("@modelcontextprotocol/sdk/client/index.js")).href);
const { StdioClientTransport } = await import(pathToFileURL(require.resolve("@modelcontextprotocol/sdk/client/stdio.js")).href);

test("locked Memorix completes a real MCP handshake with the audited Zod version", { timeout: 90_000 }, async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "volt-memorix-smoke-"));
  execFileSync("git", ["init", "-q", temporary], { stdio: "ignore" });
  const client = new Client({ name: "volt-smoke", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(root, "node_modules/memorix/dist/cli/index.js"), "serve", "--mode", "micro", "--cwd", temporary],
    cwd: temporary,
    env: {
      ...process.env,
      MEMORIX_DATA_DIR: path.join(temporary, "data"),
      MEMORIX_AUTO_UPDATE: "off",
      MEMORIX_SQLITE_DRIVER: "node",
      MEMORIX_EMBEDDING: "off",
      MEMORIX_SEMANTIC_INDEX: "orama",
      MEMORIX_CODEGRAPH_EXTERNAL_CONTEXT: "off",
    },
    stderr: "pipe",
  });
  try {
    await client.connect(transport, { timeout: 60_000 });
    const { tools } = await client.listTools({}, { timeout: 30_000 });
    assert.ok(tools.length > 0);
    assert.ok(tools.some(tool => /memorix|memory/u.test(tool.name)));
    assert.ok(tools.every(tool => tool.inputSchema?.type === "object"));
  } finally {
    await client.close();
    await rm(temporary, { recursive: true, force: true });
  }
});
