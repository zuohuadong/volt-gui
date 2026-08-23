export interface AppConfig {
  model: string;
  apiKey: string;
  baseURL: string;
  port: number;
  host: '127.0.0.1';
  compactReasoning: boolean;
  degenerationGuard: boolean;
}

export interface AppConfigPatch {
  model?: unknown;
  apiKey?: unknown;
  clearApiKey?: unknown;
  baseURL?: unknown;
  compactReasoning?: unknown;
  degenerationGuard?: unknown;
}

function replacementApiKey(patch: AppConfigPatch): string | undefined {
  if (patch.apiKey === undefined) return undefined;
  if (typeof patch.apiKey !== 'string') throw new Error('API 密钥格式无效。');
  return patch.apiKey.trim() || undefined;
}

function normalizedBaseURL(currentConfig: AppConfig, patch: AppConfigPatch, nextApiKey?: string): string {
  if (patch.baseURL === undefined) return currentConfig.baseURL;
  if (typeof patch.baseURL !== 'string' || !patch.baseURL.trim()) throw new Error('接口地址不能为空。');
  const parsed = new URL(patch.baseURL.trim());
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('接口地址仅支持 HTTP 或 HTTPS。');
  if (parsed.username || parsed.password) throw new Error('接口地址不能包含用户名或密码。');
  const changesOrigin = new URL(currentConfig.baseURL).origin !== parsed.origin;
  const reusesExistingKey = currentConfig.apiKey && nextApiKey === undefined && patch.clearApiKey !== true;
  if (changesOrigin && reusesExistingKey) {
    throw new Error('更换接口地址时必须重新输入 API 密钥或明确清除旧密钥。');
  }
  return parsed.toString().replace(/\/$/, '');
}

export function normalizedConfigPatch(currentConfig: AppConfig, patch: AppConfigPatch): AppConfig {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('运行配置格式无效。');
  const next = { ...currentConfig };
  const nextApiKey = replacementApiKey(patch);

  if (patch.model !== undefined) {
    if (typeof patch.model !== 'string' || !patch.model.trim()) throw new Error('模型名称不能为空。');
    next.model = patch.model.trim();
  }

  next.baseURL = normalizedBaseURL(currentConfig, patch, nextApiKey);
  if (nextApiKey !== undefined) next.apiKey = nextApiKey;
  if (patch.clearApiKey === true) next.apiKey = '';
  if (patch.clearApiKey !== undefined && typeof patch.clearApiKey !== 'boolean') throw new Error('密钥清除选项格式无效。');
  if (patch.compactReasoning !== undefined && typeof patch.compactReasoning !== 'boolean') throw new Error('推理压缩选项格式无效。');
  if (patch.degenerationGuard !== undefined && typeof patch.degenerationGuard !== 'boolean') throw new Error('重复输出保护选项格式无效。');
  if (patch.compactReasoning !== undefined) next.compactReasoning = patch.compactReasoning;
  if (patch.degenerationGuard !== undefined) next.degenerationGuard = patch.degenerationGuard;

  return next;
}
