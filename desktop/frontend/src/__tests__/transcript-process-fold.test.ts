// Run: tsx src/__tests__/transcript-process-fold.test.ts

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

let passed = 0;
let failed = 0;

function ok(value: boolean, label: string) {
  if (value) {
    process.stdout.write(`  PASS  ${label}\n`);
    passed += 1;
  } else {
    process.stdout.write(`  FAIL  ${label}\n`);
    failed += 1;
  }
}

console.log("\ntranscript process fold");

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, "../components/Transcript.tsx"), "utf8");

ok(
  source.includes("preferredKind=\"reasoning\""),
  "completed compact process batches render as one reasoning fold",
);
ok(
  source.includes("assistantAnswerOnly(assistant)") && source.includes("assistantReasoningOnly(assistant)"),
  "final assistant reasoning is folded while the answer renders without a second top-level reasoning panel",
);
ok(
  source.includes("processBatch.push(...nonAssistantItems)") && source.includes("processBatch.push(assistantReasoningOnly(assistant))"),
  "tools and final reasoning are inserted into the same turn-level process batch",
);
ok(
  source.includes("Active step") &&
    source.includes("processBatch.push(...nonAssistantItems)") &&
    source.includes("reasoningDisplay=\"hide\""),
  "live compact process stays inside the reasoning fold while streaming answer text renders outside",
);
ok(
  source.includes("InlineAssistantReasoning") &&
    source.includes("turn-collapse__reasoning-head") &&
    source.includes("workStatusLabel(effectiveDurationMs, hasRunningWork, t)") &&
    !source.includes("reasoningDisplay=\"only\"") &&
    source.includes("case \"notice\"") &&
    source.includes("case \"compaction\""),
  "the single work fold renders an inner reasoning phase plus notices and compaction",
);
ok(
  source.includes("Standard mode keeps the answer body flat") &&
    source.includes("standard-process-${processBatchStart}") &&
    source.includes("assistantHasVisibleAnswer(assistant, live)") &&
    source.includes("pushProcessItem(assistantReasoningOnly(assistant))"),
  "standard mode also folds per-turn process items into the single reasoning entry",
);
ok(
  source.includes("turnStartAt={turnStartAt}") &&
    source.includes("useTick(hasRunningWork)") &&
    source.includes("transcript.workingDuration") &&
    source.includes("transcript.workedDuration"),
  "the outer fold uses running/completed work labels with live elapsed time",
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
