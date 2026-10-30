export function createCredentialMutationQueue() {
  let pending: Promise<void> = Promise.resolve();
  return function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const completion = pending.then(operation);
    // 只恢复队列尾部；调用方仍收到原始失败，失败的写入不会被重放。
    pending = completion.then(() => undefined, () => undefined);
    return completion;
  };
}
