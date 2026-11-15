/**
 * 斜杠命令的纯逻辑：Host 命令目录（官方 `commands.list`）+ 本地触发判定。
 *
 * 命令面全部来自官方 Host：这里不注册、不缓存命令定义，只决定"什么时候该显示
 * 菜单"和"这一行该交给 `commands.execute` 还是当普通提示词发送"。
 */

export type HostCommand = {
  /** 不带前导斜杠的小写命令名。 */
  name: string;
  description?: string;
  /** 官方声明的输入提示；有输入的命令允许带参数。 */
  input?: string;
};

export type SlashCandidate = {
  kind: "host-command" | "skill";
  name: string;
  description: string;
  /** 有输入提示的命令在补全后保留尾随空格，方便继续输入参数。 */
  needsInput: boolean;
};

// 官方命令名语法（`dsh-commands/src/index.ts` 的 `COMMAND_NAME`）允许下划线。
const COMMAND_NAME = /^[a-z][a-z0-9_-]{0,63}$/u;

/** 一条命令行最多这么长；更长的一律按普通提示词处理。 */
export const MAX_COMMAND_LINE = 4096;

/** 从官方目录里筛掉形状不对的行，避免渲染层因为一条脏数据整块失败。 */
export function normalizeCommands(value: unknown): HostCommand[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const commands: HostCommand[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name.trim().toLowerCase() : "";
    if (!COMMAND_NAME.test(name) || seen.has(name)) continue;
    seen.add(name);
    const description = typeof record.description === "string" ? record.description.trim() : "";
    // 官方 `input` 是 `{ hint, attachments? }`；历史上也出现过纯字符串，两种都接受。
    const rawInput = record.input;
    const hint = typeof rawInput === "string"
      ? rawInput.trim()
      : rawInput && typeof rawInput === "object" && !Array.isArray(rawInput) && typeof (rawInput as Record<string, unknown>).hint === "string"
        ? String((rawInput as Record<string, unknown>).hint).trim()
        : "";
    commands.push({ name, ...(description ? { description } : {}), ...(hint ? { input: hint } : {}) });
  }
  return commands.sort((left, right) => left.name.localeCompare(right.name));
}

/**
 * 这段草稿是否正在输入一条命令？
 *
 * 只在"整段草稿以 `/` 开头、且还没有空白"时成立：带空格的已经是参数输入，
 * 多行草稿是普通文本。返回的 `query` 是斜杠后面的部分。
 */
export function commandDraftQuery(draft: string): { query: string } | null {
  if (!draft.startsWith("/") || draft.length > MAX_COMMAND_LINE) return null;
  if (/[\s\n]/u.test(draft)) return null;
  return { query: draft.slice(1) };
}

/** 解析一行命令行；不是命令形状时返回 null。 */
export function parseCommandLine(line: string): { name: string; args: string } | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("/") || trimmed.length > MAX_COMMAND_LINE) return null;
  const body = trimmed.slice(1);
  const separator = body.search(/\s/u);
  const name = (separator === -1 ? body : body.slice(0, separator)).toLowerCase();
  if (!COMMAND_NAME.test(name)) return null;
  return { name, args: separator === -1 ? "" : body.slice(separator + 1).trim() };
}

/**
 * 这一行是否应该交给官方命令执行器？
 *
 * 只有目录里确实存在这个命令时才拦截：拼错的 `/foo` 仍然按普通提示词发送，
 * 否则用户会看到一句"命令不存在"，而他其实只是想写一段以斜杠开头的文字。
 */
export function isHostCommandLine(line: string, commands: readonly HostCommand[]): boolean {
  const parsed = parseCommandLine(line);
  if (!parsed) return false;
  return commands.some((command) => command.name === parsed.name);
}

/** 命令菜单候选：Host 命令在前，技能命令在后，同名的以 Host 命令为准。 */
export function slashCandidates(
  commands: readonly HostCommand[],
  skills: readonly { name: string; description?: string }[],
  query: string,
): SlashCandidate[] {
  const needle = query.trim().toLowerCase();
  const candidates: SlashCandidate[] = [];
  const seen = new Set<string>();
  for (const command of commands) {
    if (!command.name.toLowerCase().includes(needle)
      && !(command.description ?? "").toLowerCase().includes(needle)) continue;
    seen.add(command.name.toLowerCase());
    candidates.push({
      kind: "host-command",
      name: command.name,
      description: command.description || command.input || "",
      needsInput: Boolean(command.input),
    });
  }
  for (const skill of skills) {
    const name = typeof skill.name === "string" ? skill.name.trim() : "";
    if (!COMMAND_NAME.test(name.toLowerCase()) || seen.has(name.toLowerCase())) continue;
    if (!name.toLowerCase().includes(needle) && !(skill.description ?? "").toLowerCase().includes(needle)) continue;
    seen.add(name.toLowerCase());
    candidates.push({ kind: "skill", name, description: skill.description || "", needsInput: false });
  }
  // 前缀命中优先，其余保持目录顺序（Host 命令已按字母排序）。
  const prefix = (item: SlashCandidate) => (item.name.toLowerCase().startsWith(needle) ? 0 : 1);
  return candidates.sort((left, right) => prefix(left) - prefix(right));
}

/** 把选中的候选写回草稿。 */
export function applySlashCandidate(candidate: SlashCandidate): string {
  return `/${candidate.name}${candidate.needsInput ? " " : ""}`;
}