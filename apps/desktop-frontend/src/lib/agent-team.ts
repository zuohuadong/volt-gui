/**
 * Agent 团队任务板的纯逻辑（官方 `agentTeam` 会话投影）。
 *
 * 任务归属、依赖、就绪判定全部由官方 `dsh-agent-team` 计算并保存在会话日志里；
 * 这里只做形状校验、分组与展示文案，不做第二份任务状态。
 */

/** 官方 `TeamTaskStatus`（`dsh-agent-team/src/types.ts`）。投影已过滤 `deleted`。 */
export type TeamTaskStatus = "pending" | "in_progress" | "completed" | "deleted";

export type TeamTask = {
  id: string;
  revision: number;
  subject: string;
  description: string;
  status: TeamTaskStatus;
  /** 官方 `ready`：只有依赖全部完成且状态为 `pending` 时为 true，可以直接认领。 */
  ready: boolean;
  blockedBy: string[];
  writeScopes: string[];
  ownerName?: string;
  warnings: string[];
};

export type TeamBoard = { enabled: boolean; tasks: TeamTask[]; failure?: string };

const STATUSES: ReadonlySet<string> = new Set(["pending", "in_progress", "completed", "deleted"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isTeamTask(value: unknown): value is TeamTask {
  if (!isRecord(value)) return false;
  const { id, revision, subject, status, ready, blockedBy, writeScopes } = value;
  return typeof id === "string" && id.length > 0
    && typeof revision === "number" && Number.isSafeInteger(revision) && revision >= 0
    && typeof subject === "string"
    && typeof status === "string" && STATUSES.has(status)
    && typeof ready === "boolean"
    && Array.isArray(blockedBy) && blockedBy.every((item) => typeof item === "string")
    && Array.isArray(writeScopes) && writeScopes.every((item) => typeof item === "string");
}

/**
 * 读取投影。
 *
 * 投影缺失表示这套组合没有 Team 能力（不是"团队已关闭"）；`enabled` 只来自
 * 官方保存的选择，绝不根据"有没有任务"推断。
 */
export function readTeamBoard(values: Record<string, unknown> | undefined): TeamBoard | null {
  const value = values?.agentTeam;
  if (!isRecord(value)) return null;
  if (typeof value.enabled !== "boolean") return null;
  const rawTasks = Array.isArray(value.tasks) ? value.tasks : [];
  const tasks: TeamTask[] = [];
  for (const item of rawTasks) {
    if (!isTeamTask(item)) continue;
    const data = item as unknown as Record<string, unknown>;
    tasks.push({
      id: item.id,
      revision: item.revision,
      subject: item.subject,
      description: typeof item.description === "string" ? item.description : "",
      status: item.status,
      ready: item.ready,
      blockedBy: [...item.blockedBy],
      writeScopes: [...item.writeScopes],
      ...(typeof data.ownerName === "string" && data.ownerName ? { ownerName: data.ownerName } : {}),
      warnings: Array.isArray(data.writeScopeWarnings)
        ? data.writeScopeWarnings.filter((warning): warning is string => typeof warning === "string")
        : [],
    });
  }
  return {
    enabled: value.enabled,
    tasks,
    ...(typeof value.failure === "string" && value.failure ? { failure: value.failure } : {}),
  };
}

/** 看板分组顺序：先看"现在能做什么"，再看已完成的。 */
export const TEAM_GROUP_ORDER: readonly TeamTaskStatus[] = ["in_progress", "pending", "completed"];

export function groupTasks(tasks: readonly TeamTask[]): Array<{ status: TeamTaskStatus; tasks: TeamTask[] }> {
  return TEAM_GROUP_ORDER
    .map((status) => ({ status, tasks: tasks.filter((task) => task.status === status) }))
    .filter((group) => group.tasks.length > 0);
}

/** 一行任务摘要：可认领/依赖/归属，全部来自官方字段。 */
export function taskBadges(task: TeamTask): { claimable: boolean; owner?: string; blockedCount: number; warnings: number } {
  return {
    // 官方 `ready` 只对 `pending` 为 true；进行中的任务 ready 恒为 false，
    // 不能把它显示成"依赖未完成"。
    claimable: task.status === "pending" && task.ready,
    ...(task.ownerName ? { owner: task.ownerName } : {}),
    blockedCount: task.blockedBy?.length ?? 0,
    warnings: task.warnings?.length ?? 0,
  };
}