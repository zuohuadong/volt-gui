import { describe, expect, test, vi } from "vitest";

import { confirmKnowledgeDocumentDeletion, knowledgeDeleteConfirmationMessage } from "./knowledge-delete";

describe("knowledge document deletion", () => {
  test("names every irreversible index impact", () => {
    const message = knowledgeDeleteConfirmationMessage("测试规范");
    expect(message).toContain("测试规范");
    expect(message).toContain("全文检索");
    expect(message).toContain("相似检索索引");
    expect(message).toContain("不可恢复");
  });

  test("honors cancellation before the caller invokes the backend", () => {
    const confirmDeletion = vi.fn(() => false);
    expect(confirmKnowledgeDocumentDeletion("待保留文档", confirmDeletion)).toBe(false);
    expect(confirmDeletion).toHaveBeenCalledOnce();
  });
});
