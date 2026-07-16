<script lang="ts">
  import { X, CheckCircle2, RefreshCw, Loader2, Info } from "@lucide/svelte";
  import { onMount } from "svelte";
  import { app } from "../lib/bridge";

  const hasWails = typeof window !== "undefined" && !!window.go?.main?.App;

  let {
    brandName,
    brandShortName,
    version,
    channel,
    onclose,
  }: {
    brandName: string;
    brandShortName: string;
    version: string;
    channel: string;
    onclose: () => void;
  } = $props();

  let updateStatus = $state<"idle" | "checking" | "up-to-date" | "available" | "error">("idle");
  let updateInfo = $state<{ version?: string; url?: string } | undefined>();

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") onclose();
  }

  async function checkForUpdates() {
    if (!hasWails) {
      updateStatus = "error";
      return;
    }
    updateStatus = "checking";
    try {
      const result = await app().CheckUpdate();
      if (result?.available) {
        updateStatus = "available";
        updateInfo = { version: result.latest, url: result.downloadUrl };
      } else {
        updateStatus = "up-to-date";
      }
    } catch {
      updateStatus = "error";
    }
  }

  onMount(() => {
    void checkForUpdates();
  });
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="about-backdrop" role="presentation" onclick={onclose}>
  <div class="about-dialog" role="dialog" aria-modal="true" aria-labelledby="about-title" onclick={(e) => e.stopPropagation()}>
    <button class="about-close" type="button" aria-label="关闭" onclick={onclose}><X size={18} /></button>

    <div class="about-brand">
      <div class="about-brand-mark">{brandShortName.slice(0, 1) || brandName.slice(0, 1)}</div>
      <h2 id="about-title">{brandName}</h2>
      <p class="about-tagline">统一任务工作台</p>
    </div>

    <dl class="about-meta">
      <div><dt>版本</dt><dd>{version === "dev" ? "开发模式 (dev)" : `v${version}`}</dd></div>
      <div><dt>更新通道</dt><dd>{channel === "canary" ? "Canary 预览" : "Stable 稳定版"}</dd></div>
      <div><dt>运行环境</dt><dd>{hasWails ? "桌面应用" : "浏览器预览"}</dd></div>
    </dl>

    <div class="about-update" data-status={updateStatus}>
      {#if updateStatus === "checking"}
        <Loader2 class="spin" size={16} />
        <span>正在检查更新…</span>
      {:else if updateStatus === "up-to-date"}
        <CheckCircle2 size={16} />
        <span>已是最新版本</span>
      {:else if updateStatus === "available"}
        <Info size={16} />
        <span>有新版本可用{updateInfo?.version ? `：v${updateInfo.version}` : ""}</span>
      {:else if updateStatus === "error"}
        <Info size={16} />
        <span>无法检查更新</span>
      {/if}
      <button type="button" onclick={() => void checkForUpdates()} disabled={updateStatus === "checking"}><RefreshCw size={13} /> 重新检查</button>
    </div>

    <footer class="about-footer">
      <span>Copyright &copy; 2026 西谷AI</span>
      <span class="about-tech">Powered by VoltUI Desktop</span>
    </footer>
  </div>
</div>

<style>
  .about-backdrop {
    position: fixed;
    inset: 0;
    z-index: 170;
    display: grid;
    place-items: center;
    padding: 24px;
    background: color-mix(in srgb, var(--foreground, #1f2421) 28%, transparent);
  }

  .about-dialog {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 20px;
    width: min(440px, 100%);
    padding: 36px 32px 24px;
    border: 1px solid var(--border-strong, #c7cfc7);
    border-radius: 16px;
    background: var(--background, #fff);
    color: var(--foreground, #1f2421);
    box-shadow: 0 24px 70px rgb(31 36 33 / 20%);
    text-align: center;
  }

  .about-close {
    position: absolute;
    top: 12px;
    right: 12px;
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--muted-foreground, #687169);
    cursor: pointer;
  }
  .about-close:hover { background: color-mix(in srgb, var(--foreground, #1f2421) 8%, transparent); color: var(--foreground, #1f2421); }

  .about-brand { display: flex; flex-direction: column; align-items: center; gap: 8px; }
  .about-brand-mark {
    display: grid;
    place-items: center;
    width: 56px;
    height: 56px;
    border-radius: 14px;
    font-size: 24px;
    font-weight: 700;
    color: #fff;
    background: #1f2421;
  }
  .about-brand h2 { margin: 0; font-size: 20px; font-weight: 700; }
  .about-tagline { margin: 0; color: var(--muted-foreground, #687169); font-size: 13px; }

  .about-meta { display: grid; gap: 8px; margin: 0; text-align: left; }
  .about-meta > div { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid color-mix(in srgb, var(--border, #dce1db) 60%, transparent); }
  .about-meta > div:last-child { border-bottom: 0; }
  .about-meta dt { color: var(--muted-foreground, #687169); font-size: 12px; }
  .about-meta dd { margin: 0; font-size: 13px; font-weight: 600; }

  .about-update { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 10px; border-radius: 10px; background: color-mix(in srgb, var(--muted, #edf0ec) 50%, transparent); font-size: 12px; }
  .about-update button { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border: 1px solid var(--border, #dce1db); border-radius: 6px; background: var(--card, #fff); color: var(--muted-foreground, #687169); font-size: 11px; cursor: pointer; }
  .about-update button:hover:not(:disabled) { color: var(--foreground, #1f2421); }
  .about-update button:disabled { opacity: 0.5; cursor: default; }
  .about-update[data-status="up-to-date"] { color: #2a7a4a; }
  .about-update[data-status="available"] { color: #b58105; }
  .about-update[data-status="error"] { color: var(--muted-foreground, #687169); }

  .about-footer { display: flex; flex-direction: column; gap: 2px; padding-top: 12px; border-top: 1px solid color-mix(in srgb, var(--border, #dce1db) 60%, transparent); }
  .about-footer span { font-size: 11px; color: var(--muted-foreground, #687169); }
  .about-tech { font-size: 10px !important; opacity: 0.7; }

  :global(.spin) { animation: spin 0.8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  @media (max-width: 520px) {
    .about-backdrop { padding: 0; }
    .about-dialog { min-height: 100dvh; border-radius: 0; border-width: 0; }
  }
</style>
