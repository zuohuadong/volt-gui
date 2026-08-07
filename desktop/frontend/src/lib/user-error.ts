const INVALID_API_KEY_PATTERN = /(?:invalid[_ -]?api[_ -]?key|incorrect[_ -]?api[_ -]?key|api[_ -]?key.{0,48}(?:missing|invalid|incorrect|not set|not configured|rejected|expired|未配置|未设置|不正确|已过期|无效))/i;
const MODEL_AUTH_CONTEXT_PATTERN = /(?:api[_ -]?key|\b(?:model|provider|llm)\b|模型(?:服务|渠道)?|模型提供商|推理渠道)/i;
const AUTH_FAILURE_PATTERN = /(?:authentication failed|authorization failed|auth(?:entication|orization)? error|unauthori[sz]ed|permission denied|forbidden|\b(?:401|403)\b|认证失败|授权失败|未授权|禁止访问|权限不足)/i;
const CONTEXT_LIMIT_PATTERN = /(?:context.{0,32}(?:limit|length|window|exceed|too long)|maximum context|prompt.{0,20}too long|token limit|max(?:imum)?[_ -]?tokens?[^\n]{0,48}\b0\b|上下文.{0,12}(?:限制|超出|已满))/i;
const TOOL_ARGUMENT_PATTERN = /(?:(?:tool|write_file|arguments?|parameters?).{0,48}(?:json|parse|invalid|unexpected end)|invalid character.{0,32}json|unexpected end of json)/i;
const NETWORK_PATTERN = /(?:timed? out|timeout|connection (?:failed|refused|reset)|network error|no such host|temporary failure)/i;

const FALLBACK_USER_ERROR = "操作失败，请稍后重试；若问题持续，请查看任务日志。";

// Only known business categories may keep a specific user-facing message.
// Each branch returns a fixed string so appended provider details never leak.
const SAFE_BUSINESS_ERRORS: ReadonlyArray<readonly [RegExp, string]> = [
  [/(?:project name already exists|项目名称已存在)/i, "项目名称已存在，请换一个名称。"],
  [/(?:project code already exists|项目编号已存在)/i, "项目编号已存在，请换一个编号。"],
  [/(?:project name.{0,32}(?:too long|characters)|项目名称不能超过)/i, "项目名称过长，请缩短后重试。"],
  [/(?:selected material must be between 1 byte and 64 MiB|资料文件.{0,24}(?:不能超过|大小不符合))/i, "资料文件大小不符合要求，请选择 1 byte 至 64 MiB 的文件。"],
  [/(?:report.{0,32}(?:not|isn't|hasn't).{0,16}approv|报告.{0,24}(?:尚未|未).{0,12}审批)/i, "报告尚未通过审批，暂不能导出。"],
  [/(?:archive detail.{0,24}(?:desktop|unavailable)|归档详情.{0,24}(?:桌面端|不可用))/i, "归档详情当前不可用，请在桌面端重试。"],
];

export function errorText(error: unknown): string {
  if (error instanceof Error) return unwrapNestedMessage(error.message);
  if (typeof error === "string") return unwrapNestedMessage(error);
  if (error && typeof error === "object" && "message" in error) {
    return errorText((error as { message: unknown }).message);
  }
  return "";
}

export function isModelAuthenticationError(error: unknown): boolean {
  const detail = errorText(error);
  if (INVALID_API_KEY_PATTERN.test(detail)) return true;
  return MODEL_AUTH_CONTEXT_PATTERN.test(detail) && AUTH_FAILURE_PATTERN.test(detail);
}

export function isContextLimitError(error: unknown): boolean {
  return CONTEXT_LIMIT_PATTERN.test(errorText(error));
}

export function formatUserError(error: unknown): string {
  const detail = errorText(error);
  if (!detail) return "操作失败，请稍后重试。";
  if (isModelAuthenticationError(detail)) return "API Key 无效或未配置，请前往模型设置检查对应渠道。";
  if (isContextLimitError(detail)) return "当前对话已超出模型上下文限制，请压缩对话或新建会话后重试。";
  if (/agent profile "[^"]+" uses unknown model "[^"]+"/i.test(detail) || detail.startsWith("Agent 绑定的模型当前不可用")) return "Agent 绑定的模型当前不可用，请检查 Agent 配置。";
  if (/agent profile "[^"]+" model is unavailable because provider "[^"]+" is not added/i.test(detail) || detail.startsWith("Agent 依赖的模型渠道尚未添加")) return "Agent 依赖的模型渠道尚未添加，请前往模型设置。";
  if (/agent profile base model "[^"]+" is unavailable/i.test(detail) || detail.startsWith("Agent 基础模型当前不可用")) return "Agent 基础模型当前不可用，请前往模型设置。";
  if (TOOL_ARGUMENT_PATTERN.test(detail) || detail.startsWith("工具参数不完整，")) return "工具参数不完整，本次调用已停止，请重试；若仍失败，请缩短要写入的内容。";
  if (/turn reached the configured protection limit/i.test(detail)) return "本次任务已达到运行保护上限并自动停止；已完成结果已保留，可继续当前任务。";
  if (NETWORK_PATTERN.test(detail) || detail.startsWith("模型服务连接失败或响应超时，")) return "模型服务连接失败或响应超时，请检查网络和渠道状态后重试。";
  if (/(?:turn already running|上一轮任务仍在运行)/i.test(detail)) return "上一轮任务仍在运行，请等待完成或停止后重试。";
  if (/(?:workspace is still starting|工作区正在准备中)/i.test(detail)) return "工作区正在准备中，请稍后重试。";
  if (/^(?:(?:(?:context|operation)\s+)?cancel(?:ed|led)|操作已取消[。.]?)$/i.test(detail)) return "操作已取消。";
  for (const [pattern, message] of SAFE_BUSINESS_ERRORS) {
    if (pattern.test(detail)) return message;
  }
  return FALLBACK_USER_ERROR;
}

function unwrapNestedMessage(value: string): string {
  let detail = value.trim();
  for (let depth = 0; depth < 3 && detail.startsWith("{"); depth += 1) {
    const nested = parsedMessage(detail);
    if (!nested || nested === detail) break;
    detail = nested;
  }
  return detail;
}

function parsedMessage(value: string): string {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object") return value;
    const record = parsed as Record<string, unknown>;
    if (typeof record.message === "string") return record.message.trim();
    if (typeof record.error === "string") return record.error.trim();
    if (record.error && typeof record.error === "object") return errorText(record.error);
  } catch {
    return value;
  }
  return value;
}
