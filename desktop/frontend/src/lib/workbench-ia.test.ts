import { describe, expect, test } from "vitest";

import {
  INBOX_PROJECT_ID,
  CODE_OUTCOME_TEMPLATES,
  OUTCOME_TEMPLATES,
  WORK_OUTCOME_TEMPLATES,
  applyTaskReceiptEvidence,
  createPendingTaskReceipt,
  deriveWorkspaceOptions,
  migrateWorkbenchSnapshot,
  persistentWorkbenchSnapshot,
  recoveredTaskThreadsFromBackend,
  reconcileProjectTaskNodes,
  restartTaskReceipt,
  settleTaskReceipt,
  verificationEvidenceFromTool,
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

  test("persists navigation metadata without copying transcript bodies", () => {
    const snapshot = migrateWorkbenchSnapshot({
      version: 2,
      projectTasks: [],
      inboxTasks: [{
        id: "task-1",
        title: "保留索引",
        updatedAt: "刚刚",
        sessionPath: "/sessions/task-1.jsonl",
        transcript: [{ id: "secret", role: "user", body: "不应写入后端侧栏快照" }],
      }],
    });

    const persisted = persistentWorkbenchSnapshot(snapshot);
    expect(persisted.inboxTasks).toEqual([
      expect.objectContaining({ id: "task-1", sessionPath: "/sessions/task-1.jsonl" }),
    ]);
    expect(persisted.inboxTasks[0].transcript).toBeUndefined();
    expect(JSON.stringify(persisted)).not.toContain("不应写入后端侧栏快照");
  });

  test("rebuilds recoverable inbox tasks from backend topics when WebView storage is gone", () => {
    const tasks = recoveredTaskThreadsFromBackend(
      [
        {
          key: "global",
          kind: "global_folder",
          label: "Global",
          root: "/global-home",
          children: [{ key: "global-topic", kind: "global_topic", label: "旧全局会话", topicId: "topic-global", lastActivityAt: 30 }],
        },
        {
          key: "project:/workspace/app",
          kind: "project",
          label: "App",
          root: "/workspace/app",
          children: [{
            key: "project-topic",
            kind: "topic",
            label: "项目排查",
            topicId: "topic-project",
            lastActivityAt: 20,
            children: [
              { key: "session-1", kind: "session", label: "第一次排查", topicId: "topic-project", sessionPath: "/sessions/one.jsonl", lastActivityAt: 10 },
              { key: "session-2", kind: "session", label: "第二次排查", topicId: "topic-project", sessionPath: "/sessions/two.jsonl", lastActivityAt: 20 },
            ],
          }],
        },
      ],
      [{
        id: "tab-global",
        scope: "global",
        workspaceRoot: "",
        workspaceName: "Global",
        topicId: "topic-global",
        topicTitle: "旧全局会话",
        sessionPath: "/sessions/global.jsonl",
        active: true,
        running: false,
      }],
    );

    expect(tasks).toHaveLength(3);
    expect(tasks[0]).toEqual(expect.objectContaining({
      title: "旧全局会话",
      tabId: "tab-global",
      topicId: "topic-global",
      sessionPath: "/sessions/global.jsonl",
      scope: "global",
      workspaceRoot: undefined,
    }));
    expect(tasks.slice(1).map((task) => task.sessionPath).sort()).toEqual(["/sessions/one.jsonl", "/sessions/two.jsonl"]);
    expect(new Set(tasks.map((task) => task.id)).size).toBe(3);
  });

  test("separates office outcomes from code outcomes while preserving one receipt contract", () => {
    expect(WORK_OUTCOME_TEMPLATES.map((template) => template.id)).toEqual([
      "write-document",
      "organize-materials",
      "meeting-followup",
      "analyze-data",
      "plan-work",
    ]);
    expect(CODE_OUTCOME_TEMPLATES.map((template) => template.id)).toEqual([
      "review-fix",
      "build-diagnosis",
      "knowledge-change",
      "issue-delivery",
      "release-acceptance",
    ]);
    expect(OUTCOME_TEMPLATES).toEqual([...WORK_OUTCOME_TEMPLATES, ...CODE_OUTCOME_TEMPLATES]);
    for (const template of OUTCOME_TEMPLATES) {
      expect(template.prompt.length).toBeGreaterThan(20);
      expect(template.receiptSections).toEqual(["goal", "runtime", "changes", "verification", "artifacts", "dataPath", "rollback"]);
    }
  });

  test("keeps internal-knowledge changes scoped to the explicitly cited materials", () => {
   const template = OUTCOME_TEMPLATES.find((item) => item.id === "knowledge-change");
    expect(template?.prompt).toContain("不使用历史会话、未引用资料或无关示例");
    expect(template?.prompt).toContain("先提问确认，不要猜测");
  });

  test("keeps review and fix anchored to the user's named target", () => {
    const template = OUTCOME_TEMPLATES.find((item) => item.id === "review-fix");
    expect(template?.prompt).toContain("用户明确点名的功能、文件路径、测试或错误日志是本次审查的权威范围");
    expect(template?.prompt).toContain("找不到匹配内容时停止并请求确认");
    expect(template?.prompt).toContain("不得改用 quick_sort、历史示例或其他无关代码代替");
  });

  test("keeps build diagnosis compatible with the actual host shell and installed tools", () => {
    const template = OUTCOME_TEMPLATES.find((item) => item.id === "build-diagnosis");
    expect(template?.prompt).toContain("先确认当前终端类型和工具可用性");
    expect(template?.prompt).toContain("PowerShell");
    expect(template?.prompt).toContain("未安装 git");
    expect(template?.prompt).toContain("不得执行 ls -la");
  });

  test("keeps issue delivery on the host-managed todo and completion protocol", () => {
    const template = OUTCOME_TEMPLATES.find((item) => item.id === "issue-delivery");
    expect(template?.prompt).toContain("只建立一次 todo_write");
    expect(template?.prompt).toContain("complete_step");
    expect(template?.prompt).toContain("Host 会自动推进");
    expect(template?.prompt).toContain("不得把中间草稿、乱码或失败重试内容写入最终产物");
  });

  test("requires one clean review-ready document across model backends", () => {
    const template = OUTCOME_TEMPLATES.find((item) => item.id === "write-document");
    expect(template?.prompt).toContain("最终只保留一份干净正文");
    expect(template?.prompt).toContain("连续章节编号");
    expect(template?.prompt).toContain("ONNX");
    expect(template?.prompt).toContain("结构摘要");
    expect(template?.prompt).toContain("核心信息不足时先提问");
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

  test("merges real execution evidence without erasing previously verified sections", () => {
    const pending = createPendingTaskReceipt({
      id: "receipt-2",
      taskId: "task-2",
      templateId: "build-diagnosis",
      goal: "修复构建失败",
      runtime: ["Workspace: /workspace/app"],
      now: "2026-07-14T10:00:00.000Z",
    });

    const evidenced = applyTaskReceiptEvidence(pending, {
      changes: { items: ["src/App.svelte", "src/lib/runtime.ts"], note: "来自真实 Workspace diff" },
      verification: { items: ["npm run test:unit：通过"], note: "来自工具执行结果" },
      dataPath: { items: ["Workspace: /workspace/app"], note: "本轮数据保留在当前工作区" },
      rollback: { items: ["Checkpoint turn 8"], note: "可回退到最近检查点" },
    }, "2026-07-14T10:03:00.000Z");

    expect(evidenced.sections.changes).toEqual({
      status: "ready",
      items: ["src/App.svelte", "src/lib/runtime.ts"],
      note: "来自真实 Workspace diff",
    });
    expect(evidenced.sections.verification.status).toBe("ready");
    expect(evidenced.sections.rollback.status).toBe("ready");

    const settled = settleTaskReceipt(evidenced, { now: "2026-07-14T10:05:00.000Z" });
    expect(settled.state).toBe("pending-review");
    expect(settled.sections.verification).toEqual(evidenced.sections.verification);
  });

  test("does not erase an earlier failed verification when unrelated success evidence arrives", () => {
    const pending = createPendingTaskReceipt({
      id: "receipt-3",
      taskId: "task-3",
      templateId: "review-fix",
      goal: "验证任务",
      runtime: ["Workspace: /workspace/app"],
      now: "2026-07-14T11:00:00.000Z",
    });
    const failed = applyTaskReceiptEvidence(pending, {
      verification: { items: ["go test：失败"], error: "go test failed" },
    });
    const mixed = applyTaskReceiptEvidence(failed, {
      verification: { items: ["go test：失败", "npm run build：通过"], note: "来自真实工具执行结果" },
    });

    expect(mixed.sections.verification.status).toBe("failed");
    expect(mixed.sections.verification.note).toBe("go test failed");
    expect(mixed.sections.verification.items).toEqual(["go test：失败", "npm run build：通过"]);
    const settledFailure = settleTaskReceipt(mixed, {});
    expect(settledFailure.state).toBe("failed");
    expect(settledFailure.sections.verification.status).toBe("failed");

    const recovered = applyTaskReceiptEvidence(mixed, {
      verification: {
        items: ["go test：通过（此前失败，重跑通过）", "npm run build：通过"],
        note: "同一验证命令重跑成功",
        supersedeFailure: true,
      },
    });
    expect(recovered.sections.verification.status).toBe("ready");
  });

  test("accepts only execution commands as verification and supersedes the same command on retry", () => {
    expect(verificationEvidenceFromTool({
      toolName: "read_file",
      args: JSON.stringify({ path: "src/test/build-check.ts" }),
    })).toBeUndefined();
    expect(verificationEvidenceFromTool({
      toolName: "bash",
      args: JSON.stringify({ command: "rg -n test src" }),
    })).toBeUndefined();
    expect(verificationEvidenceFromTool({
      toolName: "bash",
      args: JSON.stringify({ command: "echo npm run build" }),
    })).toBeUndefined();

    const failed = verificationEvidenceFromTool({
      toolName: "bash",
      args: JSON.stringify({ command: "go test ./..." }),
      error: "exit status 1",
    });
    expect(failed?.error).toContain("go test ./...");
    const recovered = verificationEvidenceFromTool({
      toolName: "bash",
      args: JSON.stringify({ command: "go test ./..." }),
      existingItems: failed?.items,
    });
    expect(recovered?.error).toBeUndefined();
    expect(recovered?.items).toEqual(["验证 go test ./...：通过（此前失败，重跑通过）"]);
  });

  test("clears only transient execution failures when a receipt starts a retry", () => {
    const pending = createPendingTaskReceipt({
      id: "receipt-retry",
      taskId: "task-retry",
      templateId: "review-fix",
      goal: "重试任务",
      runtime: ["Workspace: /workspace/app"],
      now: "2026-07-14T12:00:00.000Z",
    });
    const transientFailure = settleTaskReceipt(pending, { error: "provider temporarily unavailable" });
    const restarted = restartTaskReceipt(transientFailure, "2026-07-14T12:01:00.000Z");
    expect(restarted.state).toBe("running");
    expect(restarted.sections.verification).toEqual({
      status: "pending",
      items: [],
      note: "等待本次重试的验证证据",
    });

    const realVerificationFailure = applyTaskReceiptEvidence(pending, {
      verification: { items: ["go test：失败"], error: "go test failed" },
    });
    const preserved = restartTaskReceipt(realVerificationFailure);
    expect(preserved.sections.verification).toEqual(realVerificationFailure.sections.verification);
  });
});
