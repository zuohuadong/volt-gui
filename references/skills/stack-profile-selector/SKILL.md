---
name: stack-profile-selector
description: Use when a task requires choosing, validating, or recording a project stack profile, especially for greenfield defaults, ambiguous app targets, desktop/mobile/miniapp boundaries, or Task Contract stack fields.
---

# Stack Profile Selector

This skill prevents agents from silently inventing or replacing a technical
stack. It turns stack choice into auditable Task Contract evidence.

## Load With

Always pair this skill with the concrete stack skill once a profile is selected,
for example `typescript`, `elysiajs`, `nestjs-backend`, `hono-backend`,
`svelte-code-writer`, `svelte-core-bestpractices`, `vue-frontend`,
`alpine-frontend`, `sveltekit-fullstack`, `nuxt-fullstack`,
`database-profile-selector`, `sqlite-database`, `cloudflare-d1-database`,
`postgres-database`, `electron-desktop`, `tauri-desktop`, `mobile-app`,
`mpx-development-guides`, `mpx-rn-style-guide`, `deployment-target-selector`, or
a concrete deployment skill such as `supacloud-platform`, `svadmin-admin-ui`,
`edgeone-deploy`, or `cloudflare-edge-hosting`.

## Decision Order

Use the first source that applies:

1. Current user instruction.
2. Project docs: `AGENTS.md`, `GEMINI.md`, `README.md`, ADRs, or `docs/`.
3. Existing project evidence: package manifests, lockfiles, build configs,
   source files, and directory structure.
4. Project overlay or team convention.
5. Recommended fallback for a greenfield project with no conflicting evidence.
6. Block and ask.

Do not migrate frameworks, rewrite build tools, or replace existing runtime
choices unless the user explicitly requests that change.

## Contract Fields

Record the decision in the Task Contract:

```yaml
stack_profile: ""
stack_decision_source: "user | docs | detected | project-overlay | recommended-fallback | blocked"
stack_maturity: "mature | modern | experimental | existing"
stack_evidence: []
default_stack_reason: ""
stack_non_goals:
  - "do not migrate framework unless explicitly requested"
  - "do not rewrite build tooling unless explicitly requested"
```

For backend, frontend, fullstack, database, deployment, desktop, mobile,
miniapp, and Mpx tasks, also add the matching profile from
`references/stack-profiles.md`.

## Recommended Fallbacks

- Web app: choose Svelte, Vue, Alpine, SvelteKit, Nuxt, or an existing framework
  by evidence, UI complexity, render mode, and deployment target.
- API service: choose Elysia, NestJS, Hono, or the existing backend by runtime and architecture weight.
- Fullstack app: choose SvelteKit, Nuxt, separated frontend/backend, or an
  existing fullstack framework by render mode, team convention, API ownership,
  and deployment target.
- CLI: TypeScript + Bun CLI.
- Desktop: Electron as mature default; Tauri when lightweight/security and Rust/native tooling are acceptable; Electrobun only when explicitly Bun-first/internal/experimental.
- Mobile: Expo React Native for greenfield JS/TS iOS/Android apps; Capacitor for packaging an existing Web/PWA.
- Miniapp: no default framework; ask unless native/Taro/uni-app/Mpx evidence exists.
- Mpx: use only when user or repository evidence points to Mpx.
- Deployment: choose the existing target, SupaCloud, svadmin, EdgeOne, or
  Cloudflare by runtime/data/region/domain evidence; never migrate hosting by fallback.
- Database: choose the existing database, no database, SQLite, Cloudflare D1, or
  PostgreSQL by data scope, runtime, deployment, migrations, and operations.

Frontend selection:

- Existing project evidence wins.
- Svelte fits greenfield interactive tools, workbenches, dense review consoles,
  and local-state-heavy UI.
- Vue fits explicit Vue requests, existing Vue codebases, Vue-oriented teams, or
  miniapp/Mpx-adjacent ecosystem alignment.
- Alpine fits static reports, server-rendered pages, docs pages, and small
  no-build interactions.
- Block instead of choosing when the user only says "frontend/app/dashboard" or
  when the choice would imply a framework migration.

Fullstack web selection:

- Existing fullstack framework evidence wins.
- SvelteKit fits Svelte apps that need file routing, SSR/SSG/hybrid output,
  server `load`, form actions, endpoints, and adapter-aware deployment.
- Nuxt fits Vue apps that need file routing, SSR/SSG/hybrid output, Nitro server
  routes, modules, content/SEO features, and Vue ecosystem conventions.
- Plain Vite + Svelte/Vue fits client-side tools that do not need fullstack
  routing/server features.
- Separated frontend/backend fits independently owned APIs, heavy backend
  architecture, or deployment boundaries that should stay separate.
- Block when render mode, adapter/platform, auth/session, database, API
  ownership, or migration intent are unclear.

Backend selection:

- Existing project evidence wins.
- Elysia fits Bun-first TypeScript APIs and lightweight high-performance services.
- NestJS fits heavy Node.js enterprise architecture, DI/modules/decorators,
  OpenAPI, guards/pipes/interceptors, queues, microservices, or Java/Spring-like teams.
- Hono fits lightweight Web Standards APIs, Node/Edge portability, Cloudflare
  Workers/Pages Functions, Bun/Deno/Node, webhooks, middleware, and proxy logic.
- Block when runtime target, deployment platform, stateful services, architecture
  weight, or migration intent are unclear.

Deployment selection:

- SupaCloud fits self-hosted Supabase-style backends, Postgres/auth/storage,
  edge functions, frontend hosting, project lifecycle, and private infrastructure.
- svadmin fits internal admin/backoffice CRUD UI, not public product UI.
- Cloudflare Pages/Workers fit global static/frontend apps and edge/serverless workloads.
- Tencent EdgeOne fits Tencent ecosystem or China/mainland edge delivery needs.
- Block when provider account, domain/DNS owner, region/compliance, stateful
  services, secrets, runtime limits, or rollback are unclear.

Database selection:

- Existing database evidence wins.
- Use `none` when there is no persistence need.
- SQLite fits local-first, desktop, CLI, single-user, embedded, prototype, and
  test fixture persistence.
- Cloudflare D1 fits Cloudflare Workers/Pages apps that need relational storage
  through platform bindings and edge-compatible deployment.
- PostgreSQL fits multi-user production services, transactions, JSONB,
  extensions, LISTEN/NOTIFY, queues, auth integration, SupaCloud/Supabase-style
  platforms, and auditability.
- Block when data ownership, multi-tenancy, backup/restore, migrations, region,
  compliance, offline sync, write concurrency, provider access, secrets, or
  runtime connectivity are unclear.

## Block Conditions

Block and ask when:

- The user asks for "an app" but the target is not Web, mobile, desktop, or miniapp.
- The requested fallback conflicts with existing project evidence.
- The task implies framework migration without explicit authorization.
- Desktop platform, distribution, signing, updater, IPC/RPC, remote WebView, or native OS capability boundaries are unclear.
- Mobile heavy native capabilities are required but target platforms and SDK constraints are unclear.
- Miniapp framework is unspecified.
- Mpx output target is unknown before editing `.mpx` files.
- Database target, migration strategy, backup/restore, or runtime connectivity is unknown.
