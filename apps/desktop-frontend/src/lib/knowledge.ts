import { t } from "./i18n";

export type KnowledgeOperation = "build" | "refresh" | "query";

export type KnowledgeIndexReport = {
  status: "ready" | "partial" | "failed";
  root?: string;
  files?: number;
  chunks?: number;
  failures?: string[];
  updatedAt?: string;
  query?: string;
  matches?: number;
};

const REPORT_START = "<!-- voltui-knowledge-report";
const REPORT_END = "-->";

export function buildKnowledgePrompt(operation: KnowledgeOperation, workspacePath: string, query = ""): string {
  const root = workspacePath.trim() || t("knowledge.promptCurrentWorkspace");
  if (operation === "query") {
    return [
      t("knowledge.promptQueryIntro"),
      t("knowledge.promptQueryRoot", { root }),
      t("knowledge.promptQueryQuestion", { query: query.trim() }),
      t("knowledge.promptQuerySteps"),
      t("knowledge.promptQueryReport"),
    ].join("\n");
  }
  const mode = operation === "refresh" ? t("knowledge.promptIndexRefresh") : t("knowledge.promptIndexBuild");
  return [
    t("knowledge.promptIndexIntro", { mode }),
    t("knowledge.promptIndexRoot", { root }),
    t("knowledge.promptIndexScan"),
    t("knowledge.promptIndexNoVector"),
    t("knowledge.promptIndexReport"),
  ].join("\n");
}

export function parseKnowledgeReport(text: string): KnowledgeIndexReport | undefined {
  const start = text.lastIndexOf(REPORT_START);
  if (start < 0) return undefined;
  const jsonStart = start + REPORT_START.length;
  const end = text.indexOf(REPORT_END, jsonStart);
  if (end < 0) return undefined;
  const raw = text.slice(jsonStart, end).trim();
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (value.status !== "ready" && value.status !== "partial" && value.status !== "failed") return undefined;
    const report: KnowledgeIndexReport = { status: value.status };
    if (typeof value.root === "string") report.root = value.root;
    if (typeof value.files === "number" && Number.isFinite(value.files)) report.files = Math.max(0, Math.floor(value.files));
    if (typeof value.chunks === "number" && Number.isFinite(value.chunks)) report.chunks = Math.max(0, Math.floor(value.chunks));
    if (typeof value.updatedAt === "string") report.updatedAt = value.updatedAt;
    if (typeof value.query === "string") report.query = value.query;
    if (typeof value.matches === "number" && Number.isFinite(value.matches)) report.matches = Math.max(0, Math.floor(value.matches));
    if (Array.isArray(value.failures)) report.failures = value.failures.filter((item): item is string => typeof item === "string").slice(0, 20);
    return report;
  } catch {
    return undefined;
  }
}

export function stripKnowledgeReport(text: string): string {
  const start = text.lastIndexOf(REPORT_START);
  if (start < 0) return text;
  const end = text.indexOf(REPORT_END, start + REPORT_START.length);
  if (end < 0) return text;
  return `${text.slice(0, start).trimEnd()}${text.slice(end + REPORT_END.length)}`.trim();
}

export function knowledgeToolName(name: string): boolean {
  const normalized = name.trim().toLowerCase();
  return normalized === "glob" || normalized === "grep" || normalized === "read" || normalized.endsWith(":glob") || normalized.endsWith(":grep") || normalized.endsWith(":read");
}
