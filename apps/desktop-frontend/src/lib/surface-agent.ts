import type {
  BaseRecord,
  GetListParams,
  GetListResult,
  GetOneParams,
  GetOneResult,
} from "@svadmin/core";
import {
  buildSurfaceAgentMessages,
  parseSurfaceAgentResponse,
  parseSurfaceAgentProposal,
  splitSurfaceAgentText,
  SURFACE_AGENT_FENCE_TAG,
  SURFACE_AGENT_SCHEMA_VERSION,
  type SurfaceCatalog,
  type SurfaceDataProvider,
  type SurfacePolicy,
  type SurfaceSpec,
  type SurfaceValidationIssue,
} from "@svadmin/surface";
import type { DshClient, SessionSummary, Workspace } from "$lib/dsh-client";
import { VOLT_SURFACE_CATALOG } from "$lib/surface-catalog";

export const VOLT_SURFACE_AGENT_SCHEMA = SURFACE_AGENT_SCHEMA_VERSION;
/** 聊天回答里标记界面提案的围栏标签，由 svadmin 的切分协议定义。 */
export const VOLT_SURFACE_FENCE_TAG = SURFACE_AGENT_FENCE_TAG;
export { VOLT_SURFACE_CATALOG, VOLT_SURFACE_CATALOG_VERSION } from "$lib/surface-catalog";

export const VOLT_SURFACE_POLICY: SurfacePolicy = {
  resources: {
    sessions: {
      readFields: ["id", "title", "cwd", "running", "updatedAt"],
      maxPageSize: 50,
    },
    workspaces: {
      readFields: ["id", "title", "path", "sessionCount"],
      maxPageSize: 50,
    },
    subagents: {
      readFields: ["id", "label", "kind", "activity", "mode"],
      maxPageSize: 50,
    },
    skills: {
      readFields: ["name", "description", "modelInvocable"],
      maxPageSize: 50,
    },
    models: {
      readFields: ["provider", "id", "name", "description", "contextWindow", "maxTokens"],
      maxPageSize: 100,
    },
    agentPresets: {
      readFields: ["id", "name", "description", "trust", "isDefault", "broken"],
      maxPageSize: 50,
    },
    permissionPresets: {
      readFields: ["id", "name", "description"],
      maxPageSize: 20,
    },
  },
};

export interface VoltSurfaceProposal {
  readonly schemaVersion: typeof VOLT_SURFACE_AGENT_SCHEMA | "surface-agent/v2";
  readonly action: "propose";
  readonly summary?: string;
  readonly spec: SurfaceSpec;
}

export type VoltSurfaceProposalResult =
  | { readonly ok: true; readonly value: VoltSurfaceProposal }
  | { readonly ok: false; readonly issues: readonly SurfaceValidationIssue[] };

/**
 * 只接受提案；结构化 cannot-fulfill 不是可渲染界面，按校验失败处理。
 * 同时接受 surface-agent/v1 与聊天模式使用的 v2 信封。
 */
export function parseVoltSurfaceProposal(input: unknown): VoltSurfaceProposalResult {
  // v1 兼容路径允许正文加围栏；聊天模式使用 v2 信封，走响应解析器。
  const legacy = parseSurfaceAgentProposal(input, VOLT_SURFACE_CATALOG, VOLT_SURFACE_POLICY);
  if (legacy.ok) return legacy;
  const response = parseSurfaceAgentResponse(input, VOLT_SURFACE_CATALOG, VOLT_SURFACE_POLICY);
  if (!response.ok) return response;
  if (response.value.action !== "propose") {
    return {
      ok: false,
      issues: [{ code: "invalid_json", path: "", message: "Surface agent declined the request" }],
    };
  }
  const { schemaVersion, action, summary, spec } = response.value;
  return { ok: true, value: { schemaVersion, action, ...(summary === undefined ? {} : { summary }), spec } };
}

export function validateStoredSurface(value: unknown): SurfaceSpec | undefined {
  const validation = parseSurfaceAgentProposal({
    schemaVersion: VOLT_SURFACE_AGENT_SCHEMA,
    action: "propose",
    spec: value,
  }, VOLT_SURFACE_CATALOG, VOLT_SURFACE_POLICY);
  return validation.ok ? validation.value.spec : undefined;
}

const SURFACE_INTENT_OBJECT = /(看板|仪表盘|数据面板|运营界面|操作界面|界面|图表|柱状图|条形图|折线图|饼图|环形图|表格|表单|申请表|报名表|问卷|清单|待办|对比表|计算器|换算器|转换器|小工具|工具|向导|dashboard|surface|chart|table|form|calculator|checklist)/iu;
const SURFACE_INTENT_ACTION = /(生成|创建|设计|搭建|展示|画|做个|做一个|做张|做一张|做份|做一份|做成|列成|整理成|帮我做|给我做|看看|看一下|对比|分析|generate|create|build|show|draw)/iu;
/** 明确的“用界面回答”请求不需要再命中对象词。 */
const SURFACE_INTENT_EXPLICIT = /(用|以)?(界面|卡片|组件|看板)(的)?(方式)?(来)?(回答|展示|呈现|回复)/iu;

export function isSurfaceGenerationIntent(text: string): boolean {
  if (SURFACE_INTENT_EXPLICIT.test(text)) return true;
  return SURFACE_INTENT_OBJECT.test(text) && SURFACE_INTENT_ACTION.test(text);
}

/**
 * 聊天呈现的界面契约：先给正文，再给一个 ```surface 围栏提案。
 * Volt 仍把契约附在用户消息里发送，不新增会话或后端通道。
 */
export function buildVoltSurfacePrompt(text: string): string {
  const [system] = buildSurfaceAgentMessages(text, VOLT_SURFACE_CATALOG, VOLT_SURFACE_POLICY, {
    presentation: "chat",
  });
  return `${text}\n\n${system?.content ?? ""}\n\n[Volt host policy]\n所有界面只读，只使用 catalog 与 policy 允许的资源和字段；不要生成或执行 Svelte、HTML、CSS、JavaScript、SQL、URL、事件处理器或 mutation。界面由宿主校验后内联渲染，卡片上的操作只能通过新的用户消息继续对话。`;
}

/** 内联渲染用的片段：正文、可渲染提案、生成中的占位或已拒绝的提案。 */
export type VoltSurfaceSegment =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "proposal"; readonly spec: SurfaceSpec; readonly summary?: string }
  | { readonly kind: "incomplete" }
  | { readonly kind: "invalid"; readonly reason: string };

const SEGMENT_CACHE_LIMIT = 200;
const segmentCache = new Map<string, readonly VoltSurfaceSegment[]>();

function proposalSegment(json: string): VoltSurfaceSegment {
  const result = parseVoltSurfaceProposal(json);
  if (!result.ok) {
    return { kind: "invalid", reason: result.issues[0]?.message ?? "Invalid surface proposal" };
  }
  return {
    kind: "proposal",
    spec: result.value.spec,
    ...(result.value.summary === undefined ? {} : { summary: result.value.summary }),
  };
}

/**
 * 把一条 assistant 文本解析成可内联渲染的片段。
 * 只做展示切分；校验失败或不完整的内容不会进入渲染器。
 */
export function resolveVoltSurfaceSegments(text: string, streaming = false): readonly VoltSurfaceSegment[] {
  const key = `${streaming ? "1" : "0"}\u0000${text}`;
  const cached = segmentCache.get(key);
  if (cached) return cached;
  const segments: VoltSurfaceSegment[] = [];
  for (const segment of splitSurfaceAgentText(text, { streaming })) {
    if (segment.kind === "text") {
      if (segment.text.trim().length > 0) segments.push({ kind: "text", text: segment.text });
      continue;
    }
    segments.push(segment.complete ? proposalSegment(segment.json) : { kind: "incomplete" });
  }
  if (segmentCache.size >= SEGMENT_CACHE_LIMIT) segmentCache.clear();
  segmentCache.set(key, segments);
  return segments;
}

/** 该文本是否包含已通过校验的界面提案。 */
export function hasVoltSurfaceProposal(text: string): boolean {
  return resolveVoltSurfaceSegments(text).some((segment) => segment.kind === "proposal");
}

function sessionRecord(session: SessionSummary): BaseRecord {
  const title = session.projections?.values?.title;
  return {
    id: session.sessionId,
    title: typeof title === "string" && title.trim() ? title : session.cwd || "新会话",
    cwd: session.cwd || "",
    running: session.running,
    updatedAt: session.updatedAt,
  };
}

function workspaceRecord(workspace: Workspace, sessions: readonly SessionSummary[]): BaseRecord {
  return {
    id: workspace.workspaceId,
    title: workspace.title,
    path: workspace.path,
    sessionCount: sessions.filter((session) => workspace.sessionIds.includes(session.sessionId)).length,
  };
}

export function createDshSurfaceProvider(client: DshClient, activeSessionId: string): SurfaceDataProvider {
  async function listRecords(params: GetListParams): Promise<GetListResult> {
    const pageSize = params.pagination?.pageSize ?? 50;
    if (params.resource === "sessions") {
      const result = await client.listSessions();
      const sessions = result.items.filter((session) => !session.blank);
      return { data: sessions.slice(0, pageSize).map(sessionRecord), total: sessions.length };
    }
    if (params.resource === "workspaces") {
      const [workspaceResult, sessionResult] = await Promise.all([client.listWorkspaces(), client.listSessions()]);
      return {
        data: workspaceResult.items.slice(0, pageSize).map((workspace) => workspaceRecord(workspace, sessionResult.items)),
        total: workspaceResult.items.length,
      };
    }
    if (params.resource === "skills") {
      if (!activeSessionId) return { data: [], total: 0 };
      const result = await client.listSkills(activeSessionId);
      return {
        data: result.skills.slice(0, pageSize).map((skill) => ({
          name: skill.name,
          description: skill.description,
          modelInvocable: skill.modelInvocable,
        })),
        total: result.skills.length,
      };
    }
    if (params.resource === "models") {
      const result = await client.listModelCatalog();
      const models = result.groups.flatMap((group) => group.models.map((model) => ({
        provider: group.id,
        id: model.id,
        name: model.name,
        ...(model.description === undefined ? {} : { description: model.description }),
        ...(model.contextWindow === undefined ? {} : { contextWindow: model.contextWindow }),
        ...(model.maxTokens === undefined ? {} : { maxTokens: model.maxTokens }),
      })));
      return { data: models.slice(0, pageSize), total: models.length };
    }
    if (params.resource === "agentPresets") {
      const result = await client.listAgentPresets();
      return {
        data: result.presets.slice(0, pageSize).map((preset) => ({
          id: preset.id,
          ...(preset.name === undefined ? {} : { name: preset.name }),
          ...(preset.description === undefined ? {} : { description: preset.description }),
          trust: preset.trust,
          isDefault: preset.isDefault,
          ...(preset.broken === undefined ? {} : { broken: preset.broken }),
        })),
        total: result.presets.length,
      };
    }
    if (params.resource === "permissionPresets") {
      const result = await client.permissionCatalog();
      return {
        data: result.options.slice(0, pageSize).map((option) => ({
          id: option.value,
          ...(option.name === undefined ? {} : { name: option.name }),
          ...(option.description === undefined ? {} : { description: option.description }),
        })),
        total: result.options.length,
      };
    }
    if (params.resource === "subagents") {
      if (!activeSessionId) return { data: [], total: 0 };
      const result = await client.listSubagents(activeSessionId);
      return {
        data: result.entries.slice(0, pageSize).map((entry) => ({
          id: entry.id,
          label: "label" in entry ? entry.label || entry.id : entry.id,
          kind: entry.kind,
          ...(entry.kind === "child" ? { activity: entry.activity, mode: entry.mode } : {}),
        })),
        total: result.entries.length,
      };
    }
    throw new Error(`Unsupported Volt surface resource: ${params.resource}`);
  }

  return {
    async getList<TData extends BaseRecord = BaseRecord>(params: GetListParams): Promise<GetListResult<TData>> {
      const result = await listRecords(params);
      return { data: result.data as TData[], total: result.total };
    },
    async getOne<TData extends BaseRecord = BaseRecord>(params: GetOneParams): Promise<GetOneResult<TData>> {
      const result = await listRecords({ resource: params.resource, pagination: { pageSize: 50 } });
      const record = result.data.find((item) => String(item.id) === String(params.id));
      if (!record) throw new Error(`${params.resource} record not found: ${String(params.id)}`);
      return { data: record as TData };
    },
  };
}