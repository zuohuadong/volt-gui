# Agent-Team Skills Sync

This repository vendors the shared agent-team skill reference set under `references/skills/`.

Current manifest count: 31

## Verification

Run:

```bash
node scripts/check-skills-sync.mjs
```

The check verifies that `references/skills/agent-team-skills-manifest.json` matches every `references/skills/*/SKILL.md` directory and that each skill has valid frontmatter.
