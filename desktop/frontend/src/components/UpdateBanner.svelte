<script lang="ts">
  import { onMount } from "svelte";
  import { Download, ExternalLink, RefreshCw, X } from "@lucide/svelte";
  import { app, onUpdaterProgress } from "../lib/bridge";
  import type { UpdateInfo, UpdateProgress } from "../lib/types";

  type UpdateStatus =
    | { kind: "idle" }
    | { kind: "checking" }
    | { kind: "upToDate"; current: string }
    | { kind: "available"; info: UpdateInfo }
    | { kind: "downloading"; received: number; total: number; info: UpdateInfo }
    | { kind: "verifying"; info: UpdateInfo }
    | { kind: "applying"; info: UpdateInfo }
    | { kind: "done" }
    | { kind: "error"; message: string };

  let status = $state<UpdateStatus>({ kind: "idle" });
  let dismissed = $state("");

  const activeInfo = $derived(
    status.kind === "available" || status.kind === "downloading" || status.kind === "verifying" || status.kind === "applying"
      ? status.info
      : undefined,
  );
  const visible = $derived(status.kind !== "idle" && status.kind !== "checking" && status.kind !== "upToDate");
  const progressPercent = $derived(status.kind === "downloading" && status.total > 0 ? Math.round((status.received / status.total) * 100) : 0);

  onMount(() => {
    const unsubscribe = onUpdaterProgress(applyProgress);
    void check(false);
    return unsubscribe;
  });

  function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }

  function applyProgress(progress: UpdateProgress) {
    if (progress.phase === "error") {
      status = { kind: "error", message: progress.err || "update failed" };
      return;
    }
    if (!activeInfo) return;
    if (progress.phase === "downloading") status = { kind: "downloading", received: progress.received, total: progress.total, info: activeInfo };
    if (progress.phase === "verifying") status = { kind: "verifying", info: activeInfo };
    if (progress.phase === "applying") status = { kind: "applying", info: activeInfo };
    if (progress.phase === "done") status = { kind: "done" };
  }

  async function check(showUpToDate = true) {
    status = { kind: "checking" };
    try {
      const info = await app().CheckUpdate();
      if (!info) {
        status = { kind: "upToDate", current: "" };
        return;
      }
      if (info.err) {
        status = showUpToDate ? { kind: "error", message: info.err } : { kind: "idle" };
        return;
      }
      status = info.available ? { kind: "available", info } : showUpToDate ? { kind: "upToDate", current: info.current } : { kind: "idle" };
    } catch (error) {
      status = showUpToDate ? { kind: "error", message: errorMessage(error) } : { kind: "idle" };
    }
  }

  async function applyUpdate(info: UpdateInfo) {
    if (!info.canSelfUpdate) {
      await app().OpenDownloadPage();
      return;
    }
    status = { kind: "downloading", received: 0, total: info.assetSize, info };
    try {
      await app().ApplyUpdate();
    } catch (error) {
      status = { kind: "error", message: errorMessage(error) };
    }
  }

  function applyActiveUpdate() {
    if (activeInfo) void applyUpdate(activeInfo);
  }

  function dismissActiveUpdate() {
    if (activeInfo) dismissed = activeInfo.latest;
  }
</script>

{#if visible && !(activeInfo && activeInfo.latest === dismissed)}
  <section class={["update-banner", status.kind === "error" && "update-banner--error"]} aria-label="Software update" data-testid="update-banner">
    {#if status.kind === "available"}
      <div>
        <strong>Update available: {status.info.latest}</strong>
        <span>{status.info.canSelfUpdate ? "Ready to download and install." : "Manual download is required for this platform."}</span>
        {#if status.info.notes}
          <p>{status.info.notes}</p>
        {/if}
      </div>
      <button type="button" onclick={applyActiveUpdate}>
        {#if status.info.canSelfUpdate}<Download size={15} /> Update{:else}<ExternalLink size={15} /> Download{/if}
      </button>
      <button class="icon-button" type="button" aria-label="Dismiss update" onclick={dismissActiveUpdate}><X size={15} /></button>
    {:else if status.kind === "downloading"}
      <div>
        <strong>Downloading update {progressPercent}%</strong>
        <progress value={status.received} max={status.total || undefined}></progress>
      </div>
    {:else if status.kind === "verifying"}
      <strong>Verifying update signature...</strong>
    {:else if status.kind === "applying"}
      <strong>Installing update...</strong>
    {:else if status.kind === "done"}
      <strong>Update complete. Restarting...</strong>
    {:else if status.kind === "error"}
      <div>
        <strong>Update failed</strong>
        <span>{status.message}</span>
      </div>
      <button type="button" onclick={() => check(true)}><RefreshCw size={15} /> Retry</button>
    {/if}
  </section>
{/if}
