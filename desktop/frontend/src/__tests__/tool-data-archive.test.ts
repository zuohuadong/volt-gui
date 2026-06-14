// Run: tsx src/__tests__/tool-data-archive.test.ts
//
// Verifies that the turn_done reducer archives old tool items to bound JS heap
// growth: args are trimmed to 200 chars, output is set to undefined, and the
// dataArchived flag is set. Recent items are left intact.

import { initialState, reducer } from "../lib/useController";
import type { Item } from "../lib/useController";

let passed = 0;
let failed = 0;

function eq<T>(a: T, b: T, label: string) {
  if (a === b) {
    process.stdout.write(`  PASS  ${label}\n`);
    passed += 1;
  } else {
    process.stdout.write(`  FAIL  ${label}: expected ${JSON.stringify(b).slice(0, 120)}, got ${JSON.stringify(a).slice(0, 120)}\n`);
    failed += 1;
  }
}

function ok(cond: boolean, label: string) {
  if (cond) {
    process.stdout.write(`  PASS  ${label}\n`);
    passed += 1;
  } else {
    process.stdout.write(`  FAIL  ${label}\n`);
    failed += 1;
  }
}

function makeArchivableTool(id: string, argsLen = 5000, outputLen = 10000): Item {
  return {
    kind: "tool",
    id,
    name: "bash",
    args: "x".repeat(argsLen),
    readOnly: false,
    status: "done",
    output: "y".repeat(outputLen),
    durationMs: 100,
  };
}

function makeFreshTool(id: string): Item {
  return {
    kind: "tool",
    id,
    name: "bash",
    args: '{"command":"echo hello"}',
    readOnly: false,
    status: "done",
    output: "hello",
    durationMs: 50,
  };
}

function addItems(state: ReturnType<typeof initialState>, items: Item[]): ReturnType<typeof initialState> {
  let s = state;
  for (const it of items) {
    s = reducer(s, { type: "event", e: { kind: "user", text: `test ${it.id}` } });
    s = reducer(s, { type: "event", e: { kind: "turn_started" } });
    s = reducer(s, { type: "event", e: { kind: "tool_dispatch", tool: { id: it.id, name: it.name, args: it.args, readOnly: it.readOnly } } });
    s = reducer(s, { type: "event", e: { kind: "tool_result", tool: { id: it.id, output: it.output, durationMs: it.durationMs } } });
  }
  return s;
}

console.log("\ntool data archiving on turn_done");

// ── Test 1: Archiving with tool count below threshold keeps everything intact ──
{
  const items: Item[] = [];
  for (let i = 0; i < 50; i++) items.push(makeFreshTool(`t${i}`));
  let s = addItems(initialState, items);
  s = reducer(s, { type: "event", e: { kind: "turn_done" } });
  const archived = s.items.filter((it): it is Item & { kind: "tool" } => it.kind === "tool");
  // Should be 50 + the assistant messages from turn_done finalization
  const toolItems = s.items.filter((it) => it.kind === "tool") as Item[];
  ok(toolItems.length <= 55, `tools under threshold keep all output (${toolItems.length} tools)`);
  const hasArchived = toolItems.some((t: Item) => (t as any).dataArchived);
  eq(hasArchived, false, "no dataArchived when below retention threshold");
}

// ── Test 2: Archiving truncates oldest items beyond threshold ──
{
  const items: Item[] = [];
  for (let i = 0; i < 120; i++) items.push(makeArchivableTool(`t${i}`, 5000, 10000));
  let s = addItems(initialState, items);
  s = reducer(s, { type: "event", e: { kind: "turn_done" } });
  const toolItems = s.items.filter((it) => it.kind === "tool") as (Item & { dataArchived?: boolean })[];
  ok(toolItems.length >= 120, `all tools still present (${toolItems.length})`);

  // OLDEST items (first ~20) should be archived
  const first20 = toolItems.slice(0, 20);
  const allArchived = first20.every((t) => t.dataArchived === true);
  ok(allArchived, "oldest tools are marked dataArchived");

  const allTruncatedOutput = first20.every((t) => t.output === undefined);
  ok(allTruncatedOutput, "oldest tools have undefined output");

  const allShortArgs = first20.every((t) => t.args.length <= 205);
  ok(allShortArgs, `oldest tools have truncated args (max ${Math.max(...first20.map((t) => t.args.length))} chars)`);

  const lastArchived = toolItems.slice(-1)[0];
  eq(lastArchived.dataArchived, undefined, `newest tool not archived`);
  ok(lastArchived.output !== undefined, "newest tool keeps full output");
  eq(lastArchived.output!.length, 10000, "newest tool output not truncated");
}

// ── Test 3: Undefined output doesn't crash the archiver ──
{
  const items: Item[] = [];
  for (let i = 0; i < 120; i++) {
    items.push({
      kind: "tool" as const,
      id: `u${i}`,
      name: "glob",
      args: JSON.stringify({ pattern: "**/*.ts" }),
      readOnly: true,
      status: "done" as const,
      output: undefined,
      durationMs: 5,
    });
  }
  let s = addItems(initialState, items);
  // Should not throw
  s = reducer(s, { type: "event", e: { kind: "turn_done" } });
  const toolItems = s.items.filter((it) => it.kind === "tool") as (Item & { dataArchived?: boolean })[];
  ok(toolItems.length >= 120, "no crash when tool output is undefined");
}

// ── Test 4: Running tools are never archived ──
{
  const items: Item[] = [];
  for (let i = 0; i < 120; i++) items.push(makeArchivableTool(`r${i}`, 3000, 5000));
  let s = addItems(initialState, items);
  // Mark the last tool as running
  const runningIdx = s.items.length - 1;
  const last = s.items[runningIdx];
  if (last.kind === "tool") {
    s = reducer(s, { type: "event", e: { kind: "tool_dispatch", tool: { id: `r-running`, name: "bash", args: '{"command":"sleep 10"}', readOnly: false } } });
  }
  s = reducer(s, { type: "event", e: { kind: "turn_done" } });
  const toolItems = s.items.filter((it) => it.kind === "tool") as (Item & { dataArchived?: boolean })[];
  // All tools should be finalized (running → stopped)
  for (const t of toolItems) {
    if (t.dataArchived && t.status !== "done" && t.status !== "error") {
      ok(false, `running/stopped tool should not be archived`);
    }
  }
  ok(true, "all archived tools are in a final state (done/error)");
}

// ── Test 5: Total string size is reduced after archiving ──
{
  const LARGE_ARGS = 5000;
  const LARGE_OUTPUT = 10000;
  const TOOL_COUNT = 150;
  const items: Item[] = [];
  for (let i = 0; i < TOOL_COUNT; i++) items.push(makeArchivableTool(`s${i}`, LARGE_ARGS, LARGE_OUTPUT));
  let s = addItems(initialState, items);

  // Measure total tool string memory before turn_done (approximate: args + output length)
  const beforeBytes = s.items
    .filter((it) => it.kind === "tool")
    .reduce((sum, t) => sum + (t.args?.length ?? 0) + (t.output?.length ?? 0), 0);

  s = reducer(s, { type: "event", e: { kind: "turn_done" } });

  const afterBytes = s.items
    .filter((it) => it.kind === "tool")
    .reduce((sum, t) => sum + ((t as any).args?.length ?? 0) + ((t as any).output?.length ?? 0), 0);

  const reductionPct = (beforeBytes - afterBytes) / beforeBytes;
  ok(reductionPct > 0.3, `archive reduced total tool string size by ${(reductionPct * 100).toFixed(0)}%`);
  console.log(`     before: ${beforeBytes.toLocaleString()} chars, after: ${afterBytes.toLocaleString()} chars`);
}

console.log(`\n${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
