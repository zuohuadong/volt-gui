/** 内联卡片的交互回传：只读选择或本地提交，不是动作或授权凭据。 */
import type { SurfaceInteractionEvent, SurfaceSpec } from "@svadmin/surface";

/** 单条回传消息里记录的最大字符数，避免把整行大字段灌进对话。 */
export const SURFACE_FOLLOW_UP_RECORD_LIMIT = 400;

function widgetTitle(spec: SurfaceSpec, widgetId: string): string {
  const widget = spec.widgets.find((candidate) => candidate.id === widgetId);
  const title = widget?.props?.["title"];
  return typeof title === "string" && title.trim().length > 0 ? title : widgetId;
}

function serializeRecord(record: Readonly<Record<string, unknown>>): string {
  let serialized: string;
  try {
    serialized = JSON.stringify(record) ?? "{}";
  } catch {
    return "{}";
  }
  return serialized.length <= SURFACE_FOLLOW_UP_RECORD_LIMIT
    ? serialized
    : `${serialized.slice(0, SURFACE_FOLLOW_UP_RECORD_LIMIT)}…`;
}

/**
 * 把一次卡片选择变成一条用户消息。宿主仍用普通的提交路径发送它，
 * 不新增权限、凭据或 mutation 通道。
 */
export function buildSurfaceFollowUpMessage(
  event: SurfaceInteractionEvent,
  spec: SurfaceSpec,
  translate: (key: string, params?: Record<string, string | number>) => string,
): string {
  const params = {
    surface: spec.title,
    widget: widgetTitle(spec, event.widgetId),
  };
  return event.type === "submit-values"
    ? translate("surface.submitValuesMessage", { ...params, values: serializeRecord(event.values) })
    : translate("surface.followUpMessage", { ...params, record: serializeRecord(event.record) });
}