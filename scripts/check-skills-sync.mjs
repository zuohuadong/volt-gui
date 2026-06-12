#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
}

function parseSkillFrontmatter(file) {
  const raw = fs.readFileSync(file, "utf8");
  const match = raw.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) {
    throw new Error(`missing frontmatter: ${path.relative(root, file)}`);
  }
  const meta = Object.fromEntries(
    match[1]
      .split(/\n/)
      .map((line) => line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/))
      .filter(Boolean)
      .map((m) => [m[1], m[2].replace(/^['"]|['"]$/g, "").trim()]),
  );
  if (!meta.description) {
    throw new Error(`missing description: ${path.relative(root, file)}`);
  }
  return meta;
}

function skillDirs(dir) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return [];
  return fs
    .readdirSync(abs, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => fs.existsSync(path.join(abs, name, "SKILL.md")))
    .sort();
}

function checkManifest({ label, rootDir, manifestPath }) {
  if (!fs.existsSync(path.join(root, manifestPath))) {
    throw new Error(`${label}: missing ${manifestPath}`);
  }
  const manifest = readJson(manifestPath);
  const dirs = skillDirs(rootDir);
  const ids = manifest.skills.map((skill) => skill.id).sort();
  if (manifest.count !== dirs.length) {
    throw new Error(`${label}: manifest count ${manifest.count} != directories ${dirs.length}`);
  }
  if (JSON.stringify(ids) !== JSON.stringify(dirs)) {
    throw new Error(`${label}: manifest ids do not match ${rootDir}`);
  }
  for (const skill of manifest.skills) {
    const file = path.join(root, skill.path);
    if (!fs.existsSync(file)) {
      throw new Error(`${label}: missing ${skill.path}`);
    }
    const meta = parseSkillFrontmatter(file);
    if (skill.frontmatterName && meta.name !== skill.frontmatterName) {
      throw new Error(`${label}: ${skill.path} frontmatter name ${meta.name} != ${skill.frontmatterName}`);
    }
  }
  console.log(`${label}_OK count=${dirs.length}`);
}

checkManifest({
  label: "AGENT_TEAM_SKILLS",
  rootDir: "references/skills",
  manifestPath: "references/skills/agent-team-skills-manifest.json",
});

if (fs.existsSync(path.join(root, "references/private-skills/skills-manifest.json"))) {
  checkManifest({
    label: "PRIVATE_SKILLS",
    rootDir: ".voltui/skills",
    manifestPath: "references/private-skills/skills-manifest.json",
  });
}
