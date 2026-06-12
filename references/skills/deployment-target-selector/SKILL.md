---
name: deployment-target-selector
description: Use when choosing or reviewing a hosting/deployment target such as SupaCloud, svadmin, Tencent EdgeOne, Cloudflare Pages/Workers, self-hosting, static hosting, edge functions, or admin backoffice surfaces.
---

# Deployment Target Selector

This skill turns deployment choice into a recorded Task Contract decision. It is
not a deployment command runner and must not override existing infrastructure.

## Pair With

Load the concrete platform skill after selecting a target:

- `supacloud-platform`
- `svadmin-admin-ui`
- `edgeone-deploy`
- `cloudflare-edge-hosting`
- `provider-adapter` when provider/CI/PR state matters

## Decision Order

Use the first source that applies:

1. User instruction.
2. Existing project deployment docs, CI, DNS, domains, env files, and provider config.
3. Existing runtime constraints: region, data residency, auth, database, storage, queues, realtime, admin needs.
4. Project/team platform preference.
5. Newcomer-friendly fallback.
6. Block and ask.

Do not migrate a project between hosting providers without explicit user
instruction and a rollback plan.

## Target Selection

- Existing deployment: keep it unless the task is explicitly a migration.
- SupaCloud: use for Supabase-style/self-hosted projects needing Postgres, auth,
  storage, edge functions, frontend hosting, project lifecycle, or multi-tenant control plane.
- svadmin: use for admin/backoffice CRUD UI on top of an existing backend; it is
  not a public-site or general app hosting platform.
- Cloudflare Pages: use for globally distributed static sites, docs, marketing
  pages, frontend apps, and full-stack Pages Functions when Cloudflare account/DNS is acceptable.
- Cloudflare Workers: use for global serverless APIs, edge middleware, webhooks,
  cron, proxy logic, or apps designed around Workers bindings.
- Tencent EdgeOne Pages/Functions: use when China/mainland latency, Tencent Cloud
  ecosystem, domain/DNS control, or EdgeOne product fit matters.

## Contract Fields

```yaml
deployment_profile:
  target: "existing | none | supacloud | svadmin | edgeone-pages | edgeone-functions | cloudflare-pages | cloudflare-workers | cloudflare-pages-functions | blocked"
  decision_source: "user | docs | detected | project-overlay | recommended-fallback | blocked"
  evidence: []
  runtime_kind: "static | edge-function | fullstack | backend | admin-ui | unknown"
  target_region: "global | china-mainland | private-infra | unknown"
  data_residency: "none | public-content | user-data | sensitive | unknown"
  domain_dns_owner: "cloudflare | tencent-edgeone | supacloud-caddy | existing | unknown"
  stateful_services: []
  secrets_strategy: ""
  required_skills: []
  verification:
    build: ""
    local_preview: ""
    deploy_or_dry_run: ""
    runtime_smoke: ""
    rollback: ""
  non_goals:
    - "do not migrate hosting provider unless explicitly requested"
    - "do not introduce a managed platform when a static/no-backend target is sufficient"
```

## Block Conditions

Block and ask when:

- target region, domain/DNS owner, provider account, or credentials are unknown;
- the task implies hosting migration without explicit authorization;
- user data, auth, files, queues, or database state exist but the target has no recorded state plan;
- China/mainland ICP/compliance, cross-border latency, or data residency matters but is unspecified;
- static hosting is enough but the recommendation introduces a full PaaS;
- a public app is being pushed into an admin-only framework such as svadmin;
- a stateful backend is being pushed into edge functions without a storage/bindings plan.
