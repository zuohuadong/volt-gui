import { describe, expect, it, vi } from "vitest";
import { buildBundle, revealSecret } from "./codec";
import {
  applyImportPlan,
  buildSharedBundle,
  hasActionableChanges,
  localModels,
  planImport,
  type LocalConfig,
} from "./transfer";
import type { SettingsNamespace } from "$lib/dsh-client";

const namespace = (value: Record<string, unknown>): SettingsNamespace =>
  ({ ns: "llm-pi-ai", revision: 7, value }) as SettingsNamespace;

const local: LocalConfig = {
  providers: [{
    provider: "xg-gomodel",
    displayName: "XG GOModel",
    settingsNs: "llm-pi-ai",
    settingsPath: ["providers", "xg-gomodel"],
    active: true,
  }],
  namespaces: [namespace({
    providers: { "xg-gomodel": { apiKeyEnv: "XG_GOMODEL_API_KEY", models: [{ id: "vlm", name: "VLM", input: ["text", "image"] }] } },
  })],
  credentials: { XG_GOMODEL_API_KEY: { configured: true, writable: true } },
  skills: [{ id: "docx", enabled: true }, { id: "pdf", enabled: false }],
  quickActions: [{ label: "整理清单", prompt: "把工作区整理成清单" }],
  agentPresets: [{ id: "reviewer", name: "Reviewer", model: "xg-gomodel/vlm", skillIds: ["docx"] }],
};

describe("ACB ↔ DSH mapping", () => {
  it("exports local providers, skills, prompts and agents as a shared bundle", async () => {
    const bundle = await buildSharedBundle(local, { quickActions: true, now: 1_700_000_000_000 });
    expect(bundle.trust).toBe("shared");
    // 永不携带 secrets —— DSH 的凭据只能写不能读。
    expect(bundle.payload.alg).toBe("none");
    expect(bundle.capabilities).toContain("models");
    expect(bundle.pub.models?.[0]).toMatchObject({ provider: "xg-gomodel", id: "vlm", modelType: "multimodal" });
    expect(bundle.pub.skills).toEqual([
      { id: "docx", enabled: true, order: 1 },
      { id: "pdf", enabled: false, order: 2 },
    ]);
    expect(bundle.pub.agents?.[0]).toMatchObject({ id: "reviewer", model: "xg-gomodel/vlm" });
    expect(bundle.pub.prompts?.[0]).toMatchObject({ title: "整理清单" });
  });

  it("plans an import: new models are added, known ones unchanged, unsupported sections reported", async () => {
    const bundle = await buildBundle({
      label: "同事的配置",
      pub: {
        models: [
          { provider: "xg-gomodel", id: "vlm" },
          { provider: "xg-gomodel", id: "qwen-next", modelType: "multimodal", parameters: { reasoningEffort: "high" } },
          { provider: "unknown-provider", id: "m" },
        ],
        mcp: [{ name: "github", transport: "stdio", command: "npx" }],
        skills: [{ id: "pdf", enabled: true }],
      },
    });
    const plan = planImport(bundle, local);
    expect(plan.label).toBe("同事的配置");
    // `unknown-provider` 在本地不存在：计划里标成 unavailable，而不是假装能导入。
    expect(plan.models.map((item) => `${item.id}:${item.action}`)).toEqual(["vlm:unchanged", "qwen-next:add", "m:unavailable"]);
    expect(plan.skipped.map((item) => item.section)).toEqual(["models", "mcp", "skills"]);
    expect(plan.skipped[0].items).toEqual(["unknown-provider/m"]);
    expect(plan.skipped[1].reason).toContain("profile");
    expect(hasActionableChanges(plan)).toBe(true);
  });

  it("lists prompts and agents as not applied instead of claiming they were imported", async () => {
    const bundle = await buildBundle({
      pub: { prompts: [{ id: "brief", title: "简述" }], agents: [{ id: "reviewer" }] },
    });
    const plan = planImport(bundle, local);
    expect(plan.skipped.map((item) => item.section)).toEqual(["prompts", "agents"]);
    expect(plan.skipped[0].reason).toContain("没有写入提示词库");
    expect(plan.skipped[1].reason).toContain("不会自动建出智能体");
    expect(hasActionableChanges(plan)).toBe(false);
  });

  it("never overwrites an already configured credential", async () => {
    const bundle = await buildBundle({
      trust: "self",
      pub: { models: [] },
      secret: { secrets: { "xg-gomodel": { apiKey: "sk-from-bundle" }, other: { apiKey: "sk-other" } } },
      password: "pw",
    });
    const secret = await revealSecret(bundle, "pw");
    const plan = planImport(bundle, local, secret);
    expect(plan.needsPassword).toBe(false);
    expect(plan.credentials).toEqual([
      { provider: "xg-gomodel", ref: "XG_GOMODEL_API_KEY", action: "keep", reason: "本地已配置，导入不会覆盖。" },
      { provider: "other", ref: "other", action: "unavailable", reason: "凭据服务不可写或该引用未知，导入时会跳过。" },
    ]);
    expect(plan.secretTotals).toMatchObject({ providers: 2, credentials: 2 });
  });

  it("asks for a password before planning an encrypted bundle", async () => {
    const bundle = await buildBundle({
      trust: "self",
      pub: { models: [{ provider: "xg-gomodel", id: "x" }] },
      secret: { secrets: { "xg-gomodel": { apiKey: "sk" } } },
      password: "pw",
    });
    const plan = planImport(bundle, local);
    expect(plan.needsPassword).toBe(true);
    expect(plan.credentials).toEqual([]);
    expect(plan.models[0].action).toBe("add");
  });

  it("applies only the confirmed additions and keeps existing models", async () => {
    const bundle = await buildBundle({
      trust: "self",
      pub: { models: [{ provider: "xg-gomodel", id: "qwen-next", modelType: "multimodal", parameters: { reasoningEffort: "high" } }] },
      secret: { secrets: { "xg-gomodel": { apiKey: "sk-new" } } },
      password: "pw",
    });
    const secret = await revealSecret(bundle, "pw");
    // 本地凭据未配置，才会被写入。
    const fresh: LocalConfig = { ...local, credentials: { XG_GOMODEL_API_KEY: { configured: false, writable: true } } };
    const plan = planImport(bundle, fresh, secret);
    const updateSettings = vi.fn(async () => namespace({}));
    const setCredential = vi.fn(async () => ({}));
    const result = await applyImportPlan(plan, { updateSettings, setCredential } as never, fresh, secret);

    expect(result.models).toEqual(["xg-gomodel/qwen-next"]);
    expect(result.credentials).toEqual(["XG_GOMODEL_API_KEY"]);
    expect(result.failed).toEqual([]);
    const patch = (updateSettings.mock.calls[0] as unknown as [string, Record<string, unknown>])[1];
    const written = ((patch.providers as Record<string, unknown>)["xg-gomodel"] as Record<string, unknown>).models as Record<string, unknown>[];
    // 原条目保留，新条目按 modelType 还原成 DSH 的 input 声明。
    expect(written.map((item) => item.id)).toEqual(["vlm", "qwen-next"]);
    expect(written[1]).toMatchObject({ input: ["text", "image"], reasoningEffort: "high" });
    expect(setCredential).toHaveBeenCalledWith("XG_GOMODEL_API_KEY", "sk-new");
  });

  it("reports a provider that does not exist locally instead of writing anywhere", async () => {
    const bundle = await buildBundle({ pub: { models: [{ provider: "nowhere", id: "m" }] } });
    const plan = planImport(bundle, local);
    expect(plan.models[0]).toMatchObject({ provider: "nowhere", id: "m", action: "unavailable" });
    expect(hasActionableChanges(plan)).toBe(false);
    const updateSettings = vi.fn(async () => namespace({}));
    const result = await applyImportPlan(plan, { updateSettings, setCredential: vi.fn() } as never, local);
    expect(updateSettings).not.toHaveBeenCalled();
    expect(result.failed).toEqual([]);
  });

  it("treats a prototype-polluting provider name as unavailable", async () => {
    const bundle = await buildBundle({ pub: { models: [{ provider: "__proto__", id: "evil" }] } });
    const plan = planImport(bundle, local);
    expect(plan.models[0]).toMatchObject({ provider: "__proto__", action: "unavailable" });
    const updateSettings = vi.fn(async () => namespace({}));
    await applyImportPlan(plan, { updateSettings, setCredential: vi.fn() } as never, local);
    // 绝不能退化成命名空间根级 patch。
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it("reuses the revision returned by the previous write in the same namespace", async () => {
    const bundle = await buildBundle({
      pub: { models: [{ provider: "xg-gomodel", id: "new-a" }, { provider: "xg-second", id: "new-b" }] },
    });
    const twoProviders: LocalConfig = {
      ...local,
      providers: [
        ...local.providers,
        { provider: "xg-second", displayName: "Second", settingsNs: "llm-pi-ai", settingsPath: ["providers", "xg-second"], active: true },
      ],
      namespaces: [namespace({
        providers: {
          "xg-gomodel": { apiKeyEnv: "XG_GOMODEL_API_KEY", models: [] },
          "xg-second": { apiKeyEnv: "XG_SECOND_API_KEY", models: [] },
        },
      })],
    };
    const revisions: (number | undefined)[] = [];
    const updateSettings = vi.fn(async (ns: string, _patch: unknown, expected?: number) => {
      revisions.push(expected);
      return namespace({}) && { ...namespace({}), ns, revision: (expected ?? 0) + 1 } as SettingsNamespace;
    });
    const result = await applyImportPlan(planImport(bundle, twoProviders), { updateSettings, setCredential: vi.fn() } as never, twoProviders);
    expect(result.failed).toEqual([]);
    // 第二次写入必须用第一次返回的 revision，而不是两个都用 7。
    expect(revisions).toEqual([7, 8]);
  });

  it("stops writing the rest of a namespace after one failure", async () => {
    const bundle = await buildBundle({
      pub: { models: [{ provider: "xg-gomodel", id: "new-a" }, { provider: "xg-second", id: "new-b" }] },
    });
    const twoProviders: LocalConfig = {
      ...local,
      providers: [
        ...local.providers,
        { provider: "xg-second", displayName: "Second", settingsNs: "llm-pi-ai", settingsPath: ["providers", "xg-second"], active: true },
      ],
      namespaces: [namespace({
        providers: {
          "xg-gomodel": { apiKeyEnv: "XG_GOMODEL_API_KEY", models: [] },
          "xg-second": { apiKeyEnv: "XG_SECOND_API_KEY", models: [] },
        },
      })],
    };
    const updateSettings = vi.fn(async () => { throw new Error("revision conflict"); });
    const result = await applyImportPlan(planImport(bundle, twoProviders), { updateSettings, setCredential: vi.fn() } as never, twoProviders);
    // 第一次失败后不再用陈旧 revision 重试同一个 namespace。
    expect(updateSettings).toHaveBeenCalledTimes(1);
    expect(result.failed.map((item) => item.target)).toEqual(["xg-gomodel", "xg-second"]);
  });

  it("explains why a credential cannot be written instead of skipping silently", async () => {
    const bundle = await buildBundle({
      trust: "self",
      password: "pw-123456",
      pub: { models: [] },
      secret: { secrets: { "xg-gomodel": { oauth: { type: "oauth", accessToken: "token-only" } }, "nowhere": { apiKey: "sk-x" } } },
    });
    const secret = await revealSecret(bundle, "pw-123456");
    const plan = planImport(bundle, local, secret);
    const reasons = plan.skipped.filter((item) => item.section === "credentials").map((item) => item.reason);
    expect(reasons.join(" ")).toContain("没有可直接写入的密钥值");
    expect(reasons.join(" ")).toContain("凭据服务不可写");
    expect(plan.skipped.flatMap((item) => item.items)).toContain("XG_GOMODEL_API_KEY");
  });

  it("keeps credential skip reasons distinguishable when several apply", async () => {
    const bundle = await buildBundle({
      trust: "self",
      password: "pw-123456",
      pub: { models: [] },
      secret: {
        secrets: {
          "xg-gomodel": { oauth: { type: "oauth", accessToken: "t" } },
          "nowhere": { apiKey: "sk-x" },
        },
      },
    });
    const plan = planImport(bundle, local, await revealSecret(bundle, "pw-123456"));
    const sectionKeys = plan.skipped.map((item) => `${item.section}:${item.reason}`);
    // 同一个 section 可能有多条不同原因：界面用 section+reason 做 key，必须唯一。
    expect(new Set(sectionKeys).size).toBe(sectionKeys.length);
    expect(plan.skipped.filter((item) => item.section === "credentials")).toHaveLength(2);
  });

  it("keeps the skipped reasons in the apply result", async () => {
    const bundle = await buildBundle({
      pub: { models: [{ provider: "xg-gomodel", id: "new-a" }, { provider: "nowhere", id: "x" }], mcp: [] },
    });
    const updateSettings = vi.fn(async () => namespace({}));
    const result = await applyImportPlan(planImport(bundle, local), { updateSettings, setCredential: vi.fn() } as never, local);
    expect(result.models).toEqual(["xg-gomodel/new-a"]);
    expect(result.skipped.map((item) => item.section)).toContain("models");
    expect(result.skipped.find((item) => item.section === "models")?.items).toEqual(["nowhere/x"]);
  });

  it("reads local models through the provider settings path", () => {
    expect(localModels(local)).toEqual([{ provider: "xg-gomodel", id: "vlm", name: "VLM", input: ["text", "image"] }]);
  });
});
