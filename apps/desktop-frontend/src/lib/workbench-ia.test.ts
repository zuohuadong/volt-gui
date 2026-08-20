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
  redactReceiptDataPath,
  recoveredTaskThreadsFromBackend,
  reconcileProjectTaskNodes,
  restartTaskReceipt,
  restoreTaskTranscript,
  settleTaskReceipt,
  snapshotTaskTranscript,
  transcriptForHistoryHydration,
  verificationEvidenceFromTool,
  visibleReceiptRuntime,
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

  test("preserves pending transcript state only while the task is running", () => {
    const transcript = [
      { id: "user-1", role: "user" as const, body: "分析数据", pending: false },
      { id: "assistant-1", role: "assistant" as const, body: "", pending: true },
    ];

    const snapshot = snapshotTaskTranscript(transcript);
    expect(snapshot).not.toBe(transcript);
    expect(snapshot[1].pending).toBe(true);
    expect(restoreTaskTranscript(snapshot, "running")[1].pending).toBe(true);
    expect(restoreTaskTranscript(snapshot, "idle")[1].pending).toBe(false);
  });

  test("keeps live task state when persisted history hydrates a running transcript", () => {
    const currentTranscript = [
      { id: "user-live", role: "user" as const, body: "继续分析", pending: false },
      { id: "assistant-pending", role: "assistant" as const, body: "", pending: true },
    ];
    const hydratedTranscript = [
      { id: "history-user", role: "user" as const, body: "旧问题", pending: false },
      { id: "history-assistant", role: "assistant" as const, body: "旧回答", pending: false },
    ];

    const runningTranscript = transcriptForHistoryHydration(currentTranscript, hydratedTranscript, "running");
    expect(runningTranscript).toEqual(currentTranscript);
    expect(runningTranscript).not.toBe(currentTranscript);
    expect(runningTranscript[1].pending).toBe(true);
  });

  test("uses hydrated history when the local transcript has no active pending state", () => {
    const completedTranscript = [
      { id: "completed-user", role: "user" as const, body: "已完成的旧问题", pending: false },
      { id: "completed-assistant", role: "assistant" as const, body: "已完成的旧回答", pending: false },
    ];
    const hydratedTranscript = [
      { id: "history-user", role: "user" as const, body: "后台新问题", pending: false },
      { id: "history-assistant", role: "assistant" as const, body: "后台新回答", pending: false },
    ];

    expect(transcriptForHistoryHydration(completedTranscript, hydratedTranscript, "running")).toEqual(hydratedTranscript);
    expect(transcriptForHistoryHydration(completedTranscript, hydratedTranscript, "idle")).toEqual(hydratedTranscript);
  });

  test("limits legacy and new receipt runtime details to project and agent", () => {
    expect(visibleReceiptRuntime("交付项目", "文档助手")).toEqual([
      "Project: 交付项目",
      "Agent: 文档助手",
    ]);

    const migrated = migrateWorkbenchSnapshot({
      version: 2,
      projectTasks: [{
        projectId: "project-1",
        expanded: true,
        updatedAtMs: 1,
        tasks: [{
          id: "task-1",
          title: "历史收据",
          updatedAt: "刚刚",
          receipt: {
            id: "receipt-1",
            taskId: "task-1",
            templateId: "write-document",
            sections: {
              runtime: {
                status: "ready",
                items: [
                  "Workspace: /Users/example/private-project",
                  "Project: 交付项目",
                  "Agent Profile: 文档助手",
                  "Model: glm-primary/glm-5.2-nvfp4",
                  "Permission: ask",
                  "Memory: project-1",
                ],
              },
              dataPath: {
                status: "ready",
                items: ["Workspace: /Users/example/private-project", "Session: /Users/example/.volt/sessions/one.jsonl"],
              },
            },
          },
        }],
      }],
    });

    const receipt = migrated.projectTasks[0].tasks[0].receipt;
    expect(receipt?.sections.runtime.items).toEqual(["Project: 交付项目", "Agent: 文档助手"]);
    expect(receipt?.sections.dataPath.items).toEqual(["交付数据保存在当前项目中", "任务会话已本地保存"]);
    expect(JSON.stringify(receipt)).not.toContain("private-project");
    expect(JSON.stringify(receipt)).not.toContain("glm-primary");
  });

  test("redacts raw local paths from new receipt data-path evidence", () => {
    expect(redactReceiptDataPath([
      "Workspace: C:\\Users\\example\\private-project",
      "Session: C:\\Users\\example\\.volt\\sessions\\one.jsonl",
      "artifact stored at /home/example/private-project/report.docx",
    ])).toEqual([
      "交付数据保存在当前项目中",
      "任务会话已本地保存",
      "artifact stored at 当前项目路径",
    ]);
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
    expect(template?.prompt).toContain("必须先给完整文档正文");
    expect(template?.prompt).toContain("正文前不得出现执行计划、结构摘要或运行说明");
    expect(template?.prompt).toContain("仅在正文后作为简短附注");
    expect(template?.prompt).toContain("不得输出本地路径、工具回执");
    expect(template?.prompt).toContain("不得输出本地绝对路径");
    expect(template?.prompt).toContain("核心信息不足时先提问");
    expect(template?.prompt).toContain("输入只给出总数时，不得自行拆分模块数据或补造日期");
    expect(template?.prompt).toContain("统一使用“上线前”");
    expect(template?.prompt).toContain("首次创建新文档时可一次完整写入");
    expect(template?.prompt).toContain("已有文档或已写入的初稿在校对时只能局部修正");
    expect(template?.prompt).not.toContain("替换整份文档时优先使用完整写入");
  });

  test("applies the shared office-output quality gate to every office template", () => {
    for (const template of WORK_OUTCOME_TEMPLATES) {
      expect(template.prompt).toContain("最终只能输出一份正文");
      expect(template.prompt).toContain("不得先输出 Markdown 源码再输出渲染版");
      expect(template.prompt).toContain("保存文件后也不得再次完整复述正文");
      expect(template.prompt).toContain("不得出现工具名、工具调用参数或输出");
      expect(template.prompt).toContain("todo、receipt、pending/completed/blocked 等内部状态分类");
      expect(template.prompt).toContain("不得展示逐步思维链或探索性演算过程");
      expect(template.prompt).toContain("输入事实 → 输出事实");
      expect(template.prompt).toContain("前后端主体、状态码和技术判断必须与输入逐字一致");
      expect(template.prompt).toContain("禁止形近错字、乱码、随机字符");
      expect(template.prompt).toContain("所有精确数字、日期、ID、模块分布和缺陷出现时间必须逐项追溯到输入");
      expect(template.prompt).toContain("不得为凑齐总数、比例或叙述闭环反向构造分项数据");
      expect(template.prompt).toContain("不得生造术语");
      expect(template.prompt).toContain("Markdown 表格和代码块必须完整闭合");
      expect(template.prompt).toContain("核对样本数、总和、公式、单位和结果");
      expect(template.prompt).toContain("独立复算");
      expect(template.prompt).toContain("所有推算必须展示公式和舍入规则");
      expect(template.prompt).toContain("统一标注“估算”或“约”");
      expect(template.prompt).toContain("“发生次数”是缺陷证据");
      expect(template.prompt).toContain("不得拆成独立缺陷");
      expect(template.prompt).toContain("价格、周期和服务");
      expect(template.prompt).toContain("字符数必须由工具实算");
      expect(template.prompt).toContain("不得报告精确字符数");
      expect(template.prompt).toContain("不得扩展到不适用的供应商");
      expect(template.prompt).toContain("最多执行一次局部修正");
      expect(template.prompt).toContain("不得整篇重写或进入自检循环");
      expect(template.prompt).toContain("全文校对");
      expect(template.prompt).toContain("连续递增且不得重复");
      expect(template.prompt).toContain("对全量样本求最小值、最大值和对应日期");
      expect(template.prompt).toContain("并列关系");
      expect(template.prompt).toContain("初步风险判断");
      expect(template.prompt).toContain("自然日、工作日和各阶段有效天数");
      expect(template.prompt).toContain("维护窗口只能扣减实际重叠的阶段");
      expect(template.prompt).toContain("不得暴露工具内部参数名、模式名或枚举值");
      expect(template.prompt).toContain("硬性字数上限");
      expect(template.prompt).toContain("超限必须压缩到限制内");
      expect(template.prompt).toContain("本条消息声明的任务类型是唯一准绳");
      expect(template.prompt).toContain("不得把上一任务的正文、标题、称谓或格式带入本次交付");
      expect(template.prompt).toContain("最多调用一轮");
      expect(template.prompt).toContain("不得为自检反复调用工具");
      expect(template.prompt).toContain("可额外重读一次最新文件");
      expect(template.prompt).toContain("最多一次 multi_edit 或 edit_file");
      expect(template.prompt).toContain("匹配失败不等于编码损坏或乱码");
      expect(template.prompt).toContain("匹配仍失败时保留当前产物并指出待处理段落");
      expect(template.prompt).not.toContain("文件编辑失败时改用整份重写");
    }
  });

  test("refuses to fabricate an analysis when no data was provided", () => {
    const template = WORK_OUTCOME_TEMPLATES.find((item) => item.id === "analyze-data");
    expect(template?.prompt).toContain("未提供任何实际表格、指标或结构化数据");
    expect(template?.prompt).toContain("不得生成空分析框架");
    expect(template?.prompt).toContain("标记为“已完成”");
    expect(template?.prompt).toContain("明确说明未收到数据");
  });

  test("keeps organized materials formal, source-faithful, and unique", () => {
    const template = WORK_OUTCOME_TEMPLATES.find((item) => item.id === "organize-materials");
    expect(template?.prompt).toContain("材料 A/B/C 等来源标识必须原样保留");
    expect(template?.prompt).toContain("核心风险点");
    expect(template?.prompt).toContain("硬性截止日期");
    expect(template?.prompt).toContain("只保留一份最终结果");
  });

  test("keeps meeting owners character-for-character identical", () => {
    const template = WORK_OUTCOME_TEMPLATES.find((item) => item.id === "meeting-followup");
    expect(template?.prompt).toContain("负责人姓名必须与原文逐字一致");
    expect(template?.prompt).toContain("“张工”不得改写为“Z工”");
    expect(template?.prompt).toContain("“后端返回 200”不得改写成“前端返回 HTTP 200”或省略");
    expect(template?.prompt).toContain("尚待确认的事项不得擅自写入固定日期");
    expect(template?.prompt).toContain("验收日期必须晚于方案提出日期");
    expect(template?.prompt).toContain("不得出现 pending、completed、blocked、todo、receipt 等内部状态分类");
    expect(template?.prompt).toContain("会议决策、待办事项、遗留问题、会后通知");
    expect(template?.prompt).toContain("不得把“已确认决策、讨论结论、未决问题、行动项、待确认事项、跟进消息草稿”作为层级标题");
  });

  test("requires tool-backed and independently checked arithmetic", () => {
    const template = WORK_OUTCOME_TEMPLATES.find((item) => item.id === "analyze-data");
    expect(template?.prompt).toContain("所有算术统计必须调用计算器或代码执行工具");
    expect(template?.prompt).toContain("保留可核对的计算式");
    expect(template?.prompt).toContain("独立复算");
    expect(template?.prompt).toContain("340 × 4.5% = 15.3");
    expect(template?.prompt).toContain("估算约 15 条");
    expect(template?.prompt).toContain("原始值、公式、单位、舍入规则及“估算/约”标识");
    expect(template?.prompt).toContain("先给 3 至 5 条核心结论");
    expect(template?.prompt).toContain("不得另设内部复核章节");
    expect(template?.prompt).toContain("不得另设“计算依据”“计算工具复核”“内部校验”等后台章节");
    expect(template?.prompt).toContain("MB 是兆字节、GB 是吉字节");
    expect(template?.prompt).toContain("不得用逐步演算过程淹没结论");
  });

  test("keeps planning milestones finite, consistent, and resource-feasible", () => {
    const planningTemplate = WORK_OUTCOME_TEMPLATES.find((outcomeTemplate) => outcomeTemplate.id === "plan-work");
    expect(planningTemplate?.prompt).toContain("有限且连续的里程碑编号");
    expect(planningTemplate?.prompt).toContain("不得出现未定义的里程碑");
    expect(planningTemplate?.prompt).toContain("完成标准、交付物、任务与唯一负责人、风险");
    expect(planningTemplate?.prompt).toContain("每个任务只能有一人");
    expect(planningTemplate?.prompt).toContain("同一负责人不得在重叠时间段承担多个任务");
    expect(planningTemplate?.prompt).toContain("零人力窗口不得安排工作");
    expect(planningTemplate?.prompt).toContain("不得使用未定义的“高×中”“中×低”等符号表达");
    expect(planningTemplate?.prompt).toContain("每个风险及其缓解措施只描述一次");
    expect(planningTemplate?.prompt).toContain("不得循环扩写");
    expect(planningTemplate?.prompt).toContain("标题后不得出现无法归类的孤立文本");
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
