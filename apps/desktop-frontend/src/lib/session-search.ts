// 会话列表搜索：只在标题与工作目录上做大小写不敏感的子串匹配，
// 空查询（含纯空格）表示不过滤，保证 Esc/清除后一定能回到完整列表。

export type SessionSearchAccessors<T> = {
  title: (session: T) => string;
  cwd?: (session: T) => string | null | undefined;
};

export function normalizeSessionQuery(query: string): string {
  return query.trim().toLowerCase();
}

export function matchesSessionQuery<T>(
  session: T,
  query: string,
  accessors: SessionSearchAccessors<T>,
): boolean {
  const needle = normalizeSessionQuery(query);
  if (!needle) return true;
  const title = accessors.title(session) ?? "";
  const cwd = accessors.cwd?.(session) ?? "";
  return `${title}`.toLowerCase().includes(needle) || `${cwd}`.toLowerCase().includes(needle);
}

export function filterSessionsByQuery<T>(
  sessions: readonly T[],
  query: string,
  accessors: SessionSearchAccessors<T>,
): readonly T[] {
  // 空查询返回同一个数组引用，避免下游 derived 反复重建列表。
  if (!normalizeSessionQuery(query)) return sessions;
  return sessions.filter((session) => matchesSessionQuery(session, query, accessors));
}