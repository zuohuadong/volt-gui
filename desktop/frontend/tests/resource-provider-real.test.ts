import { afterEach, describe, expect, test } from "bun:test";

import { wailsDataProvider } from "../src/lib/resourceProvider";
import type { WorkbenchTodo } from "../src/lib/types";

const originalWindow = globalThis.window;

function installBindings(bindings: Record<string, unknown>) {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { go: { main: { App: bindings } } },
  });
}

afterEach(() => {
  Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
});

describe("Wails resource provider uses persisted todos", () => {
  test("lists, creates, updates and deletes tasks through Wails bindings", async () => {
    const calls: string[] = [];
    const saved: WorkbenchTodo = {
      id: "todo-real",
      title: "真实待办",
      description: "由桌面后端持久化",
      priority: "高",
      dueLabel: "今天",
      status: "pending",
      source: "workbench",
      createdAt: "2026-07-13T00:00:00Z",
      updatedAt: "2026-07-13T00:00:00Z",
    };
    installBindings({
      ListTodos: async () => [saved],
      SaveTodo: async (input: { id?: string; title: string }) => {
        calls.push(`save:${input.id ?? "new"}:${input.title}`);
        return { ...saved, id: input.id ?? saved.id, title: input.title };
      },
      DeleteTodo: async (id: string) => calls.push(`delete:${id}`),
    });

    const listed = await wailsDataProvider.getList({ resource: "tasks" });
    expect(listed.data).toHaveLength(1);
    expect(listed.data[0]?.id).toBe("todo-real");

    await wailsDataProvider.create({ resource: "tasks", variables: { title: "新增待办", priority: "中" } });
    await wailsDataProvider.update({ resource: "tasks", id: "todo-real", variables: { title: "更新待办" } });
    await wailsDataProvider.deleteOne({ resource: "tasks", id: "todo-real" });
    expect(calls).toEqual(["save:new:新增待办", "save:todo-real:更新待办", "delete:todo-real"]);
  });

  test("never fabricates records for unsupported writes or missing reads", async () => {
    installBindings({ ListTabs: async () => [] });

    await expect(wailsDataProvider.create({ resource: "sessions", variables: { title: "fake" } })).rejects.toThrow("不支持");
    await expect(wailsDataProvider.update({ resource: "sessions", id: "missing", variables: { title: "fake" } })).rejects.toThrow();
    await expect(wailsDataProvider.getOne({ resource: "topics", id: "missing" })).rejects.toThrow("未找到资源");
  });
});
