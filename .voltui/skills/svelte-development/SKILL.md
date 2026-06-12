---
name: svelte-development
description: Build and review Svelte and SvelteKit applications. Use for Svelte 5 runes, components, stores, load functions, form actions, routing, SSR, and TypeScript.
---

# Svelte Development

## Purpose

Support Svelte applications with idiomatic reactivity, strong route boundaries, and production-safe SvelteKit behavior.

## Workflow

1. Identify Svelte/SvelteKit version and whether Svelte 5 runes are used.
2. Keep state ownership clear between component state, stores, load functions, and server actions.
3. Treat server code, environment variables, cookies, and auth as boundary-sensitive.
4. Avoid client/server leakage in universal modules.
5. Verify with typecheck, tests, build, and browser checks for UI changes.

## Checklist

- Runes or legacy reactivity consistency.
- `load` dependency tracking, invalidation, and redirects.
- Form actions, validation, progressive enhancement, and errors.
- SSR safety, hydration consistency, and browser-only APIs.
- Accessibility, keyboard behavior, and responsive layout.

## Output

Return:

- Route/component summary.
- Reactivity and SSR risks.
- Verification commands.
- User-visible behavior changes.
