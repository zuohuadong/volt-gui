import { describe, expect, it } from "vitest";
import {
  countSkillsByCategory,
  filterSkills,
  formatSkillSize,
  inferSkillCategory,
  normalizeSkillCategory,
  sortSkills,
  type FilterableSkill,
} from "./skill-categories";

const skills: FilterableSkill[] = [
  { id: "office-docx", title: "Word 文档", tags: ["办公"] },
  { id: "semiconductor-failure-analysis", title: "半导体失效分析" },
  { id: "security-review", title: "安全审查", installed: true, updateAvailable: true, updatedAt: "2026-11-01T00:00:00Z" },
  { id: "test-plan-and-qa", title: "测试计划与质量验证" },
  { id: "data-reporting-analytics", title: "数据分析与报表" },
  { id: "typescript-development", title: "TypeScript 开发", installed: true, updatedAt: "2026-10-01T00:00:00Z" },
  { id: "unknown-skill", title: "未知技能" },
];

describe("skill categories", () => {
  it("normalizes declared categories in both languages and falls back on unknown values", () => {
    expect(normalizeSkillCategory("Office")).toBe("office");
    expect(normalizeSkillCategory("研发与架构")).toBe("engineering");
    expect(normalizeSkillCategory("Engineering / 研发")).toBe("engineering");
    expect(normalizeSkillCategory("nonsense")).toBeUndefined();
    expect(normalizeSkillCategory("")).toBeUndefined();
  });

  it("prefers the declared category over id heuristics", () => {
    expect(inferSkillCategory({ id: "office-docx", category: "engineering" })).toBe("engineering");
  });

  it("infers categories for the shipped skill ids", () => {
    expect(inferSkillCategory({ id: "office-pptx" })).toBe("office");
    expect(inferSkillCategory({ id: "document-reading" })).toBe("office");
    expect(inferSkillCategory({ id: "semiconductor-yield-spc" })).toBe("hardware");
    expect(inferSkillCategory({ id: "security-review" })).toBe("security");
    expect(inferSkillCategory({ id: "test-plan-and-qa" })).toBe("quality");
    expect(inferSkillCategory({ id: "code-review" })).toBe("quality");
    expect(inferSkillCategory({ id: "data-reporting-analytics" })).toBe("data");
    expect(inferSkillCategory({ id: "rag-knowledge-management" })).toBe("data");
    expect(inferSkillCategory({ id: "rust-development" })).toBe("engineering");
    expect(inferSkillCategory({ id: "mcp-tool-builder" })).toBe("engineering");
    expect(inferSkillCategory({ id: "unknown-skill" })).toBe("other");
  });

  it("falls back to tags when the id says nothing", () => {
    expect(inferSkillCategory({ id: "custom-x", tags: ["办公", "模板"] })).toBe("office");
  });

  it("counts every skill exactly once", () => {
    const counts = countSkillsByCategory(skills);
    expect(counts.all).toBe(skills.length);
    const sum = Object.entries(counts)
      .filter(([key]) => key !== "all")
      .reduce((total, [, value]) => total + value, 0);
    expect(sum).toBe(skills.length);
  });

  it("filters by category, install state and query together", () => {
    expect(filterSkills(skills, { category: "office" }).map((skill) => skill.id)).toEqual(["office-docx"]);
    expect(filterSkills(skills, { installFilter: "installed" }).map((skill) => skill.id))
      .toEqual(["security-review", "typescript-development"]);
    expect(filterSkills(skills, { installFilter: "updates" }).map((skill) => skill.id)).toEqual(["security-review"]);
    expect(filterSkills(skills, { query: "文档" }).map((skill) => skill.id)).toEqual(["office-docx"]);
    expect(filterSkills(skills, { category: "hardware", query: "失效" }).map((skill) => skill.id))
      .toEqual(["semiconductor-failure-analysis"]);
    expect(filterSkills(skills, { query: "  " })).toHaveLength(skills.length);
  });

  it("matches queries against id, title, description, scenarios and tags", () => {
    const entry: FilterableSkill = { id: "custom-one", description: "报表生成", scenarios: ["季度复盘"], tags: ["分析"] };
    expect(filterSkills([entry], { query: "custom-one" })).toHaveLength(1);
    expect(filterSkills([entry], { query: "报表" })).toHaveLength(1);
    expect(filterSkills([entry], { query: "季度" })).toHaveLength(1);
    expect(filterSkills([entry], { query: "分析" })).toHaveLength(1);
    expect(filterSkills([entry], { query: "nope" })).toHaveLength(0);
  });

  it("sorts by recommendation, recency and name", () => {
    expect(sortSkills(skills, "recommended")[0]?.id).toBe("security-review");
    expect(sortSkills(skills, "updated")[0]?.id).toBe("security-review");
    expect(sortSkills(skills, "name").map((skill) => skill.title)).toEqual(
      [...skills].map((skill) => skill.title).sort((left, right) => (left ?? "").localeCompare(right ?? "", "zh-Hans-CN")),
    );
  });

  it("formats sizes and ignores invalid input", () => {
    expect(formatSkillSize(512)).toBe("512 B");
    expect(formatSkillSize(2048)).toBe("2.0 KB");
    expect(formatSkillSize(3 * 1024 * 1024)).toBe("3.0 MB");
    expect(formatSkillSize(undefined)).toBeUndefined();
    expect(formatSkillSize(-1)).toBeUndefined();
    expect(formatSkillSize(Number.NaN)).toBeUndefined();
  });
});