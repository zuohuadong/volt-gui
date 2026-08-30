import type {
  BaseRecord,
  GetListParams,
  GetListResult,
  GetOneParams,
  GetOneResult,
} from "@svadmin/core";
import { z } from "zod";
import {
  validateSurfaceSpec,
  type SurfaceCatalog,
  type SurfaceDataProvider,
  type SurfacePolicy,
  type SurfaceSpec,
  type SurfaceValidationIssue,
} from "@svadmin/surface";
import type { DshClient, SessionSummary, Workspace } from "$lib/dsh-client";

export const VOLT_SURFACE_AGENT_SCHEMA = "voltui/surface-proposal-v1" as const;
const fieldSchema = z.string().min(1).max(64).regex(/^[A-Za-z][A-Za-z0-9_-]*$/u);
const metricPropsSchema = z.object({
  label: z.string().min(1).max(80),
  format: z.enum(["number", "currency", "percent"]),
  currency: z.string().regex(/^[A-Z]{3}$/u).optional(),
  description: z.string().min(1).max(160).optional(),
}).strict().superRefine((props, context) => {
  if (props.format === "currency" && !props.currency) {
    context.addIssue({ code: "custom", path: ["currency"], message: "currency 格式必须提供 ISO 货币代码" });
  }
  if (props.format !== "currency" && props.currency) {
    context.addIssue({ code: "custom", path: ["currency"], message: "currency 仅适用于 currency 格式" });
  }
});
const resourceTablePropsSchema = z.object({
  title: z.string().min(1).max(80),
  emptyLabel: z.string().min(1).max(80).optional(),
  columns: z.array(z.object({
    field: fieldSchema,
    label: z.string().min(1).max(60),
    format: z.enum(["text", "number", "date", "boolean"]).optional(),
  }).strict()).min(1).max(8),
}).strict();
const barChartPropsSchema = z.object({
  title: z.string().min(1).max(80),
  labelField: fieldSchema,
  valueField: fieldSchema,
  showValues: z.boolean().optional(),
}).strict();
const lineChartPropsSchema = z.object({
  title: z.string().min(1).max(80),
  labelField: fieldSchema,
  valueField: fieldSchema,
  showDots: z.boolean().optional(),
  fill: z.boolean().optional(),
}).strict();

export const VOLT_SURFACE_CATALOG: SurfaceCatalog = {
  version: "svadmin/v1",
  widgets: [
    { type: "metric", dataKind: "scalar", propsSchema: metricPropsSchema },
    { type: "resource-table", dataKind: "items", propsSchema: resourceTablePropsSchema, getReferencedFields: (props) => resourceTablePropsSchema.parse(props).columns.map((column) => column.field) },
    { type: "bar-chart", dataKind: "items", propsSchema: barChartPropsSchema, getReferencedFields: (props) => { const value = barChartPropsSchema.parse(props); return [value.labelField, value.valueField]; } },
    { type: "line-chart", dataKind: "items", propsSchema: lineChartPropsSchema, getReferencedFields: (props) => { const value = lineChartPropsSchema.parse(props); return [value.labelField, value.valueField]; } },
  ],
};

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
  },
};

export interface VoltSurfaceProposal {
  readonly schemaVersion: typeof VOLT_SURFACE_AGENT_SCHEMA;
  readonly action: "propose";
  readonly summary?: string;
  readonly spec: SurfaceSpec;
}

export type VoltSurfaceProposalResult =
  | { readonly ok: true; readonly value: VoltSurfaceProposal }
  | { readonly ok: false; readonly issues: readonly SurfaceValidationIssue[] };

function invalidProposal(message: string, path = "/"): VoltSurfaceProposalResult {
  return { ok: false, issues: [{ code: "invalid_json", path, message }] };
}

function candidateJson(text: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  return (fenced?.[1] ?? text).trim();
}

export function parseVoltSurfaceProposal(text: string): VoltSurfaceProposalResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidateJson(text));
  } catch {
    return invalidProposal("操作界面 proposal 必须是有效 JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return invalidProposal("proposal 必须是 JSON 对象");
  const envelope = parsed as Record<string, unknown>;
  const allowedKeys = new Set(["schemaVersion", "action", "summary", "spec"]);
  if (Object.keys(envelope).some((key) => !allowedKeys.has(key))) return invalidProposal("proposal 包含未允许字段");
  if (envelope.schemaVersion !== VOLT_SURFACE_AGENT_SCHEMA || envelope.action !== "propose") {
    return invalidProposal("不支持的操作界面 proposal 版本");
  }
  if (envelope.summary !== undefined && (typeof envelope.summary !== "string" || envelope.summary.length > 240)) {
    return invalidProposal("proposal summary 无效", "/summary");
  }
  const validation = validateSurfaceSpec(envelope.spec, VOLT_SURFACE_CATALOG, VOLT_SURFACE_POLICY);
  if (!validation.ok) return validation;
  return {
    ok: true,
    value: {
      schemaVersion: VOLT_SURFACE_AGENT_SCHEMA,
      action: "propose",
      ...(typeof envelope.summary === "string" ? { summary: envelope.summary } : {}),
      spec: validation.value,
    },
  };
}

export function validateStoredSurface(value: unknown): SurfaceSpec | undefined {
  const validation = validateSurfaceSpec(value, VOLT_SURFACE_CATALOG, VOLT_SURFACE_POLICY);
  return validation.ok ? validation.value : undefined;
}

export function isSurfaceGenerationIntent(text: string): boolean {
  return /(看板|仪表盘|数据面板|运营界面|操作界面|dashboard|surface)/iu.test(text)
    && /(生成|创建|设计|搭建|展示|做一个|做成|generate|create|build)/iu.test(text);
}

export function buildVoltSurfacePrompt(text: string): string {
  const resources = Object.entries(VOLT_SURFACE_POLICY.resources)
    .map(([resource, policy]) => `${resource}[${policy.readFields.join(",")}]`)
    .join("；");
  return `${text}\n\n[Volt operation surface protocol]\n如果用户要求生成看板、仪表盘、数据面板或操作界面，只返回一个 fenced JSON proposal，不要生成或执行 Svelte、HTML、CSS、JavaScript、SQL、URL、事件处理器或 mutation。Envelope 必须是 {"schemaVersion":"${VOLT_SURFACE_AGENT_SCHEMA}","action":"propose","summary":"...","spec":{...}}。spec.schemaVersion 必须是 "surface/v1"，spec.catalogVersion 必须是 "${VOLT_SURFACE_CATALOG.version}"。仅允许 widget：metric、resource-table、bar-chart、line-chart。metric props 为 {label,format:number|currency|percent,currency?,description?}；resource-table props 为 {title,emptyLabel?,columns:[{field,label,format?:text|number|date|boolean}]}；bar-chart props 为 {title,labelField,valueField,showValues?}；line-chart props 为 {title,labelField,valueField,showDots?,fill?}。仅允许资源与字段：${resources}。所有界面只读，无法安全表达时说明限制，不要猜测字段。`;
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
