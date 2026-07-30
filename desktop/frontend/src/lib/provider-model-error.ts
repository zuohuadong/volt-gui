const NETWORK_PATTERN = /(?:timed? out|timeout|connection (?:failed|refused|reset)|network error|no such host|temporary failure|context deadline exceeded|request failed)/i;

export function formatProviderModelFetchError(error: unknown): string {
  const detail = modelFetchErrorText(error);
  if (/(?:status\s+(?:401|403)\b|has no api key|invalid[_ -]?api[_ -]?key)/i.test(detail)) {
    return "模型列表获取失败：API Key 无效或未填写，请检查后重试。";
  }
  if (NETWORK_PATTERN.test(detail)) {
    return "模型列表获取失败：渠道网络不可达或响应超时，请检查 Base URL 和网络。";
  }
  if (/(?:status\s+(?:404|405)\b|endpoint.{0,24}(?:not found|unsupported))/i.test(detail)) {
    return "模型列表获取失败：渠道不支持当前 /models 接口，请填写模型名或自定义模型接口。";
  }
  if (/(?:status\s+429\b|rate limit|too many requests)/i.test(detail)) {
    return "模型列表获取失败：渠道请求过于频繁，请稍后重试。";
  }
  if (/(?:status\s+5\d\d\b)/i.test(detail)) {
    return "模型列表获取失败：渠道服务暂时异常，请稍后重试。";
  }
  if (/(?:decode response|invalid character|unexpected end of json)/i.test(detail)) {
    return "模型列表获取失败：渠道返回的数据格式不兼容 /models 接口。";
  }
  if (/(?:no base_url|base_url is required|build request)/i.test(detail)) {
    return "模型列表获取失败：Base URL 无效，请检查地址后重试。";
  }
  return "模型列表获取失败，请检查 API 地址、网络和渠道兼容性后重试。";
}

function modelFetchErrorText(error: unknown): string {
  if (error instanceof Error) return error.message.trim();
  if (typeof error === "string") return error.trim();
  if (error && typeof error === "object" && "message" in error) {
    return modelFetchErrorText((error as { message: unknown }).message);
  }
  return "";
}
