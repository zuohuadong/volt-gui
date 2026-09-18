import type { ToolInfo } from "./transcript";
import { t } from "./i18n";

type ToolKind = "browser" | "computer" | "skill" | "document" | "command" | "file" | "generic";

const TOOL_LABEL_KEYS: Record<ToolKind, string> = {
  browser: "transcript.toolBrowser",
  computer: "transcript.toolComputer",
  skill: "transcript.toolSkill",
  document: "transcript.toolDocument",
  command: "transcript.toolCommand",
  file: "transcript.toolFile",
  generic: "transcript.toolGeneric",
};

const TOOL_ACTION_KEYS: Record<string, string> = {
  start: "transcript.actionOpenPage",
  navigate: "transcript.actionOpenPage",
  open: "transcript.actionOpenPage",
  search: "transcript.actionSearch",
  fetch: "transcript.actionFetch",
  click: "transcript.actionClick",
  type: "transcript.actionType",
  screenshot: "transcript.actionScreenshot",
  scroll: "transcript.actionScroll",
  keypress: "transcript.actionKeypress",
};

function classifyTool(name: string): ToolKind {
  const normalized = name.trim().toLowerCase();
  if (normalized.includes("browser") || normalized.includes("web")) return "browser";
  if (normalized.includes("computer") || normalized.includes("screenshot")) return "computer";
  if (normalized.includes("skill")) return "skill";
  if (normalized.includes("office") || normalized.includes("document")) return "document";
  if (normalized.includes("shell") || normalized.includes("bash") || normalized.includes("powershell") || normalized.includes("command") || normalized.includes("exec")) return "command";
  if (normalized.includes("file") || normalized.includes("read") || normalized.includes("write")) return "file";
  return "generic";
}

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
  artifact?: { title: string; description?: string; content: string; kind: "text" | "code" | "json"; language?: string };
  code?: { code: string; language: string };
  terminal?: { output: string; title: string; cwd?: string };
  web?: { kind: "search" | "fetch" | "computer"; title: string; answer?: string; url?: string; statusCode?: number; truncated?: boolean; sources: TranscriptSource[] };
  images: Array<{ id: string; src: string; alt?: string }>;
  tests: StructuredTestResult[];
  files: StructuredFileNode[];
};

export type ToolDisplay = {
  label: string;
  detail?: string;
};

export function toolResultSummary(result: string | undefined): string | undefined {
  const value = result?.trim();
  if (!value) return undefined;
  if (/tool[-_]call|tool[-_]use|tool[-_]result/iu.test(value)) return t("transcript.toolCompleted");
  const firstLine = value.split(/\r?\n/u).map((line) => line.trim()).find(Boolean) || t("transcript.toolCompleted");
  return firstLine.length > 180 ? `${firstLine.slice(0, 180)}…` : firstLine;
}

export function toolErrorSummary(result: string | undefined): string {
  const value = result?.trim() || "";
  if (/interrupted|connection closed|unknown outcome/iu.test(value)) return t("transcript.toolInterrupted");
  if (/timeout|timed out/iu.test(value)) return t("transcript.toolTimeout");
  if (/permission|approval|denied/iu.test(value)) return t("transcript.toolNeedsApproval");
  return toolResultSummary(value) || t("transcript.toolFailedRetry");
}

export function toolDisplay(tool: Pick<ToolInfo, "name" | "args" | "view">): ToolDisplay {
  const kind = classifyTool(tool.name);
  const label = t(TOOL_LABEL_KEYS[kind]);
  const record = toolArgumentRecord(tool.args) || asRecord(tool.view) || asRecord(tool.view?.view);
  const action = text(record?.action || record?.operation || record?.kind).toLowerCase();
  const target = text(record?.url || record?.query || record?.path || record?.file || record?.command || record?.skill || record?.name);
  if (kind === "browser" || kind === "computer") {
    const actionKey = TOOL_ACTION_KEYS[action];
    const actionText = actionKey ? t(actionKey) : (action || undefined);
    if (actionText && target) return { label, detail: `${actionText} · ${shortenToolDetail(target)}` };
    if (actionText) return { label, detail: actionText };
    if (target) return { label, detail: shortenToolDetail(target) };
  }
  if (kind === "skill" && target) return { label, detail: t("transcript.toolLoadSkill", { name: shortenToolDetail(target) }) };
  if ((kind === "command" || kind === "file") && target) return { label, detail: shortenToolDetail(target) };
  return { label };
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
  return Boolean(presentation.artifact || presentation.code || presentation.terminal || presentation.web || presentation.images.length || presentation.tests.length || presentation.files.length);
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
    const answer = questionOptionLabels(question).length ? answers[id] : answers[`${id}:custom`];
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
    const title = text(record.title || record.name || record.label) || url || t("transcript.sources");
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
  return { artifact, code, terminal, web, images, tests, files };
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
    title: text(value.title || value.name) || t("transcript.toolArtifact"),
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
  return output ? { output, title: text(value.title || value.command) || t("transcript.toolTerminal"), cwd: text(value.cwd) || undefined } : undefined;
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
    title: text(root.title) || (kind === "fetch" ? t("structured.webFetch") : kind === "computer" ? t("structured.computerUse") : t("structured.webSearch")),
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
