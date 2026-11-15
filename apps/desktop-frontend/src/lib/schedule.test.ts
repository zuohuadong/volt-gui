import { describe, expect, it } from "vitest";

import {
  describeRule,
  isScheduleRow,
  normalizeSchedule,
  scheduleDeleteRequest,
  scheduleFilter,
  scheduleOutcomeCode,
  scheduleRunRequest,
  scheduleToggleRequest,
  type ScheduleRow,
} from "./schedule";

const entry = {
  id: "sched-1",
  kind: "daily",
  title: "部署巡检",
  prompt: "检查部署状态",
  time: "09:00:00.000",
  timeZone: "Asia/Shanghai",
  scheduledAt: "2026-11-16T01:00:00.000Z",
  status: "active",
  updatedAt: "2026-11-15T00:00:00.000Z",
  target: { kind: "session", sessionId: "s1" },
  lastDelivery: { deliveredAt: "2026-11-15T01:00:00.000Z" },
};

const row: ScheduleRow = {
  id: "sched-1", title: "部署巡检", prompt: "检查部署状态", kind: "daily",
  status: "active", rule: "每天 09:00（Asia/Shanghai）", updatedAt: "2026-11-15T00:00:00.000Z",
};

describe("schedule row validation", () => {
  it("accepts the official catalog entry", () => {
    expect(isScheduleRow(entry)).toBe(true);
    expect(isScheduleRow({ ...entry, status: "unknown" })).toBe(false);
    expect(isScheduleRow({ ...entry, title: 3 })).toBe(false);
  });

  it("flattens a page and keeps the official total", () => {
    const page = normalizeSchedule({ items: [entry, { id: "broken" }], total: 5, shown: 1, limit: 100, offset: 0 });
    expect(page.total).toBe(5);
    expect(page.rows).toHaveLength(1);
    expect(page.rows[0]).toMatchObject({ id: "sched-1", rule: "每天 09:00（Asia/Shanghai）", targetSessionId: "s1", lastDeliveredAt: "2026-11-15T01:00:00.000Z" });
  });

  it("treats a malformed page as empty instead of throwing", () => {
    expect(normalizeSchedule(undefined)).toEqual({ rows: [], total: 0 });
    expect(normalizeSchedule({ items: "nope" })).toEqual({ rows: [], total: 0 });
  });
});

describe("describeRule", () => {
  it("describes the known timing kinds", () => {
    // 读的是 `schedule/list` 的输出记录（camelCase），不是创建用的 `ScheduleTiming`。
    expect(describeRule({ kind: "after", afterSeconds: 600 })).toBe("一次性 · 10 分钟后");
    expect(describeRule({ kind: "at", scheduledAt: "2026-11-16T09:00:00.000Z" })).toContain("2026-11-16");
    expect(describeRule({ kind: "every", everySeconds: 3600 })).toBe("每 60 分钟");
    expect(describeRule({ kind: "daily", time: "09:00:00.000", timeZone: "UTC" })).toBe("每天 09:00（UTC）");
    expect(describeRule({ kind: "weekly", time: "08:30:00.000", timeZone: "UTC", weekdays: [1, 5] })).toBe("周一、周五 08:30（UTC）");
    expect(describeRule({ kind: "cron", expression: "0 9 * * 1", timeZone: "UTC" })).toBe("cron 0 9 * * 1（UTC）");
    expect(describeRule({ kind: "cron", expression: "0 9 * * 1" })).toBe("cron 0 9 * * 1");
    expect(describeRule({ kind: "rrule", rrule: "FREQ=DAILY" })).toBe("RRULE FREQ=DAILY");
  });

  it("ignores the creation-only snake_case timing fields", () => {
    // `after_seconds`/`every_seconds`/`at` 只出现在输入形状里；拿它们读输出会退化。
    expect(describeRule({ kind: "after", after_seconds: 600 })).toBe("after");
    expect(describeRule({ kind: "every", every_seconds: 3600 })).toBe("every");
    expect(describeRule({ kind: "at", at: "2026-11-16T09:00:00.000Z" })).toBe("at");
  });

  it("never invents a rule for unknown kinds", () => {
    expect(describeRule({ kind: "unknown-kind" })).toBe("unknown-kind");
    expect(describeRule({})).toBe("未知规则");
  });
});

describe("mutations reuse the official edit endpoint", () => {
  it("maps the three-state filter to the official request", () => {
    expect(scheduleFilter("all")).toEqual({});
    expect(scheduleFilter("active")).toEqual({ active: true });
    expect(scheduleFilter("inactive")).toEqual({ active: false });
  });

  it("pauses an active task and resumes an inactive one with the read revision", () => {
    expect(scheduleToggleRequest(row)).toEqual({
      id: "sched-1", action: "update", patch: { active: false }, expectedUpdatedAt: "2026-11-15T00:00:00.000Z",
    });
    expect(scheduleToggleRequest({ ...row, status: "paused" })).toMatchObject({ patch: { active: true } });
    expect(scheduleToggleRequest({ ...row, updatedAt: undefined })).not.toHaveProperty("expectedUpdatedAt");
  });

  it("builds delete and run-now requests", () => {
    expect(scheduleDeleteRequest(row)).toEqual({ id: "sched-1", action: "delete", expectedUpdatedAt: "2026-11-15T00:00:00.000Z" });
    expect(scheduleRunRequest(row)).toEqual({ id: "sched-1" });
  });
});

describe("non-exception outcomes", () => {
  it("reads the official refusal codes", () => {
    expect(scheduleOutcomeCode({ code: "schedule_conflict" })).toBe("schedule_conflict");
    expect(scheduleOutcomeCode({ code: "schedule_not_found" })).toBe("schedule_not_found");
    expect(scheduleOutcomeCode({ code: 42 })).toBe("");
    expect(scheduleOutcomeCode(undefined)).toBe("");
  });
});