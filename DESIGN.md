---
version: "alpha"
name: "Volt Codex Workbench"
description: "A restrained, compact desktop workbench for trustworthy agent operations and code review."
colors:
  primary: "#20211F"
  on-primary: "#FFFFFF"
  accent: "#2D6A4F"
  on-accent: "#FFFFFF"
  canvas: "#F6F6F5"
  surface: "#FFFFFF"
  surface-muted: "#F1F1EF"
  border: "#E3E3E0"
  border-strong: "#CBCBC6"
  text: "#20211F"
  text-muted: "#6F6F69"
  text-faint: "#92928C"
  warning: "#9A5B00"
  warning-soft: "#FFF4DE"
  danger: "#B42318"
  danger-soft: "#FDECEA"
typography:
  title-lg:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Noto Sans SC, sans-serif"
    fontSize: "24px"
    fontWeight: 650
    lineHeight: 1.25
  title-md:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Noto Sans SC, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.35
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Noto Sans SC, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Noto Sans SC, sans-serif"
    fontSize: "12px"
    fontWeight: 550
    lineHeight: 1.35
  meta:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Noto Sans SC, sans-serif"
    fontSize: "11px"
    fontWeight: 450
    lineHeight: 1.4
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, SF Mono, Cascadia Code, Consolas, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "32px"
components:
  app-shell:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
  surface:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
  sidebar:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.text}"
    width: "248px"
  toolbar:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    height: "42px"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.sm}"
    height: "34px"
    padding: "0 12px"
  button-accent:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.sm}"
    height: "34px"
    padding: "0 12px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    height: "34px"
    padding: "0 12px"
  navigation-active:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    height: "34px"
  composer:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    padding: "10px"
  modal:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    padding: "16px"
  review-row:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.xs}"
    height: "36px"
    padding: "0 12px"
  pane-toolbar:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    height: "40px"
  divider:
    backgroundColor: "{colors.border}"
    height: "1px"
  divider-strong:
    backgroundColor: "{colors.border-strong}"
    height: "1px"
  text-muted:
    textColor: "{colors.text-muted}"
    typography: "{typography.meta}"
  text-faint:
    textColor: "{colors.text-faint}"
    typography: "{typography.meta}"
  status-warning:
    backgroundColor: "{colors.warning-soft}"
    textColor: "{colors.warning}"
    rounded: "{rounded.full}"
  status-danger:
    backgroundColor: "{colors.danger-soft}"
    textColor: "{colors.danger}"
    rounded: "{rounded.full}"
---

## Overview

Volt Codex Workbench combines a precision electronics workbench with a well-indexed case file. Its interaction rhythm is deliberately closer to Codex Desktop: quiet neutral panels, compact review rows, a transcript-first center, and local pending/recovery states at the control that initiated them. It should feel calm enough for long-running agent sessions, dense enough for professional operations, and explicit enough that users can always see what the system is doing.

The design learns from aoristlawer's enterprise information rhythm and verified Codex Desktop 5591 panel/composer/review behavior, but it is not a visual clone of either. Volt GUI keeps its own graphite identity, restrained Volt green for constructive status, local-first trust model, and Work/Code product structure.

## Colors

Use neutral surfaces for almost the entire interface. Graphite carries primary actions, selection, and high-emphasis text. Volt green is reserved for constructive status, completion, and rare focus emphasis; it is no longer the default fill for every selected navigation row.

- Use `canvas` behind docked surfaces and `surface` for content.
- Use a neutral inset surface for selected navigation; reserve green tint for constructive contextual status only.
- Reserve warning and danger colors for real state, not decorative category labels.
- Never use color alone to communicate running, blocked, failed, or selected state.

## Typography

Use the operating system's native sans stack so the desktop feels integrated on macOS and Windows. Use weight and spacing before increasing size. Most operational text should stay between 12px and 14px.

Use monospace only for paths, commands, model identifiers, hashes, logs, and code. Use tabular numerals for tokens, usage, durations, dates, and diff statistics.

## Layout

Use a stable desktop shell: durable 248px navigation on the left, the active task in the center, and contextual inspection in optional right or bottom panels. Collapse inspection panels before compressing the primary task surface. Primary toolbars are 42px, pane toolbars are 40px, and high-volume Review rows are exactly 36px with 12px horizontal padding.

Spacing follows a 4px base. Keep controls compact and aligned. Prefer rows for large resource sets and cards for summaries, templates, or decisions. Avoid nested decorative cards.

## Elevation & Depth

Use hairline borders and small surface changes for docked structure. Docked Code/Review panes have no shadow. Shadows are reserved for floating composer surfaces, popovers, drag previews, confirmations, and modals. Avoid glass, glow, and ornamental depth.

## Shapes

Use 6-8px radii for controls and rows, 12px for cards, and 16px for composer/modal surfaces. Pill shapes are limited to statuses, compact segmented controls, and small metadata chips.

## Components

- **Navigation:** 32-36px rows with icon, label, optional count/state, and stable trailing actions. Active rows normally use a white/neutral inset surface with graphite text.
- **Toolbar:** 42px primary toolbar; 40px pane toolbars.
- **Buttons:** one semantic primary action per local decision group; secondary and ghost actions remain visually quieter.
- **Composer:** text first, 12px structural radius, advanced controls progressively disclosed, provisional submission status and cancel always visible while authority is pending.
- **Tabs:** use for sibling views; do not combine Work/Code activity with execution posture or permission mode.
- **Modal:** fixed header/footer, scrollable body, visible save/confirm action.
- **Status:** pair text and icon with color; keep pending dependencies and recovery paths explicit.
- **Review:** 36px file rows, Unstaged/Staged sibling sources, path-local patch pending, local revert confirmation, and one shared Commit/Push/Create PR workflow gate. A staged Revert exposes partial success instead of flattening it into failure.

## Runtime Surface Contracts

- **Terminal:** before PTY attach, user input is visibly queued rather than dropped; resize requests coalesce to the newest dimensions; reconnect snapshots expose only the final 16,000 characters. TypeScript owns product pending/recovery state, the Go desktop backend owns PTY lifetime, and a renderer may own only cells, input, and selection.
- **CodeSurface:** every write carries `fileHandle`, `documentGeneration`, and `ticket`. A stale acknowledgement never replaces the visible document. The Go desktop backend remains authoritative for workspace path, mtime, and disk writes; renderer state is limited to the document model, selection, undo, and IME. Conflict UI preserves the draft and offers compare, reload, or retry instead of silently overwriting the file.
- These contracts describe required behavior for a real surface. Do not render a successful terminal attach or file write until the Wails backend exposes the matching authority and acknowledgement.

## Do's and Don'ts

- Do make system state and recovery paths visible at the point of action.
- Do keep Work and Code structurally distinct while sharing a consistent shell.
- Do use real empty states and templates instead of fake business data.
- Do preserve keyboard focus, reduced motion, and desktop/mobile behavior.
- Don't copy OpenAI branding, fonts, source code, product copy, or illustrations.
- Don't add new `--aorist-*`, `--law-*`, or Accio-named styling; those are legacy compatibility layers.
- Don't append broad normalization selectors to `App.svelte`; move styles toward owned components and semantic tokens.
- Don't use gradients, oversized headings, floating card stacks, or decorative badges in operational surfaces.
