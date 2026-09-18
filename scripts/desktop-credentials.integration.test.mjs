import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ensureOfficeCliBinary } from "./third-party-office-tools.mjs";
import {
  bundledDshModelEnvironment,
  OfficialDshRuntime,
  provisionBundledDshCredential,
} from "../apps/desktop-electron/src/official-dsh-runtime.ts";
import { DshRemoteClient } from "../apps/desktop-electron/src/dsh-remote-client.ts";

const root = path.resolve(import.meta.dirname, "..");
const desktop = path.join(root, "apps", "desktop-electron");
const testPackageRoot = process.env.ANYONG_TEST_PACKAGE_ROOT || desktop;
const desktopRequire = createRequire(path.join(testPackageRoot, "package.json"));
const dshBin = path.join(path.dirname(desktopRequire.resolve("@deepseek-ai/dsh/package.json")), "lib", "bin.js");
const browserPlugin = path.dirname(desktopRequire.resolve("@wxg-prc-cpg/browser-skill-dsh-plugin/package.json"));
const weknoraPlugin = path.dirname(desktopRequire.resolve("@wxg-prc-cpg/dsh-weknora/package.json"));
const officeEntry = path.resolve(path.dirname(desktopRequire.resolve("@officecli/officecli")), "..", "officecli.js");
const integrationsMcpScript = path.join(root, "scripts", "anyong-integrations-mcp.mjs");
const stagedBsk = path.join(desktop, ".browser-skill-runtime", process.platform === "win32" ? "bsk.exe" : "bsk");

async function connect(runtime) {
  const client = new DshRemoteClient(await runtime.start());
  await client.authenticate();
  return client;
}

for (const source of ["project-env", "user-env"]) {
  test(`desktop replaces ${source} fallback and authenticates through official DSH`, { timeout: 420_000 }, async () => {
    await ensureOfficeCliBinary(officeEntry);
    const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "anyong-credential-upgrade-"));
    const workspace = path.join(temporaryRoot, "workspace");
    const home = path.join(temporaryRoot, "home");
    await mkdir(workspace);
    await mkdir(home);
    const envPath = path.join(source === "project-env" ? workspace : home, ".env");
    const oldEnv = "XG_GOMODEL_API_KEY=synthetic-expired-value\n";
    await writeFile(envPath, oldEnv);
    const authorizations = [];
    const gateway = createServer((req, res) => {
      const accepted = req.headers.authorization === "Bearer synthetic-bundled-value";
      authorizations.push(accepted);
      res.writeHead(accepted ? 200 : 401, { "content-type": "application/json" });
      res.end(JSON.stringify(accepted
        ? { data: [{ id: "synthetic-model" }] }
        : { error: { message: "synthetic credential rejected" } }));
    });
    await new Promise((resolve) => gateway.listen(0, "127.0.0.1", resolve));
    const endpoint = `http://127.0.0.1:${gateway.address().port}/v1`;
    const bundledPath = path.join(temporaryRoot, "bundled.env");
    await writeFile(bundledPath, `XG_MODEL_BASE_URL=${endpoint}\nXG_GOMODEL_API_KEY=synthetic-bundled-value\n`);
    const runtime = new OfficialDshRuntime({
      executable: process.execPath,
      executableArgs: ["--expose-internals"],
      dshBin,
      dshHome: home,
      patchFile: path.join(root, "profiles", "anyong.yml"),
      workspace,
      bundledBrowserSkillPackageDir: browserPlugin,
      bundledProfilePlugins: [{ packageName: "@wxg-prc-cpg/dsh-weknora", packageDir: weknoraPlugin }],
      environment: {
        ...bundledDshModelEnvironment(bundledPath),
        XG_GOMODEL_API_KEY: "",
        HOME: temporaryRoot,
        USERPROFILE: temporaryRoot,
        ANYONG_BSK_PATH: existsSync(stagedBsk) ? stagedBsk : "bsk",
        ANYONG_OFFICECLI_COMMAND: process.execPath,
        ANYONG_OFFICECLI_ARGS_JSON: JSON.stringify([officeEntry, "mcp"]),
        ANYONG_INTEGRATIONS_MCP_COMMAND: process.execPath,
        ANYONG_INTEGRATIONS_MCP_SCRIPT: integrationsMcpScript,
      },
    });
    try {
      let client = await connect(runtime);
      const settings = await client.call("settings/describe", {});
      const modelSettings = settings.namespaces.find((entry) => entry.ns === "llm-pi-ai");
      assert.equal(modelSettings.value.providers["xg-gomodel"].baseURL, endpoint);
      const refs = { refs: ["XG_GOMODEL_API_KEY"] };
      let described = await client.call("credentials/describe", refs);
      assert.equal(described.XG_GOMODEL_API_KEY.source, source);
      const discovery = { settingsNs: "llm-pi-ai", provider: "xg-gomodel", baseURL: endpoint, api: "openai-completions" };
      const { settingsNs, ...discoveryRequest } = discovery;
      const discoveryArgs = { settingsNs, request: discoveryRequest };
      await assert.rejects(client.call("llm/discoverModels", discoveryArgs));
      assert.equal((await provisionBundledDshCredential(client, bundledPath)).provisioned, true);
      described = await client.call("credentials/describe", refs);
      assert.equal(described.XG_GOMODEL_API_KEY.source, "file");
      const discovered = await client.call("llm/discoverModels", discoveryArgs);
      assert.equal(discovered[0].id, "synthetic-model");
      assert.deepEqual(authorizations, [false, true]);
      assert.equal(await readFile(envPath, "utf8"), oldEnv);
      await runtime.stop();
      client = await connect(runtime);
      assert.equal((await provisionBundledDshCredential(client, bundledPath)).reason, "already-configured");
      assert.equal((await client.call("llm/discoverModels", discoveryArgs))[0].id, "synthetic-model");
    } finally {
      await runtime.stop();
      await new Promise((resolve) => gateway.close(resolve));
      await rm(temporaryRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  });
}
