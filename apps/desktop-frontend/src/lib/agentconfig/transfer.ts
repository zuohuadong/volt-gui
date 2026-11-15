import type { AcbAgentEntry, AcbBundle, AcbMcpEntry, AcbModelEntry, AcbPublic, AcbSecret } from "./types";
import { ACB_KNOWN_CAPABILITIES, assertTrust, buildBundle, countSecrets } from "./codec";
import { providerCredentialRef, resolveProviderSettings } from "../model-catalog";
import type { ConfigurableProvider, SettingsNamespace } from "../dsh-client";

/**
 * ACB ↔ 我们的 DSH 配置之间的映射与导入计划。
 *
 * 设计原则：
 * 1. 只做我们能真实写入的能力；写不了的（MCP server、skills 启停）如实标成 unsupported，
 *    不在界面上假装成功。
 * 2. 导入永远是「计划 → 用户确认 → 执行」，计划可测、可 diff、可复述。
 * 3. 导出只出 shared 免密包：DSH 的凭据只能写不能读，导不出明文密钥（也不该导）。
 */

export const AGENTCONFIG_SOURCE = "anyong-agent";

export type LocalModel = {
  provider: string;
  id: string;
  name?: string;
  input?: string[];
  contextWindow?: number;
  maxOutputTokens?: number;
  reasoningEffort?: string;
};

export type LocalConfig = {
  readonly providers: readonly ConfigurableProvider[];
  readonly namespaces: readonly SettingsNamespace[];
  readonly credentials: Readonly<Record<string, { configured?: boolean; writable?: boolean }>>;
  readonly skills?: readonly { id: string; enabled?: boolean }[];
  readonly agentPresets?: readonly { id: string; name?: string; model?: string; skillIds?: string[] }[];
  readonly quickActions?: readonly { label: string; prompt: string }[];
};

function providerModels(config: Record<string, unknown>): LocalModel[] {
  const models = Array.isArray(config.models) ? config.models : [];
  return models.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    if (typeof item.id !== "string") return [];
    return [{
      provider: "",
      id: item.id,
      ...(typeof item.name === "string" ? { name: item.name } : {}),
      ...(Array.isArray(item.input) ? { input: item.input.filter((value): value is string => typeof value === "string") } : {}),
      ...(typeof item.contextWindow === "number" ? { contextWindow: item.contextWindow } : {}),
      ...(typeof item.maxOutputTokens === "number" ? { maxOutputTokens: item.maxOutputTokens } : {}),
      ...(typeof item.reasoningEffort === "string" ? { reasoningEffort: item.reasoningEffort } : {}),
    }];
  });
}

/** 读取本地 provider 配置（用于导出与 diff）。 */
export function localModels(local: Pick<LocalConfig, "providers" | "namespaces">): LocalModel[] {
  const models: LocalModel[] = [];
  for (const provider of local.providers) {
    const settings = resolveProviderSettings([...local.namespaces], [...local.providers], provider.provider);
    if (!settings) continue;
    for (const model of providerModels(settings.config)) models.push({ ...model, provider: provider.provider });
  }
  return models;
}

function modelType(model: LocalModel): AcbModelEntry["modelType"] {
  if (!model.input || model.input.length === 0) return undefined;
  const image = model.input.includes("image");
  const video = model.input.includes("video");
  const text = model.input.includes("text");
  if (video) return "video-generation";
  if (image && text) return "multimodal";
  return "text";
}

/** 本地配置 → shared bundle（永远不含 secrets）。 */
export async function buildSharedBundle(local: LocalConfig, options: { label?: string; now?: number; quickActions?: boolean } = {}): Promise<AcbBundle> {
  const models: AcbModelEntry[] = localModels(local).map((model) => ({
    provider: model.provider,
    id: model.id,
    ...(model.name ? { alias: model.name.slice(0, 64) } : {}),
    ...(model.contextWindow ? { contextWindow: model.contextWindow } : {}),
    ...(model.maxOutputTokens ? { maxOutputTokens: model.maxOutputTokens } : {}),
    ...(modelType(model) ? { modelType: modelType(model) } : {}),
    ...(model.reasoningEffort ? { parameters: { reasoningEffort: model.reasoningEffort } } : {}),
  }));
  const mcp: AcbMcpEntry[] = [];
  const skills = (local.skills ?? []).map((skill, index) => ({
    id: skill.id,
    enabled: skill.enabled !== false,
    order: index + 1,
  }));
  const prompts = options.quickActions && (local.quickActions?.length ?? 0) > 0
    ? local.quickActions!.map((action, index) => ({ id: `quick-action-${index + 1}`, title: action.label.slice(0, 80) }))
    : [];
  const agents: AcbAgentEntry[] = (local.agentPresets ?? []).map((preset) => ({
    id: preset.id.slice(0, 64),
    ...(preset.name ? { name: preset.name.slice(0, 80) } : {}),
    ...(preset.model ? { model: preset.model.slice(0, 128) } : {}),
    ...(preset.skillIds ? { skillIds: preset.skillIds.slice(0, 64) } : {}),
  }));
  const pub: AcbPublic = { models, mcp, skills, prompts, agents, resources: [] };
  return buildBundle({
    trust: "shared",
    label: options.label ?? "anyong-agent configuration",
    src: AGENTCONFIG_SOURCE,
    pub,
    ...(options.now === undefined ? {} : { now: options.now }),
  });
}

export type ImportSkip = {
  readonly section: string;
  readonly reason: string;
  readonly items: readonly string[];
};

export type ModelChange = {
  readonly provider: string;
  readonly id: string;
  /** `unavailable`：本地没有这个 provider，写不进去，计划里如实标出来而不是假装能导。 */
  readonly action: "add" | "unchanged" | "unavailable";
  readonly credentialRef?: string;
  readonly reason?: string;
};

export type CredentialChange = {
  readonly provider: string;
  readonly ref: string;
  readonly action: "set" | "keep" | "unavailable";
  readonly reason?: string;
};

export type ImportPlan = {
  readonly bundle: AcbBundle;
  readonly label: string;
  readonly trust: AcbBundle["trust"];
  readonly encrypted: boolean;
  readonly capabilities: readonly string[];
  readonly models: readonly ModelChange[];
  readonly credentials: readonly CredentialChange[];
  readonly skipped: readonly ImportSkip[];
  readonly secretTotals?: { readonly providers: number; readonly credentials: number; readonly promptBodies: number; readonly endpoints: number };
  /** 需要用户输入的密码才能继续。 */
  readonly needsPassword: boolean;
};

/** 真正会被写进本地配置的段（凭据单独走 secret，不算 section）。 */
const APPLIED_SECTIONS = new Set(["models"]);
const NOT_APPLIED: Record<string, string> = {
  mcp: "MCP server 定义在 DSH profile 里静态装配，运行时没有写入接口；请手动加入配置后重启。",
  skills: "技能是安装在工作区目录里的文件，导入包不携带技能内容，只带启停状态。",
  prompts: "指令正文在 secret 段，DSH 没有写入提示词库的接口；请在预览里复制后手动创建。",
  agents: "智能体需要绑定提示词与技能，运行时没有创建接口；导入不会自动建出智能体。",
  resources: "资源 URI 只做引用提示，不会自动打开或下载。",
};

/**
 * 生成导入计划（纯函数，不发请求）。
 *
 * `secret` 只有在 bundle 未加密或用户已提供正确密码时才传入；凭据名称按 provider
 * 的 apiKeyEnv 对齐，避免把包里的 provider 名当成环境变量名。
 */
export function planImport(bundle: AcbBundle, local: LocalConfig, secret?: AcbSecret): ImportPlan {
  const pub = bundle.pub;
  const localModelKeys = new Set(localModels(local).map((model) => `${model.provider}\u0000${model.id}`));
  const models: ModelChange[] = (pub.models ?? []).map((entry) => {
    const key = `${entry.provider}\u0000${entry.id}`;
    const settings = safeProviderSettings(local, entry.provider);
    const credentialRef = settings
      ? providerCredentialRef([...local.namespaces], [...local.providers], entry.provider)
      : undefined;
    const unavailable = !settings;
    return {
      provider: entry.provider,
      id: entry.id,
      action: unavailable ? "unavailable" : localModelKeys.has(key) ? "unchanged" : "add",
      ...(credentialRef ? { credentialRef } : {}),
      ...(unavailable ? { reason: "本地没有这个 provider，导入会跳过它。" } : {}),
    };
  });

  const credentials: CredentialChange[] = [];
  /** 凭据里"看得到但写不进去"的部分也要出现在结果清单，不能只在代码里跳过。 */
  const credentialSkips: { reason: string; items: string[] }[] = [];
  for (const [provider, entry] of Object.entries(secret?.secrets ?? {})) {
    if (provider === "__proto__" || provider === "constructor" || provider === "prototype") continue;
    const ref = providerCredentialRef([...local.namespaces], [...local.providers], provider) ?? provider;
    const view = Object.hasOwn(local.credentials, ref) ? local.credentials[ref] : undefined;
    const plaintext = entry.apiKey ?? Object.values(entry.env ?? {})[0];
    const hasValue = Boolean(plaintext);
    if (!hasValue) {
      // 只有 OAuth / header / url 的条目：能描述但写不进去（DSH 只接受字符串密钥）。
      credentialSkips.push({ reason: "包里没有可直接写入的密钥值（例如只带了 OAuth 或请求头），需要你手动填写。", items: [ref] });
      continue;
    }
    if (!view || view.writable === false) {
      credentials.push({ provider, ref, action: "unavailable", reason: "凭据服务不可写或该引用未知，导入时会跳过。" });
      credentialSkips.push({ reason: "本地凭据服务不可写，或该引用未知，导入会跳过。", items: [ref] });
      continue;
    }
    credentials.push({ provider, ref, action: view.configured ? "keep" : "set", ...(view.configured ? { reason: "本地已配置，导入不会覆盖。" } : {}) });
  }

  const skipped: ImportSkip[] = [];
  // 同类原因只出一条，避免同一段说明重复十几次。
  const seenCredentialSkips = new Set<string>();
  for (const item of credentialSkips) {
    const key = `${item.reason}\u0000${item.items.join(",")}`;
    if (seenCredentialSkips.has(key)) continue;
    seenCredentialSkips.add(key);
    skipped.push({ section: "credentials", reason: item.reason, items: item.items });
  }
  const unavailableModels = models.filter((item) => item.action === "unavailable");
  if (unavailableModels.length > 0) {
    skipped.push({
      section: "models",
      reason: "这些模型属于本地没有的 provider，导入会跳过。",
      items: unavailableModels.map((item) => `${item.provider}/${item.id}`),
    });
  }
  for (const capability of bundle.capabilities.length ? bundle.capabilities : Object.keys(pub)) {
    if (APPLIED_SECTIONS.has(capability)) continue;
    const items = itemsFor(pub, capability);
    const reason = NOT_APPLIED[capability] ?? "当前版本不支持导入该能力，已保留原始字段。";
    if (items.length > 0 || capability in NOT_APPLIED) skipped.push({ section: capability, reason, items });
  }
  const unknown = bundle.capabilities.filter((name) => !ACB_KNOWN_CAPABILITIES.includes(name as never));
  if (unknown.length > 0) {
    skipped.push({
      section: "unknown",
      reason: "这些能力名不在规范定义范围内，已忽略但保留在 bundle 里。",
      items: unknown,
    });
  }

  return {
    bundle,
    label: bundle.label ?? "未命名配置包",
    trust: bundle.trust,
    encrypted: bundle.payload.alg !== "none",
    capabilities: bundle.capabilities,
    models,
    credentials,
    skipped,
    ...(secret === undefined ? {} : { secretTotals: countSecrets(secret) }),
    needsPassword: bundle.payload.alg !== "none" && secret === undefined,
  };
}

function itemsFor(pub: AcbPublic, capability: string): string[] {
  if (capability === "mcp") return (pub.mcp ?? []).map((item) => item.name);
  if (capability === "skills") return (pub.skills ?? []).map((item) => item.id);
  if (capability === "resources") return (pub.resources ?? []).map((item) => item.uri);
  if (capability === "agents") return (pub.agents ?? []).map((item) => item.id);
  if (capability === "prompts") return (pub.prompts ?? []).map((item) => item.id);
  if (capability === "models") return (pub.models ?? []).map((item) => `${item.provider}/${item.id}`);
  return [];
}

/** 计划里是否存在用户可执行的动作（否则界面直接说"没有可导入的改动"）。 */
export function hasActionableChanges(plan: ImportPlan): boolean {
  return plan.models.some((item) => item.action === "add")
    || plan.credentials.some((item) => item.action === "set");
}

export type ApplyResult = {
  readonly models: readonly string[];
  readonly credentials: readonly string[];
  readonly failed: readonly { readonly target: string; readonly reason: string }[];
  /** 本次明确没写入的部分（预览里已经说明过的原因），导入后仍可回看。 */
  readonly skipped: readonly ImportSkip[];
};

type ApplyClient = {
  updateSettings(ns: string, patch: Record<string, unknown>, expectedRevision?: number): Promise<SettingsNamespace>;
  setCredential(ref: string, value: string): Promise<unknown>;
};

/**
 * 执行导入计划。只写入用户确认过的部分：
 * - 模型：追加到 provider 的 models 数组，保留原有条目与未知字段。
 * - 凭据：只写"本地未配置"的，已配置的一律不覆盖（导入不可静默替换密钥）。
 */
export async function applyImportPlan(
  plan: ImportPlan,
  client: ApplyClient,
  local: LocalConfig,
  secret?: AcbSecret,
): Promise<ApplyResult> {
  // 防御性复核：预览阶段已经拦过一次，写入前再拦一次（凭据只能进加密载荷）。
  assertTrust(plan.bundle, secret);
  const models: string[] = [];
  const credentials: string[] = [];
  const failed: { target: string; reason: string }[] = [];

  const byProvider = new Map<string, AcbModelEntry[]>();
  for (const change of plan.models) {
    if (change.action !== "add") continue;
    const entry = (plan.bundle.pub.models ?? []).find((item) => item.provider === change.provider && item.id === change.id);
    if (!entry) continue;
    byProvider.set(change.provider, [...(byProvider.get(change.provider) ?? []), entry]);
  }
  // 同一 namespace 下可能有多个 provider：第一次写入后 revision 就变了，
  // 后续必须用服务器返回的新 revision，否则第二个 provider 一定撞版本冲突。
  const revisions = new Map<string, number | undefined>();
  // 某次写入失败后同一个 namespace 的 revision 就不可信了（服务端可能已提交、
  // 也可能被并发改过），继续写只会连环失败，所以直接停掉这个 namespace。
  const blockedNamespaces = new Set<string>();
  for (const [provider, entries] of byProvider) {
    const settings = resolveProviderSettings([...local.namespaces], [...local.providers], provider);
    if (!settings) {
      failed.push({ target: provider, reason: "本地没有这个 provider，未导入其模型。" });
      continue;
    }
    const descriptor = local.providers.find((item) => item.provider === provider);
    const path = descriptor?.settingsPath ?? [];
    const existing = Array.isArray(settings.config.models) ? settings.config.models as Record<string, unknown>[] : [];
    const additions = entries.map((entry) => toLocalModel(entry));
    const patch = path.reduceRight<Record<string, unknown>>(
      (inner, key) => ({ [key]: inner }),
      { models: [...existing, ...additions] },
    );
    const ns = settings.namespace.ns;
    if (blockedNamespaces.has(ns)) {
      failed.push({ target: provider, reason: "同一命名空间的上一笔写入失败，已停止继续写入，避免用陈旧版本号重试。" });
      continue;
    }
    const expectedRevision = revisions.has(ns) ? revisions.get(ns) : settings.namespace.revision;
    try {
      const updated = await client.updateSettings(ns, patch, expectedRevision);
      revisions.set(ns, updated?.revision);
      models.push(...entries.map((entry) => `${provider}/${entry.id}`));
    } catch (error) {
      blockedNamespaces.add(ns);
      failed.push({ target: provider, reason: error instanceof Error ? error.message : String(error) });
    }
  }

  if (secret) {
    for (const change of plan.credentials) {
      if (change.action !== "set") continue;
      const entry = secret.secrets?.[change.provider];
      const value = entry?.apiKey ?? Object.values(entry?.env ?? {})[0];
      if (!value) continue;
      try {
        await client.setCredential(change.ref, value);
        credentials.push(change.ref);
      } catch (error) {
        failed.push({ target: change.ref, reason: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  return { models, credentials, failed, skipped: plan.skipped };
}


/**
 * provider 名来自不可信输入，`__proto__` 之类会命中普通对象原型链。
 * 只接受真正登记过的 provider，其它一律当作"本地不存在"。
 */
function safeProviderSettings(local: LocalConfig, provider: string): ReturnType<typeof resolveProviderSettings> {
  if (provider === "__proto__" || provider === "constructor" || provider === "prototype") return undefined;
  if (!local.providers.some((item) => item.provider === provider)) return undefined;
  return resolveProviderSettings([...local.namespaces], [...local.providers], provider);
}

function toLocalModel(entry: AcbModelEntry): Record<string, unknown> {
  const input = entry.modelType === "multimodal"
    ? ["text", "image"]
    : entry.modelType === "text"
      ? ["text"]
      : entry.modelType
        ? [entry.modelType]
        : undefined;
  return {
    id: entry.id,
    ...(entry.alias ? { name: entry.alias } : {}),
    ...(input ? { input } : {}),
    ...(typeof entry.parameters?.reasoningEffort === "string" ? { reasoningEffort: entry.parameters.reasoningEffort } : {}),
  };
}