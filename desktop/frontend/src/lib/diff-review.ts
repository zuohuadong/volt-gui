export type DiffReviewCommentStatus = "open" | "resolved";

export interface DiffReviewComment {
  id: string;
  tabId: string;
  path: string;
  revision: string;
  line: number;
  body: string;
  status: DiffReviewCommentStatus;
  createdAtMs: number;
}

export interface NewDiffReviewComment extends Omit<DiffReviewComment, "status"> {
  status?: DiffReviewCommentStatus;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeComment(input: NewDiffReviewComment): DiffReviewComment | undefined {
  const id = input.id.trim();
  const tabId = input.tabId.trim();
  const path = input.path.trim();
  const revision = input.revision.trim();
  const body = input.body.trim();
  if (!id || !tabId || !path || !revision || !body || !Number.isInteger(input.line) || input.line < 1) return undefined;
  return {
    id,
    tabId,
    path,
    revision,
    line: input.line,
    body,
    status: input.status === "resolved" ? "resolved" : "open",
    createdAtMs: Number.isFinite(input.createdAtMs) ? input.createdAtMs : Date.now(),
  };
}

export function addDiffReviewComment(
  comments: DiffReviewComment[],
  input: NewDiffReviewComment,
): DiffReviewComment[] {
  const next = normalizeComment(input);
  if (!next) return comments;
  return [...comments.filter((comment) => comment.id !== next.id), next];
}

export function setDiffReviewCommentStatus(
  comments: DiffReviewComment[],
  id: string,
  status: DiffReviewCommentStatus,
): DiffReviewComment[] {
  return comments.map((comment) => comment.id === id ? { ...comment, status } : comment);
}

export function removeDiffReviewComment(comments: DiffReviewComment[], id: string): DiffReviewComment[] {
  return comments.filter((comment) => comment.id !== id);
}

export function diffRevision(diff: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < diff.length; index += 1) {
    hash ^= diff.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}-${diff.length}`;
}

export function buildDiffFixPrompt(path: string, revision: string, comments: DiffReviewComment[]): string {
  const open = comments
    .filter((comment) => comment.path === path && comment.revision === revision && comment.status === "open")
    .sort((left, right) => left.line - right.line || left.createdAtMs - right.createdAtMs);
  if (!open.length) return "";
  const findings = open.map((comment) => `- Diff 第 ${comment.line} 行：${comment.body}`).join("\n");
  return `请根据以下行级 Diff 评论修复 ${path}。只处理评论指向的问题，保留无关改动；完成后说明每条评论如何处理，并运行最小相关验证。\n\n${findings}`;
}

export function parsePersistedDiffComments(raw: string | null | undefined): DiffReviewComment[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.flatMap((item) => {
      if (!isRecord(item)) return [];
      const normalized = normalizeComment({
        id: typeof item.id === "string" ? item.id : "",
        tabId: typeof item.tabId === "string" ? item.tabId : "",
        path: typeof item.path === "string" ? item.path : "",
        revision: typeof item.revision === "string" ? item.revision : "",
        line: typeof item.line === "number" ? item.line : 0,
        body: typeof item.body === "string" ? item.body : "",
        status: item.status === "resolved" ? "resolved" : "open",
        createdAtMs: typeof item.createdAtMs === "number" ? item.createdAtMs : Date.now(),
      });
      return normalized ? [normalized] : [];
    });
  } catch {
    return [];
  }
}
