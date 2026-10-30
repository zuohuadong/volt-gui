export function createSingleFlight<T, Arguments extends unknown[]>(
  operation: (...args: Arguments) => Promise<T>,
): (...args: Arguments) => Promise<T> {
  let pending: Promise<T> | null = null;
  return (...args: Arguments) => {
    if (pending) return pending;
    pending = operation(...args).finally(() => {
      pending = null;
    });
    return pending;
  };
}

export async function reuseReadyRuntime(pending: Promise<void> | null, isReady: () => boolean): Promise<boolean> {
  if (pending) await pending;
  return isReady();
}

export async function runtimeResponds(client: { call(endpoint: string, args: Record<string, unknown>): Promise<unknown> } | null): Promise<boolean> {
  if (!client) return false;
  try {
    await client.call("session/list", { _request: {} });
    return true;
  } catch {
    // 探测失败只进入恢复流程，不重放可能产生副作用的原请求。
    return false;
  }
}
