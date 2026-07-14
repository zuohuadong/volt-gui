# Volt GUI visual language

## Contents

- Product character
- Layout and density
- Color and elevation
- Typography and icons
- Component anatomy
- Responsive behavior
- Migration constraints

## Product character

Use the concrete reference of a precision electronics workbench organized like a well-indexed case file. The interface should feel durable, inspectable, and ready for long sessions: matte materials, disciplined labels, shallow hierarchy, and visible operational state.

Volt GUI is not a Codex skin. Borrow Codex Desktop's panel discipline, composer focus, and progressive disclosure; borrow aoristlawer's enterprise information rhythm; express both through Volt's local-first, operational identity.

## Layout and density

- Use a stable shell with a 240-280px left navigation region, a flexible main canvas, and optional right/bottom inspection panels.
- Use 46px for the primary desktop toolbar, 36-40px for pane toolbars, and 32-36px for common controls.
- Use 4px as the base spacing unit. Prefer 8, 12, 16, 20, 24, and 32px gaps.
- Keep page content aligned to a clear reading column. Use full width for diff, tables, timelines, and workbench panels; cap prose/settings forms around 720-860px.
- Prefer one surface plus dividers over nested cards. Use cards only for separable objects, decisions, or reusable actions.
- Reserve large empty areas for conversation focus, diff inspection, or onboarding—not decorative breathing room.

## Color and elevation

- Canvas: cool neutral, slightly darker than the content surface.
- Surface: white or near-white.
- Primary controls: graphite.
- Accent: Volt green, used for selection, focus, current context, and constructive actions.
- Status: green for success, amber for warning/pending attention, red for destructive/error.
- Use 1px borders as the default separation mechanism.
- Use a small shadow only for floating composer, popover, modal, or drag surface. Docked panels should normally have no shadow.
- Do not use gradients except for data visualization or an explicitly approved branded illustration.

## Typography and icons

- Use the native system sans stack with `Noto Sans SC` fallback; use the existing monospace stack for paths, commands, hashes, and code.
- Use 12-14px for most desktop content, 15-16px for section titles, 20-24px for page titles, and 11-12px for metadata.
- Use weight before size to create hierarchy. Avoid oversized headings inside operational surfaces.
- Use tabular numerals for usage, token counts, diff stats, dates, and durations.
- Use one Lucide icon per action where it materially improves scanning. Do not add decorative icon badges to every card.

## Component anatomy

### App shell

- Left: workspace/project/task navigation and durable resources.
- Center: current task, conversation, workbench, or settings surface.
- Right/bottom: contextual inspection such as diff, files, browser, artifacts, terminal, or process state.
- Header: current location, narrow context, and a small set of page-level actions.

### Navigation row

- Height: 32-36px.
- Structure: icon, label, optional count/status, optional trailing action.
- Active state: soft Volt green or strong neutral surface; never rely on color alone.
- Hover state: neutral tint; preserve layout dimensions.

### Buttons

- Primary: graphite or Volt green fill, white text, one per local decision group.
- Secondary: surface fill, border, graphite text.
- Ghost: transparent with neutral hover.
- Danger: red only at confirmation or irreversible action points.
- Avoid making the last button primary by selector position; encode variants semantically.

### Tabs and segmented controls

- Use tabs for sibling views within one resource.
- Use segmented controls for mutually exclusive modes with immediate effect.
- Do not place Work/Code activity selection in the same control as Ask/Auto/Plan/Goal execution posture.

### Cards and rows

- Prefer rows for high-volume resources and cards for summaries, templates, or action choices.
- Keep card radius at 8-12px and padding at 12-16px.
- Put the object's identity first, state second, and actions last.
- Avoid cards inside cards; use sections and dividers inside a complex card.

### Composer

- Use a 12-16px radius and a single clear border.
- Keep the textarea visually dominant.
- Put attachment/reference actions on the left, model/permission/status near the bottom edge, and submit/cancel on the right.
- Keep menus attached to their trigger and constrained to the viewport.

### Modal and popover

- Modal radius: 14-16px; header and footer separated by hairlines.
- Use a modal for configuration, creation, and destructive confirmation.
- Use popovers for contextual choices that do not require leaving the current task.
- Keep the primary action visible while the body scrolls.

## Responsive behavior

- At narrow widths, collapse secondary inspection panels before shrinking the main task surface below usability.
- Turn the sidebar into a drawer on small mobile widths; preserve a clear reopen affordance.
- Stack toolbars and composer controls only when necessary; keep submit/cancel reachable.
- Replace multi-column summary grids with a single scannable list on mobile.
- Do not hide critical state such as active workspace, permission mode, or running status solely because of width.

## Migration constraints

- New styles must not add another global normalization block to `App.svelte`.
- Treat current `--aorist-*` and `--law-*` variables as migration aliases. Introduce new semantic tokens through `DESIGN.md`, `@svadmin/ui`, or a single owned theme layer.
- Prefer extracting coherent surfaces from the oversized `App.svelte` into components before adding large new style sections.
- Preserve existing screenshot and feature-smoke selectors unless the change intentionally updates the test contract.
