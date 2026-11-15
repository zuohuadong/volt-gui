<script lang="ts">
  import { ChevronRight, CircleAlert, Users } from "@lucide/svelte";
  import { Button } from "$components/ui/button";
  import { groupTasks, taskBadges, type TeamBoard, type TeamTaskStatus } from "$lib/agent-team";
  import { t } from "$lib/i18n";

  interface Props {
    readonly board: TeamBoard;
    readonly busy: boolean;
    readonly onToggle: (enabled: boolean) => void;
  }

  let { board, busy, onToggle }: Props = $props();

  const groups = $derived(groupTasks(board.tasks));
  const openCount = $derived(board.tasks.filter((task) => task.status === "pending" || task.status === "in_progress").length);

  function statusLabel(status: TeamTaskStatus): string {
    return t(`team.status_${status}`);
  }
</script>

<section class="team-board" aria-label={t("team.title")}>
  <header>
    <Users size={14} aria-hidden="true" />
    <strong>{t("team.title")}</strong>
    <small>{board.enabled ? t("team.enabledHint", { count: String(openCount) }) : t("team.disabledHint")}</small>
    <Button variant="outline" size="sm" disabled={busy} onclick={() => onToggle(!board.enabled)}>
      {board.enabled ? t("team.disable") : t("team.enable")}
    </Button>
  </header>

  {#if board.failure}
    <p class="team-failure" role="status"><CircleAlert size={13} aria-hidden="true" />{t("team.failure", { code: board.failure })}</p>
  {/if}

  {#if groups.length === 0}
    <p class="team-empty" role="status">{board.enabled ? t("team.emptyEnabled") : t("team.emptyDisabled")}</p>
  {:else}
    <div class="team-groups">
      {#each groups as group (group.status)}
        <div class="team-group">
          <div class="team-group-head"><span class="section-label">{statusLabel(group.status)}</span><small>{group.tasks.length}</small></div>
          <ul>
            {#each group.tasks as task (task.id)}
              {@const badges = taskBadges(task)}
              <li class="team-task">
                <details>
                  <summary>
                    <ChevronRight size={12} aria-hidden="true" />
                    <span class="team-subject">{task.subject}</span>
                    {#if badges.owner}<span class="team-owner">{badges.owner}</span>{/if}
                    {#if group.status === "pending"}
                      <span class:team-ready={badges.claimable} class="team-state">{badges.claimable ? t("team.ready") : t("team.notReady")}</span>
                    {/if}
                    {#if badges.blockedCount > 0}<small>{t("team.blockedCount", { count: String(badges.blockedCount) })}</small>{/if}
                    {#if badges.warnings > 0}<small class="team-warning">{t("team.warningCount", { count: String(badges.warnings) })}</small>{/if}
                  </summary>
                  <div class="team-detail">
                    {#if task.description}<p>{task.description}</p>{/if}
                    {#if task.writeScopes.length > 0}
                      <p class="team-scopes">{t("team.writeScopes", { paths: task.writeScopes.join("、") })}</p>
                    {/if}
                    {#each task.warnings as warning (`${task.id}:${warning}`)}
                      <p class="team-warning">{warning}</p>
                    {/each}
                    <small class="team-revision">{t("team.revision", { revision: String(task.revision) })}</small>
                  </div>
                </details>
              </li>
            {/each}
          </ul>
        </div>
      {/each}
    </div>
  {/if}
</section>

<style>
  .team-board { border: 1px solid var(--border); border-radius: 8px; margin: 10px 0; background: var(--card); }
  .team-board > header { display: flex; align-items: center; gap: 6px; padding: 8px 10px; border-bottom: 1px solid var(--border); }
  .team-board > header small { flex: 1; min-width: 0; color: var(--muted-foreground); font-size: 11px; }
  .team-failure { display: flex; align-items: center; gap: 6px; margin: 0; padding: 6px 10px; color: var(--destructive); font-size: 12px; }
  .team-empty { margin: 0; padding: 10px; color: var(--muted-foreground); font-size: 12px; }
  .team-groups { display: grid; gap: 8px; padding: 8px 10px 10px; }
  .team-group-head { display: flex; align-items: baseline; gap: 6px; }
  .team-group-head small { color: var(--muted-foreground); font-size: 11px; }
  .team-group ul { list-style: none; margin: 4px 0 0; padding: 0; display: grid; gap: 2px; }
  .team-task > details > summary { display: flex; align-items: center; gap: 6px; padding: 3px 4px; cursor: pointer; list-style: none; font-size: 12.5px; }
  .team-task > details > summary::-webkit-details-marker { display: none; }
  .team-task > details[open] > summary > :global(svg:first-child) { transform: rotate(90deg); }
  .team-subject { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .team-owner { padding: 0 6px; border-radius: 999px; background: var(--muted); font-size: 11px; }
  .team-state { color: var(--muted-foreground); font-size: 11px; }
  .team-state.team-ready { color: var(--primary); }
  .team-task summary small { color: var(--muted-foreground); font-size: 11px; }
  .team-warning { color: var(--destructive); font-size: 11px; }
  .team-detail { padding: 2px 4px 8px 22px; font-size: 12px; color: var(--muted-foreground); }
  .team-detail p { margin: 0 0 4px; }
  .team-scopes, .team-revision { font-size: 11px; }
</style>