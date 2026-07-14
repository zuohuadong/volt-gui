import { describe, expect, test } from "vitest";

import {
  INBOX_PROJECT_ID,
  OUTCOME_TEMPLATES,
  createPendingTaskReceipt,
  deriveWorkspaceOptions,
  migrateWorkbenchSnapshot,
  reconcileProjectTaskNodes,
  settleTaskReceipt,
} from "./workbench-ia";

describe("unified workbench IA state", () => {
  test("migrates legacy local folders into workspaces without turning them into business projects", () => {
    const migrated = migrateWorkbenchSnapshot({
      version: 1,
      activeProjectId: "folder-project",
      activeConversationId: "folder-task-1",
      sort: "recent",
      dockCollapsed: false,
      projects: [
        {
          id: "folder-project",
          name: "本地源码",
          localPath: "/workspace/local-app",
          expanded: true,
          updatedAtMs: 10,
          conversations: [{ id: "folder-task-1", title: "旧任务", updatedAt: "刚刚" }],
        },
        {
          id: "project-1",
          name: "交付项目",
          expanded: true,
          updatedAtMs: 20,
          conversations: [{ id: "project-task-1", title: "交付审查", updatedAt: "刚刚" }],
        },
      ],
    });

    expect(migrated.version).toBe(2);
    expect(migrated.savedWorkspaces).toEqual([
      { id: "folder:/workspace/local-app", name: "本地源码", root: "/workspace/local-app", source: "folder" },
    ]);
    expect(migrated.projectTasks).toEqual([
      expect.objectContaining({ projectId: "project-1", tasks: [expect.objectContaining({ id: "project-task-1" })] }),
    ]);
    expect(migrated.inboxTasks).toEqual([expect.objectContaining({ id: "folder-task-1" })]);
    expect(migrated.activeProjectId).toBe(INBOX_PROJECT_ID);
  });

  test("derives workspaces only from real tabs and user-selected folders, deduplicated by root", () => {
    const options = deriveWorkspaceOptions(
      [
        { id: "tab-1", workspaceRoot: "/workspace/app", workspaceName: "App", cwd: "/workspace/app", active: true },
        { id: "tab-2", workspaceRoot: "/workspace/app", workspaceName: "Duplicate", cwd: "/workspace/app", active: false },
        { id: "tab-3", workspaceRoot: "", workspaceName: "Global", cwd: "", active: false },
      ],
      [
        { id: "folder:/workspace/docs", name: "Docs", root: "/workspace/docs", source: "folder" },
        { id: "folder:/workspace/app", name: "Old App", root: "/workspace/app", source: "folder" },
      ],
    );

    expect(options).toEqual([
      { id: "tab:tab-1", name: "App", root: "/workspace/app", source: "tab", tabId: "tab-1", active: true },
      { id: "folder:/workspace/docs", name: "Docs", root: "/workspace/docs", source: "folder" },
    ]);
  });

  test("reconciles the task tree exclusively from business projects plus an explicit inbox", () => {
    const nodes = reconcileProjectTaskNodes(
      [{ id: "project-1", name: "真实项目" }],
      {
        projectTasks: [
          { projectId: "project-1", expanded: true, updatedAtMs: 20, tasks: [{ id: "task-1", title: "真实任务", updatedAt: "刚刚" }] },
          { projectId: "deleted-project", expanded: true, updatedAtMs: 10, tasks: [{ id: "orphan", title: "遗留任务", updatedAt: "刚刚" }] },
        ],
        inboxTasks: [{ id: "inbox-1", title: "临时任务", updatedAt: "刚刚" }],
      },
    );

    expect(nodes.map((node) => node.id)).toEqual([INBOX_PROJECT_ID, "project-1"]);
    expect(nodes[0].tasks.map((task) => task.id)).toEqual(["inbox-1", "orphan"]);
    expect(nodes[1]).toEqual(expect.objectContaining({ id: "project-1", name: "真实项目", tasks: [expect.objectContaining({ id: "task-1" })] }));
  });

  test("offers exactly five outcome templates with a prompt and receipt contract", () => {
    expect(OUTCOME_TEMPLATES.map((template) => template.id)).toEqual([
      "review-fix",
      "build-diagnosis",
      "knowledge-change",
      "issue-delivery",
      "release-acceptance",
    ]);
    for (const template of OUTCOME_TEMPLATES) {
      expect(template.prompt.length).toBeGreaterThan(20);
      expect(template.receiptSections).toEqual(["goal", "runtime", "changes", "verification", "artifacts", "dataPath", "rollback"]);
    }
  });

  test("keeps receipt fields pending until evidence exists and only settles the shell on turn_done", () => {
    const pending = createPendingTaskReceipt({
      id: "receipt-1",
      taskId: "task-1",
      templateId: "review-fix",
      goal: "审查并修复当前变更",
      runtime: ["Workspace: /workspace/app", "Project: 真实项目"],
      now: "2026-07-13T10:00:00.000Z",
    });

    expect(pending.state).toBe("running");
    expect(pending.sections.changes.status).toBe("pending");
    expect(pending.sections.verification.status).toBe("pending");
    expect(pending.sections.artifacts.status).toBe("pending");

    const settled = settleTaskReceipt(pending, { now: "2026-07-13T10:05:00.000Z" });
    expect(settled.state).toBe("pending-review");
    expect(settled.sections.verification).toEqual({ status: "pending", items: [], note: "等待验证证据与人工复核" });

    const failed = settleTaskReceipt(pending, { now: "2026-07-13T10:05:00.000Z", error: "构建失败" });
    expect(failed.state).toBe("failed");
    expect(failed.sections.verification).toEqual({ status: "failed", items: [], note: "构建失败" });
  });
});
