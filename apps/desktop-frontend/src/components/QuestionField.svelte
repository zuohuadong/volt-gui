<script lang="ts">
  import {
    Question,
    QuestionDescription,
    QuestionInput,
    QuestionOption,
    QuestionOptions,
    QuestionPrompt,
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
</script>

<Question
  value={{ selectedValues: selected ? [selected] : [], text: custom }}
  selectionMode="single"
  onvaluechange={(value) => {
    const selectedValue = value.selectedValues[0] || "";
    onAnswer(id, selectedValue);
    onAnswer(id, selectedValue ? "" : value.text, true);
  }}
  class="question-block"
>
  <QuestionPrompt>{String(item.question || item.header || t("interactions.selectPrompt"))}</QuestionPrompt>
  {#if item.description}<QuestionDescription>{String(item.description)}</QuestionDescription>{/if}
  {#if options.length}
    <QuestionOptions>
      {#each options as option (option)}<QuestionOption value={option}>{option}</QuestionOption>{/each}
    </QuestionOptions>
  {:else}
    <QuestionInput aria-label={String(item.question || item.id)} placeholder={t("interactions.customInputPlaceholder")} />
  {/if}
</Question>
