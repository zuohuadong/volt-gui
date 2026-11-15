import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), "utf8");

const app = read("../App.svelte");
const sources = read("../components/ExternalKnowledgeSources.svelte");
const profile = readFileSync(new URL("../../../../profiles/anyong.yml", import.meta.url), "utf8");
const weknoraPatch = readFileSync(new URL("../../../../patches/@wxg-prc-cpg__dsh-weknora@0.1.0.patch", import.meta.url), "utf8");

// 外部知识库（WeKnora）不再默认参与回答：只声明「已配置」不够，
// 地址写错或凭据过期都会让每轮检索稳定拿 401。
describe("external knowledge is opt-in by default (#363)", () => {
  it("keeps the plugin off unless the user turns it on", () => {
    // Profile patch 不得替用户写 weknora 配置（overlay 会阻断用户保存设置），
    // 插件自身的默认值是关闭，由用户在设置里显式启用。
    expect(profile).toContain("此处不得覆盖 weknora 行");
    expect(profile).not.toContain("id: weknora");
    // 插件 schema 默认关闭，且关闭时不注册任何工具。
    expect(weknoraPatch).toContain("enabled: Schema.boolean().default(false)");
    expect(weknoraPatch).toContain('if (!initial.enabled) ctx.logger?.info?.("dsh-weknora: disabled; tools are not registered")');
  });

  it("requires a successful connection test before enabling", () => {
    expect(sources).toContain('if (enabled && !verified) throw new Error(t("knowledge.sourceTestRequired"))');
    expect(sources).toContain("onVerified?.();");
    // 测试失败必须走失败态，而不是停在「未验证」。
    expect(sources).toContain('if (result.status !== "connected") {');
    expect(sources).toContain('t("knowledge.sourceDefaultOffNote")');
    expect(sources).toContain("enabled = value.enabled === true;");
  });

  it("keeps the retrieval scope on local until verified", () => {
    expect(app).toContain("const externalKnowledgeUnavailable = $derived(externalScopeState({ state: externalKnowledgeState, verifiedInSession: externalKnowledgeVerified })");
    expect(app).toContain('managementNotice = t("knowledge.externalNeedsVerification")');
    expect(app).toContain("externalKnowledgeSignature = signature;");
    expect(app).toContain("externalKnowledgeVerified = false;");
  });

  it("falls back to local retrieval when the source rejects the request", () => {
    expect(app).toContain('if (endFailure && classifyAuthFailure(endFailure.message, endFailure.code) === "weknora")');
    expect(app).toContain('knowledgeScope = "local";');
    expect(app).toContain('managementNotice = t("knowledge.externalDeniedFallback")');
  });

  it("keeps the settings block collapsed and the shutdown action out of the summary", () => {
    // 折叠与「一键关闭只在异常提示条里出现」由渲染测试覆盖，这里只守住实现钩子。
    expect(sources).toContain("const showForm = $derived(expanded ?? (enabled && !verified));");
    expect(sources).toContain('t("knowledge.sourceConfigure")');
    expect(sources).toContain('class="source-notice alert" role="alert"');
    // 摘要行只有「名称 / 状态 / 配置」三项：没有常驻破坏性按钮，也没有重复的 Badge。
    const summary = sources.slice(sources.indexOf('<div class="source-row">'), sources.indexOf("{#if descriptor"));
    expect(summary).toContain('t("knowledge.sourceConfigure")');
    expect(summary).not.toContain("disableSource");
    expect(summary).not.toContain("StatusBadge");
    expect(summary).toContain("sourceStateLabel");
  });

  it("saves the form before testing so the test never validates a stale address", () => {
    expect(sources).toContain("await persist(false);");
    expect(sources).toContain("await client.testKnowledgeSource();");
  });

  it("never asks the model to call WeKnora for local-only retrieval", () => {
    expect(read("../lib/knowledge.ts")).toContain("本次不要调用任何外部知识库（WeKnora）工具");
  });
});