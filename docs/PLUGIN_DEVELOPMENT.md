# Workbench Plugin Development

Volt GUI has two plugin layers:

- `[[plugins]]` are MCP capability plugins. They expose tools, prompts, and resources to the model.
- `[[workbench.plugins]]` are product UI/workflow plugins. They own native workbench surfaces and persist multi-step jobs that users can review, edit, approve, or run in autopilot mode.

Use a workbench plugin when the feature needs deep UI, user-editable intermediate state, artifacts, or multiple generation steps. Use an MCP plugin when the feature only needs model-callable tools.

## Configuration

Workbench plugins are declared in `voltui.toml`:

```toml
[[workbench.plugins]]
id = "content-studio"
name = "Content Studio"
kind = "native"
entry = "content-studio"
version = "1.0.0"
capabilities = ["presentation", "poster", "video"]
provider_ids = ["asset-mcp", "render-http"]
config = { default_mode = "manual" }

[[workbench.providers]]
id = "asset-mcp"
type = "mcp"
server = "internal-assets"
capabilities = ["image-search", "asset-library"]

[[workbench.providers]]
id = "render-http"
type = "http"
url = "https://render.example.com"
capabilities = ["image-render", "video-render"]
headers = { Authorization = "Bearer ${RENDER_TOKEN}" }
```

Provider secrets must stay in environment variables. The desktop bridge exposes only `headerKeys` and `envKeys`, not secret values.

## Runtime Model

Workbench state is workspace-local:

```text
<workspace>/.voltui/workbench/
  jobs/<job-id>.json
  artifacts/<job-id>/
```

A job is the durable unit of work:

- `pluginId`: which workbench plugin owns it.
- `kind`: plugin-defined job type, for example `presentation`, `poster`, or `video`.
- `scenario`: user-selected generation scenario.
- `templateId`: optional template reference.
- `mode`: `manual`, `autopilot`, or a plugin-defined mode.
- `steps`: user-editable workflow checkpoints.
- `artifacts`: exported files such as `.pptx`, poster images, or video clips.

Steps should represent reviewable decisions, not hidden implementation details. A content studio can model:

- Presentation: outline -> layout -> visuals.
- Poster: copy/style confirmation -> generation -> export.
- Video: script confirmation -> clip generation -> stitching/export.

## Desktop Bridge

The Wails bridge exposes these methods:

```ts
WorkbenchPlugins(): Promise<WorkbenchPlugin[]>
WorkbenchProviders(): Promise<WorkbenchProvider[]>
ListWorkbenchJobs(): Promise<WorkbenchJob[]>
CreateWorkbenchJob(input: CreateWorkbenchJobInput): Promise<WorkbenchJob>
GetWorkbenchJob(id: string): Promise<WorkbenchJob>
UpdateWorkbenchStep(jobID: string, stepID: string, patch: UpdateWorkbenchStepInput): Promise<WorkbenchJob>
ApproveWorkbenchStep(jobID: string, stepID: string): Promise<WorkbenchJob>
AddWorkbenchArtifact(jobID: string, artifact: WorkbenchArtifactInput): Promise<WorkbenchJob>
WorkbenchArtifactDir(jobID: string): Promise<string>
```

The Svelte workbench also exposes these resources through `workbenchDataProvider`:

- `workbenchPlugins`
- `workbenchProviders`
- `workbenchJobs`

## Implementation Pattern

1. Add `[[workbench.plugins]]` and the required `[[workbench.providers]]`.
2. Build a native Svelte surface keyed by the plugin `entry`.
3. Create a job with explicit steps.
4. Let users edit each step output before approving or moving forward.
5. Store generated files under `WorkbenchArtifactDir(jobID)`.
6. Register completed files with `AddWorkbenchArtifact`.

MCP providers should do capability work such as retrieval, generation, rendering, and export. The native workbench plugin should own product UX, state transitions, validation, and artifact review.

## Production Checklist

- Keep plugin config generic; do not hardcode a customer or deployment name.
- Never expose provider secrets to the frontend.
- Persist every user-editable intermediate result in a job step.
- Make autopilot an explicit mode, not an implicit default.
- Use deterministic artifact names inside the job artifact directory.
- Verify config round-trip, store behavior, Wails bindings, frontend typecheck, and production build before publishing a plugin.

Recommended checks:

```sh
go test ./internal/config -run Render
go test ./internal/workbench
cd desktop && GOTOOLCHAIN=local GOPROXY=https://goproxy.cn,direct go test . -run 'TestWorkbench|TestWailsBinding|TestWorkspace|TestCheckpoints|TestAuth|TestOIDC|TestIsLoopback|TestPostStartupPing|TestAttachDropped'
cd desktop/frontend && pnpm check
cd desktop/frontend && pnpm build
git diff --check
```
