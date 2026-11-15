import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  DEFAULT_SKILL_INDEX,
  DEFAULT_SKILL_REPO,
  assertSkillId,
  assertSkillRef,
  mergeSkillLists,
  parseCredentialScalar,
  parseSkillActionJson,
  parseSkillListJson,
  readSkillTokenFromCredentials,
  resolveSkillStoreConfig,
  skillStoreEnv,
  skillStoreScriptPath,
} from "./skill-store.ts";

test("技能 id 与版本引用只接受安全字符", () => {
  assert.equal(assertSkillId("failure-analysis"), "failure-analysis");
  assert.throws(() => assertSkillId("../etc"), /不合法/u);
  assert.throws(() => assertSkillId("A-B"), /不合法/u);
  assert.equal(assertSkillRef("main"), "main");
  assert.equal(assertSkillRef("v1.2.3"), "v1.2.3");
  assert.throws(() => assertSkillRef("../../etc"), /不合法/u);
  assert.throws(() => assertSkillRef("http://x"), /不合法/u);
});

test("默认仓库与索引指向内网 Gitea", () => {
  const config = resolveSkillStoreConfig({}, {});
  assert.equal(config.repo, DEFAULT_SKILL_REPO);
  assert.equal(config.indexUrl, DEFAULT_SKILL_INDEX);
  assert.equal(config.token, undefined);
});

test("环境变量覆盖默认值并去除尾部斜杠", () => {
  const config = resolveSkillStoreConfig({}, {
    ANYONG_SKILLS_REPO: "https://example.internal/xg/skills/",
    ANYONG_SKILLS_INDEX: "https://example.internal/xg/skills/raw/branch/main/skills.index.json",
    ANYONG_SKILLS_TOKEN: "  read-token  ",
  });
  assert.equal(config.repo, "https://example.internal/xg/skills");
  assert.equal(config.token, "read-token");
});

test("技能命令使用独立 Node 并清除继承的 Node 注入参数", () => {
  const env = skillStoreEnv({ PATH: "/usr/bin", ELECTRON_RUN_AS_NODE: "1", NODE_OPTIONS: "--require unsafe", NODE_TLS_REJECT_UNAUTHORIZED: "0" }, { repo: "https://r", indexUrl: "https://r/i.json", token: "t" });
  assert.equal(env.ELECTRON_RUN_AS_NODE, undefined);
  assert.equal(env.NODE_OPTIONS, undefined);
  assert.equal(env.NODE_TLS_REJECT_UNAUTHORIZED, undefined);
  assert.equal(env.ANYONG_SKILLS_REPO, "https://r");
  assert.equal(env.ANYONG_SKILLS_INDEX, "https://r/i.json");
  assert.equal(env.ANYONG_SKILLS_TOKEN, "t");
  assert.equal(env.PATH, "/usr/bin");
});

test("脚本路径位于运行时 scripts 目录", () => {
  // 用 path.join 生成期望值，避免在 Windows runner 上把分隔符写死成正斜杠。
  assert.equal(skillStoreScriptPath("/runtime"), path.join("/runtime", "scripts", "anyong-skill.mjs"));
});

test("已安装与索引合并后标记可更新", () => {
  const merged = mergeSkillLists(
    [{ id: "failure-analysis", version: "1.0.0", sha256: "aaa", installedAt: "2026-11-01T00:00:00.000Z" }],
    [
      { id: "failure-analysis", version: "1.1.0", sha256: "bbb", title: "失效分析" },
      { id: "failure-report", version: "1.0.0", sha256: "ccc", title: "失效报告", tags: ["报告", 1] },
    ],
  );
  const analysis = merged.find((skill) => skill.id === "failure-analysis");
  assert.equal(analysis?.installed, true);
  assert.equal(analysis?.updateAvailable, true);
  assert.equal(analysis?.version, "1.0.0");
  assert.equal(analysis?.title, "失效分析");
  const report = merged.find((skill) => skill.id === "failure-report");
  assert.equal(report?.installed, false);
  assert.equal(report?.updateAvailable, false);
  assert.deepEqual(report?.tags, ["报告"]);
  // 已安装项排在前面。
  assert.equal(merged[0]?.id, "failure-analysis");
});

test("索引缺失时仍返回已安装列表", () => {
  const merged = mergeSkillLists([{ id: "a", version: "1.0.0" }], []);
  assert.equal(merged.length, 1);
  assert.equal(merged[0]?.installed, true);
  assert.equal(merged[0]?.updateAvailable, false);
});

test("解析 list 与动作输出", () => {
  const parsed = parseSkillListJson(JSON.stringify({
    dir: "/skills",
    installed: [{ id: "a" }],
    remote: [{ id: "b" }],
  }));
  assert.equal(parsed.dir, "/skills");
  assert.equal(parsed.installed.length, 1);
  assert.equal(parsed.remote.length, 1);
  assert.deepEqual(parseSkillActionJson(JSON.stringify({ id: "a", version: "1.0.0", sha256: "x" })), {
    id: "a", version: "1.0.0", sha256: "x",
  });
});
test("从官方凭据 YAML 读取令牌：支持引号与行内注释", () => {
  const yaml = [
    "# harness credentials",
    "XG_GOMODEL_API_KEY: abc",
    "ANYONG_SKILLS_TOKEN: test-skill-token",
    "OTHER: 'v'",
  ].join("\n");
  assert.equal(parseCredentialScalar(yaml, "ANYONG_SKILLS_TOKEN"), "test-skill-token");
  assert.equal(parseCredentialScalar('ANYONG_SKILLS_TOKEN: "a\\tb"', "ANYONG_SKILLS_TOKEN"), "a\tb");
  assert.equal(parseCredentialScalar("ANYONG_SKILLS_TOKEN: 'x''y'", "ANYONG_SKILLS_TOKEN"), "x'y");
  assert.equal(parseCredentialScalar("ANYONG_SKILLS_TOKEN: tok # note", "ANYONG_SKILLS_TOKEN"), "tok");
  assert.equal(parseCredentialScalar("ANYONG_SKILLS_TOKEN:", "ANYONG_SKILLS_TOKEN"), undefined);
});

test("复杂结构与缺失键不返回猜测值", () => {
  assert.equal(parseCredentialScalar("ANYONG_SKILLS_TOKEN:\n  nested: 1", "ANYONG_SKILLS_TOKEN"), undefined);
  assert.equal(parseCredentialScalar("ANYONG_SKILLS_TOKEN: |\n  block", "ANYONG_SKILLS_TOKEN"), "block\n");
  assert.equal(parseCredentialScalar("ANYONG_SKILLS_TOKEN: {a: 1}", "ANYONG_SKILLS_TOKEN"), undefined);
  assert.equal(parseCredentialScalar("OTHER: 1", "ANYONG_SKILLS_TOKEN"), undefined);
});

test("凭据文件缺失或不可读时返回 undefined", () => {
  assert.equal(readSkillTokenFromCredentials("/nonexistent-home", "ANYONG_SKILLS_TOKEN"), undefined);
});

test("从 DSH home 的实际凭据文件读取令牌", async () => {
  const home = await mkdtemp(path.join(tmpdir(), "skill-store-home-"));
  try {
    await writeFile(path.join(home, ".credentials.yaml"), [
      "XG_GOMODEL_API_KEY: model-secret",
      "ANYONG_SKILLS_TOKEN: \"read-only-token\"",
      "",
    ].join("\n"));
    assert.equal(readSkillTokenFromCredentials(home), "read-only-token");
    assert.equal(readSkillTokenFromCredentials(home, "MISSING"), undefined);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("索引的可选分类字段透传，非法值被忽略", () => {
  const merged = mergeSkillLists([], [
    {
      id: "office-docx",
      version: "1.2.0",
      category: "办公与文档",
      updatedAt: "2026-11-01T08:00:00Z",
      maintainer: "skills-maintainers",
      sizeBytes: 2048,
      scenarios: ["写报告", 42],
    },
    { id: "office-xlsx", version: "1.0.0", sizeBytes: -3, scenarios: [] },
  ]);
  const docx = merged.find((skill) => skill.id === "office-docx");
  assert.equal(docx?.category, "办公与文档");
  assert.equal(docx?.updatedAt, "2026-11-01T08:00:00Z");
  assert.equal(docx?.maintainer, "skills-maintainers");
  assert.equal(docx?.sizeBytes, 2048);
  assert.deepEqual(docx?.scenarios, ["写报告"]);
  const xlsx = merged.find((skill) => skill.id === "office-xlsx");
  assert.equal(xlsx?.sizeBytes, undefined);
  assert.equal(xlsx?.scenarios, undefined);
  assert.equal(xlsx?.category, undefined);
});
