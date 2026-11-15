/**
 * `agentconfig://` 深链解析（#ACB）。
 *
 * 这里只做纯函数：从命令行参数里挑出合法的导入链接，并给出拒绝原因。
 * 协议注册、窗口转发由 main.ts 负责，这样解析逻辑可以脱离 Electron 单测。
 */

export const AGENTCONFIG_SCHEME = "agentconfig";

export type AgentConfigLinkRejection =
  | "not-agentconfig"
  | "malformed"
  | "unsupported-host"
  | "unsupported-version"
  | "missing-bundle";

export type AgentConfigLinkResult =
  | { readonly ok: true; readonly link: string }
  | { readonly ok: false; readonly reason: AgentConfigLinkRejection };

const MAX_LINK_LENGTH = 24_000;

/**
 * 校验一条深链。
 *
 * 只接受 `agentconfig://import?v=1&bundle=…`：`auth/callback` 属于 OAuth 回调，
 * 我们还没有 OAuth 导入流程，因此明确拒绝而不是静默忽略成"没反应"。
 */
export function parseAgentConfigLink(value: string): AgentConfigLinkResult {
  const trimmed = value.trim();
  if (!trimmed.toLowerCase().startsWith(`${AGENTCONFIG_SCHEME}://`)) return { ok: false, reason: "not-agentconfig" };
  if (trimmed.length > MAX_LINK_LENGTH) return { ok: false, reason: "malformed" };
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (url.protocol !== `${AGENTCONFIG_SCHEME}:`) return { ok: false, reason: "not-agentconfig" };
  if (!url.host) return { ok: false, reason: "malformed" };
  if (url.host !== "import") return { ok: false, reason: "unsupported-host" };
  if (url.searchParams.get("v") !== "1") return { ok: false, reason: "unsupported-version" };
  const bundle = url.searchParams.get("bundle");
  if (!bundle) return { ok: false, reason: "missing-bundle" };
  if (bundle.length > 20_000) return { ok: false, reason: "malformed" };
  if (!/^[A-Za-z0-9_-]+$/u.test(bundle)) return { ok: false, reason: "malformed" };
  // scheme 规范化成小写：Windows 的协议名不区分大小写，渲染层与 preload 都按小写匹配，
  // 否则 `AGENTCONFIG://…` 会在这里通过、到渲染层被静默丢掉。
  return { ok: true, link: `agentconfig://${trimmed.slice(`${AGENTCONFIG_SCHEME}://`.length)}` };
}

export type AgentConfigArgvScan = {
  /** 找到的合法导入链接（最多一条，重复出现的同一链接会去重）。 */
  readonly link?: string;
  /** 被拒绝的候选链接及原因，便于写诊断日志。 */
  readonly rejected: readonly { readonly value: string; readonly reason: AgentConfigLinkRejection }[];
};

/**
 * 从 `process.argv` / `second-instance` 的 argv 里挑出深链。
 *
 * Windows 会把链接作为普通参数传进来；打包版还可能是 `--` 之后的第一个参数。
 * 这里只扫以 agentconfig:// 开头的参数，其它参数一律不看。
 */
export function scanAgentConfigArgv(argv: readonly string[]): AgentConfigArgvScan {
  const rejected: { value: string; reason: AgentConfigLinkRejection }[] = [];
  // 同一条 argv 里出现多条时保留最后一条：用户最后点的那次才是他的意图。
  let link: string | undefined;
  for (const argument of argv) {
    if (typeof argument !== "string" || !argument.toLowerCase().startsWith(`${AGENTCONFIG_SCHEME}://`)) continue;
    const result = parseAgentConfigLink(argument);
    if (result.ok) {
      link = result.link;
      continue;
    }
    rejected.push({ value: argument.slice(0, 120), reason: result.reason });
  }
  return { ...(link ? { link } : {}), rejected };
}