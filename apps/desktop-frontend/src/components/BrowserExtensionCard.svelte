<script lang="ts">
  import { onMount } from "svelte";
  import { Check, Copy, FolderOpen, Globe, Puzzle, RefreshCw } from "@lucide/svelte";
  import { Button } from "$components/ui/button";
  import { StatusBadge } from "@svadmin/ui";
  import type { DesktopBrowserCandidate, DesktopBrowserExtension, DesktopShellApi } from "../electron";
  import { t } from "$lib/i18n";
  import { writeClipboard } from "$lib/clipboard";

  interface Props { readonly shell?: DesktopShellApi; }
  let { shell }: Props = $props();
  let extension = $state<DesktopBrowserExtension | null>(null);
  let browsers = $state<DesktopBrowserCandidate[]>([]);
  let busy = $state("");
  let notice = $state("");
  let copied = $state(false);
  let error = $state("");
  let installTarget = $state<DesktopBrowserCandidate | null>(null);
  let pathCopied = $state(false);
  const isMac = typeof navigator !== "undefined" && /Mac/i.test(navigator.userAgent);

  function api(): DesktopShellApi | undefined { return shell ?? window.voltDesktop; }

  onMount(() => { void refresh(); });

  async function refresh(): Promise<void> {
    const desktop = api();
    if (!desktop) { error = t("browserExtension.bridgeNotLoaded"); return; }
    busy = "refresh"; error = "";
    try {
      const [state, detected] = await Promise.all([
        desktop.browserExtension(),
        desktop.browserExtensionBrowsers?.() ?? Promise.resolve([]),
      ]);
      extension = state;
      browsers = detected;
      if (!state.installed) error = state.error ?? t("browserExtension.missing");
    } catch (reason) {
      error = reason instanceof Error ? reason.message : String(reason);
    } finally {
      busy = "";
    }
  }

  async function openFolder(): Promise<void> {
    const desktop = api();
    if (!desktop) return;
    busy = "open"; error = ""; notice = "";
    try {
      const result = await desktop.openBrowserExtensionFolder();
      if (!result.opened) error = result.error;
    } catch (reason) {
      error = reason instanceof Error ? reason.message : String(reason);
    } finally {
      busy = "";
    }
  }

  // Chrome/Edge 不允许程序静默安装扩展。快速安装把用户真正需要的动作一次做完：
  // 先复制稳定目录，再同时打开扩展管理页和目录，用户只需开启开发者模式并粘贴路径。
  async function install(browser: DesktopBrowserCandidate): Promise<void> {
    const desktop = api();
    if (!desktop || !extension?.directory) return;
    busy = browser.id; error = ""; notice = ""; installTarget = null; pathCopied = false;
    try {
      await writeClipboard(extension.directory);
      pathCopied = true;
    } catch (reason) {
      error = reason instanceof Error ? reason.message : String(reason);
    }
    try {
      const [page, folder] = await Promise.all([
        desktop.openBrowserExtensionPage(browser.id),
        desktop.openBrowserExtensionFolder(),
      ]);
      if (!page.launched) error = page.error;
      else installTarget = browser;
      if (!folder.opened) error = error || folder.error;
      if (page.launched) notice = t("browserExtension.pageOpened", { browser: browser.name });
    } catch (reason) {
      error = reason instanceof Error ? reason.message : String(reason);
    } finally {
      busy = "";
    }
  }

  async function copyPath(): Promise<void> {
    if (!extension?.directory) return;
    try {
      await writeClipboard(extension.directory);
      copied = true;
      setTimeout(() => { copied = false; }, 2_000);
    } catch (reason) {
      error = reason instanceof Error ? reason.message : String(reason);
    }
  }
</script>

<section class="browser-extension-card" aria-label={t("browserExtension.title")}>
  <header class="browser-extension-header">
    <span class="row-icon"><Puzzle size={15} /></span>
    <div>
      <strong>{t("browserExtension.title")}</strong>
      <small>{t("browserExtension.description")}</small>
    </div>
    <StatusBadge
      status={extension?.installed ? "success" : "neutral"}
      label={extension?.installed ? t("browserExtension.installed", { version: extension.version }) : t("browserExtension.missing")}
    />
  </header>

  {#if extension?.directory}
    <div class="browser-extension-path" title={extension.directory}>{extension.directory}</div>
    <p class="browser-extension-hint">{t("browserExtension.loadHint")}</p>
    {#if extension.installed && browsers.length > 0}
      <p class="browser-extension-hint">{t("browserExtension.installHint")}</p>
    {/if}
    {#if installTarget}
      <ol class="browser-extension-steps">
        <li>{t("browserExtension.stepDeveloperMode")}</li>
        <li>{t("browserExtension.stepLoadUnpacked")}</li>
        <li>{t("browserExtension.stepConnected")}</li>
      </ol>
      <p class="browser-extension-hint browser-extension-paste">
        {pathCopied ? (isMac ? t("browserExtension.pastePathMac") : t("browserExtension.pastePath")) : t("browserExtension.copyPathFirst")}
      </p>
    {/if}
    <div class="browser-extension-actions">
      {#if extension.installed}
        {#each browsers as browser (browser.id)}
          <Button variant="outline" size="sm" disabled={!!busy} onclick={() => void install(browser)}>
            <Globe size={13} />
            {t("browserExtension.quickInstall", { browser: browser.name })}
          </Button>
        {/each}
      {/if}
      <Button variant="outline" size="sm" disabled={!extension.installed || busy === "open"} onclick={() => void openFolder()}>
        <FolderOpen size={13} />
        {t("browserExtension.openFolder")}
      </Button>
      <Button variant="ghost" size="sm" disabled={!extension.installed} onclick={() => void copyPath()}>
        {#if copied}<Check size={13} />{:else}<Copy size={13} />{/if}
        {copied ? t("browserExtension.copied") : t("browserExtension.copyPath")}
      </Button>
      <Button variant="ghost" size="icon-sm" aria-label={t("browserExtension.refresh")} title={t("browserExtension.refresh")} disabled={!!busy} onclick={() => void refresh()}>
        <RefreshCw size={13} />
      </Button>
    </div>
    {#if extension.installed && browsers.length === 0}
      <p class="browser-extension-hint">{t("browserExtension.noBrowser")}</p>
    {/if}
  {:else if busy === "refresh"}
    <p class="browser-extension-hint">{t("browserExtension.loading")}</p>
  {/if}

  {#if notice}<p class="browser-extension-notice" role="status">{notice}</p>{/if}
  {#if error}<p class="browser-extension-error" role="alert">{error}</p>{/if}
</section>

<style>
  .browser-extension-card { display: flex; min-width: 0; flex-direction: column; gap: 8px; padding: 14px 16px; border: 1px solid var(--border, #e5e7eb); border-radius: 10px; }
  .browser-extension-header { display: flex; align-items: flex-start; gap: 10px; }
  .browser-extension-header div { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 2px; }
  .browser-extension-header strong { font-size: 13px; }
  .browser-extension-header small { font-size: 12px; opacity: 0.72; overflow-wrap: anywhere; }
  .browser-extension-path { max-width: 100%; overflow: hidden; padding: 6px 8px; border-radius: 6px; background: var(--muted, rgba(127, 127, 127, 0.08)); font-family: var(--font-mono, ui-monospace, monospace); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
  .browser-extension-hint { margin: 0; font-size: 12px; opacity: 0.72; overflow-wrap: anywhere; }
  .browser-extension-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  .browser-extension-steps { display: grid; gap: 4px; margin: 2px 0; padding-left: 18px; font-size: 12px; line-height: 1.55; opacity: 0.86; }
  .browser-extension-paste { padding: 7px 9px; border-radius: 6px; background: var(--muted, rgba(127, 127, 127, 0.08)); }
  .browser-extension-error { margin: 0; font-size: 12px; color: var(--destructive, #dc2626); overflow-wrap: anywhere; }
  .browser-extension-notice { margin: 0; font-size: 12px; color: var(--primary, #2563eb); overflow-wrap: anywhere; }
  .row-icon { display: inline-flex; }
</style>