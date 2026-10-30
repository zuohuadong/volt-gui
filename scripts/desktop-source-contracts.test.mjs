import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { assertSourceOrder } from "./source-order.mjs";

const read = (relative) => readFileSync(path.resolve(import.meta.dirname, "..", relative), "utf8");
const main = read("apps/desktop-electron/src/main.ts");

test("desktop renders its window before the runtime startup transaction", () => {
  assertSourceOrder(main, ["mainWindow = createWindow();", "void beginDesktopStart();"]);
});

test("voice input uses trusted microphone IPC and the official speech endpoints", () => {
  assert.match(main, /callback\(isTrustedMicrophonePermission\(webContents, permission, details\)\)/u);
  assert.match(main, /handleTrustedIpc\("desktop:microphone-access"/u);
  assert.match(read("apps/desktop-electron/src/dsh-method-map.ts"), /"speech\/catalog", "speech\/prepare"/u);
});

test("clipboard writes use bounded trusted IPC", () => {
  assert.match(main, /handleTrustedIpc\("desktop:copy-text"/u);
  assert.match(main, /value\.length > 1_000_000/u);
  assert.match(main, /clipboard\.writeText\(value\)/u);
});

test("lazy management imports keep their own CSS preload branches", () => {
  const app = read("apps/desktop-frontend/src/App.svelte");
  const loader = app.slice(app.indexOf("function importManagementComponent("), app.indexOf("async function ensureManagementComponents("));
  assert.doesNotMatch(loader, /[?:]\s*import\(/u);
  for (const name of ["ProviderWorkbench", "PluginInventoryView", "McpInventoryView", "ExternalKnowledgeSources", "KnowledgeSkillList", "KnowledgeScopePicker"]) {
    assert.ok(loader.includes(`return import("$components/${name}.svelte")`), name);
  }
});

test("text-only browser screenshots never instruct the model to read an image", () => {
  const patch = read("patches/@wxg-prc-cpg__browser-skill-dsh-plugin@0.4.0.patch");
  const added = patch.split("\n").filter(line => line.startsWith("+") && !line.startsWith("+++")).join("\n");
  assert.match(added, /must not be read as an image/u);
  assert.match(added, /Do not read this PNG as an image/u);
  assert.doesNotMatch(added, /read the file to view it/u);
});

test("offline spreadsheet extension is staged and reachable through the profile", () => {
  const staging = read("apps/desktop-electron/scripts/stage-dsh-runtime.mjs");
  assert.match(staging, /await stageDuckdbExtension/u);
  assert.match(staging, /"duckdb-extensions"/u);
  assert.match(main, /ANYONG_DUCKDB_EXTENSION_DIR/u);
  assert.match(read("profiles/anyong.yml"), /ANYONG_DUCKDB_EXTENSION_DIR/u);
});

test("Office cleanup fails closed without the same process identity", () => {
  const source = read("scripts/office-control.ps1");
  assert.match(source, /function Test-OwnerIdentity/u);
  assert.match(source, /Test-OwnerIdentity \$Instance\.spec \$Instance\.pid \$Instance\.identity/u);
  assert.match(source, /Test-OwnerIdentity \$spec \$targetPid \$record/u);
  assert.match(source, /Get-SpecProcessNames \$Spec/u);
  assert.match(source, /current\.creationDate -eq \$Identity\.creationDate/u);
  assert.match(source, /current\.processName -eq \$Identity\.processName/u);
});

test("Altium exchange is private, atomic and correlated on both bridge sides", () => {
  const source = read("scripts/anyong-integrations-mcp.mjs");
  const bridge = read("scripts/altium/AltiumScript/Altium_API.pas");
  assert.doesNotMatch(source + bridge, /C:\\Users\\Public/u);
  assert.match(source, /value\.requestId !== requestId/u);
  assert.match(source, /renameSync\(temporaryRequest, request\)/u);
  assert.match(source, /"\/inheritance:r", "\/grant:r"/u);
  assert.match(source, /Object\.hasOwn\(args\.params \?\? \{\}, key\)/u);
  assert.match(bridge, /BridgeCommandAllowed\(CommandType\)/u);
  assert.match(bridge, /WRITE_CONFIRMED and/u);
  assert.match(bridge, /AddJSONProperty\(ResultProps, 'requestId', REQUEST_ID\)/u);
  assert.match(bridge, /RenameFile\(RESPONSE_FILE \+ '\.tmp', RESPONSE_FILE\)/u);
});
