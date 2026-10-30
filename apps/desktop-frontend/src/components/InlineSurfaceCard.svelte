<script lang="ts">
  import { AlertTriangle, LoaderCircle } from "@lucide/svelte";
  import type { SurfaceSpec } from "@svadmin/surface";
  import type { DshClient } from "$lib/dsh-client";
  import type { SurfaceInteractionEvent } from "@svadmin/surface";
  import { t } from "$lib/i18n";

  interface Props {
    readonly spec: SurfaceSpec;
    readonly client?: DshClient;
    readonly sessionId: string;
    readonly onInteraction?: (event: SurfaceInteractionEvent, spec: SurfaceSpec) => void;
  }

  type GeneratedSurfaceComponent = typeof import("./GeneratedSurface.svelte").default;

  let { spec, client, sessionId, onInteraction }: Props = $props();
  let Renderer = $state<GeneratedSurfaceComponent>();
  let loadFailed = $state(false);
  let renderError = $state("");
  let loadStarted = false;

  // 按需加载渲染器：只用标题的消息不引入 svadmin surface 渲染包。
  $effect(() => {
    if (loadStarted) return;
    loadStarted = true;
    void import("./GeneratedSurface.svelte")
      .then((module) => { Renderer = module.default; })
      .catch(() => { loadFailed = true; });
  });
</script>

<section class="inline-surface" aria-label={spec.title}>
  <header class="inline-surface__header">
    <strong>{spec.title}</strong>
    <span class="inline-surface__badge">{t("surface.inlineReadOnly")}</span>
  </header>
  {#if !client}
    <p class="inline-surface__status">{t("surface.inlineUnavailable")}</p>
  {:else if Renderer}
    <Renderer {spec} {client} activeSessionId={sessionId} onError={(message) => { renderError = message; }}
      {...(onInteraction === undefined ? {} : { onInteraction: (event: SurfaceInteractionEvent) => onInteraction(event, spec) })} />
    {#if renderError}<p class="inline-surface__status inline-surface__status--error" role="status">{t("surface.inlineError")}：{renderError}</p>{/if}
  {:else if loadFailed}
    <p class="inline-surface__status inline-surface__status--error" role="alert">
      <AlertTriangle size={14} aria-hidden="true" />{t("surface.inlineLoadFailed")}
    </p>
  {:else}
    <p class="inline-surface__status" role="status"><LoaderCircle size={14} class="spin" aria-hidden="true" />{t("surface.inlineGenerating")}</p>
  {/if}
</section>

<style>
  .inline-surface {
    display: grid;
    gap: 8px;
    margin: 10px 0;
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--background);
  }
  .inline-surface__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .inline-surface__badge {
    padding: 1px 6px;
    border: 1px solid var(--border);
    border-radius: 999px;
    color: var(--muted-foreground);
    font-size: 11px;
    white-space: nowrap;
  }
  .inline-surface__status {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    color: var(--muted-foreground);
    font-size: 12px;
  }
  .inline-surface__status--error { color: var(--destructive); }
</style>