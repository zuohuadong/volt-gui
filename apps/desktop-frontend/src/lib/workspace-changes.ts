/**
 * 变更文件卡片的数据校验与展示逻辑。
 *
 * 摘要与逐文件比对都由官方 `dsh-workspace-changes` 在 Host 侧计算并通过认证路由
 * 提供；这里只做"读回来的东西是否可信"的校验，以及行级渲染的纯函数，不重新
 * 计算 diff。
 */

export type ChangedFile = {
  path: string;
  display: string;
  added: number;
  deleted: number;
  binary?: true;
  oversized?: true;
};

export type ChangesSummary = {
  turn: number;
  files: ChangedFile[];
  total: number;
  added: number;
  deleted: number;
};

export type DiffHunk = { oldStart: number; oldLines: number; newStart: number; newLines: number; lines: string[] };

export type FileDiff =
  | { kind: "text"; path: string; display: string; before: boolean; after: boolean; hunks: DiffHunk[]; coarse: boolean }
  | { kind: "binary"; path: string; display: string }
  | { kind: "oversized"; path: string; display: string };

/** 一条路由请求最多关心的文件数（与 Host 默认 `maxFiles` 同量级）。 */
export const MAX_CHANGED_FILES = 500;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function isChangedFile(value: unknown): value is ChangedFile {
  if (!isRecord(value)) return false;
  const { path, display, added, deleted, binary, oversized } = value;
  return typeof path === "string" && path.length > 0
    && typeof display === "string" && display.length > 0
    && isCount(added) && isCount(deleted)
    && (binary === undefined || binary === true)
    && (oversized === undefined || oversized === true);
}

export function isChangesSummary(value: unknown): value is ChangesSummary {
  if (!isRecord(value)) return false;
  const { turn, files, total, added, deleted } = value;
  return typeof turn === "number" && Number.isSafeInteger(turn) && turn >= 1
    && isCount(total) && isCount(added) && isCount(deleted)
    && Array.isArray(files) && files.length <= MAX_CHANGED_FILES && files.every(isChangedFile);
}

function isHunk(value: unknown): value is DiffHunk {
  if (!isRecord(value)) return false;
  const { oldStart, oldLines, newStart, newLines, lines } = value;
  return [oldStart, oldLines, newStart, newLines].every(isCount)
    && Array.isArray(lines) && lines.every((line) => typeof line === "string" && /^[+ -]/u.test(line));
}

export function isFileDiff(value: unknown): value is FileDiff {
  if (!isRecord(value)) return false;
  const { kind, path, display } = value;
  if (typeof path !== "string" || typeof display !== "string") return false;
  if (kind === "binary" || kind === "oversized") return true;
  if (kind !== "text") return false;
  const { before, after, hunks, coarse } = value;
  return typeof before === "boolean" && typeof after === "boolean"
    && Array.isArray(hunks) && hunks.length <= 20_000 && hunks.every(isHunk)
    && typeof coarse === "boolean";
}

/** 文件行的增减摘要，例如 `+12 −3`。 */
export function fileChangeLabel(file: ChangedFile): string {
  if (file.binary) return "binary";
  if (file.oversized) return "oversized";
  return `+${file.added} −${file.deleted}`;
}

/** 卡片标题行：`N 个文件变更 · +A −D`；超过 `maxFiles` 时补一句被省略的数量。 */
export function summaryLabel(summary: ChangesSummary): { files: number; added: number; deleted: number; omitted: number } {
  return {
    files: summary.total,
    added: summary.added,
    deleted: summary.deleted,
    omitted: Math.max(summary.total - summary.files.length, 0),
  };
}

export type DiffRow = { kind: "add" | "remove" | "context" | "meta"; text: string };

/**
 * 把 hunks 摊平成可直接渲染的行。
 *
 * 行首前缀是官方契约的一部分（`+` / `-` / 空格），这里不重新推断增删，
 * 只在 hunk 之间插入一条 `@@` 标记，让用户能看出跳过的上下文。
 */
export function diffRows(diff: FileDiff): DiffRow[] {
  if (diff.kind !== "text") return [];
  const rows: DiffRow[] = [];
  for (const hunk of diff.hunks) {
    rows.push({ kind: "meta", text: `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@` });
    for (const line of hunk.lines) {
      const prefix = line[0];
      const text = line.slice(1);
      rows.push({ kind: prefix === "+" ? "add" : prefix === "-" ? "remove" : "context", text });
    }
  }
  return rows;
}

/**
 * 从历史事件里找出最新一条 `workspace/changes` 的坐标。
 *
 * 事件只带轮次，摘要按事件序号回读；因此卡片必须记住 `seq`，不能只记轮次。
 */
export function latestChangesAnnouncement(
  entries: readonly { event: { type: string; seq: number; data?: Record<string, unknown> } }[],
): { seq: number; turn: number } | null {
  let latest: { seq: number; turn: number } | null = null;
  for (const entry of entries) {
    if (entry.event.type !== "workspace/changes") continue;
    const turn = entry.event.data?.turn;
    if (typeof turn !== "number" || !Number.isSafeInteger(turn) || turn < 1) continue;
    latest = { seq: entry.event.seq, turn };
  }
  return latest;
}