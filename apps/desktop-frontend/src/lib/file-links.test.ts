import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { displayFileName, extractBareFileMentions, isLocalFilePath, splitLocalFileLinks, stripInternalPlaceholders } from "./file-links";

describe("deliverable file links", () => {
  it("recognizes Windows, UNC and POSIX paths but not web links", () => {
    expect(isLocalFilePath("C:\\Users\\demo\\Anyong Workspace\\交付核对.md")).toBe(true);
    expect(isLocalFilePath("c:/tmp/report.md")).toBe(true);
    expect(isLocalFilePath("\\\\nas\\share\\doc.md")).toBe(true);
    expect(isLocalFilePath("/Users/demo/report.md")).toBe(true);
    expect(isLocalFilePath("https://example.com/a.md")).toBe(false);
    expect(isLocalFilePath("mailto:a@b.c")).toBe(false);
    expect(isLocalFilePath("交付核对.md")).toBe(false);
  });

  it("strips the raw markdown link and keeps the surrounding sentence", () => {
    const input = "第一阶段已写入[_交付核对.md](C:\\Users\\27852\\Documents\\Anyong Workspace\\交付核对.md)。";
    const { text, links } = splitLocalFileLinks(input);
    expect(links).toEqual([{ label: "交付核对.md", path: "C:\\Users\\27852\\Documents\\Anyong Workspace\\交付核对.md" }]);
    expect(text).toBe("第一阶段已写入。");
    expect(text).not.toContain("C:\\Users");
    expect(text).not.toContain("[");
  });

  it("keeps http links and fenced code untouched", () => {
    const input = "见[文档](https://example.com/a.md)\n\n```md\n[x](C:\\tmp\\x.md)\n```";
    const { text, links } = splitLocalFileLinks(input);
    expect(links).toHaveLength(0);
    expect(text).toContain("https://example.com/a.md");
    expect(text).toContain("(C:\\tmp\\x.md)");
  });

  it("normalizes labels and falls back to the file name", () => {
    expect(displayFileName("_交付核对.md", "C:\\tmp\\交付核对.md")).toBe("交付核对.md");
    expect(displayFileName("", "C:\\tmp\\notes.md")).toBe("notes.md");
    expect(displayFileName("", "/var/tmp/_draft.md")).toBe("draft.md");
  });
});

describe("deliverable rendering contract", () => {
  const transcript = readFileSync(new URL("../components/ConversationTranscript.svelte", import.meta.url), "utf8");

  it("renders deliverable files as clickable chips instead of raw markdown", () => {
    expect(transcript).toContain("splitLocalFileLinks(segment.text)");
    expect(transcript).toContain('class="deliverable-chip"');
    expect(transcript).toContain("void client.openPath(path)");
    expect(transcript).toContain('t("transcript.openFileFailed")');
  });

  it("never prints the absolute path in the chip label", () => {
    expect(transcript).toContain("<span>{file.label}</span>");
    expect(transcript).not.toContain("<span>{file.path}</span>");
    expect(transcript).toContain("title={t(\"transcript.openFile\")}");
  });
});

describe("internal placeholders never reach the screen (#355)", () => {
  it("drops bracketed placeholders that replaced a file link", () => {
    expect(stripInternalPlaceholders("文件已创建：回归核对.md [blocked]")).toBe("文件已创建：回归核对.md");
    expect(stripInternalPlaceholders("引用：_withdraw_notes.md [blocked] 第 21-25 行")).toBe("引用：_withdraw_notes.md 第 21-25 行");
    // 普通方括号内容（用户自己写的）保持原样。
    expect(stripInternalPlaceholders("注意[TODO]之后再补")).toBe("注意[TODO]之后再补");
  });

  it("strips the placeholder from rendered segments too", () => {
    const split = splitLocalFileLinks("已生成 回归核对.md [blocked]");
    expect(split.text).toBe("已生成 回归核对.md");
    expect(split.links).toEqual([]);
  });

  it("finds bare file names so they can become clickable entries", () => {
    expect(extractBareFileMentions("文件已创建：回归核对.md，内容只有一句。")).toEqual(["回归核对.md"]);
    expect(extractBareFileMentions("引用：_withdraw_notes.md 第 21-25 行")).toEqual(["_withdraw_notes.md"]);
    expect(extractBareFileMentions("没有提到任何文件")).toEqual([]);
  });
});
