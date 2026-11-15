<script lang="ts">
  import { onMount } from "svelte";
  import { CalendarClock, LoaderCircle, Pause, Play, Trash2 } from "@lucide/svelte";
  import { Button } from "$components/ui/button";
  import type { DshClient } from "$lib/dsh-client";
  import {
    normalizeSchedule,
    scheduleDeleteRequest,
    scheduleFilter,
    scheduleOutcomeCode,
    scheduleRunRequest,
    scheduleToggleRequest,
    type ScheduleRow,
  } from "$lib/schedule";
  import { t } from "$lib/i18n";

  interface Props {
    readonly client?: DshClient;
    readonly onNotice?: (message: string) => void;
    readonly onError?: (message: string) => void;
  }

  let { client, onNotice, onError }: Props = $props();

  let filter = $state<"all" | "active" | "inactive">("all");
  let rows = $state<ScheduleRow[]>([]);
  let total = $state(0);
  let loading = $state(false);
  let busyId = $state("");

  /** 请求代次：切换筛选条件后，慢回来的旧响应不能覆盖新结果。 */
  let reloadSerial = 0;

  async function reload(): Promise<void> {
    if (!client) return;
    const serial = ++reloadSerial;
    const wanted = filter;
    loading = true;
    try {
      const page = await client.listSchedules(scheduleFilter(wanted));
      if (serial !== reloadSerial) return;
      const normalized = normalizeSchedule(page);
      rows = normalized.rows;
      total = normalized.total;
    } catch (error) {
      if (serial !== reloadSerial) return;
      onError?.(error instanceof Error ? error.message : String(error));
    } finally {
      if (serial === reloadSerial) loading = false;
    }
  }

  async function mutate(row: ScheduleRow, kind: "toggle" | "run" | "delete"): Promise<void> {
    if (!client) return;
    busyId = row.id;
    try {
      const payload = kind === "toggle" ? scheduleToggleRequest(row) : kind === "delete" ? scheduleDeleteRequest(row) : scheduleRunRequest(row);
      const result = kind === "run" ? await client.runSchedule(payload) : await client.editSchedule(payload);
      // 冲突/未找到是官方的非异常结果，必须如实说明，不能当成成功。
      const code = scheduleOutcomeCode(result);
      if (code === "schedule_conflict") onError?.(t("automation.conflict"));
      else if (code === "schedule_not_found") onError?.(t("automation.notFound"));
      else if (code === "schedule_execution_pending") onError?.(t("automation.executionPending"));
      else if (code === "schedule_input_invalid") onError?.(t("automation.inputInvalid"));
      else {
        onNotice?.(kind === "delete" ? t("automation.deleted") : kind === "run" ? t("automation.runQueued") : t("automation.updated"));
        await reload();
      }
    } catch (error) {
      onError?.(error instanceof Error ? error.message : String(error));
    } finally {
      busyId = "";
    }
  }

  // 只有一处首次加载入口；筛选变化也走同一条 reload（内部带代次校验）。
  $effect(() => {
    void filter;
    void client;
    void reload();
  });
  // 任务由模型或其它窗口改动时，官方 event 会推 `schedule/changed`。
  onMount(() => {
    const unsubscribe = window.voltDesktop?.onDshFrame?.((raw) => {
      const payload = (raw as { payload?: Record<string, unknown> } | null)?.payload;
      if (payload?.type !== "host/schedule-changed") return;
      void reload();
    });
    return () => unsubscribe?.();
  });
</script>

<section class="automation-panel">
  <div class="automation-toolbar">
    <div class="section-label">{t("automation.filterLabel")}</div>
    <div class="automation-filters" role="group" aria-label={t("automation.filterLabel")}>
      {#each [["all", t("automation.filterAll")], ["active", t("automation.filterActive")], ["inactive", t("automation.filterInactive")]] as [value, label] (value)}
        <button type="button" class:active={filter === value} aria-pressed={filter === value} onclick={() => filter = value as typeof filter}>{label}</button>
      {/each}
    </div>
    <small>{t("automation.count", { shown: String(rows.length), total: String(total) })}</small>
  </div>

  {#if loading && rows.length === 0}
    <p class="automation-status" role="status"><LoaderCircle size={14} class="spin" aria-hidden="true" />{t("automation.loading")}</p>
  {:else if rows.length === 0}
    <div class="automation-empty">
      <CalendarClock size={16} aria-hidden="true" />
      <p>{t("automation.empty")}</p>
      <small>{t("automation.emptyHint")}</small>
    </div>
  {:else}
    <ul class="automation-list">
      {#each rows as row (row.id)}
        <li class="automation-row">
          <div class="automation-main">
            <strong>{row.title}</strong>
            <small>{row.rule}</small>
            <small class="automation-prompt">{row.prompt}</small>
          </div>
          <div class="automation-meta">
            <span class="automation-state automation-state--{row.status}">{t(`automation.state_${row.status}`)}</span>
            {#if row.scheduledAt}<small>{t("automation.nextAt", { at: row.scheduledAt })}</small>{/if}
            {#if row.lastDeliveredAt}<small>{t("automation.lastDelivered", { at: row.lastDeliveredAt })}</small>{/if}
          </div>
          <div class="automation-actions">
            <Button variant="ghost" size="sm" disabled={busyId === row.id} onclick={() => void mutate(row, "run")}>{t("automation.runNow")}</Button>
            {#if row.status !== "ended"}
              <Button variant="ghost" size="sm" disabled={busyId === row.id} onclick={() => void mutate(row, "toggle")}>
                {#if row.status === "active"}<Pause size={13} aria-hidden="true" />{t("automation.pause")}{:else}<Play size={13} aria-hidden="true" />{t("automation.resume")}{/if}
              </Button>
            {/if}
            <Button variant="ghost" size="sm" disabled={busyId === row.id} onclick={() => void mutate(row, "delete")}>
              <Trash2 size={13} aria-hidden="true" />{t("common.delete")}
            </Button>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .automation-panel { display: grid; gap: 12px; }
  .automation-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
  .automation-toolbar small { margin-left: auto; color: var(--muted-foreground); font-size: 11px; }
  .automation-filters { display: flex; gap: 4px; }
  .automation-filters button { padding: 3px 10px; border: 1px solid var(--border); border-radius: 999px; background: var(--background); font-size: 12px; cursor: pointer; }
  .automation-filters button.active { border-color: var(--primary); color: var(--primary); }
  .automation-status { display: flex; align-items: center; gap: 6px; color: var(--muted-foreground); font-size: 12px; }
  .automation-empty { display: grid; justify-items: start; gap: 4px; padding: 16px; border: 1px dashed var(--border); border-radius: 8px; color: var(--muted-foreground); }
  .automation-empty p { margin: 0; font-size: 13px; }
  .automation-empty small { font-size: 11px; }
  .automation-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
  .automation-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px 12px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px; }
  .automation-main { display: grid; gap: 2px; min-width: 0; }
  .automation-main small { color: var(--muted-foreground); font-size: 11px; }
  .automation-prompt { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .automation-meta { display: grid; justify-items: end; gap: 2px; color: var(--muted-foreground); font-size: 11px; }
  .automation-state { padding: 0 8px; border-radius: 999px; font-size: 11px; line-height: 18px; background: var(--muted); }
  .automation-state--active { color: var(--primary); background: color-mix(in oklch, var(--primary) 12%, transparent); }
  .automation-actions { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 4px; }
</style>
