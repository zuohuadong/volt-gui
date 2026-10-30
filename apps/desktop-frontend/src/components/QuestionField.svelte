<script lang="ts">
  import { Circle, CircleDot } from "@lucide/svelte";
  import {
    Question,
    QuestionDescription,
    QuestionInput,
    QuestionOption,
    QuestionOptions,
    QuestionPrompt,
    type QuestionValue,
  } from "@svadmin/ai-elements";
import { questionOptionLabels } from "$lib/ai-elements-adapter";
import { t } from "$lib/i18n";

type Props = {
    item: Record<string, unknown>;
    selected?: string;
    custom?: string;
    onAnswer: (id: string, value: string, custom?: boolean) => void;
  };
  let { item, selected = "", custom = "", onAnswer }: Props = $props();
  const id = $derived(String(item.id));
  const options = $derived(questionOptionLabels(item));
  const otherOption = $derived.by(() => {
    let sentinel = "__custom_answer__";
    while (options.includes(sentinel)) sentinel += "_";
    return options.length > 0 ? sentinel : "";
  });
  let customMode = $state(false);
  const customSelected = $derived(Boolean(otherOption && customMode));

  $effect(() => {
    selected;
    custom;
    if (selected) customMode = false;
    else if (custom) customMode = true;
  });
  function optionDescription(label: string): string {
    if (!Array.isArray(item.options)) return "";
    const option = item.options.find((option) => option && typeof option === "object" && option.label === label);
    return typeof option?.description === "string" ? option.description : "";
  }

  function updateAnswer(value: QuestionValue): void {
    const selectedValue = value.selectedValues[0] || "";
    if (!options.length || value.selectedValues.includes(otherOption)) {
      customMode = Boolean(otherOption);
      onAnswer(id, value.text, true);
    } else {
      customMode = false;
      onAnswer(id, selectedValue);
    }
  }
</script>

<Question
  value={{ selectedValues: selected ? [selected] : customSelected ? [otherOption] : [], text: custom }}
  selectionMode="single"
  onvaluechange={updateAnswer}
  class="question-block"
>
  <QuestionPrompt>{String(item.question || item.header || t("interactions.selectPrompt"))}</QuestionPrompt>
  {#if item.description}<QuestionDescription>{String(item.description)}</QuestionDescription>{/if}
  {#if options.length}
    <QuestionOptions class="question-option-list" aria-label={String(item.question || item.header || t("interactions.selectPrompt"))}>
      {#each options as option (option)}
        <QuestionOption value={option} class="question-choice">
          {#if selected === option}<CircleDot size={16} aria-hidden="true" />{:else}<Circle size={16} aria-hidden="true" />{/if}
          <span class="question-choice__copy"><strong>{option}</strong>{#if optionDescription(option)}<small>{optionDescription(option)}</small>{/if}</span>
        </QuestionOption>
      {/each}
      {#if otherOption}
        <QuestionOption value={otherOption} class="question-choice question-choice--custom">
          {#if customSelected}<CircleDot size={16} aria-hidden="true" />{:else}<Circle size={16} aria-hidden="true" />{/if}
          <span class="question-choice__copy"><strong>{t("interactions.otherOption")}</strong></span>
        </QuestionOption>
      {/if}
    </QuestionOptions>
    {#if customSelected}
      <QuestionInput
        aria-label={String(item.question || item.id)}
        placeholder={t("interactions.customInputPlaceholder")}
        oninput={(event) => onAnswer(id, event.currentTarget.value, true)}
      />
    {/if}
  {:else}
    <QuestionInput
      aria-label={String(item.question || item.id)}
      placeholder={t("interactions.customInputPlaceholder")}
      oninput={(event) => onAnswer(id, event.currentTarget.value, true)}
    />
  {/if}
</Question>

<style>
  :global(.question-block) { border: 0; border-radius: 0; padding: 12px 0; background: transparent; }
  :global(.question-option-list) { display: grid; grid-template-columns: minmax(0, 1fr); gap: 6px; }
  :global(.question-choice) { width: 100%; justify-content: flex-start; gap: 10px; text-align: left; }
  :global(.question-choice > svg) { flex-shrink: 0; }
  .question-choice__copy { display: grid; gap: 3px; min-width: 0; overflow-wrap: anywhere; }
  .question-choice__copy strong { font-size: 12px; font-weight: 500; }
  .question-choice__copy small { font-size: 11px; line-height: 1.5; }
</style>
