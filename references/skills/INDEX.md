# Agent Team Skills Index

Use this index when filling `Required Skills and Conventions` in a Task Contract or deciding which local skill to load.

| Task area | Skill |
| --- | --- |
| Agent-team Task Ledger, Task Contract, automation workflows, Codex scheduled tasks, smoke | `agent-team-automation` |
| Stack Profile / Recommended Fallback selection, ambiguous app target, framework/fullstack/database migration guard | `stack-profile-selector` |
| Deployment target selection, hosting platform fit, domain/DNS/data-residency guard | `deployment-target-selector` |
| GitHub / CNB / GitLab / local provider diagnostics and PR/MR state mapping | `provider-adapter` |
| `setup.ts`, Bun CLI, shell hooks, cross-platform install/deploy behavior | `bun-cli-cross-platform` |
| TypeScript typing, Bun-compatible imports, strict type fixes | `typescript` |
| Volt GUI running queue, activity/receipt/recovery, approvals, Diff review, automation inbox, managed worktrees | `volt-desktop-experience` |
| Elysia backend routes, validation, plugins, deployment | `elysiajs` |
| NestJS enterprise Node.js backend, DI/modules/decorators/guards/pipes/microservices | `nestjs-backend` |
| Hono lightweight Web Standards API, edge functions, Node/Bun/Deno portability | `hono-backend` |
| Fullstack web framework decision with routing, SSR/SSG, server routes, adapter fit | `stack-profile-selector` plus `sveltekit-fullstack` or `nuxt-fullstack` |
| SvelteKit fullstack apps, file routing, load/actions, endpoints, adapters | `sveltekit-fullstack` |
| Nuxt fullstack apps, Vue routing, SSR/SSG, Nitro server routes, modules | `nuxt-fullstack` |
| Database target selection, migrations, backup/restore, data/runtime fit | `database-profile-selector` |
| SQLite local-first, desktop, CLI, embedded, single-user persistence | `sqlite-database` |
| Cloudflare D1 relational edge storage, Workers/Pages bindings, Wrangler migrations | `cloudflare-d1-database` |
| PostgreSQL production relational storage, transactions, JSONB, LISTEN/NOTIFY | `postgres-database` |
| Svelte 5 component syntax and autofix workflow | `svelte-code-writer` |
| Svelte 5 reactivity and component best practices | `svelte-core-bestpractices` |
| Vue frontend, Single-File Components, Composition API, Vue TypeScript | `vue-frontend` |
| Alpine.js lightweight HTML-first interactions and static/server-rendered UI | `alpine-frontend` |
| Tailwind CSS v4 | `tailwind-v4` |
| shadcn/ui components and registries | `shadcn` |
| Electron desktop apps, IPC/preload security, packaging/signing/updater | `electron-desktop` |
| Tauri desktop apps, Rust commands, capabilities/permissions, packaging/updater | `tauri-desktop` |
| Electrobun desktop apps | `electrobun-best-practices` |
| Mobile apps, Expo React Native, Capacitor, Flutter/native decision and verification | `mobile-app` |
| Mpx development | `mpx-development-guides` |
| Mpx React Native style compatibility | `mpx-rn-style-guide` |
| SupaCloud self-hosted Supabase-style platform, frontend hosting, Edge Functions | `supacloud-platform` |
| svadmin admin/backoffice CRUD UI on Svelte 5 | `svadmin-admin-ui` |
| Tencent EdgeOne Pages and Edge Functions deployment | `edgeone-deploy` |
| Cloudflare Pages, Pages Functions, Workers, and bindings deployment | `cloudflare-edge-hosting` |

Candidate for a later split:

- `git-pr-review-ops`: safe commit/push/PR review/merge operations. For now, use `provider-adapter` plus project workflow `pr-review-merge.md`.

## 西谷智灯暗涌系统 Fork 专属 Skills

以下 skill 是西谷AI (Xigu AI) 西谷智灯暗涌系统 fork 的行业定制，不贡献到上游：

| Task area | Skill |
| --- | --- |
| 西谷智灯暗涌系统品牌配置、BrandConfig 环境变量、白标定制验证 | `anyong-brand-config` |
| CNB CI/CD 管道配置、.cnb.yml、自动发版、跨仓库 PR | `cnb-ci-cd` |
| 西谷AI 内部运营、产品策略、中国市场、上游同步策略 | `xigu-ai-ops` |
