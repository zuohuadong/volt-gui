import type { ToolInfo } from "./transcript";
import { parseDshNativeUiView, type DshNativeUiView } from "./dsh-native-ui";
import { browserSkillErrorMessage } from "./browser-skill-error";
import { t } from "./i18n";

export type TranscriptSource = {
  id: string;
  title: string;
  url?: string;
  description?: string;
  quote?: string;
};

export type StructuredTestResult = {
  id: string;
  name: string;
  status: "passed" | "failed" | "skipped" | "todo" | "running";
  durationMs?: number;
  file?: string;
  suite?: string;
  message?: string;
};

export type StructuredFileNode = {
  id: string;
  name: string;
  type: "file" | "directory";
  path?: string;
  children?: StructuredFileNode[];
  metadata?: string;
};

export type ToolPresentation = {
  nativeUi?: DshNativeUiView;
  mcpApp?: McpAppDescriptor;
  artifact?: { title: string; description?: string; content: string; kind: "text" | "code" | "json"; language?: string };
  code?: { code: string; language: string };
  terminal?: { output: string; title: string; cwd?: string };
  web?: { kind: "search" | "fetch" | "computer"; title: string; answer?: string; url?: string; statusCode?: number; truncated?: boolean; sources: TranscriptSource[] };
  images: Array<{ id: string; src: string; alt?: string }>;
  tests: StructuredTestResult[];
  files: StructuredFileNode[];
};

export type McpAppDescriptor = {
  viewId: string;
  resourceUri: string;
  connectionGeneration: string;
  sandboxOrigin: string;
  sessionId?: string;
  title?: string;
  result?: Record<string, unknown>;
};

export type ToolDisplay = {
  label: string;
  detail?: string;
};

export function toolResultSummary(result: string | undefined): string | undefined {
  const value = result?.trim();
  if (!value) return undefined;
  if (/tool[-_]call|tool[-_]use|tool[-_]result/iu.test(value)) return "操作已完成";
  const firstLine = value.split(/\r?\n/u).map((line) => line.trim()).find(Boolean) || "操作已完成";
  return firstLine.length > 180 ? `${firstLine.slice(0, 180)}…` : firstLine;
}

export function toolErrorSummary(result: string | undefined): string {
  const value = result?.trim() || "";
  const parsed = asRecord(parseJson(value));
  const parsedError = asRecord(parsed?.error);
  const structured = text(parsedError?.message || parsed?.message || parsedError?.code || parsed?.code);
  const normalized = structured || value;
  const browserSkillMessage = browserSkillErrorMessage(normalized, t);
  if (browserSkillMessage) return browserSkillMessage;
  if (/windows acl temp root|aclsandbox private temp directory/iu.test(normalized)) return "工作区与系统临时目录冲突，请选择具体项目文件夹并新建会话。";
  if (/enoent|no such file or directory/iu.test(normalized)) {
    const missing = normalized.match(/['"`]([^'"`\r\n]+)['"`]/u)?.[1]?.trim();
    return missing ? `找不到文件：${missing}。请确认文件仍在当前工作区。` : "找不到目标文件，请确认路径仍在当前工作区。";
  }
  if (/weknora_disabled/iu.test(normalized)) return "知识库检索服务未启用，本次未使用知识库；请在“管理 > 设置”启用后重试。";
  if (/glob search failed|io error for operation on/iu.test(normalized)) return "部分路径不存在或无法读取，请缩小搜索范围；结果可能不完整。";
  if (/interrupted|connection closed|unknown outcome/iu.test(normalized)) return "操作未完成，工具连接已中断。";
  if (/timeout|timed out/iu.test(normalized)) return "操作超时，请重试。";
  if (/permission|approval|denied/iu.test(normalized)) return "操作需要授权后才能继续。";
  return toolResultSummary(normalized) || "工具执行失败，请重试。";
}

const toolActionLabels: Record<string, string> = {
  start: "打开页面",
  navigate: "打开页面",
  open: "打开页面",
  search: "搜索内容",
  fetch: "读取页面",
  click: "点击页面",
  type: "输入内容",
  screenshot: "截取画面",
  scroll: "滚动页面",
  keypress: "发送按键",
};

export function toolDisplay(tool: Pick<ToolInfo, "name" | "args" | "view">): ToolDisplay {
  const name = tool.name.trim().toLowerCase();
  const label = name.includes("browser") || name.includes("web")
    ? "浏览器操作"
    : name.includes("computer") || name.includes("screenshot")
      ? "电脑操作"
      : name.includes("skill")
        ? "加载能力"
        : name.includes("office") || name.includes("document")
          ? "文档处理"
          : name.includes("shell") || name.includes("bash") || name.includes("pwsh") || name.includes("command") || name.includes("exec")
            ? "执行命令"
            : name.includes("file") || name.includes("read") || name.includes("write")
              ? "文件操作"
              : "工具调用";

  const record = toolArgumentRecord(tool.args) || asRecord(tool.view?.view) || asRecord(tool.view);
  const action = text(record?.action || record?.operation || record?.kind).toLowerCase();
  const target = text(record?.url || record?.query || record?.path || record?.file || record?.command || record?.skill || record?.name);
  if (label === "浏览器操作" || label === "电脑操作") {
    const actionText = toolActionLabels[action] || (action ? action : undefined);
    if (actionText && target) return { label, detail: `${actionText} · ${shortenToolDetail(target)}` };
    if (actionText) return { label, detail: actionText };
    if (target) return { label, detail: shortenToolDetail(target) };
  }
  if (label === "加载能力" && target) return { label, detail: `加载 ${shortenToolDetail(target)}` };
  if (label === "执行命令" && target) return { label, detail: target };
  if (label === "文件操作" && target) return { label, detail: shortenToolDetail(target) };
  return { label, ...(target ? { detail: shortenToolDetail(target) } : label === "工具调用" ? { detail: tool.name } : {}) };
}

function shortenToolDetail(value: string): string {
  const normalized = value.replace(/[\r\n\t]+/gu, " ").replace(/\s{2,}/gu, " ").trim();
  return normalized.length > 72 ? `${normalized.slice(0, 72)}…` : normalized;
}

function toolArgumentRecord(value?: string): Record<string, unknown> | undefined {
  if (!value) return undefined;
  const parsed = asRecord(parseJson(value));
  if (parsed) return parsed;

  // Some DSH adapters serialize arguments as `{action:start,url: ...}`.
  // Recover only the small fields used for the user-facing summary.
  const action = value.match(/(?:^|[,{\s])(?:action|operation|kind)\s*[:=]\s*["']?([\w-]+)/iu)?.[1];
  const target = value.match(/(?:url|query|path|file|command|skill|name)\s*[:=]\s*["']?(.+?)(?:["'}]|,\s*\w+\s*[:=]|$)/iu)?.[1];
  if (!action && !target) return undefined;
  const cleanTarget = target?.trim().replace(/[\\"]+$/gu, "");
  return { ...(action ? { action } : {}), ...(cleanTarget ? { url: cleanTarget } : {}) };
}

export function hasStructuredToolOutput(presentation: ToolPresentation): boolean {
  return Boolean(presentation.nativeUi || presentation.mcpApp || presentation.artifact || presentation.code || presentation.terminal || presentation.web || presentation.images.length || presentation.tests.length || presentation.files.length);
}

export type QuestionAnswer = {
  id: string;
  selected: string[];
  custom?: string;
};

export function questionOptionLabels(question: Record<string, unknown>): string[] {
  if (!Array.isArray(question.options)) return [];
  return question.options.flatMap((option) => {
    const label = typeof option === "object" && option ? text((option as Record<string, unknown>).label) : text(option);
    return label ? [label] : [];
  });
}

export function questionsAnswered(questions: Array<Record<string, unknown>>, answers: Record<string, string>): boolean {
  return questions.every((question) => {
    const id = text(question.id);
    const answer = answers[id] || answers[`${id}:custom`];
    return Boolean(answer?.trim());
  });
}

export function buildQuestionAnswers(questions: Array<Record<string, unknown>>, answers: Record<string, string>): QuestionAnswer[] {
  return questions.map((question) => {
    const id = text(question.id);
    const selected = answers[id]?.trim();
    const custom = answers[`${id}:custom`]?.trim();
    return { id, selected: selected ? [selected] : [], custom: custom || undefined };
  });
}

export function extractSources(value: unknown): TranscriptSource[] {
  const sources: TranscriptSource[] = [];
  visit(value, (record) => {
    const type = text(record.type).toLowerCase();
    if (!type.includes("source") && !type.includes("citation") && !record.url && !record.uri) return;
    const url = text(record.url || record.uri || record.href) || undefined;
    const title = text(record.title || record.name || record.label) || url || "来源";
    const key = text(record.id) || url || title;
    if (sources.some((source) => (url && source.url === url) || source.id === key || (source.title === title && !source.url && !url))) return;
    sources.push({
      id: key,
      title,
      url,
      description: text(record.description || record.summary) || undefined,
      quote: text(record.quote || record.snippet) || undefined,
    });
  });
  return sources;
}

export function toolPresentation(tool: ToolInfo): ToolPresentation {
  const parsedResult = parseJson(tool.result);
  const roots = [tool.view, asRecord(tool.view?.view), asRecord(parsedResult)].filter(Boolean) as Record<string, unknown>[];
  const structured = roots.find((record) => Object.keys(record).length > 0);
  const codeRecord = firstRecord(roots, ["code", "codeBlock", "snippet"]);
  const terminalRecord = firstRecord(roots, ["terminal", "command", "shell"]);
  const testsValue = firstValue(roots, ["tests", "testResults", "results"]);
  const filesValue = firstValue(roots, ["files", "fileTree", "tree"]);
  const artifactRecord = firstRecord(roots, ["artifact"]);
  const resultText = tool.result?.trim() || "";
  const name = tool.name.toLowerCase();
  const code = parseCode(codeRecord ?? (structured?.kind === "code" ? structured : undefined));
  const terminal = parseTerminal(terminalRecord) ?? (/terminal|shell|exec|command|powershell|bash/u.test(name) && resultText
    ? { output: resultText, title: tool.name }
    : undefined);
  const tests = parseTests(testsValue);
  const files = parseFileNodes(filesValue);
  const explicitArtifact = parseArtifact(artifactRecord);
  const artifact = explicitArtifact;
  const web = parseWeb(roots, name);
  const images = parseImages(roots);
  return { nativeUi: parseNativeUi(roots), mcpApp: parseMcpApp(roots), artifact, code, terminal, web, images, tests, files };
}

function parseNativeUi(roots: Record<string, unknown>[]): DshNativeUiView | undefined {
  for (const root of roots) {
    const view = parseDshNativeUiView(root);
    if (view) return view;
  }
  return undefined;
}

function parseMcpApp(roots: Record<string, unknown>[]): McpAppDescriptor | undefined {
  const root = roots.find((candidate) => candidate.kind === "dsh/mcp-app" && candidate.version === 1);
  if (!root) return undefined;
  const viewId = text(root.viewId);
  const resourceUri = text(root.resourceUri);
  const connectionGeneration = text(root.connectionGeneration);
  const sandboxOrigin = text(root.sandboxOrigin);
  if (!viewId || viewId.length > 256 || !resourceUri.startsWith("ui://") || resourceUri.length > 2048
    || !connectionGeneration || connectionGeneration.length > 128
    || !sandboxOrigin || !/^http:\/\/127\.0\.0\.1:\d+$/u.test(sandboxOrigin)) return undefined;
  const result = asRecord(root.result);
  return {
    viewId,
    resourceUri,
    connectionGeneration,
    sandboxOrigin,
    sessionId: text(root.sessionId) || undefined,
    title: text(root.publicToolName) || undefined,
    result,
  };
}

export function toolErrorTrace(tool: ToolInfo): string | undefined {
  if (tool.state !== "error") return undefined;
  const parsed = asRecord(parseJson(tool.result));
  const explicit = text(parsed?.stack || parsed?.trace || asRecord(parsed?.error)?.stack);
  if (explicit) return explicit;
  const result = tool.result?.trim() || "";
  return /(?:^|\n)\s*(?:at\s+.*?|.*?)\(?[^\n()]+:\d+:\d+\)?\s*(?:\n|$)/u.test(result) ? result : undefined;
}

function parseArtifact(value?: Record<string, unknown>): ToolPresentation["artifact"] {
  if (!value) return undefined;
  const content = text(value.content || value.text || value.output);
  if (!content) return undefined;
  const rawKind = text(value.kind).toLowerCase();
  const kind = rawKind === "code" || rawKind === "json" ? rawKind : "text";
  return {
    title: text(value.title || value.name) || "工具产物",
    description: text(value.description) || undefined,
    content,
    kind,
    language: text(value.language) || (kind === "json" ? "json" : undefined),
  };
}

function parseCode(value?: Record<string, unknown>): ToolPresentation["code"] {
  if (!value) return undefined;
  const code = text(value.code || value.content || value.text);
  return code ? { code, language: text(value.language || value.lang) || "text" } : undefined;
}

function parseTerminal(value?: Record<string, unknown>): ToolPresentation["terminal"] {
  if (!value) return undefined;
  const output = text(value.output || value.content || value.text);
  return output ? { output, title: text(value.title || value.command) || "终端输出", cwd: text(value.cwd) || undefined } : undefined;
}

function parseTests(value: unknown): StructuredTestResult[] {
  if (!Array.isArray(value)) return [];
  return value.map(asRecord).filter(Boolean).flatMap((record, index) => {
    const status = normalizeTestStatus(record?.status);
    const name = text(record?.name || record?.title);
    if (!status || !name) return [];
    return [{
      id: text(record?.id) || `test-${index}`,
      name,
      status,
      durationMs: finiteNumber(record?.durationMs || record?.duration),
      file: text(record?.file) || undefined,
      suite: text(record?.suite) || undefined,
      message: text(record?.message || record?.error) || undefined,
    }];
  });
}

function parseFileNodes(value: unknown, parent = "root"): StructuredFileNode[] {
  if (!Array.isArray(value)) return [];
  return value.map(asRecord).filter(Boolean).flatMap((record, index) => {
    const name = text(record?.name || record?.path || record?.title);
    if (!name) return [];
    const children = parseFileNodes(record?.children, `${parent}-${index}`);
    const rawType = text(record?.type || record?.kind).toLowerCase();
    const type = rawType === "directory" || rawType === "folder" || children.length > 0 ? "directory" as const : "file" as const;
    return [{
      id: text(record?.id || record?.path) || `${parent}-${index}-${name}`,
      name,
      type,
      path: text(record?.path) || undefined,
      children: children.length ? children : undefined,
      metadata: text(record?.metadata || record?.status) || undefined,
    }];
  });
}

function parseWeb(roots: Record<string, unknown>[], toolName: string): ToolPresentation["web"] {
  const isWebTool = /(?:^|[_-])(web|browser|computer)(?:$|[_-])/u.test(toolName) || /web_search|web_fetch/u.test(toolName);
  const root = roots.find((item) => {
    const card = text(item.card).toLowerCase();
    const kind = text(item.kind).toLowerCase();
    if (card === "web" || kind === "fetch" || kind === "computer") return true;
    return isWebTool && (card === "search" || kind === "search");
  });
  if (!root) return undefined;
  const rawKind = text(root.kind).toLowerCase();
  const kind = rawKind === "fetch" ? "fetch" : rawKind === "computer" || /computer|screenshot/u.test(toolName) ? "computer" : "search";
  const sources = extractSources(root.sources || root.results || root.items);
  const statusCode = finiteNumber(root.statusCode);
  return {
    kind,
    title: text(root.title) || (kind === "fetch" ? "网页抓取" : kind === "computer" ? "电脑操作" : "网页搜索"),
    answer: text(root.answer) || undefined,
    url: text(root.url) || undefined,
    statusCode,
    truncated: root.truncated === true,
    sources,
  };
}

function parseImages(roots: Record<string, unknown>[]): ToolPresentation["images"] {
  const images: ToolPresentation["images"] = [];
  visit(roots, (record) => {
    const type = text(record.type).toLowerCase();
    if (type !== "image" && type !== "screenshot") return;
    const raw = text(record.data || record.src || record.url || record.content);
    if (!raw) return;
    const src = raw.startsWith("data:") || raw.startsWith("http://") || raw.startsWith("https://")
      ? raw
      : `data:${text(record.mediaType) || "image/png"};base64,${raw}`;
    if (images.some((image) => image.src === src)) return;
    images.push({ id: text(record.id) || `image-${images.length}`, src, alt: text(record.alt || record.name || record.description) || undefined });
  });
  return images;
}

function normalizeTestStatus(value: unknown): StructuredTestResult["status"] | undefined {
  const status = text(value).toLowerCase();
  if (status === "passed" || status === "pass" || status === "success") return "passed";
  if (status === "failed" || status === "fail" || status === "error") return "failed";
  if (status === "skipped" || status === "skip") return "skipped";
  if (status === "todo" || status === "pending") return "todo";
  if (status === "running" || status === "active") return "running";
  return undefined;
}

function firstRecord(roots: Record<string, unknown>[], keys: string[]): Record<string, unknown> | undefined {
  return asRecord(firstValue(roots, keys));
}

function firstValue(roots: Record<string, unknown>[], keys: string[]): unknown {
  for (const root of roots) for (const key of keys) if (root[key] !== undefined) return root[key];
  return undefined;
}

function visit(value: unknown, visitor: (record: Record<string, unknown>) => void): void {
  if (Array.isArray(value)) {
    for (const item of value) visit(item, visitor);
    return;
  }
  const record = asRecord(value);
  if (!record) return;
  visitor(record);
  if (Array.isArray(record.content)) visit(record.content, visitor);
  if (record.screenshot) visit(record.screenshot, visitor);
  if (Array.isArray(record.images)) visit(record.images, visitor);
  if (Array.isArray(record.parts)) visit(record.parts, visitor);
  if (Array.isArray(record.sources)) visit(record.sources, visitor);
  if (Array.isArray(record.citations)) visit(record.citations, visitor);
}

function parseJson(value?: string): unknown {
  if (!value) return undefined;
  try { return JSON.parse(value); } catch { return undefined; }
}

function finiteNumber(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : typeof value === "number" ? String(value) : "";
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
