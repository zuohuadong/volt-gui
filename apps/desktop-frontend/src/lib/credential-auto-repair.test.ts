import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync(new URL("../App.svelte", import.meta.url), "utf8");

// 用户现场：新建对话后第一个问题正常，第二问直接弹 401（内置网关凭据）。
// 以前只有一句「去配置」，用户只能重启应用；这里锁定自愈路径的关键约束。
describe("401 self-healing with the bundled gateway credential", () => {
  it("repairs the bundled credential and retries the failed prompt once", () => {
    expect(app).toContain("async function repairBundledCredentialAndRetry");
    expect(app).toContain("await shell.resetBundledModelCredential()");
    expect(app).toContain("await retryLastPrompt({ automatic: true })");
    // 每条失败提问只自动尝试一次，避免连续失败时无限循环。
    expect(app).toContain("autoRepairHandled.add(repairKey)");
    expect(app).toContain("if (!options.manual && autoRepairHandled.has(repairKey)) return false;");
  });

  it("never overwrites a credential the user saved in this run", () => {
    expect(app).toContain("userSavedCredentialRefs = new Set([...userSavedCredentialRefs, ref]);");
    expect(app).toContain('!userSavedCredentialRefs.has("XG_GOMODEL_API_KEY")');
  });

  it("only auto-repairs auth failures on the bundled credential", () => {
    expect(app).toContain("const canAutoRepairBundledCredential = $derived(providerAuthFailure");
    expect(app).toContain('selectedProviderCredentialRef() === "XG_GOMODEL_API_KEY"');
    expect(app).toContain("window.voltDesktop?.resetBundledModelCredential");
  });

  it("offers a manual action and reports the outcome", () => {
    expect(app).toContain('t("errors.autoRepairAction")');
    expect(app).toContain('t("errors.autoRepairDone")');
    expect(app).toContain('t("errors.autoRepairUnavailable")');
    expect(app).toContain("repairBundledCredentialAndRetry({ manual: true })");
    expect(app).toContain("{autoRepairNotice}");
  });

  it("keeps the raw upstream text behind technical details", () => {
    expect(app).toContain('class="error-banner-technical"');
    expect(app).toContain("{sessionLoadError || runtimeError}");
  });
});