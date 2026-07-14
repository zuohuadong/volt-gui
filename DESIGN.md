---
version: "alpha"
name: "Volt Operational Canvas"
description: "A calm, compact desktop workbench for trustworthy agent operations and code work."
colors:
  primary: "#1F2421"
  on-primary: "#FFFFFF"
  accent: "#0F7B55"
  on-accent: "#FFFFFF"
  accent-soft: "#E7F5EF"
  canvas: "#F3F5F2"
  surface: "#FFFFFF"
  surface-muted: "#EDF0EC"
  border: "#DCE1DB"
  border-strong: "#C7CFC7"
  text: "#1F2421"
  text-muted: "#687169"
  text-faint: "#89918B"
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
    width: "260px"
  toolbar:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    height: "46px"
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
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent}"
    rounded: "{rounded.md}"
    height: "34px"
  composer:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.xl}"
    padding: "12px"
  modal:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.xl}"
    padding: "16px"
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

Volt Operational Canvas combines a precision electronics workbench with a well-indexed case file. It should feel calm enough for long-running agent sessions, dense enough for professional operations, and explicit enough that users can always see what the system is doing.

The design learns from aoristlawer's enterprise information rhythm and Codex Desktop's panel/composer discipline, but it is not a visual clone of either. Volt GUI uses its own graphite-and-Volt-green identity, local-first trust model, and Work/Code product structure.

## Colors

Use neutral surfaces for most of the interface. Graphite carries primary actions and high-emphasis text. Volt green is the single product accent for focus, current selection, and constructive actions.

- Use `canvas` behind docked surfaces and `surface` for content.
- Use `accent-soft` for selected navigation and contextual emphasis.
- Reserve warning and danger colors for real state, not decorative category labels.
- Never use color alone to communicate running, blocked, failed, or selected state.

## Typography

Use the operating system's native sans stack so the desktop feels integrated on macOS and Windows. Use weight and spacing before increasing size. Most operational text should stay between 12px and 14px.

Use monospace only for paths, commands, model identifiers, hashes, logs, and code. Use tabular numerals for tokens, usage, durations, dates, and diff statistics.

## Layout

Use a stable desktop shell: durable navigation on the left, the active task in the center, and contextual inspection in optional right or bottom panels. Collapse inspection panels before compressing the primary task surface.

Spacing follows a 4px base. Keep controls compact and aligned. Prefer rows for large resource sets and cards for summaries, templates, or decisions. Avoid nested decorative cards.

## Elevation & Depth

Use borders and surface changes for docked structure. Shadows are reserved for floating composer surfaces, popovers, drag previews, and modals. Avoid glass, glow, and ornamental depth.

## Shapes

Use 6-8px radii for controls and rows, 12px for cards, and 16px for composer/modal surfaces. Pill shapes are limited to statuses, compact segmented controls, and small metadata chips.

## Components

- **Navigation:** 32-36px rows with icon, label, optional count/state, and stable trailing actions.
- **Toolbar:** 46px primary toolbar; 36-40px pane toolbars.
- **Buttons:** one semantic primary action per local decision group; secondary and ghost actions remain visually quieter.
- **Composer:** text first, advanced controls progressively disclosed, execution status and cancel always visible when running.
- **Tabs:** use for sibling views; do not combine Work/Code activity with execution posture or permission mode.
- **Modal:** fixed header/footer, scrollable body, visible save/confirm action.
- **Status:** pair text and icon with color; keep pending dependencies and recovery paths explicit.

## Do's and Don'ts

- Do make system state and recovery paths visible at the point of action.
- Do keep Work and Code structurally distinct while sharing a consistent shell.
- Do use real empty states and templates instead of fake business data.
- Do preserve keyboard focus, reduced motion, and desktop/mobile behavior.
- Don't copy OpenAI branding, fonts, source code, product copy, or illustrations.
- Don't add new `--aorist-*`, `--law-*`, or Accio-named styling; those are legacy compatibility layers.
- Don't append broad normalization selectors to `App.svelte`; move styles toward owned components and semantic tokens.
- Don't use gradients, oversized headings, floating card stacks, or decorative badges in operational surfaces.
