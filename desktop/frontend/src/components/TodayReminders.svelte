<script lang="ts">
  import { AlertTriangle, CheckCheck, History, MessageSquareWarning, PackageCheck } from "@lucide/svelte";

  interface ReminderItem {
    id: string;
    icon: typeof AlertTriangle;
    tone: "neutral" | "warning" | "danger";
    label: string;
    detail?: string;
    actionLabel: string;
    onAction: () => void;
  }

  interface Props {
    pendingDeliveries: number;
    changedFiles: number;
    lastError: string;
    queuedMessages: number;
    onOpenDeliveries: () => void;
    onOpenChanges: () => void;
    onOpenTask: () => void;
    onOpenQueue: () => void;
    showAdvanced: boolean;
  }

  let {
    pendingDeliveries,
    changedFiles,
    lastError,
    queuedMessages,
    onOpenDeliveries,
    onOpenChanges,
    onOpenTask,
    onOpenQueue,
    showAdvanced,
  }: Props = $props();

  const items = $derived.by<ReminderItem[]>(() => {
    const list: ReminderItem[] = [];
    if (lastError) {
      list.push({
        id: "error",
        icon: AlertTriangle,
        tone: "danger",
        label: "当前任务遇到错误",
        detail: lastError.length > 64 ? `${lastError.slice(0, 64)}…` : lastError,
        actionLabel: "查看任务",
        onAction: onOpenTask,
      });
    }
    if (pendingDeliveries > 0) {
      list.push({
        id: "deliveries",
        icon: PackageCheck,
        tone: "warning",
        label: `${pendingDeliveries} 项交付等待你复核`,
        actionLabel: "去复核",
        onAction: onOpenDeliveries,
      });
    }
    if (queuedMessages > 0) {
      list.push({
        id: "queue",
        icon: MessageSquareWarning,
        tone: "warning",
        label: `${queuedMessages} 条消息排队中`,
        actionLabel: "继续",
        onAction: onOpenQueue,
      });
    }
    if (showAdvanced && changedFiles > 0) {
      list.push({
        id: "changes",
        icon: History,
        tone: "neutral",
        label: `${changedFiles} 个文件有未提交改动`,
        actionLabel: "查看改动",
        onAction: onOpenChanges,
      });
    }
    return list;
  });
</script>

{#if items.length > 0}
  <ul class="today-reminders" data-testid="today-reminders" aria-label="需要关注的事项">
    {#each items as item (item.id)}
      {@const Icon = item.icon}
      <li class="reminder reminder--{item.tone}">
        <Icon size={15} />
        <div class="reminder__copy">
          <strong>{item.label}</strong>
          {#if item.detail}<em>{item.detail}</em>{/if}
        </div>
        <button type="button" onclick={item.onAction}>{item.actionLabel}</button>
      </li>
    {/each}
  </ul>
{:else}
  <div class="today-reminders today-reminders--calm" data-testid="today-reminders-empty" aria-label="无需关注的事项">
    <CheckCheck size={15} />
    <span>当前没有需要你处理的事项</span>
    {#if showAdvanced}
      <em>改动、检查点等会在这里提醒</em>
    {/if}
  </div>
{/if}

<style>
  .today-reminders { display: flex; flex-direction: column; gap: 6px; margin: 0 0 12px; padding: 0; list-style: none; }
  .today-reminders--calm { display: flex; align-items: center; gap: 7px; margin: 0 0 12px; padding: 8px 12px; border: 1px solid var(--border, #dce1db); border-radius: 9px; background: var(--card, #fff); color: var(--muted-foreground, #687169); font-size: 12px; }
  .today-reminders--calm span { color: var(--foreground, #1f2421); font-weight: 600; }
  .today-reminders--calm em { color: var(--muted-foreground, #89918b); font-style: normal; }
  .reminder { display: flex; align-items: center; gap: 9px; min-height: 40px; padding: 6px 11px; border: 1px solid var(--border, #dce1db); border-radius: 9px; background: var(--card, #fff); color: var(--foreground, #1f2421); }
  .reminder--warning { border-color: color-mix(in srgb, #9a5b00 42%, var(--border, #dce1db)); background: #fff4de; }
  .reminder--danger { border-color: color-mix(in srgb, #b42318 42%, var(--border, #dce1db)); background: #fdecea; }
  .reminder :global(svg) { flex: 0 0 15px; color: var(--muted-foreground, #687169); }
  .reminder--warning :global(svg) { color: #9a5b00; }
  .reminder--danger :global(svg) { color: #b42318; }
  .reminder__copy { display: flex; flex-direction: column; min-width: 0; flex: 1 1 auto; }
  .reminder__copy strong { font-size: 12px; font-weight: 600; }
  .reminder__copy em { font-size: 11px; color: var(--muted-foreground, #687169); font-style: normal; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .reminder button { flex: 0 0 auto; min-height: 30px; padding: 0 12px; border: 1px solid var(--border, #dce1db); border-radius: 7px; background: var(--card, #fff); color: var(--foreground, #1f2421); font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
  .reminder button:hover { background: var(--muted, #edf0ec); }
  button:focus-visible { outline: 2px solid color-mix(in srgb, #0f7b55 55%, transparent); outline-offset: 2px; }
  @media (max-width: 720px) { .reminder { flex-wrap: wrap; } .reminder button { width: 100%; min-height: 36px; } }
</style>
