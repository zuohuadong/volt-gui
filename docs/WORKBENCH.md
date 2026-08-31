# Workbench

The desktop workbench is a local Svelte 5 renderer hosted inside a hardened Electron window. It uses shadcn-svelte for focused controls and svadmin for resource-oriented management views.

Electron starts the official web profile, waits for a trusted `dsh web:` loopback URL, and exposes only an allowlisted RPC/event bridge through the isolated preload. The renderer does not mirror DSH persistence or implement a second agent engine, so session, tool, approval, and credential behavior remains owned by the official runtime.

The profile overlay in `profiles/anyong.yml` contains only product defaults. Missing runtime capabilities should be implemented as official DSH profile/plugin configuration or upstream contributions, not as private engine code in this repository.

## Conversational operation surfaces

Volt can generate constrained svadmin operation surfaces from a conversation. The model returns a versioned `@svadmin/surface` JSON proposal rather than executable Svelte, HTML, CSS, JavaScript, SQL, URLs, or event handlers. Volt validates the proposal against a fixed component catalog and resource policy, presents a preview, and renders it through the Svelte `SurfaceRenderer` only after explicit user confirmation.

This follows the declarative architecture demonstrated by DSH Generative UI plugins while keeping Volt on Svelte 5 and svadmin. It does not load a third-party React renderer or add another session, permission, credential, workspace, or persistence backend.
