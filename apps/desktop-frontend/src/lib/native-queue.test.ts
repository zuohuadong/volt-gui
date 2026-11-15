import { describe, expect, it } from "vitest";
import { isMutableQueueItem, nativeQueueRows, queueItemDraft, toNativeQueueItem, toNativeQueueItems } from "./native-queue";

describe("native queue mapping", () => {
  it("reads text and attachment counts from official queue items", () => {
    const item = toNativeQueueItem({
      id: "m1",
      placement: "queued",
      rpcId: "r1",
      content: [
        { type: "text", text: "先跑测试" },
        { type: "text", text: "再更新文档" },
        { type: "image", mediaType: "image/png", data: "AAAA" },
      ],
    });
    expect(item).toEqual({
      id: "m1",
      placement: "queued",
      rpcId: "r1",
      // 多段文字按原顺序用换行拼接，不能丢第二段。
      text: "先跑测试\n再更新文档",
      attachmentCount: 1,
    });
  });

  it("survives malformed items instead of throwing", () => {
    expect(toNativeQueueItem({ id: "" })).toBeUndefined();
    expect(toNativeQueueItem({ placement: "queued" })).toBeUndefined();
    expect(toNativeQueueItem(null)).toBeUndefined();
    expect(toNativeQueueItems("nope")).toEqual([]);
    expect(toNativeQueueItems([{ id: "a" }, { id: "" }, 5])).toHaveLength(1);
    // 未知 placement 按普通排队处理，不丢条目。
    expect(toNativeQueueItem({ id: "a", placement: "weird", content: [] })?.placement).toBe("queued");
  });

  it("numbers only queued items and keeps steering out of the numbering", () => {
    const rows = nativeQueueRows([
      { id: "a", placement: "queued", text: "第一条", attachmentCount: 0 },
      { id: "b", placement: "steering", text: "插队", attachmentCount: 0 },
      { id: "c", placement: "queued", text: "x".repeat(80), attachmentCount: 2 },
      { id: "d", placement: "context", text: "", attachmentCount: 0 },
    ]);
    expect(rows.map((row) => row.position)).toEqual([1, undefined, 2, undefined]);
    expect(rows[2].summary.endsWith("… · +2 个附件")).toBe(true);
    expect(rows[3].summary).toBe("+0 个附件".replace("+0 个附件", ""));
  });

  it("only queued and steering items are client-mutable", () => {
    expect(isMutableQueueItem({ id: "a", placement: "queued", text: "", attachmentCount: 0 })).toBe(true);
    expect(isMutableQueueItem({ id: "b", placement: "steering", text: "", attachmentCount: 0 })).toBe(true);
    // context 是 agent 自己塞的，客户端不能改。
    expect(isMutableQueueItem({ id: "c", placement: "context", text: "", attachmentCount: 0 })).toBe(false);
    expect(queueItemDraft({ id: "a", placement: "queued", text: "原文", attachmentCount: 0 })).toBe("原文");
  });
});
