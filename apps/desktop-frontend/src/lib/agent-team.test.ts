import { describe, expect, it } from "vitest";

import { groupTasks, isTeamTask, readTeamBoard, taskBadges, type TeamTask } from "./agent-team";

const task: TeamTask = {
  id: "t1",
  revision: 3,
  subject: "Review the diff",
  description: "Check for regressions",
  status: "pending",
  blockedBy: [],
  writeScopes: ["apps/x.ts"],
  ready: true,
  ownerName: "reviewer",
  warnings: [],
};

const group = (id: string, status: TeamTask["status"], ready = false): TeamTask => ({ ...task, id, status, ready });

describe("isTeamTask", () => {
  it("accepts only the official status enum", () => {
    expect(isTeamTask(task)).toBe(true);
    expect(isTeamTask({ ...task, status: "in_progress" })).toBe(true);
    expect(isTeamTask({ ...task, status: "completed" })).toBe(true);
    // 官方没有 open/blocked/done/cancelled，这些值属于历史误解。
    for (const bogus of ["open", "blocked", "done", "cancelled", "pending "]) {
      expect(isTeamTask({ ...task, status: bogus })).toBe(false);
    }
    expect(isTeamTask({ ...task, revision: -1 })).toBe(false);
    expect(isTeamTask(null)).toBe(false);
  });
});

describe("readTeamBoard", () => {
  it("returns null when the projection is absent (capability missing, not disabled)", () => {
    expect(readTeamBoard(undefined)).toBeNull();
    expect(readTeamBoard({})).toBeNull();
    expect(readTeamBoard({ agentTeam: { tasks: [] } })).toBeNull();
  });

  it("keeps official pending and completed tasks instead of dropping them", () => {
    const board = readTeamBoard({
      agentTeam: {
        enabled: true,
        tasks: [task, group("t2", "completed"), group("t3", "in_progress"), { id: "broken" }],
      },
    });
    expect(board?.tasks.map((item) => item.id)).toEqual(["t1", "t2", "t3"]);
    expect(board?.tasks.map((item) => item.status)).toEqual(["pending", "completed", "in_progress"]);
  });

  it("keeps the projection failure visible", () => {
    const board = readTeamBoard({ agentTeam: { enabled: false, tasks: [], failure: "team/task-invalid" } });
    expect(board?.failure).toBe("team/task-invalid");
    expect(board?.enabled).toBe(false);
  });
});

describe("groupTasks", () => {
  it("orders groups by what can be acted on first", () => {
    const groups = groupTasks([
      group("done", "completed"),
      group("open", "pending"),
      group("run", "in_progress"),
    ]);
    expect(groups.map((item) => item.status)).toEqual(["in_progress", "pending", "completed"]);
    expect(groups[0].tasks.map((item) => item.id)).toEqual(["run"]);
  });

  it("omits empty groups", () => {
    expect(groupTasks([])).toEqual([]);
    expect(groupTasks([group("c", "completed")]).map((item) => item.status)).toEqual(["completed"]);
  });
});

describe("taskBadges", () => {
  it("only offers claiming for a ready pending task", () => {
    expect(taskBadges(task)).toEqual({ claimable: true, owner: "reviewer", blockedCount: 0, warnings: 0 });
    // 进行中的任务 ready 恒为 false，但不代表依赖未完成。
    expect(taskBadges(group("run", "in_progress"))).toEqual({ claimable: false, owner: "reviewer", blockedCount: 0, warnings: 0 });
    expect(taskBadges({ ...task, ready: false, blockedBy: ["a", "b"], warnings: ["w"] }))
      .toEqual({ claimable: false, owner: "reviewer", blockedCount: 2, warnings: 1 });
  });
});