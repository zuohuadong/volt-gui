<script lang="ts">
  import type { TrustedIntranetSiteView } from "../lib/types";

  let {
    sites = [],
    removingKey = "",
    onRemove,
  }: {
    sites?: TrustedIntranetSiteView[];
    removingKey?: string;
    onRemove: (site: TrustedIntranetSiteView) => void | Promise<void>;
  } = $props();

  function siteKey(site: TrustedIntranetSiteView) {
    return `${site.host}|${site.cidrs.join(",")}|${site.ports.join(",")}`;
  }
</script>

<section class="trusted-intranet" aria-label="可信内网站点">
  <header>
    <div>
      <strong>可信内网站点</strong>
      <p>仅显示你选择“永久允许”后保存的精确主机、地址和端口。</p>
    </div>
    <span>{sites.length} 项</span>
  </header>
  {#if sites.length > 0}
    <div class="trusted-intranet__list">
      {#each sites as site (siteKey(site))}
        <article>
          <div>
            <strong>{site.host}</strong>
            <code>{site.cidrs.join("、")}</code>
            <span>端口 {site.ports.join("、")}</span>
          </div>
          <button type="button" disabled={removingKey === siteKey(site)} onclick={() => void onRemove(site)}>
            {removingKey === siteKey(site) ? "撤销中" : "撤销授权"}
          </button>
        </article>
      {/each}
    </div>
  {:else}
    <p class="trusted-intranet__empty">暂无永久授权。访问内网站点时，VoltUI 会先请求你的确认。</p>
  {/if}
</section>

<style>
  .trusted-intranet {
    grid-column: 1 / -1;
    display: grid;
    gap: 12px;
    padding-top: 4px;
  }

  header,
  article {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  header strong,
  article strong {
    display: block;
    color: #252a32;
    font-size: 13px;
  }

  header p,
  .trusted-intranet__empty {
    margin: 4px 0 0;
    color: #747b86;
    font-size: 12px;
    line-height: 1.5;
  }

  header > span {
    flex: 0 0 auto;
    color: #747b86;
    font-size: 12px;
  }

  .trusted-intranet__list {
    display: grid;
    gap: 8px;
  }

  article {
    min-width: 0;
    padding: 11px 12px;
    border: 1px solid #e0e3e8;
    border-radius: 9px;
    background: #fafbfc;
  }

  article > div {
    min-width: 0;
  }

  article code,
  article span {
    display: inline-block;
    margin: 5px 8px 0 0;
    color: #626a76;
    font-size: 11px;
  }

  article code {
    overflow-wrap: anywhere;
  }

  button {
    flex: 0 0 auto;
    min-height: 32px;
    padding: 0 11px;
    border: 1px solid #d7dbe1;
    border-radius: 8px;
    background: #ffffff;
    color: #4b5563;
    font-size: 12px;
  }

  button:disabled {
    opacity: 0.55;
  }

  @media (max-width: 640px) {
    article {
      align-items: flex-start;
      flex-direction: column;
    }

    button {
      width: 100%;
    }
  }
</style>
