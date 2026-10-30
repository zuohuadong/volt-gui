/**
 * Minimal renderer-side fail-open screen. If the Svelte application cannot
 * mount, users must still get a readable explanation and a retry action instead
 * of a blank window or a process that appears to have crashed.
 */
export function renderBootFailure(target: HTMLElement, error: unknown): void {
  const document = target.ownerDocument;
  const message = error instanceof Error ? error.message : String(error);
  const main = document.createElement("main");
  main.className = "boot-failure";
  main.setAttribute("role", "alert");

  const title = document.createElement("h1");
  title.textContent = "工作台无法启动";
  const description = document.createElement("p");
  description.textContent = "界面初始化失败。请重试；如果问题持续，请重启应用并保留下方诊断信息。";
  const detail = document.createElement("pre");
  detail.textContent = message || "未知错误";
  const retry = document.createElement("button");
  retry.type = "button";
  retry.textContent = "重新加载";
  retry.addEventListener("click", () => window.location.reload());

  main.append(title, description, detail, retry);
  target.replaceChildren(main);
}