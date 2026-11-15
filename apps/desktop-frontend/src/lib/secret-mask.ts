/**
 * 发送前的凭据遮蔽（模式匹配版）。
 *
 * 官方 `ui-secret-mask` 在客户端把**已识别**凭据换成掩码；我们的渲染层拿不到
 * 凭据值（官方只暴露 `credentials.describe/set/unset`），所以这里只能按已知的
 * 密钥形态做保守匹配。它不承诺"所有密钥都会被遮住"——这是近似防护，不是官方
 * 那套基于凭据库的判定，界面必须如实说明遮了几处。
 */

export type MaskResult = {
  text: string;
  /** 被遮蔽的片段数量。 */
  masked: number;
};

/** 已知密钥前缀：命中即整段替换，保留前几位便于用户辨认是哪一个。 */
const PREFIX_PATTERNS: ReadonlyArray<{ prefix: string; body: RegExp }> = [
  { prefix: "sk-ant-", body: /sk-ant-[A-Za-z0-9_-]{16,}/gu },
  { prefix: "sk-proj-", body: /sk-proj-[A-Za-z0-9_-]{16,}/gu },
  { prefix: "sk-", body: /sk-[A-Za-z0-9_-]{20,}/gu },
  { prefix: "ghp_", body: /ghp_[A-Za-z0-9]{20,}/gu },
  { prefix: "github_pat_", body: /github_pat_[A-Za-z0-9_]{20,}/gu },
  { prefix: "xoxb-", body: /xox[abpr]-[A-Za-z0-9-]{10,}/gu },
  { prefix: "AKIA", body: /AKIA[0-9A-Z]{16}/gu },
  { prefix: "AIza", body: /AIza[0-9A-Za-z_-]{30,}/gu },
];

/** `Bearer <token>`、`api_key=...` 这类带标签的赋值。 */
const LABELLED_PATTERNS: ReadonlyArray<RegExp> = [
  /\b(Bearer\s+)[A-Za-z0-9._~+/-]{12,}=*/gu,
  /\b((?:api[_-]?key|access[_-]?token|secret[_-]?key|client[_-]?secret|password)\s*[:=]\s*["']?)[A-Za-z0-9._~+/-]{12,}["']?/giu,
];

const PRIVATE_KEY_BLOCK = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gu;

/** 保留可辨认的前缀与结尾，中间全部替换。 */
function maskValue(value: string, keepPrefix: number): string {
  const prefix = value.slice(0, Math.min(keepPrefix, value.length));
  return `${prefix}••••••`;
}

export function maskSecrets(text: string): MaskResult {
  if (!text) return { text, masked: 0 };
  let masked = 0;
  let output = text.replace(PRIVATE_KEY_BLOCK, () => {
    masked += 1;
    return "-----BEGIN PRIVATE KEY-----••••••";
  });
  for (const { prefix, body } of PREFIX_PATTERNS) {
    output = output.replace(body, (match) => {
      masked += 1;
      return maskValue(match, prefix.length);
    });
  }
  for (const pattern of LABELLED_PATTERNS) {
    output = output.replace(pattern, (_match, label: string) => {
      masked += 1;
      return `${label}••••••`;
    });
  }
  return { text: output, masked };
}