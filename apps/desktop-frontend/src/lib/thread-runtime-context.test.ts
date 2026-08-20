import { describe, expect, test, vi } from "vitest";

import {
  resolveSubmissionFailureAction,
  submitThreadMessageWithProjectContext,
} from "./thread-runtime-context";
import type { ScopedMemoryView, TabMeta } from "./types";

function tab(projectId = "inbox"): TabMeta {
  return {
    id: "tab-1",
    scope: "project",
    workspaceRoot: "/workspace",
    workspaceName: "Workspace",
    topicId: "topic-1",
    topicTitle: "Task",
    active: true,
    running: false,
    memoryContext: {
      organizationId: "org",
      workspaceId: "workspace",
      projectId,
      threadId: "thread-1",
    },
  };
}

function memoryView(projectId = "inbox"): ScopedMemoryView {
  return {
    context: {
      organizationId: "org",
      workspaceId: "workspace",
      projectId,
      threadId: "thread-1",
    },
    entries: [],
    archives: [],
    available: true,
  };
}

describe("thread project memory context gate", () => {
  test("binds project memory before profile submission and refreshes the tab", async () => {
    const calls: string[] = [];
    const latestTab = tab("project-a");
    const setMemoryContextForTab = vi.fn(async (_tabID, context) => {
      calls.push(`set:${context.projectId}`);
    });
    const submit = vi.fn(async (current: TabMeta) => {
      calls.push(`profile:${current.memoryContext?.projectId}`);
      calls.push("message");
    });

    await submitThreadMessageWithProjectContext({
      tab: tab(),
      projectId: "project-a",
      scopedMemoryForTab: async () => {
        calls.push("memory");
        return memoryView();
      },
      setMemoryContextForTab,
      listTabs: async () => {
        calls.push("tabs");
        return [latestTab];
      },
      submit,
    });

    expect(calls).toEqual(["memory", "set:project-a", "tabs", "profile:project-a", "message"]);
    expect(setMemoryContextForTab).toHaveBeenCalledWith("tab-1", {
      organizationId: "org",
      workspaceId: "workspace",
      projectId: "project-a",
      threadId: "thread-1",
    });
    expect(submit).toHaveBeenCalledWith(latestTab);
  });

  test("does not rebuild when the backend context already owns the project", async () => {
    const setMemoryContextForTab = vi.fn(async () => undefined);
    const submit = vi.fn(async () => undefined);
    await submitThreadMessageWithProjectContext({
      tab: tab("project-a"),
      projectId: "project-a",
      scopedMemoryForTab: async () => memoryView("project-a"),
      setMemoryContextForTab,
      listTabs: async () => [tab("project-a")],
      submit,
    });
    expect(setMemoryContextForTab).not.toHaveBeenCalled();
    expect(submit).toHaveBeenCalledTimes(1);
  });

  test("fails closed when project context binding fails", async () => {
    const listTabs = vi.fn(async () => [tab("project-a")]);
    const submit = vi.fn(async () => undefined);
    await expect(submitThreadMessageWithProjectContext({
      tab: tab(),
      projectId: "project-a",
      scopedMemoryForTab: async () => memoryView(),
      setMemoryContextForTab: async () => {
        throw new Error("memory context rejected");
      },
      listTabs,
      submit,
    })).rejects.toThrow("memory context rejected");
    expect(listTabs).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });

  test("refuses a refreshed thread that is already busy before submission", async () => {
    const submit = vi.fn(async () => undefined);
    await expect(submitThreadMessageWithProjectContext({
      tab: tab("project-a"),
      projectId: "project-a",
      scopedMemoryForTab: async () => memoryView("project-a"),
      setMemoryContextForTab: async () => undefined,
      listTabs: async () => [{ ...tab("project-a"), running: true }],
      submit,
    })).rejects.toThrow("turn already running");
    expect(submit).not.toHaveBeenCalled();
  });
});

describe("resolveSubmissionFailureAction", () => {
  test("restores the draft when cancellation happens before backend submission starts", () => {
    expect(resolveSubmissionFailureAction({
      backendSubmissionStarted: false,
      cancelled: true,
    })).toBe("restore-draft");
  });

  test("keeps a real backend cancellation cancelled after submission starts", () => {
    expect(resolveSubmissionFailureAction({
      backendSubmissionStarted: true,
      cancelled: true,
    })).toBe("cancel-submitted");
  });

  test("restores the draft for other pre-submit failures", () => {
    expect(resolveSubmissionFailureAction({
      backendSubmissionStarted: false,
      cancelled: false,
    })).toBe("restore-draft");
  });

  test("keeps post-submit failures in the normal error path", () => {
    expect(resolveSubmissionFailureAction({
      backendSubmissionStarted: true,
      cancelled: false,
    })).toBe("fail-submitted");
  });
});
