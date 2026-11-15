<script lang="ts">
  import { Blocks, CircleAlert, RefreshCw, ShieldAlert } from "@lucide/svelte";
  import { Button } from "$components/ui/button";
  import { StatusBadge } from "@svadmin/ui";
  import { t } from "$lib/i18n";
  import { describeCapabilityGroups, type CapabilityGroupId, type CapabilityKey } from "$lib/capability-groups";

  interface Props {
    /** 与「设置 / 高级配置」同一份能力开关状态（#352）。 */
    readonly capabilities: Partial<Record<CapabilityKey, boolean>>;
    readonly browserSkillVersion?: string;
    readonly busy?: boolean;
    /** 读取能力清单失败时的业务语言说明；有值时不再渲染空态。 */
    readonly error?: string;
    readonly onToggle?: (key: CapabilityKey) => void | Promise<void>;
    readonly onRefresh?: () => void;
  }
  let { capabilities, browserSkillVersion, busy = false, error = "", onToggle, onRefresh }: Props = $props();
  const groups = $derived(describeCapabilityGroups({ capabilities, browserSkillVersion }));
  const enabledTotal = $derived(groups.reduce((total, group) => total + group.enabledCount, 0));

  const groupOrder: readonly CapabilityGroupId[] = ["documents", "knowledge", "desktop", "runtime"];
</script>

<section class="extension-capabilities" aria-label={t("extensions.title")}>
  <header class="extension-capabilities__header">
    <div>
      <h2>{t("extensions.title")}</h2>
      <p>{t("extensions.description")}</p>
    </div>
    {#if onRefresh}
      <Button variant="outline" size="sm" disabled={busy} onclick={onRefresh}>
        <RefreshCw size={14} class={busy ? "spin" : undefined} />{busy ? t("extensions.refreshing") : t("common.refresh")}
      </Button>
    {/if}
  </header>

  {#if error}
    <!-- 读取失败也是一种状态，必须说出来，不能显示「此类暂无扩展」（#352）。 -->
    <div class="extension-capabilities__error" role="alert">
      <CircleAlert size={15} aria-hidden="true" />
      <span>{error}</span>
      {#if onRefresh}<Button variant="outline" size="sm" disabled={busy} onclick={onRefresh}>{t("common.retry")}</Button>{/if}
    </div>
  {:else}
    <p class="extension-capabilities__note"><ShieldAlert size={14} aria-hidden="true" />{t("extensions.riskNote", { count: enabledTotal })}</p>
    {#each groupOrder as groupId (groupId)}
      {@const group = groups.find((item) => item.id === groupId)}
      {#if group}
        <section class="extension-group" aria-label={t(`extensions.group.${group.id}`)}>
          <h3>{t(`extensions.group.${group.id}`)}<small>{t("extensions.groupCount", { count: group.entries.length })}</small></h3>
          <ul>
            {#each group.entries as entry (entry.key)}
              <li>
                <div class="extension-copy">
                  <span class="extension-name">{t(entry.titleKey)}</span>
                  <small>{t(entry.descKey)}</small>
                </div>
                <div class="extension-meta">
                  {#if entry.enabled && entry.builtin}
                    <StatusBadge status="success" label={t("extensions.builtin")} />
                  {:else}
                    <StatusBadge status={entry.enabled ? "success" : "neutral"} label={entry.enabled ? t("settings.capabilityOn") : t("settings.capabilityOff")} />
                  {/if}
                  {#if entry.highRisk}
                    <span class="extension-risk"><CircleAlert size={12} aria-hidden="true" />{t("extensions.highRisk")}</span>
                  {/if}
                  {#if entry.restartRequired}
                    <span class="extension-restart">{t("extensions.restartRequired")}</span>
                  {/if}
                  {#if !entry.builtin && onToggle}
                    <Button variant="outline" size="sm" disabled={busy} onclick={() => void onToggle(entry.key as CapabilityKey)}>
                      <Blocks size={13} />{entry.enabled ? t("settings.capabilityDisable") : t("settings.capabilityEnable")}
                    </Button>
                  {/if}
                </div>
              </li>
            {/each}
          </ul>
        </section>
      {/if}
    {/each}
    <p class="extension-capabilities__hint">{t("extensions.restartHint")}</p>
  {/if}
</section>

<style>
  .extension-capabilities { display: grid; gap: 12px; }
  .extension-capabilities__header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
  .extension-capabilities__header h2 { margin: 0; font-size: 16px; }
  .extension-capabilities__header p { margin: 4px 0 0; font-size: 12px; color: var(--muted-foreground); }
  .extension-capabilities__note { display: flex; gap: 6px; align-items: center; margin: 0; font-size: 12px; color: var(--muted-foreground); }
  .extension-capabilities__hint { margin: 0; font-size: 12px; color: var(--muted-foreground); }
  .extension-capabilities__error { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border: 1px solid var(--destructive, #b42318); border-radius: 8px; font-size: 12px; color: var(--destructive, #b42318); }
  .extension-group { border: 1px solid var(--border); border-radius: 8px; padding: 12px 14px; }
  .extension-group h3 { margin: 0 0 8px; font-size: 13px; display: flex; gap: 8px; align-items: baseline; }
  .extension-group h3 small { font-weight: 400; font-size: 11px; color: var(--muted-foreground); }
  .extension-group ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 10px; }
  .extension-group li { display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-start; justify-content: space-between; font-size: 12px; }
  .extension-copy { display: grid; gap: 2px; min-width: 0; }
  .extension-name { font-weight: 600; }
  .extension-copy small { color: var(--muted-foreground); }
  .extension-meta { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .extension-risk { display: inline-flex; gap: 4px; align-items: center; color: var(--destructive, #b42318); }
  .extension-restart { color: var(--muted-foreground); }
</style>