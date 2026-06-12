---
name: vue-development
description: Build and review Vue 3 applications and components. Use for Composition API, reactivity, routing, Pinia, Vite, TypeScript, UI state, forms, and performance.
---

# Vue Development

## Purpose

Support Vue applications with predictable reactivity, accessible UI, and maintainable component boundaries.

## Workflow

1. Identify Vue version, build tool, state management, routing, and component library.
2. Prefer Composition API patterns that keep data flow explicit.
3. Keep side effects in lifecycle hooks, composables, or stores with clear ownership.
4. Validate forms and API data at boundaries.
5. Verify UI behavior with component tests, E2E tests, or targeted browser checks when useful.

## Checklist

- Reactive refs vs reactive objects, computed values, watchers, and cleanup.
- Props/events contracts and slot behavior.
- Pinia store scope, persistence, and SSR concerns.
- Accessibility, keyboard behavior, loading, empty, and error states.
- Bundle size, route splitting, and excessive watchers.

## Output

Return:

- Component/data-flow summary.
- UX and accessibility risks.
- Test or browser verification notes.
- Migration notes if component contracts change.
