import { describe, expect, it } from "vitest";
import { QUOTE_MAX_CHARS, appendQuoteToDraft, buildQuoteReference, normalizeQuoteText } from "./quote-reference";

describe("selection quoting", () => {
  it("keeps the selected text verbatim and only fixes HTML trailing spaces", () => {
    expect(normalizeQuoteText("  assert\"a\\\\b\"  \r\n\tsecond   line\t\n")).toBe("  assert\"a\\\\b\"\n\tsecond   line");
    // 连续空行压缩，但行内空格一个都不动。
    expect(normalizeQuoteText("a\n\n\n\nb")).toBe("a\n\nb");
  });

  it("labels the source and keeps every line inside the quote block", () => {
    const quote = buildQuoteReference({ text: "第一步\n\n第二步", role: "assistant" });
    expect(quote.ok).toBe(true);
    expect(quote.text).toBe("> 引用助手原文：\n> 第一步\n>\n> 第二步");
    expect(buildQuoteReference({ text: "hi", role: "user" }).text).toContain("引用我原文");
  });

  it("refuses an empty selection", () => {
    expect(buildQuoteReference({ text: "   \n\t", role: "assistant" })).toEqual({ ok: false, text: "", charCount: 0, truncated: false });
  });

  it("truncates a long selection and says how long the original was", () => {
    const text = "字".repeat(QUOTE_MAX_CHARS + 40);
    const quote = buildQuoteReference({ text, role: "assistant" });
    expect(quote.truncated).toBe(true);
    expect(quote.charCount).toBe(QUOTE_MAX_CHARS + 40);
    expect(quote.text).toContain(`原文 ${QUOTE_MAX_CHARS + 40} 字`);
    // 引用正文本身不能超限太多（只多出省略号和头部）。
    expect(quote.text.length).toBeLessThan(QUOTE_MAX_CHARS + 120);
  });

  it("appends without touching the existing draft", () => {
    expect(appendQuoteToDraft("", "> 引用")).toBe("> 引用");
    expect(appendQuoteToDraft("我自己的问题", "> 引用")).toBe("我自己的问题\n\n> 引用");
    expect(appendQuoteToDraft("我自己的问题\n\n", "> 引用")).toBe("我自己的问题\n\n> 引用");
  });
});
