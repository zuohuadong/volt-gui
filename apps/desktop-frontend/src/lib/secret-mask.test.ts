import { describe, expect, it } from "vitest";

import { maskSecrets } from "./secret-mask";

describe("maskSecrets", () => {
  it("leaves ordinary text untouched", () => {
    expect(maskSecrets("总结这份文档，并列出 3 个风险点。")).toEqual({ text: "总结这份文档，并列出 3 个风险点。", masked: 0 });
    expect(maskSecrets("")).toEqual({ text: "", masked: 0 });
  });

  it("masks well-known key prefixes and keeps the recognizable head", () => {
    const result = maskSecrets("key sk-abcdefghijklmnopqrstuvwxyz012345 ok");
    expect(result.masked).toBe(1);
    expect(result.text).toBe("key sk-•••••• ok");
    expect(result.text).not.toContain("abcdefghij");
  });

  it("masks GitHub, Slack, AWS and Google keys", () => {
    const input = [
      "ghp_0123456789abcdefghijABCDEFGHIJ",
      "xoxb-1234567890-abcdefghij",
      "AKIAABCDEFGHIJKLMNOP",
      "AIzaSyA1234567890abcdefghijklmnopqrst",
    ].join(" ");
    const result = maskSecrets(input);
    expect(result.masked).toBe(4);
    for (const fragment of ["0123456789abcdef", "1234567890-abc", "ABCDEFGHIJKLMNOP", "SyA1234567890"]) {
      expect(result.text).not.toContain(fragment);
    }
  });

  it("masks labelled secrets such as Bearer tokens and api keys", () => {
    const bearer = maskSecrets("Authorization: Bearer abcdefghijklmnopqrstuvwxyz");
    expect(bearer.masked).toBe(1);
    expect(bearer.text).toBe("Authorization: Bearer ••••••");

    const assignment = maskSecrets('api_key = "abcdefghijklmnop1234"');
    expect(assignment.masked).toBe(1);
    expect(assignment.text).not.toContain("abcdefghijklmnop1234");
  });

  it("masks a whole private key block", () => {
    const pem = "-----BEGIN RSA PRIVATE KEY-----\nMIIEow==\n-----END RSA PRIVATE KEY-----";
    const result = maskSecrets(`证书：\n${pem}\n结束`);
    expect(result.masked).toBe(1);
    expect(result.text).toContain("-----BEGIN PRIVATE KEY-----••••••");
    expect(result.text).not.toContain("MIIEow==");
  });

  it("does not touch short tokens that merely start with a prefix", () => {
    expect(maskSecrets("sk-short").masked).toBe(0);
    expect(maskSecrets("bearer of good news").masked).toBe(0);
  });
});