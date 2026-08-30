<script lang="ts">
  import type { SurfaceSpec } from "@svadmin/surface";
  import { defaultSurfaceCatalog, SurfaceRenderer, type SurfaceRendererError } from "@svadmin/surface/svelte";
  import type { DshClient } from "$lib/dsh-client";
  import { createDshSurfaceProvider, VOLT_SURFACE_POLICY } from "$lib/surface-agent";

  interface Props {
    readonly spec: SurfaceSpec;
    readonly client: DshClient;
    readonly activeSessionId: string;
    readonly onError?: (message: string) => void;
  }

  let { spec, client, activeSessionId, onError }: Props = $props();
  const provider = $derived(createDshSurfaceProvider(client, activeSessionId));

  function reportError(error: SurfaceRendererError): void {
    if (error.type === "validation") {
      onError?.(error.issues.map((issue) => issue.message).join("；"));
      return;
    }
    onError?.(error.error.message);
  }
</script>

<SurfaceRenderer {spec} catalog={defaultSurfaceCatalog} policy={VOLT_SURFACE_POLICY} dataProvider={provider} onError={reportError} />
