<script lang="ts">
  import { ChevronRight, ListChecks } from "@lucide/svelte";
  import { Response } from "@svadmin/ai-elements";
  import { planTitle, type PlanCard } from "$lib/plan-mode";
  import { t } from "$lib/i18n";

  interface Props {
    readonly cards: readonly PlanCard[];
    /** 当前会话是否仍处于规划模式；用于把"等待审批"与"历史计划"区分开。 */
    readonly active: boolean;
  }

  let { cards, active }: Props = $props();

  function stateLabel(card: PlanCard): string {
    if (card.approved === true) return t("plan.approved");
    if (card.approved === false) return t("plan.keptPlanning");
    return t("plan.awaitingReview");
  }
</script>

{#if cards.length > 0}
  <div class="plan-cards" aria-label={t("plan.cardsLabel")}>
    {#each cards as card (card.callId)}
      <details class="plan-card" open={card.approved === null && active}>
        <summary>
          <ChevronRight size={14} aria-hidden="true" />
          <ListChecks size={14} aria-hidden="true" />
          <strong>{planTitle(card.text, t("plan.cardTitle"))}</strong>
          <small>{stateLabel(card)}</small>
        </summary>
        <div class="plan-card__body"><Response content={card.text} /></div>
      </details>
    {/each}
  </div>
{/if}

<style>
  .plan-cards { display: grid; gap: 8px; margin: 8px 0; }
  .plan-card { border: 1px solid var(--border); border-radius: 8px; background: var(--card); }
  .plan-card > summary { display: flex; align-items: center; gap: 6px; padding: 8px 10px; cursor: pointer; list-style: none; }
  .plan-card > summary::-webkit-details-marker { display: none; }
  .plan-card > summary small { margin-left: auto; color: var(--muted-foreground); font-size: 11px; }
  .plan-card[open] > summary > :global(svg:first-child) { transform: rotate(90deg); }
  .plan-card__body { padding: 0 12px 12px; border-top: 1px solid var(--border); }
</style>