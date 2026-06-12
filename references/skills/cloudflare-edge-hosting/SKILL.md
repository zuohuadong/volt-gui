---
name: cloudflare-edge-hosting
description: Use when deploying or reviewing Cloudflare Pages, Pages Functions, Workers, D1, R2, KV, Queues, or other Cloudflare edge hosting choices.
---

# Cloudflare Edge Hosting

Use Cloudflare Pages for static/front-end and simple full-stack Pages Functions.
Use Workers for serverless APIs, edge middleware, webhooks, scheduled jobs, and
apps intentionally designed around Cloudflare bindings.

## Pair With

- `deployment-target-selector` for target selection.
- Frontend skills for the app being deployed.
- `typescript` for Workers/Functions.

## Good Fit

- Global static sites, docs, marketing pages, frontend apps, and preview deploys.
- Full-stack frontend apps that fit Pages Functions.
- Serverless APIs, webhooks, cron triggers, edge middleware, or proxy logic.
- Apps designed around Cloudflare bindings such as D1, R2, KV, Queues, Durable Objects, or Workers AI.

## Poor Fit

- Backends requiring long-running processes or unrestricted Node/server APIs.
- Stateful apps without a clear Cloudflare data/bindings plan.
- China/mainland-first projects where EdgeOne or private/SupaCloud infrastructure is the better fit.
- Existing SupaCloud deployments unless migration is explicitly requested.

## Contract Checklist

```yaml
deployment_profile:
  target: "cloudflare-pages | cloudflare-workers | cloudflare-pages-functions"
  runtime_kind: "static | edge-function | fullstack"
  target_region: "global | unknown"
  domain_dns_owner: "cloudflare | existing | unknown"
  stateful_services: [] # d1 | r2 | kv | queues | durable-objects | hyperdrive
  secrets_strategy: "wrangler secret | dashboard | ci"
  required_skills:
    - "deployment-target-selector"
    - "cloudflare-edge-hosting"
  verification:
    build: ""
    local_preview: ""
    deploy_or_dry_run: ""
    runtime_smoke: ""
    rollback: ""
```

## Verification

Use the project's existing commands first. Typical checks:

- Static/frontend build output matches Pages config.
- `wrangler` auth and config are valid before deploy.
- Local preview or dry-run where possible.
- Deployed URL/custom domain smoke check.
- Worker bindings and secrets are configured outside source control.
- Rollback plan uses Pages rollbacks or previous Worker version strategy.

## Block Instead of Defaulting

Block when Cloudflare account/DNS ownership, secrets, bindings, runtime limits,
data storage, or migration intent is unclear.
