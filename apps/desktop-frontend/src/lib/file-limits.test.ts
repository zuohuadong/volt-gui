import { describe, expect, it } from "vitest";
import {
  GIB,
  MAX_INLINE_IMAGE_BYTES,
  MAX_INLINE_TEXT_BYTES,
  MAX_INLINE_UPLOAD_BYTES,
  MAX_INPUT_FILE_BYTES,
  MAX_INPUT_TOTAL_BYTES,
  MIB,
  KIB,
  formatFileSize,
  resolveInlineUploadBudget,
} from "./file-limits";

// 输入大小策略的回归锁：数值基准是 zai-org/ZCode 的附件策略
// （小文本 64 KiB、媒体内联 20 MiB、上传通道 20 MiB、stat 上限 2 GiB）。
describe("input file size policy", () => {
  it("caps the stat/reference ceiling at 2 GiB", () => {
    expect(MAX_INPUT_FILE_BYTES).toBe(2 * 1024 * 1024 * 1024);
    expect(MAX_INPUT_FILE_BYTES).toBe(2 * GIB);
    expect(MAX_INPUT_TOTAL_BYTES).toBe(MAX_INPUT_FILE_BYTES);
  });

  it("matches ZCode inline budgets for uploads, images and text", () => {
    expect(MAX_INLINE_UPLOAD_BYTES).toBe(20 * MIB);
    expect(MAX_INLINE_IMAGE_BYTES).toBe(20 * MIB);
    expect(MAX_INLINE_TEXT_BYTES).toBe(64 * KIB);
    // base64 膨胀 4/3 之后仍在字符串可承载范围内。
    expect(Math.ceil((MAX_INLINE_UPLOAD_BYTES * 4) / 3)).toBeLessThan(32 * MIB);
  });

  it("shrinks the inline budget on memory-constrained machines", () => {
    // 没有信号时用协议上限。
    expect(resolveInlineUploadBudget()).toBe(MAX_INLINE_UPLOAD_BYTES);
    // 可用内存充足：仍以 20 MiB 为上限，不会放大。
    expect(resolveInlineUploadBudget({ freeMemoryBytes: 8 * GIB })).toBe(MAX_INLINE_UPLOAD_BYTES);
    // 可用内存 512 MiB：收缩到 32 MiB 仍被压回 20 MiB 以内。
    expect(resolveInlineUploadBudget({ freeMemoryBytes: 512 * MIB })).toBe(MAX_INLINE_UPLOAD_BYTES);
    // 可用内存 256 MiB：16 MiB。
    expect(resolveInlineUploadBudget({ freeMemoryBytes: 256 * MIB })).toBe(16 * MIB);
    // 极低内存：不低于 4 MiB。
    expect(resolveInlineUploadBudget({ freeMemoryBytes: 8 * MIB })).toBe(4 * MIB);
    // 只有 deviceMemory 时：4 GiB 机器降到 8 MiB，其它保持 20 MiB。
    expect(resolveInlineUploadBudget({ deviceMemoryGiB: 4 })).toBe(8 * MIB);
    expect(resolveInlineUploadBudget({ deviceMemoryGiB: 16 })).toBe(MAX_INLINE_UPLOAD_BYTES);
    // 非法输入不放大也不报错。
    expect(resolveInlineUploadBudget({ freeMemoryBytes: -1, deviceMemoryGiB: 0 })).toBe(MAX_INLINE_UPLOAD_BYTES);
  });

  it("formats sizes for the user-facing limit messages", () => {
    expect(formatFileSize(MAX_INPUT_FILE_BYTES)).toBe("2 GB");
    expect(formatFileSize(MAX_INLINE_UPLOAD_BYTES)).toBe("20 MB");
    expect(formatFileSize(1536 * MIB)).toBe("1.5 GB");
    expect(formatFileSize(5 * MIB)).toBe("5 MB");
    expect(formatFileSize(2048)).toBe("2 KB");
    expect(formatFileSize(0)).toBe("0 B");
    expect(formatFileSize(Number.NaN)).toBe("0 B");
  });
});
