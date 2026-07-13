import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

describe("browser secure login UI", () => {
  test("keeps the password in a dedicated local form and offers explicit save", () => {
    const source = readFileSync(new URL("../src/components/BrowserInteractionPrompt.svelte", import.meta.url), "utf8");
    expect(source).toContain('type="password"');
    expect(source).toContain("仅本次登录");
    expect(source).toContain("保存并登录");
    expect(source).toContain("系统钥匙串");
    expect(source).toContain('password = ""');
    expect(source).not.toContain("console.log");
  });

  test("offers manual verification continuation without attempting captcha bypass", () => {
    const source = readFileSync(new URL("../src/components/BrowserInteractionPrompt.svelte", import.meta.url), "utf8");
    expect(source).toContain("已完成，继续");
    expect(source).toContain("取消登录");
    expect(source).toContain("验证码、扫码或 MFA");
  });

  test("saved credential settings expose metadata and deletion but never a password", () => {
    const source = readFileSync(new URL("../src/components/BrowserCredentialSettings.svelte", import.meta.url), "utf8");
    expect(source).toContain("已保存的浏览器登录");
    expect(source).toContain("credential.origin");
    expect(source).toContain("credential.username");
    expect(source).toContain("删除凭据");
    expect(source).not.toContain("credential.password");
  });
});
