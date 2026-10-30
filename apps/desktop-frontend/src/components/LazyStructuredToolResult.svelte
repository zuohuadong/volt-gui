<script lang="ts">
  import { LoaderCircle } from "@lucide/svelte";
  import { Button } from "$components/ui/button";
  import type { DshClient } from "$lib/dsh-client";
  import type { ToolInfo } from "$lib/transcript";
  import { t } from "$lib/i18n";

  type StructuredToolResultComponent = typeof import("$components/StructuredToolResult.svelte").default;

  let {
    enabled,
    tool,
    client,
    sessionId = "",
  }: {
    readonly enabled: boolean;
    readonly tool: ToolInfo;
    readonly client?: DshClient;
    readonly sessionId?: string;
  } = $props();

  let StructuredToolResult = $state<StructuredToolResultComponent>();
  let loading = $state(false);
  let loadError = $state(false);
  let retryToken = $state(0);

  $effect(() => {
    if (!enabled || StructuredToolResult || loading) return;
    retryToken;
    loading = true;
    loadError = false;
    void import("$components/StructuredToolResult.svelte")
      .then((module) => {
        StructuredToolResult = module.default;
      })
      .catch(() => {
        loadError = true;
      })
      .finally(() => {
        loading = false;
      });
  });
</script>

{#if StructuredToolResult}
  <StructuredToolResult {tool} {client} {sessionId} />
{:else if enabled && loading}
  <span class="lazy-tool-result-loading" aria-live="polite"><LoaderCircle size={14} class="spin" /></span>
{:else if enabled && loadError}
  <Button variant="ghost" size="sm" onclick={() => retryToken += 1}>{t("common.retry")}</Button>
{/if}
