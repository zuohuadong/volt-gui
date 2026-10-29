import { rm } from "node:fs/promises";

export async function removeIntegrationTree(directory, {
  platform = process.platform,
  remove = rm,
  warn = console.warn,
} = {}) {
  try {
    await remove(directory, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
  } catch (error) {
    // Windows 子进程退出后可能短暂持有目录；其他平台/错误仍然影响测试结论。
    if (platform !== "win32" || !["EBUSY", "ENOTEMPTY", "EPERM"].includes(error?.code)) throw error;
    warn(`Temporary DSH test directory remains locked after cleanup retries (${error.code}): ${directory}`);
  }
}
