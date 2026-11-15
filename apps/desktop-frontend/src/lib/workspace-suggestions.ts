// 空会话建议卡片：按工作区里能观察到的信号给出可执行动作（#342）。
//
// 渲染层目前只有目录枚举（`host.listDirectory` 只返回目录），拿不到稳定文件清单，
// 因此判定只使用目录名这一确定信号：见到代码/工程目录才给研发类建议，其余一律给
// 文档型建议，避免在纯文档工作区里推「理解代码结构 / 运行测试」。
export type WorkspaceKind = "code" | "documents";

const CODE_DIRECTORIES = new Set([
  ".git", "src", "lib", "app", "apps", "packages", "cmd", "internal", "pkg",
  "test", "tests", "spec", "scripts", "server", "client", "mobile", "desktop",
]);

export type WorkspaceSuggestion = { labelKey: string; promptKey: string };

export function classifyWorkspaceDirectories(names: readonly string[]): WorkspaceKind {
  return names.some((name) => CODE_DIRECTORIES.has(name.trim().toLowerCase())) ? "code" : "documents";
}

export function workspaceSuggestions(kind: WorkspaceKind): WorkspaceSuggestion[] {
  if (kind === "code") {
    return [
      { labelKey: "transcript.checkProject", promptKey: "transcript.checkProjectPrompt" },
      { labelKey: "transcript.understandCode", promptKey: "transcript.understandCodePrompt" },
      { labelKey: "transcript.runTests", promptKey: "transcript.runTestsPrompt" },
    ];
  }
  return [
    { labelKey: "transcript.summarizeDocs", promptKey: "transcript.summarizeDocsPrompt" },
    { labelKey: "transcript.findInDocs", promptKey: "transcript.findInDocsPrompt" },
    { labelKey: "transcript.outlineDocs", promptKey: "transcript.outlineDocsPrompt" },
  ];
}
