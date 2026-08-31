---
name: ui-customization
description: Design and review safe conversational UI customization for VoltUI. Use when a user asks to change layout, density, sidebar, activity panels, composer size, labels, or quick actions through natural language.
---

# Conversational UI Customization

VoltUI uses a constrained `voltui/ui-patch-v1` JSON protocol for presentation
changes. The assistant may propose a patch; the user must explicitly apply it.

## Allowed surface

- `title` and `subtitle` text
- `density`: `compact` or `comfortable`
- `sidebar`: `expanded` or `collapsed`
- `activity`: `visible` or `hidden`
- `composerRows`: `2`, `3`, or `4`
- up to three `quickActions` with short labels and prompts

Never generate HTML, CSS, JavaScript, event handlers, URLs, file paths, or
runtime/persistence changes as part of a UI patch. Preserve fields the user did
not request. Patches are previewed in the workbench and require confirmation;
the local renderer remains a presentation layer over official DSH runtime APIs.
