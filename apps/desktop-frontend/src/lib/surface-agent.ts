import type {
  BaseRecord,
  GetListParams,
  GetListResult,
  GetOneParams,
  GetOneResult,
} from "@svadmin/core";
import {
  buildSurfaceAgentPrompt,
  parseSurfaceAgentProposal,
  SURFACE_AGENT_SCHEMA_VERSION,
  type SurfaceCatalog,
  type SurfaceDataProvider,
  type SurfacePolicy,
  type SurfaceSpec,
  type SurfaceValidationIssue,
} from "@svadmin/surface";
import { defaultSurfaceCatalog } from "@svadmin/surface/svelte";
import type { DshClient, SessionSummary, Workspace } from "$lib/dsh-client";

export const VOLT_SURFACE_AGENT_SCHEMA = SURFACE_AGENT_SCHEMA_VERSION;
export const VOLT_SURFACE_CATALOG: SurfaceCatalog = defaultSurfaceCatalog;

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

export function parseVoltSurfaceProposal(input: unknown): VoltSurfaceProposalResult {
  return parseSurfaceAgentProposal(input, VOLT_SURFACE_CATALOG, VOLT_SURFACE_POLICY);
}

export function validateStoredSurface(value: unknown): SurfaceSpec | undefined {
  const validation = parseSurfaceAgentProposal({
    schemaVersion: VOLT_SURFACE_AGENT_SCHEMA,
    action: "propose",
    spec: value,
  }, VOLT_SURFACE_CATALOG, VOLT_SURFACE_POLICY);
  return validation.ok ? validation.value.spec : undefined;
}

export function isSurfaceGenerationIntent(text: string): boolean {
  return /(看板|仪表盘|数据面板|运营界面|操作界面|dashboard|surface)/iu.test(text)
    && /(生成|创建|设计|搭建|展示|做一个|做成|generate|create|build)/iu.test(text);
}

export function buildVoltSurfacePrompt(text: string): string {
  return `${buildSurfaceAgentPrompt(text, VOLT_SURFACE_CATALOG, VOLT_SURFACE_POLICY)}\n\n[Volt host policy]\n所有界面只读，必须经过 VoltUI 预览与用户明确确认后才渲染；不要生成或执行 Svelte、HTML、CSS、JavaScript、SQL、URL、事件处理器或 mutation；不要猜测资源、字段或执行任何 mutation。`;
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
