<script lang="ts">
  import type { SurfaceInteractionEvent, SurfaceSpec } from "@svadmin/surface";
  import { SurfaceRenderer, type SurfaceRendererError } from "@svadmin/surface/svelte";
  import type { DshClient } from "$lib/dsh-client";
  import { createDshSurfaceProvider, VOLT_SURFACE_POLICY } from "$lib/surface-agent";
  import { VOLT_SURFACE_CATALOG } from "$lib/surface-catalog";

  interface Props {
    readonly spec: SurfaceSpec;
    readonly client: DshClient;
    readonly activeSessionId: string;
    readonly onError?: (message: string) => void;
    readonly onInteraction?: (event: SurfaceInteractionEvent) => void;
  }

  let { spec, client, activeSessionId, onError, onInteraction }: Props = $props();
  const provider = $derived(createDshSurfaceProvider(client, activeSessionId));

  function reportError(error: SurfaceRendererError): void {
    if (error.type === "validation") {
      onError?.(error.issues.map((issue) => issue.message).join("；"));
      return;
    }
    onError?.(error.error.message);
  }
</script>

<SurfaceRenderer {spec} catalog={VOLT_SURFACE_CATALOG} policy={VOLT_SURFACE_POLICY} dataProvider={provider} onError={reportError} {...(onInteraction === undefined ? {} : { onInteraction })} />
