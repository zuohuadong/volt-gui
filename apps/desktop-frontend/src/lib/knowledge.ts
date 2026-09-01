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
  const root = workspacePath.trim() || "当前会话工作区";
  if (operation === "query") {
    return [
      "你正在执行知识库检索。必须只使用官方 DSH 文件工具 glob、grep、read 读取当前工作区，禁止 shell find/grep，也不要访问工作区之外的路径。",
      `检索根目录：${root}`,
      `用户问题：${query.trim()}`,
      "先用 glob/grep 定位候选资料，再用 read 获取必要上下文；按相关性给出答案，列出引用路径和行号。若没有可靠依据，明确说明未找到，不要臆测。",
      "回答末尾追加一行机器可读报告：<!-- voltui-knowledge-report {\"status\":\"ready\",\"root\":\"...\",\"query\":\"...\",\"matches\":1} -->。",
    ].join("\n");
  }
  const mode = operation === "refresh" ? "增量刷新已有索引" : "首次建立索引";
  return [
    `你正在执行知识库 RAG 索引任务：${mode}。必须只使用官方 DSH 文件工具 glob、grep、read，禁止 shell find/grep，也不要访问工作区之外的路径。`,
    `索引根目录：${root}`,
    "扫描常见文档、源码、配置和说明文件，排除 .git、node_modules、dist、build 等生成或依赖目录。对可读文本按约 800-1200 tokens 分块，保留相对路径、标题、行号范围等元数据。",
    "当前运行时没有独立的向量数据库 RPC；请使用官方文件检索结果完成可审计的词法/上下文 RAG，不要创建第二套数据库或写入应用私有存储。",
    "完成后给出：扫描文件数、分块数、失败项、更新时间，以及后续检索建议。回答末尾追加一行机器可读报告：<!-- voltui-knowledge-report {\"status\":\"ready\",\"root\":\"...\",\"files\":12,\"chunks\":34,\"failures\":[],\"updatedAt\":\"...\"} -->。若部分失败使用 status=partial，完全失败使用 status=failed。",
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
