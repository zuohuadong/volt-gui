import { describe, expect, it, vi } from "vitest";
import { MAX_INLINE_IMAGE_BYTES, MAX_INLINE_UPLOAD_BYTES, MAX_INPUT_FILE_BYTES, MAX_INPUT_TOTAL_BYTES, formatFileSize } from "./file-limits";
import { describeFileRejection, formatFileReference, planFileInput } from "./attachment-plan";

// 大文件不再走 base64 单请求：超过 inline 预算改成 "@路径" 引用，只有拿不到路径才拒绝。
function fakeFile(name: string, size: number): File {
  return { name, size, type: "", lastModified: 0 } as unknown as File;
}

const translate = (key: string, params?: Record<string, string | number>) => `${key}:${JSON.stringify(params ?? {})}`;

describe("file input planning", () => {
  it("uploads small files and references files above the inline budget", () => {
    const small = fakeFile("note.docx", 8 * 1024 * 1024);
    const large = fakeFile("report.pdf", MAX_INLINE_UPLOAD_BYTES + 1);
    const plan = planFileInput([small, large], { resolvePath: () => "C:\\资料\\report.pdf" });

    expect(plan.uploads).toEqual([small]);
    expect(plan.references).toEqual([{ file: large, path: "C:\\资料\\report.pdf" }]);
    expect(plan.rejections).toEqual([]);
  });

  it("rejects a large file when its local path cannot be resolved", () => {
    const large = fakeFile("report.pdf", MAX_INLINE_UPLOAD_BYTES + 1);
    for (const resolvePath of [() => "", () => "   ", () => { throw new Error("bridge failed"); }]) {
      const plan = planFileInput([large], { resolvePath });
      expect(plan.references).toEqual([]);
      expect(plan.rejections).toEqual([{ name: "report.pdf", size: large.size, reason: "no-path" }]);
    }
  });

  it("rejects files above 2 GiB and batches above 2 GiB in total", () => {
    const oversized = fakeFile("huge.iso", MAX_INPUT_FILE_BYTES + 1);
    expect(planFileInput([oversized]).rejections).toEqual([
      { name: "huge.iso", size: oversized.size, reason: "too-large" },
    ]);

    const chunk = fakeFile("part1.docx", MAX_INLINE_UPLOAD_BYTES);
    const chunkTwo = fakeFile("part2.docx", MAX_INLINE_UPLOAD_BYTES);
    const plan = planFileInput([chunk, chunkTwo], { maxTotalBytes: MAX_INLINE_UPLOAD_BYTES + 1 });
    expect(plan.uploads).toEqual([chunk]);
    expect(plan.rejections).toEqual([{ name: "part2.docx", size: chunkTwo.size, reason: "total-too-large" }]);
    expect(MAX_INPUT_TOTAL_BYTES).toBe(MAX_INPUT_FILE_BYTES);
  });

  it("keeps the documented 2 GiB ceiling and 20 MiB inline budget", () => {
    expect(MAX_INPUT_FILE_BYTES).toBe(2 * 1024 * 1024 * 1024);
    expect(MAX_INLINE_UPLOAD_BYTES).toBe(20 * 1024 * 1024);
    // 2 GiB 的文件本身可以被引用，但绝不能进入 base64 上传分支。
    const plan = planFileInput([fakeFile("big.bin", MAX_INPUT_FILE_BYTES)], { resolvePath: () => "/data/big.bin" });
    expect(plan.uploads).toEqual([]);
    expect(plan.references).toHaveLength(1);
  });
});

describe("file reference formatting", () => {
  it("quotes paths with spaces and JSON-escapes quotes", () => {
    expect(formatFileReference("/work/a.docx")).toBe("@/work/a.docx");
    expect(formatFileReference("C:\\my files\\a.docx")).toBe('@"C:\\my files\\a.docx"');
    expect(formatFileReference('/work/a"b.docx')).toBe('"/work/a\\"b.docx"');
    expect(formatFileReference("/work/a\nb.docx")).toBe('"/work/a\\nb.docx"');
  });
});

describe("file rejection messages", () => {
  it("names the file, its size and the configured limit", () => {
    const tooLarge = describeFileRejection({ name: "a.docx", size: MAX_INPUT_FILE_BYTES + 1, reason: "too-large" }, translate);
    expect(tooLarge).toContain("composer.fileTooLarge");
    expect(tooLarge).toContain("a.docx");
    expect(tooLarge).toContain("2 GB");

    const noPath = describeFileRejection({ name: "b.pdf", size: MAX_INLINE_UPLOAD_BYTES + 1, reason: "no-path" }, translate);
    expect(noPath).toContain("composer.fileReferenceUnavailable");
    expect(noPath).toContain(formatFileSize(MAX_INLINE_UPLOAD_BYTES));

    const total = describeFileRejection({ name: "c.zip", size: 10, reason: "total-too-large" }, translate);
    expect(total).toContain("composer.fileTotalTooLarge");
    expect(total).toContain("2 GB");
  });

  it("keeps images inline only below the image budget and asks for compression otherwise", () => {
    const small = fakeFile("shot.png", 8 * 1024 * 1024);
    const huge = fakeFile("huge.png", MAX_INLINE_IMAGE_BYTES + 1);
    const isImage = (file: File) => file.name.endsWith(".png");

    // 有路径：超大图片转引用，不内联 base64。
    const referenced = planFileInput([small, huge], { isImage, resolvePath: () => "/data/huge.png" });
    expect(referenced.uploads).toEqual([small]);
    expect(referenced.references).toHaveLength(1);
    expect(referenced.rejections).toEqual([]);

    // 没有路径：提示压缩，而不是建议"拆分"。
    const rejected = planFileInput([huge], { isImage, resolvePath: () => "" });
    expect(rejected.rejections).toEqual([{ name: "huge.png", size: huge.size, reason: "image-too-large" }]);
    const message = describeFileRejection(rejected.rejections[0], translate);
    expect(message).toContain("composer.imageTooLarge");
    expect(message).toContain("20 MB");
  });

  it("honours an adaptive inline budget instead of the fixed ceiling", () => {
    const file = fakeFile("mid.docx", 12 * 1024 * 1024);
    // 内存紧张时预算降到 8 MiB：12 MB 的文件必须改成路径引用。
    const tight = planFileInput([file], { inlineUploadBytes: 8 * 1024 * 1024, resolvePath: () => "/w/mid.docx" });
    expect(tight.uploads).toEqual([]);
    expect(tight.references).toHaveLength(1);
    const loose = planFileInput([file], { inlineUploadBytes: 20 * 1024 * 1024 });
    expect(loose.uploads).toEqual([file]);
  });

  it("never reports a rejection path for files it accepts", () => {
    const plan = planFileInput([fakeFile("ok.docx", 1024)], { resolvePath: vi.fn() });
    expect(plan.rejections).toEqual([]);
    expect(plan.uploads).toHaveLength(1);
  });
});