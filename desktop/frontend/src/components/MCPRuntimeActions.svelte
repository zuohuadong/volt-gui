<script lang="ts">
  import { KeyRound, RefreshCw, ServerCog } from "@lucide/svelte";

  let {
    serverName,
    status,
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
    runtimeState?: string;
    startIntent?: string;
    authStatus?: string;
    authConfigured?: boolean;
    error?: string;
    busy?: boolean;
    onReconnect: () => void | Promise<void>;
    onClearAuthentication: () => void | Promise<void>;
  } = $props();

  function clearAuthentication() {
    if (!window.confirm(`清除 ${serverName} 的本地认证配置？服务会断开，需要重新验证后才能连接。`)) return;
    void onClearAuthentication();
  }
</script>

<section class="mcp-runtime" aria-label={`${serverName} MCP 运行与复验`}>
  <header><ServerCog size={16} /><div><strong>连接与复验</strong><p>显示当前运行意图和连接状态；复验会执行一次真实断开与重新握手。</p></div></header>
  <dl>
    <div><dt>连接状态</dt><dd>{status}</dd></div>
    <div><dt>运行状态</dt><dd>{runtimeState || "未报告"}</dd></div>
    <div><dt>启动意图</dt><dd>{startIntent || "按配置"}</dd></div>
    <div><dt>认证状态</dt><dd>{authStatus || (authConfigured ? "已配置" : "未配置")}</dd></div>
  </dl>
  {#if error}<p class="mcp-runtime__error">{error}</p>{/if}
  <footer>
    <button type="button" disabled={busy} onclick={() => void onReconnect()}><RefreshCw size={13} /> {busy ? "处理中" : "重新连接并复验"}</button>
    <button class="danger" type="button" disabled={busy || (!authConfigured && !authStatus)} onclick={clearAuthentication}><KeyRound size={13} /> 清除本地认证</button>
  </footer>
</section>

<style>
  .mcp-runtime { display: grid; gap: 10px; padding: 12px; border: 1px solid var(--border, #dce1db); border-radius: 10px; background: var(--card, #fff); }
  header { display: grid; grid-template-columns: 18px minmax(0, 1fr); gap: 8px; color: var(--primary, #0f7b55); }
  header strong { display: block; color: var(--foreground, #1f2421); font-size: 12px; }
  header p { margin: 3px 0 0; color: var(--muted-foreground, #687169); font-size: 11px; line-height: 1.5; }
  dl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; margin: 0; }
  dl div { display: grid; gap: 3px; min-width: 0; padding: 8px; background: var(--muted, #edf0ec); border-radius: 7px; }
  dt { color: var(--muted-foreground, #687169); font-size: 10px; }
  dd { margin: 0; overflow: hidden; color: var(--foreground, #1f2421); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
  footer { display: flex; flex-wrap: wrap; gap: 7px; }
  button { display: inline-flex; align-items: center; gap: 5px; min-height: 32px; padding: 0 9px; color: var(--foreground, #1f2421); background: var(--card, #fff); border: 1px solid var(--border, #dce1db); border-radius: 7px; font: inherit; font-size: 11px; }
  button.danger, .mcp-runtime__error { color: var(--danger, #b42318); }
  button:disabled { cursor: not-allowed; opacity: .52; }
  .mcp-runtime__error { margin: 0; padding: 8px; background: var(--danger-soft, #fdecea); border-radius: 7px; font-size: 11px; line-height: 1.5; }

  @media (max-width: 560px) {
    dl { grid-template-columns: 1fr; }
  }
</style>
