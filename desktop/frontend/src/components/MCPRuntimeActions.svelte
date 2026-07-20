<script lang="ts">
  import { KeyRound, RefreshCw, ServerCog } from "@lucide/svelte";
  import { mcpConnectionPresentation } from "../lib/mcp-detail";

  let {
    serverName,
    status,
    rawStatus = status,
    runtimeState = "",
    startIntent = "",
    authStatus = "",
    authConfigured = false,
    error = "",
    busy = false,
    onReconnect,
    onClearAuthentication,
  }: {
    serverName: string;
    status: string;
    rawStatus?: string;
    runtimeState?: string;
    startIntent?: string;
    authStatus?: string;
    authConfigured?: boolean;
    error?: string;
    busy?: boolean;
    onReconnect: () => void | Promise<void>;
    onClearAuthentication: () => void | Promise<void>;
  } = $props();

  const presentation = $derived(mcpConnectionPresentation(rawStatus, error));
  const hasAuthentication = $derived(authConfigured || Boolean(authStatus && authStatus !== "none"));
  const authenticationLabel = $derived(authStatus && authStatus !== "none" ? authStatus : authConfigured ? "已配置" : "无需认证");

  function clearAuthentication() {
    if (!window.confirm(`清除 ${serverName} 的本地认证配置？服务会断开，需要重新验证后才能连接。`)) return;
    void onClearAuthentication();
  }
</script>

<section class={`mcp-runtime mcp-runtime--${presentation.tone}`} aria-label={`${serverName} MCP 连接状态`} aria-live="polite">
  <header>
    <span class="mcp-runtime__icon"><ServerCog size={16} /></span>
    <div><strong>{presentation.title}</strong><p>{presentation.summary}</p></div>
    <b>{status}</b>
  </header>
  <div class="mcp-runtime__meta" aria-label="连接摘要">
    <span>{startIntent === "automatic" ? "自动启动" : startIntent === "off" ? "手动启用" : "按配置启动"}</span>
    {#if hasAuthentication}<span>认证：{authenticationLabel}</span>{/if}
  </div>
  <footer>
    <button class="primary" type="button" disabled={busy} onclick={() => void onReconnect()}><RefreshCw size={13} /> {busy ? "连接中" : presentation.actionLabel}</button>
    {#if hasAuthentication}<button class="danger" type="button" disabled={busy} onclick={clearAuthentication}><KeyRound size={13} /> 清除认证</button>{/if}
  </footer>
  <details class="mcp-runtime__details">
    <summary>技术详情</summary>
    <dl>
      <div><dt>运行状态</dt><dd>{runtimeState || "未报告"}</dd></div>
      <div><dt>启动方式</dt><dd>{startIntent || "按配置"}</dd></div>
      <div><dt>认证状态</dt><dd>{authenticationLabel}</dd></div>
    </dl>
    {#if error}<code>{error}</code>{/if}
  </details>
</section>

<style>
  .mcp-runtime { display: grid; gap: 10px; padding: 12px; border: 1px solid var(--border, #dce1db); border-radius: 10px; background: var(--card, #fff); }
  header { display: grid; grid-template-columns: 28px minmax(0, 1fr) auto; align-items: start; gap: 9px; }
  header strong { display: block; color: var(--foreground, #1f2421); font-size: 13px; }
  header p { margin: 3px 0 0; color: var(--muted-foreground, #687169); font-size: 11px; line-height: 1.5; }
  header b { padding: 3px 7px; color: var(--foreground, #1f2421); background: var(--muted, #edf0ec); border-radius: 999px; font-size: 10px; white-space: nowrap; }
  .mcp-runtime__icon { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; color: var(--foreground, #1f2421); background: var(--muted, #edf0ec); border-radius: 7px; }
  .mcp-runtime--danger .mcp-runtime__icon { color: var(--destructive, #b42318); background: color-mix(in srgb, var(--destructive, #b42318) 9%, var(--muted, #edf0ec)); }
  .mcp-runtime--warning .mcp-runtime__icon { color: var(--warning, #9a5b00); background: var(--warning-soft, #fff4de); }
  .mcp-runtime--danger header b { color: var(--destructive, #b42318); background: color-mix(in srgb, var(--destructive, #b42318) 8%, var(--muted, #edf0ec)); }
  .mcp-runtime__meta { display: flex; flex-wrap: wrap; gap: 6px; }
  .mcp-runtime__meta span { padding: 3px 7px; color: var(--muted-foreground, #687169); background: var(--muted, #edf0ec); border-radius: 999px; font-size: 10px; }
  footer { display: flex; flex-wrap: wrap; gap: 7px; }
  button { display: inline-flex; align-items: center; gap: 5px; min-height: 32px; padding: 0 9px; color: var(--foreground, #1f2421); background: var(--card, #fff); border: 1px solid var(--border, #dce1db); border-radius: 7px; font: inherit; font-size: 11px; }
  button.primary { color: var(--card, #fff); background: var(--foreground, #1f2421); border-color: var(--foreground, #1f2421); }
  button.primary:hover:not(:disabled) { background: color-mix(in srgb, var(--foreground, #1f2421) 88%, var(--card, #fff)); }
  button.danger { color: var(--destructive, #b42318); }
  button:disabled { cursor: not-allowed; opacity: .52; }
  button:focus-visible, summary:focus-visible { outline: 2px solid var(--accent, #0f7b55); outline-offset: 2px; }
  .mcp-runtime__details { padding-top: 2px; border-top: 1px solid var(--border, #dce1db); color: var(--muted-foreground, #687169); font-size: 11px; }
  .mcp-runtime__details summary { width: max-content; padding-top: 8px; cursor: pointer; color: var(--foreground, #1f2421); font-weight: 650; }
  dl { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 7px; margin: 9px 0 0; }
  dl div { display: grid; gap: 3px; min-width: 0; padding: 8px; background: var(--muted, #edf0ec); border-radius: 7px; }
  dt { color: var(--muted-foreground, #687169); font-size: 10px; }
  dd { margin: 0; overflow: hidden; color: var(--foreground, #1f2421); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
  code { display: block; max-height: 120px; margin-top: 7px; padding: 8px; overflow: auto; color: var(--destructive, #b42318); background: color-mix(in srgb, var(--destructive, #b42318) 8%, var(--muted, #edf0ec)); border-radius: 7px; font: 10px/1.5 var(--mono, monospace); overflow-wrap: anywhere; white-space: pre-wrap; }

  @media (max-width: 560px) {
    header { grid-template-columns: 28px minmax(0, 1fr); }
    header b { grid-column: 2; width: max-content; }
    dl { grid-template-columns: 1fr; }
  }
</style>
