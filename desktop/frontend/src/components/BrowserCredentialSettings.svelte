<script lang="ts">
  import { KeyRound, Trash2 } from "@lucide/svelte";
  import type { BrowserCredentialView } from "../lib/types";

  let {
    credentials = [],
    removingOrigin = "",
    onRemove,
  }: {
    credentials?: BrowserCredentialView[];
    removingOrigin?: string;
    onRemove: (credential: BrowserCredentialView) => void | Promise<void>;
  } = $props();
</script>

<section class="browser-credentials wide" aria-label="已保存的浏览器登录">
  <header>
    <div><strong>已保存的浏览器登录</strong><p>仅显示站点和账号；密码保存在系统钥匙串中，不会回显。</p></div>
    <span>{credentials.length} 项</span>
  </header>
  {#each credentials as credential (credential.origin)}
    <article>
      <span><KeyRound size={15} /></span>
      <div><strong>{credential.origin}</strong><p>{credential.username || "未命名账号"}</p></div>
      <button type="button" disabled={removingOrigin === credential.origin} onclick={() => void onRemove(credential)}>
        <Trash2 size={14} />{removingOrigin === credential.origin ? "删除中" : "删除凭据"}
      </button>
    </article>
  {:else}
    <p class="empty">暂无已保存凭据。登录时选择“保存并登录”后会显示在这里。</p>
  {/each}
</section>

<style>
  .browser-credentials { display: grid; gap: 10px; padding-top: 4px; }
  header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
  header strong { display: block; font-size: 13px; }
  header p, .empty { margin: 4px 0 0; color: var(--muted, #6b7280); font-size: 11px; line-height: 1.55; }
  header > span { color: var(--muted, #6b7280); font-size: 11px; white-space: nowrap; }
  article { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 10px; border: 1px solid var(--border, #d9dce2); border-radius: 10px; padding: 10px; }
  article > span { color: #315b88; }
  article strong { display: block; overflow-wrap: anywhere; font-size: 12px; }
  article p { margin: 3px 0 0; color: var(--muted, #6b7280); font-size: 11px; }
  button { display: inline-flex; align-items: center; gap: 5px; border: 1px solid var(--border, #d9dce2); border-radius: 9px; padding: 7px 9px; background: transparent; color: inherit; cursor: pointer; }
  button:disabled { opacity: .5; cursor: not-allowed; }
  @media (max-width: 560px) { article { grid-template-columns: auto minmax(0, 1fr); } article button { grid-column: 1 / -1; justify-content: center; } }
</style>
