import { describe, expect, it } from "vitest";

import {
  appendJobOutput,
  canKillJob,
  formatElapsed,
  hasRunningJob,
  isJobRow,
  jobElapsedSeconds,
  normalizeJobRows,
  type JobRow,
} from "./jobs";

const row: JobRow = { id: "bash-1", kind: "bash", label: "pnpm test", status: "running", startedAt: 1_000 };

describe("job row validation", () => {
  it("accepts the official JobView shape", () => {
    expect(isJobRow(row)).toBe(true);
    expect(isJobRow({ ...row, finishedAt: 2_000, detail: "exit code: 1" })).toBe(true);
  });

  it("rejects malformed rows", () => {
    expect(isJobRow({ ...row, id: "" })).toBe(false);
    expect(isJobRow({ ...row, status: "paused" })).toBe(false);
    expect(isJobRow({ ...row, startedAt: "now" })).toBe(false);
    expect(isJobRow(null)).toBe(false);
  });

  it("drops bad rows and sorts newest first", () => {
    const rows = normalizeJobRows({
      type: "rows",
      jobs: [row, { ...row, id: "bash-2", startedAt: 3_000 }, { id: "broken" }],
    });
    expect(rows.map((item) => item.id)).toEqual(["bash-2", "bash-1"]);
    expect(normalizeJobRows(undefined)).toEqual([]);
    expect(normalizeJobRows({ jobs: "nope" })).toEqual([]);
  });
});

describe("job state helpers", () => {
  it("only offers kill on a running job", () => {
    expect(canKillJob(row)).toBe(true);
    expect(canKillJob({ ...row, status: "stopping" })).toBe(false);
    expect(canKillJob({ ...row, status: "completed" })).toBe(false);
  });

  it("measures elapsed time against the end instant when settled", () => {
    expect(jobElapsedSeconds(row, 61_000)).toBe(60);
    expect(jobElapsedSeconds({ ...row, finishedAt: 5_000 }, 61_000)).toBe(4);
    expect(formatElapsed(9)).toBe("9s");
    expect(formatElapsed(75)).toBe("1m 15s");
    expect(formatElapsed(3_900)).toBe("1h 5m");
  });

  it("reports whether any job is still live", () => {
    expect(hasRunningJob([row])).toBe(true);
    expect(hasRunningJob([{ ...row, status: "killed" }])).toBe(false);
  });
});

describe("bounded job output", () => {
  it("keeps everything under the limit", () => {
    expect(appendJobOutput("a", "b")).toEqual({ text: "ab", dropped: false });
    expect(appendJobOutput("a", "")).toEqual({ text: "a", dropped: false });
  });

  it("keeps the tail and reports the drop", () => {
    const result = appendJobOutput("x".repeat(8), "0123456789", 10);
    expect(result.text).toBe("0123456789");
    expect(result.dropped).toBe(true);
    expect(result.text.length).toBe(10);
  });
});