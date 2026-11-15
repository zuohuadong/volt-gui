// 输入文件大小策略（前端唯一来源）。
//
// 基准是 zai-org/ZCode（apps/zcode-cli/docs/design/v2/message-attachments.md）：
// - 桌面入口优先传 localPath，不把普通文件序列化成 base64；
// - 小文本 64 KiB 内联（INLINE_TEXT_ATTACHMENT_MAX_BYTES）；
// - 图片/媒体内联 20 MiB（INLINE_MEDIA_ATTACHMENT_MAX_BYTES）；
// - 上传通道 20 MiB（PROTOCOL_V4_LIMITS.attachmentMaxBytes），分块 512 KiB × 64；
// - 2 GiB 只作为 stat / 路径引用上限（attachmentStatMaxBytes），不用于搬字节。
//
// 我们的上传 RPC 是单次 base64，没有分块，所以「上传预算」直接取 ZCode 的
// 通道上限 20 MiB；更大的文件一律转成 "@路径" 引用，由模型用文件工具读取。
// 任何改动都要同步 apps/desktop-electron/src/file-limits.ts，并由
// scripts/file-limits.test.mjs 交叉校验两份常量。

export const GIB = 1024 * 1024 * 1024;
export const MIB = 1024 * 1024;
export const KIB = 1024;

/** 单个输入文件上限（stat/引用）：2 GiB。 */
export const MAX_INPUT_FILE_BYTES = 2 * GIB;
/** 一次提交内所有输入文件合计上限：2 GiB。 */
export const MAX_INPUT_TOTAL_BYTES = 2 * GIB;
/** 单次 base64 上传预算：20 MiB（对齐 ZCode 上传通道上限）。 */
export const MAX_INLINE_UPLOAD_BYTES = 20 * MIB;
/** 小文本内联阈值：64 KiB（对齐 ZCode INLINE_TEXT_ATTACHMENT_MAX_BYTES）。 */
export const MAX_INLINE_TEXT_BYTES = 64 * KIB;
/** 图片内联阈值：20 MiB（对齐 ZCode INLINE_MEDIA_ATTACHMENT_MAX_BYTES）。 */
export const MAX_INLINE_IMAGE_BYTES = 20 * MIB;

export function isInlineUploadSizeAllowed(bytes: number): boolean {
  return Number.isSafeInteger(bytes) && bytes >= 0 && bytes <= MAX_INLINE_UPLOAD_BYTES;
}

export type InlineBudgetInput = {
  /** 主进程报告的可用内存字节数（os.freemem）。 */
  freeMemoryBytes?: number;
  /** 渲染进程 navigator.deviceMemory（GiB）。 */
  deviceMemoryGiB?: number;
};

/**
 * 实际可用的内联上传预算。
 *
 * 20 MiB 是「协议允许」的上限；真实机器还要留出内存余量，所以按可用内存
 * 收缩（峰值约为文件的 4.7 倍），下限 4 MiB，永不放大到 20 MiB 以上。
 */
/** 读取浏览器暴露的设备内存（GiB）；不支持时返回 undefined。 */
export function deviceMemoryGiB(): number | undefined {
  const value = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

export function resolveInlineUploadBudget(input: InlineBudgetInput = {}): number {
  const ceiling = MAX_INLINE_UPLOAD_BYTES;
  const free = input.freeMemoryBytes;
  if (typeof free === "number" && Number.isFinite(free) && free > 0) {
    return Math.min(ceiling, Math.max(4 * MIB, Math.floor(free / 16)));
  }
  const device = input.deviceMemoryGiB;
  if (typeof device === "number" && Number.isFinite(device) && device > 0) {
    return device <= 4 ? 8 * MIB : ceiling;
  }
  return ceiling;
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes >= GIB) {
    const value = bytes / GIB;
    return `${Number.isInteger(value) ? value : value.toFixed(1)} GB`;
  }
  if (bytes >= MIB) {
    const value = bytes / MIB;
    return `${Number.isInteger(value) ? value : value.toFixed(1)} MB`;
  }
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${Math.round(bytes)} B`;
}
