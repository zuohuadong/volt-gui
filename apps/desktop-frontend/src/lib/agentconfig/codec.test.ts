// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ACB_DEEP_LINK_MAX_CHARS,
  ACB_MAX_BUNDLE_BYTES,
  AgentConfigError,
  assertTrust,
  buildBundle,
  bundleToDeepLink,
  countSecrets,
  extractBundleFromDeepLink,
  parseBundle,
  parseBundleText,
  revealSecret,
} from "./codec";

// 规范给出的标准向量（MIT，spec/INTEGRATION.md §9 Vector 1）：跨实现必须逐字节兼容。
const VECTOR_PASSWORD = "test-vector-2026";
const VECTOR_DEEP_LINK = "agentconfig://import?v=1&bundle=eyJzY2hlbWEiOiJhZ2VudGNvbmZpZy1idW5kbGUiLCJ2IjoxLCJjcmVhdGVkIjoxNzg3MjE3MDU5OTIwLCJsYWJlbCI6IkNhbm9uaWNhbCBJbnRlZ3JhdGlvbiBUZXN0IFZlY3RvciIsInNyYyI6InNwZWMiLCJ0cnVzdCI6InNlbGYiLCJjYXBhYmlsaXRpZXMiOlsibWNwIiwibW9kZWxzIl0sImhpbnQiOiJzdGFuZGFyZCB0ZXN0IHZlY3RvciIsInBheWxvYWQiOnsiYWxnIjoiUEJLREYyLVNIQTI1Ni1BRVMtMjU2LUdDTSIsIml0ZXJhdGlvbnMiOjEwMDAwMCwic2FsdCI6Ik1ERXlNelExTmpjNE9XRmlZMlJsWmc9PSIsIml2IjoiTURFeU16UTFOamM0T1dGaSIsImN0IjoicTNXMGhrWlEyNnFLbm5HQ2xDYURSelk1SFpKSThwcDJmczRaTk8vblZBKzIzZnFpWFJaOTUzVCtXTEljRkhQM2RHVk1JRitDNUwxZ05vaTFZVTh2dUpqcFBQTDRubnZmU2xmQXVEamF2bytnUlc5K3huREFpK0tScXpQeCsyWW54MFd0UE5xeGswWHkvRWtvN2cvQWJZYWVuc3B2RW8zdVZKMmhYM3FROFRmQzB4Nno5R0dXTVEzYWRnR2VuUWtyUytrTWJvMUFZRlRCMjFuUlJjaEFQK3E4ZVNMQkIwdGJheFpTZlpXL2NKNU1UbGRyNTY5OUZ2c2xPQ0M2RkhSUG5uRzdPczlUei82YVl2U1g3QzVnWDlFOHVVaFAwNjVsTi9rT2dOSnM0VWNSSjZZZnp2NkdiQTMvN2xmS003eS9uNVF1dEFpOGNVWW5ZY3lYNkFqbldWdldtOVFLVzVmZ2FWcytnYkxzeFA5aFdDejNsWXpIbWR1WEZyV0dHbkRCdEJFMGd3PT0ifSwicHViIjp7Im1jcCI6W3sibmFtZSI6ImdpdGh1YiIsImVuYWJsZWQiOnRydWUsInRyYW5zcG9ydCI6InN0ZGlvIiwiY29tbWFuZCI6Im5weCIsImFyZ3MiOlsiLXkiLCJAbW9kZWxjb250ZXh0cHJvdG9jb2wvc2VydmVyLWdpdGh1YiJdLCJlbnZLZXlzIjpbIkdJVEhVQl9QRVJTT05BTF9BQ0NFU1NfVE9LRU4iXX1dLCJtb2RlbHMiOlt7InByb3ZpZGVyIjoicHJvdmlkZXItYSIsImlkIjoibW9kZWwteCIsImFsaWFzIjoieCIsImNvbnRleHRXaW5kb3ciOjEyODAwMCwibW9kZWxUeXBlIjoibXVsdGltb2RhbCJ9XSwic2tpbGxzIjpbXSwicHJvbXB0cyI6W10sImFnZW50cyI6W10sInJlc291cmNlcyI6W119fQ";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const errorCode = (fn: () => unknown): string | undefined => {
  try {
    fn();
    return undefined;
  } catch (error) {
    return error instanceof AgentConfigError ? error.code : `unexpected: ${String(error)}`;
  }
};

describe("ACB codec", () => {
  it("opens the specification's canonical encrypted vector", async () => {
    const bundle = extractBundleFromDeepLink(VECTOR_DEEP_LINK);
    expect(bundle.trust).toBe("self");
    expect(bundle.payload.alg).toBe("PBKDF2-SHA256-AES-256-GCM");
    const secret = await revealSecret(bundle, VECTOR_PASSWORD);
    expect(secret.secrets?.["provider-a"]).toMatchObject({ apiKey: "sk-test-key-abcdef" });
    expect(secret.secrets?.github.env?.GITHUB_PERSONAL_ACCESS_TOKEN).toBe("ghp_testtoken123");
    expect(secret.customPrompts?.default).toBe("Be concise.");
    expect(countSecrets(secret)).toMatchObject({ providers: 2, promptBodies: 1, endpoints: 1 });
  });

  it("round-trips a self bundle it produced itself", async () => {
    const bundle = await buildBundle({
      trust: "self",
      label: "My setup",
      pub: { models: [{ provider: "xg-gomodel", id: "vlm", modelType: "multimodal" }] },
      secret: { secrets: { "xg-gomodel": { apiKey: "sk-local" } } },
      password: "hunter2",
      now: 1_700_000_000_000,
    });
    const reopened = parseBundle(JSON.parse(JSON.stringify(bundle)));
    await expect(revealSecret(reopened, "hunter2")).resolves.toMatchObject({
      secrets: { "xg-gomodel": { apiKey: "sk-local" } },
    });
    await expect(revealSecret(reopened, "wrong")).rejects.toMatchObject({ code: "wrong-password" });
  });

  it("refuses to put credentials in a shared bundle", async () => {
    await expect(buildBundle({
      trust: "shared",
      pub: {},
      secret: { secrets: { p: { apiKey: "sk" } } },
      password: "pw",
    })).rejects.toMatchObject({ code: "trust-violation" });
    // 明文的 self 包同样不允许带凭据：要么给出密码，要么拒绝。
    await expect(buildBundle({ trust: "self", pub: {}, secret: { secrets: { p: { apiKey: "sk" } } } }))
      .rejects.toMatchObject({ code: "trust-violation" });
  });

  it("rejects hand-made bundles that violate trust rules", async () => {
    const smuggled = {
      schema: "agentconfig-bundle",
      v: 1,
      created: 1,
      trust: "shared",
      capabilities: [],
      payload: { alg: "none", ct: btoa(JSON.stringify({ secrets: { p: { apiKey: "sk" } } })) },
      pub: {},
    };
    const bundle = parseBundle(smuggled);
    const secret = await revealSecret(bundle);
    expect(errorCode(() => assertTrust(bundle, secret))).toBe("trust-violation");
  });

  it("validates versions, algorithms, size and PBKDF2 bounds before doing work", () => {
    const base = { schema: "agentconfig-bundle", v: 1, created: 1, trust: "shared", capabilities: [], pub: {} };
    expect(errorCode(() => parseBundle({ ...base, v: 2, payload: { alg: "none", ct: "" } }))).toBe("unsupported-version");
    expect(errorCode(() => parseBundle({ ...base, schema: "other", payload: { alg: "none", ct: "" } }))).toBe("not-a-bundle");
    expect(errorCode(() => parseBundle({ ...base, payload: { alg: "none", ct: "!!!" } }))).toBe("invalid-base64");
    const enc = (iterations: number) => ({
      ...base,
      payload: { alg: "PBKDF2-SHA256-AES-256-GCM", iterations, salt: "MDEyMzQ1Njc4OWFiY2RlZg==", iv: "MDEyMzQ1Njc4OWFi", ct: "AAAA" },
    });
    expect(errorCode(() => parseBundle(enc(99_999)))).toBe("invalid-iterations");
    expect(errorCode(() => parseBundle(enc(1_000_001)))).toBe("invalid-iterations");
    const huge = { ...base, payload: { alg: "none", ct: "" }, padding: "x".repeat(ACB_MAX_BUNDLE_BYTES) };
    expect(errorCode(() => parseBundle(huge))).toBe("too-large");
  });

  it("rejects an agent promptId that points at no prompt (Draft v1.5 §5.5)", async () => {
    const broken = await buildBundle({
      pub: { prompts: [{ id: "brief" }], agents: [{ id: "broken", promptId: "missing" }] },
    });
    expect(() => parseBundle(broken)).toThrow(/does not match an entry in prompts/);
    // 缺省 promptId 表示"不带指令"，仍然合法。
    const fine = await buildBundle({ pub: { prompts: [{ id: "brief" }], agents: [{ id: "plain" }] } });
    expect(() => parseBundle(fine)).not.toThrow();
  });

  it("keeps unknown fields and capabilities instead of rejecting them", () => {
    const bundle = parseBundle({
      schema: "agentconfig-bundle",
      v: 1,
      created: 1,
      trust: "shared",
      capabilities: ["models", "future-thing"],
      payload: { alg: "none", ct: btoa("{}") },
      pub: { models: [], futureSection: [{ id: "x" }] },
      vendorExtension: { keep: true },
    });
    expect(bundle.capabilities).toContain("future-thing");
    expect((bundle as unknown as Record<string, unknown>).vendorExtension).toEqual({ keep: true });
    expect((bundle.pub as Record<string, unknown>).futureSection).toEqual([{ id: "x" }]);
  });

  it("rejects structural malformations instead of treating them as an empty bundle", () => {
    const valid = "agentconfig-bundle";
    const base = {
      schema: valid,
      v: 1,
      created: 1,
      trust: "shared",
      capabilities: ["models"],
      payload: { alg: "none", ct: "e30=" },
      pub: { models: [] },
    };
    expect(() => parseBundle({ ...base, pub: [] })).toThrow(/pub must be an object/);
    expect(() => parseBundle({ ...base, capabilities: "models" })).toThrow(/string array/);
    expect(() => parseBundle({ ...base, capabilities: [1] })).toThrow(/string array/);
    expect(() => parseBundle({ ...base, created: "1" })).toThrow(/must be a number/);
    expect(() => parseBundle({ ...base, pub: { models: [{ provider: "p" }] } })).toThrow(/non-empty id/);
    expect(() => parseBundle({ ...base, pub: { models: [{ id: "m" }] } })).toThrow(/non-empty provider/);
    expect(() => parseBundle({ ...base, pub: { resources: [{ name: "x" }] } })).toThrow(/non-empty uri/);
  });

  it("refuses a shared bundle that still carries credentials", async () => {
    // 攻击者可以把 trust 写成 shared 却塞进凭据，导入路径必须按 trust 拒绝。
    // 手工构造：明文 ct 里塞进凭据，却声称 trust:"shared"。
    const ct = btoa(JSON.stringify({ secrets: { p: { apiKey: "sk-x" } } }));
    const forged = {
      schema: "agentconfig-bundle",
      v: 1,
      created: 1,
      trust: "shared",
      capabilities: ["models"],
      payload: { alg: "none", ct },
      pub: { models: [] },
    };
    const bundle = parseBundle(forged);
    const secret = await revealSecret(bundle);
    expect(() => assertTrust(bundle, secret)).toThrow(/must not carry credentials/);
    // 明文载荷携带凭据同样不允许。
    expect(() => assertTrust({ ...bundle, trust: "self" }, secret)).toThrow(/password-encrypted/);
  });

  it("refuses to build a deep link that would exceed the 20k limit", async () => {
    const small = await buildBundle({ pub: { models: [{ provider: "p", id: "m" }] } });
    expect(bundleToDeepLink(small)).toMatch(/^agentconfig:\/\/import\?v=1&bundle=/u);
    // 超过上限的必须拒绝生成，而不是产出一个对方无法接收的链接。
    const oversize = await buildBundle({
      pub: { prompts: Array.from({ length: 400 }, (_item, index) => ({ id: `prompt-${index}-${"x".repeat(40)}` })) },
    });
    expect(errorCode(() => bundleToDeepLink(oversize))).toBe("too-large");
    expect(ACB_DEEP_LINK_MAX_CHARS).toBe(20_000);
  });

  it("parses .acfg text and rejects junk", () => {
    const text = JSON.stringify({
      schema: "agentconfig-bundle", v: 1, created: 1, trust: "shared", capabilities: ["models"],
      payload: { alg: "none", ct: btoa(JSON.stringify({ endpoints: {}, customPrompts: {}, providerHints: [], secrets: {} })) },
      pub: { models: [{ provider: "p", id: "m" }] },
    });
    expect(parseBundleText(text).pub.models?.[0]).toMatchObject({ provider: "p", id: "m" });
    expect(errorCode(() => parseBundleText("not json"))).toBe("not-a-bundle");
    expect(errorCode(() => parseBundleText("agentconfig://import?v=2&bundle=e30"))).toBe("invalid-deep-link");
  });
});
