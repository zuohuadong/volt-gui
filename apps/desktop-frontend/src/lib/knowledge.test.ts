import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildKnowledgePrompt, externalKnowledgeStateFrom, externalScopeState, externalSourceSignature, isInternalKnowledgePrompt, isKnowledgeIndexPromptText, isKnowledgePromptText, knowledgeIndexSummary, knowledgeToolName, parseKnowledgeReport, stripKnowledgeArtifacts, stripKnowledgeReport } from "./knowledge";

describe("knowledge workflow", () => {
  it("defaults to local retrieval and keeps indexing local regardless of scope", () => {
    expect(buildKnowledgePrompt("query", "C:\\repo", "question")).toContain("本次只查询本地");
    expect(buildKnowledgePrompt("build", "C:\\repo", "", "all")).toContain("不要访问网络");
  });

  it("requests external read-only retrieval with explicit partial failure and citations", () => {
    const external = buildKnowledgePrompt("query", "C:\\repo", "question", "external");
    expect(external).toContain("本次只查询已配置");
    expect(external).toContain("禁止上传本地文件");
    expect(external).toContain("status=failed");
    const combined = buildKnowledgePrompt("query", "C:\\repo", "question", "all");
    expect(combined).toContain("本次同时查询");
    expect(combined).toContain("status=partial");
    expect(combined).toContain("文档 ID 或页码");
  });
  it("builds a local workspace indexing prompt without a private backend", () => {
    const prompt = buildKnowledgePrompt("build", "C:\\repo");
    expect(prompt).toContain("本地工作区索引任务");
    expect(prompt).toContain("文件工具 glob、grep、read");
    expect(prompt).toContain("C:\\repo");
    expect(prompt).toContain("<!-- voltui-knowledge-report");
    expect(prompt).toContain("不要访问网络");
  });

  it("parses bounded machine-readable reports", () => {
    const report = parseKnowledgeReport('完成。<!-- voltui-knowledge-report {"status":"partial","files":12.8,"chunks":4,"failures":["a.md",3],"query":"x","matches":2} -->');
    expect(report).toEqual({ status: "partial", files: 12, chunks: 4, failures: ["a.md"], query: "x", matches: 2 });
  });

  it("recognizes official filesystem search tool events", () => {
    expect(knowledgeToolName("glob")).toBe(true);
    expect(knowledgeToolName("tool:grep")).toBe(true);
    expect(knowledgeToolName("bash")).toBe(false);
  });

  it("keeps the machine report out of the visible answer", () => {
    expect(stripKnowledgeReport('答案\n<!-- voltui-knowledge-report {"status":"ready"} -->')).toBe("答案");
  });
});

describe("knowledge index reporting (#336)", () => {
  it("asks for self-consistent counts and keeps placeholders out of chunks", () => {
    const prompt = buildKnowledgePrompt("build", "C:\\repo");
    expect(prompt).toContain("placeholders");
    expect(prompt).toContain("不得混入 chunks");
    expect(prompt).toContain("文件名：原因");
  });

  it("parses the split counts and derives searchable totals", () => {
    const report = parseKnowledgeReport(`索引完成\n<!-- voltui-knowledge-report {"status":"partial","files":3,"indexed":2,"skipped":1,"chunks":5,"placeholders":2,"failures":["反馈.docx：暂不支持读取正文"]} -->`);
    expect(report).toMatchObject({ status: "partial", files: 3, indexed: 2, skipped: 1, chunks: 5, placeholders: 2 });
    expect(knowledgeIndexSummary(report!)).toEqual({ scanned: 3, indexed: 2, skipped: 1, placeholders: 2, searchableChunks: 3 });
  });

  it("falls back conservatively for legacy reports without the new fields", () => {
    const legacy = parseKnowledgeReport(`<!-- voltui-knowledge-report {"status":"partial","files":3,"chunks":3,"failures":["反馈.docx"]} -->`);
    expect(knowledgeIndexSummary(legacy!)).toEqual({ scanned: 3, indexed: 2, skipped: 1, placeholders: 0, searchableChunks: 3 });
  });

  it("never reports more searchable files than scanned files", () => {
    const summary = knowledgeIndexSummary({ status: "ready", files: 2, indexed: 5, skipped: 4, chunks: 1, placeholders: 5 });
    expect(summary.searchableChunks).toBe(0);
    // 统计必须自洽：成功/未索引文件都不能超过扫描数。
    expect(summary.indexed).toBe(2);
    // indexed + skipped 不能超过 scanned：这里 5 + 4 已被夹到 2 + 0。
    expect(summary.skipped).toBe(0);
    expect(summary.indexed + summary.skipped).toBeLessThanOrEqual(summary.scanned);
    expect(summary.scanned).toBe(2);
  });
});

describe("external knowledge state machine (#348)", () => {
  const namespace = { enabled: true, baseUrl: "https://weknora.example/api", apiKeyRef: "WEKNORA_API_KEY" };
  const activePlugin = { enabled: true, fiberPhase: "active" };

  it("is ready only when config, plugin and credential are all confirmed", () => {
    expect(externalKnowledgeStateFrom({ namespace, plugin: activePlugin, credential: { configured: true } })).toBe("ready");
  });

  it("is unavailable on explicit negative evidence", () => {
    expect(externalKnowledgeStateFrom({ namespace: undefined, plugin: activePlugin, credential: { configured: true } })).toBe("unavailable");
    expect(externalKnowledgeStateFrom({ namespace: { ...namespace, enabled: false }, plugin: activePlugin, credential: { configured: true } })).toBe("unavailable");
    expect(externalKnowledgeStateFrom({ namespace: { ...namespace, baseUrl: "  " }, plugin: activePlugin, credential: { configured: true } })).toBe("unavailable");
    expect(externalKnowledgeStateFrom({ namespace, plugin: { enabled: true, fiberPhase: "failed" }, credential: { configured: true } })).toBe("unavailable");
    expect(externalKnowledgeStateFrom({ namespace, plugin: activePlugin, credential: { configured: false } })).toBe("unavailable");
  });

  it("stays unknown when a lookup failed instead of locking the source", () => {
    expect(externalKnowledgeStateFrom({ namespace, plugin: undefined, credential: undefined, pluginLookupFailed: true })).toBe("unknown");
    expect(externalKnowledgeStateFrom({ namespace, plugin: activePlugin, credential: undefined, credentialLookupFailed: true })).toBe("unknown");
    expect(externalKnowledgeStateFrom({ namespace, plugin: activePlugin, credential: undefined })).toBe("unknown");
  });
});

describe("external scope gating (#348)", () => {
  const picker = readFileSync(new URL("../components/KnowledgeScopePicker.svelte", import.meta.url), "utf8");
  const app = readFileSync(new URL("../App.svelte", import.meta.url), "utf8");

  it("disables external scopes and explains why when the source is unavailable", () => {
    expect(picker).toContain("externalUnavailable");
    expect(picker).toContain('disabled={isBlocked(option)}');
    expect(picker).toContain('t("knowledge.scopeUnavailable")');
    expect(picker).toContain('t("knowledge.scopeExternalUnavailable")');
    expect(picker).toContain('t("knowledge.scopeConfigure")');
  });

  it("falls back to local retrieval and keeps settings failures permissive", () => {
    expect(app).toContain('externalKnowledgeState === "unavailable"');
    expect(app).toContain('if (externalKnowledgeState === "unavailable" && knowledgeScope !== "local") knowledgeScope = "local";');
    expect(app).toContain('let externalKnowledgeState = $state<"unknown" | "ready" | "unavailable">("unknown");');
    expect(app).toContain("externalUnavailable={externalKnowledgeUnavailable}");
  });
});

describe("inline knowledge query results (#344)", () => {
  const app = readFileSync(new URL("../App.svelte", import.meta.url), "utf8");
  it("keeps the index state and shows an inline searching/result state", () => {
    expect(app).toContain("knowledgeQuerying");
    expect(app).toContain('t("knowledge.querying")');
    expect(app).toContain('t("knowledge.queryResultTitle")');
    expect(app).toContain('t("knowledge.queryEmpty")');
    expect(app).toContain("...(operation === \"query\" ? {} : { state: \"building\" as const }),");
  });

  it("announces an auto-created search session and offers a jump", () => {
    expect(app).toContain('t("knowledge.querySessionCreated")');
    expect(app).toContain('t("knowledge.queryOpenSession")');
    expect(app).toContain("void selectSession(knowledgeQuerySessionId)");
  });

  it("disables the search button while a query is running", () => {
    expect(app).toContain("sending || knowledgeQuerying || knowledgeIndex.state === \"building\"");
  });
});

describe("internal knowledge prompts stay out of the transcript (#354)", () => {
  it("recognizes our injected query and index templates", () => {
    const queryPrompt = buildKnowledgePrompt("query", "C:\\Users\\demo\\Anyong Workspace", "有哪些历史单号", "local");
    const indexPrompt = buildKnowledgePrompt("build", "C:\\Users\\demo\\Anyong Workspace");
    expect(isKnowledgePromptText(queryPrompt)).toBe(true);
    expect(isKnowledgeIndexPromptText(indexPrompt)).toBe(true);
    expect(isInternalKnowledgePrompt(queryPrompt)).toBe(true);
    expect(isInternalKnowledgePrompt(indexPrompt)).toBe(true);
  });

  it("never treats a real user question as an injected template", () => {
    expect(isKnowledgePromptText("你正在执行知识库检索吗？")).toBe(false);
    expect(isKnowledgePromptText("撤回记录里提到的历史单号有哪些？")).toBe(false);
    expect(isInternalKnowledgePrompt(undefined)).toBe(false);
  });

  it("strips the machine readable report before rendering", () => {
    const answer = "命中 2 份资料。\n<!-- voltui-knowledge-report {\"status\":\"ready\",\"matches\":2} -->";
    expect(stripKnowledgeArtifacts(answer)).toBe("命中 2 份资料。");
    expect(stripKnowledgeArtifacts("普通回答")).toBe("普通回答");
  });
});

describe("external knowledge stays opt-in (#363)", () => {
  it("keeps external scope unavailable until a connection test passed", () => {
    // 默认关闭 / 未验证：只能本地检索。
    expect(externalScopeState({ state: "unavailable", verifiedInSession: false })).toBe("local-only");
    expect(externalScopeState({ state: "ready", verifiedInSession: false })).toBe("local-only");
    expect(externalScopeState({ state: "unknown", verifiedInSession: true })).toBe("local-only");
    // 配置齐全且本次运行验证过，才允许选外部/全部。
    expect(externalScopeState({ state: "ready", verifiedInSession: true })).toBe("selectable");
  });

  it("invalidates the test result whenever the source configuration changes", () => {
    const base = { enabled: true, baseUrl: "https://kb.example/v1", apiKeyRef: "WEKNORA_API_KEY" };
    const signature = externalSourceSignature(base, true);
    expect(externalSourceSignature({ ...base }, true)).toBe(signature);
    expect(externalSourceSignature({ ...base, baseUrl: "https://other.example/v1" }, true)).not.toBe(signature);
    // 开关不参与指纹：关掉时 externalKnowledgeStateFrom 已经判定不可用。
    expect(externalSourceSignature({ ...base, enabled: false }, true)).toBe(signature);
    // 规范化：尾斜杠与「逗号+空格」不能造成指纹抖动，否则一保存就退回未验证。
    expect(externalSourceSignature({ ...base, baseUrl: "https://kb.example/v1/" }, true)).toBe(signature);
    expect(externalSourceSignature({ ...base, knowledgeBaseIds: ["kb-1", "kb-2"] }, true))
      .toBe(externalSourceSignature({ ...base, knowledgeBaseIds: [" kb-1 ", "kb-2"] }, true));
    expect(externalSourceSignature(base, false)).not.toBe(signature);
    // 租户、知识库范围、私网开关同样会改变检索结果，也必须作废验证。
    expect(externalSourceSignature({ ...base, tenantId: "t2" }, true)).not.toBe(signature);
    expect(externalSourceSignature({ ...base, knowledgeBaseIds: ["kb-1"] }, true)).not.toBe(signature);
    expect(externalSourceSignature({ ...base, allowPrivateHosts: true }, true)).not.toBe(signature);
    // 缺省 / 空字符串的凭据引用必须与设置页的默认值等价，否则旧配置永远「指纹不相等」。
    expect(externalSourceSignature({ ...base, apiKeyRef: "" }, true)).toBe(signature);
    expect(externalSourceSignature({ ...base, apiKeyRef: undefined }, true)).toBe(signature);
    expect(externalSourceSignature(undefined, false)).toBe("none");
  });
});
