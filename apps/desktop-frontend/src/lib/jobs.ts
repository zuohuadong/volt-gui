/**
 * 后台任务（官方 `job` 命名空间）的纯逻辑。
 *
 * 任务花名册、输出与终止都由官方 Host 负责；这里只做形状校验、展示文案和
 * 有界输出累积（浏览器侧不应该无上限地攒一个任务的完整输出）。
 */

export type JobStatus = "running" | "stopping" | "completed" | "killed" | "failed";

export type JobRow = {
  id: string;
  kind: string;
  label: string;
  status: JobStatus;
  progress?: string;
  detail?: string;
  startedAt: number;
  finishedAt?: number;
  owner?: string;
};

/** 单条任务保留的输出上限：超出后只保留尾部，并标记被丢弃。 */
export const MAX_JOB_OUTPUT_CHARS = 200_000;

const STATUSES: ReadonlySet<string> = new Set(["running", "stopping", "completed", "killed", "failed"]);

export function isJobRow(value: unknown): value is JobRow {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === "string" && record.id.length > 0
    && typeof record.kind === "string"
    && typeof record.label === "string"
    && typeof record.status === "string" && STATUSES.has(record.status)
    && typeof record.startedAt === "number" && Number.isFinite(record.startedAt)
    && (record.finishedAt === undefined || typeof record.finishedAt === "number")
    && (record.progress === undefined || typeof record.progress === "string")
    && (record.detail === undefined || typeof record.detail === "string")
    && (record.owner === undefined || typeof record.owner === "string");
}

/** 官方花名册帧是 `{type:'rows', jobs: JobView[]}`；坏行直接丢弃，不让整块列表失败。 */
export function normalizeJobRows(value: unknown): JobRow[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const jobs = (value as Record<string, unknown>).jobs;
  if (!Array.isArray(jobs)) return [];
  return jobs.filter(isJobRow).sort((left, right) => right.startedAt - left.startedAt);
}

export function isJobRunning(job: JobRow): boolean {
  return job.status === "running" || job.status === "stopping";
}

/** 只允许终止仍在跑的任务：已结束的任务再发 kill 只会拿到 `already-finished`。 */
export function canKillJob(job: JobRow): boolean {
  return job.status === "running";
}

/** 已运行时长（秒）；已结束的任务用结束时间。 */
export function jobElapsedSeconds(job: JobRow, now: number): number {
  const end = job.finishedAt ?? now;
  return Math.max(0, Math.round((end - job.startedAt) / 1000));
}

export function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 60) return `${minutes}m${rest ? ` ${rest}s` : ""}`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

/**
 * 追加一段输出并保持有界。
 *
 * 返回 `dropped` 表示这次追加把前面的内容挤掉了：界面必须能说明"更早的输出
 * 已经不在"，而不是静默截断。
 */
export function appendJobOutput(current: string, chunk: string, limit = MAX_JOB_OUTPUT_CHARS): { text: string; dropped: boolean } {
  if (!chunk) return { text: current, dropped: false };
  const next = current + chunk;
  if (next.length <= limit) return { text: next, dropped: false };
  const keep = Math.max(0, limit);
  return { text: next.slice(next.length - keep), dropped: true };
}

/** 花名册里是否还有正在跑的任务（决定界面要不要继续计时）。 */
export function hasRunningJob(jobs: readonly JobRow[]): boolean {
  return jobs.some(isJobRunning);
}