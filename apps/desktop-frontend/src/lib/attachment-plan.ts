// 输入文件提交计划：决定哪些文件真正上传字节、哪些改成工作区路径引用。
//
// 参考 zai-org/ZCode：桌面入口优先 localPath，只有小文件才内联；媒体内联 20 MiB、
// 小文本 64 KiB，2 GiB 只作为 stat/引用上限。我们这里的分档：
// - ≤ 实际内联预算（默认 20 MiB，按可用内存收缩）且拿得到字节 → 上传；
// - 其余一律 "@路径" 引用（图片超出内联阈值时提示压缩或引用）；
// - 超过 2 GiB 或拿不到路径才拒绝。
import {
  MAX_INLINE_IMAGE_BYTES,
  MAX_INLINE_UPLOAD_BYTES,
  MAX_INPUT_FILE_BYTES,
  MAX_INPUT_TOTAL_BYTES,
  formatFileSize,
} from "./file-limits";

export type FileInputRejectionReason = "too-large" | "total-too-large" | "no-path" | "image-too-large";

export type FileInputRejection = {
  name: string;
  size: number;
  reason: FileInputRejectionReason;
};

export type FileInputPlan = {
  /** 需要读取字节并上传的文件。 */
  uploads: File[];
  /** 改为 "@路径" 引用的文件（不复制内容）。 */
  references: { file: File; path: string }[];
  rejections: FileInputRejection[];
};

export type FileInputOptions = {
  /** 把 File 解析成本机绝对路径；拿不到时返回空字符串。 */
  resolvePath?: (file: File) => string;
  /** 是否按图片处理（图片超过内联阈值时提示压缩而不是拆分）。 */
  isImage?: (file: File) => boolean;
  maxFileBytes?: number;
  maxTotalBytes?: number;
  inlineUploadBytes?: number;
  inlineImageBytes?: number;
};

/** 把路径写成模型可识别的引用：含空白用 @"..."，含引号用 JSON 文本。 */
export function formatFileReference(path: string): string {
  if (/["\r\n]/u.test(path)) return JSON.stringify(path);
  return /\s/u.test(path) ? `@"${path}"` : `@${path}`;
}

export function planFileInput(files: readonly File[], options: FileInputOptions = {}): FileInputPlan {
  const maxFileBytes = options.maxFileBytes ?? MAX_INPUT_FILE_BYTES;
  const maxTotalBytes = options.maxTotalBytes ?? MAX_INPUT_TOTAL_BYTES;
  const inlineUploadBytes = options.inlineUploadBytes ?? MAX_INLINE_UPLOAD_BYTES;
  const inlineImageBytes = options.inlineImageBytes ?? MAX_INLINE_IMAGE_BYTES;
  const plan: FileInputPlan = { uploads: [], references: [], rejections: [] };
  let total = 0;
  for (const file of files) {
    const size = Number(file.size) || 0;
    const image = options.isImage?.(file) === true;
    if (size > maxFileBytes) {
      plan.rejections.push({ name: file.name, size, reason: "too-large" });
      continue;
    }
    total += size;
    if (total > maxTotalBytes) {
      plan.rejections.push({ name: file.name, size, reason: "total-too-large" });
      continue;
    }
    const inlineBudget = image ? Math.min(inlineUploadBytes, inlineImageBytes) : inlineUploadBytes;
    if (size <= inlineBudget) {
      plan.uploads.push(file);
      continue;
    }
    let path = "";
    try {
      path = options.resolvePath?.(file) ?? "";
    } catch {
      path = "";
    }
    if (!path.trim()) {
      // 图片没有路径时只能提示压缩，不能建议用户"拆分"一张图片。
      plan.rejections.push({ name: file.name, size, reason: image ? "image-too-large" : "no-path" });
      continue;
    }
    plan.references.push({ file, path: path.trim() });
  }
  return plan;
}

type Translate = (key: string, params?: Record<string, string | number>) => string;

export function describeFileRejection(rejection: FileInputRejection, translate: Translate): string {
  const size = formatFileSize(rejection.size);
  if (rejection.reason === "too-large") {
    return translate("composer.fileTooLarge", { name: rejection.name, size, limit: formatFileSize(MAX_INPUT_FILE_BYTES) });
  }
  if (rejection.reason === "total-too-large") {
    return translate("composer.fileTotalTooLarge", { name: rejection.name, limit: formatFileSize(MAX_INPUT_TOTAL_BYTES) });
  }
  if (rejection.reason === "image-too-large") {
    return translate("composer.imageTooLarge", { name: rejection.name, size, limit: formatFileSize(MAX_INLINE_IMAGE_BYTES) });
  }
  return translate("composer.fileReferenceUnavailable", { name: rejection.name, size, limit: formatFileSize(MAX_INLINE_UPLOAD_BYTES) });
}