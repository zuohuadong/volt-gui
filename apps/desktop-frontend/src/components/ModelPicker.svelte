<script lang="ts">
import { ModelSelector } from "@svadmin/ai-elements";
import type { ModelGroup } from "$lib/dsh-client";
import { t } from "$lib/i18n";

type Props = {
    groups: ModelGroup[];
    selected: string;
    disabled?: boolean;
    onSelect: (provider: string, model: string) => void;
  };
  let { groups, selected, disabled = false, onSelect }: Props = $props();
  const options = $derived(groups.flatMap((group) => group.models.map((model) => ({
    id: `${group.id}/${model.id}`,
    name: model.name,
    description: model.description || modelCapability(model),
    provider: group.name,
    group: group.name,
    disabled: false,
  }))));
  const selectedOption = $derived(options.find((option) => option.id === selected));

  function modelCapability(model: ModelGroup["models"][number]): string {
    return model.input?.includes("image") ? t("models.imageInput") : t("models.textInput");
  }
</script>

<ModelSelector
  options={options}
  selectedId={selected}
  disabled={disabled || options.length === 0}
  label={t("composer.selectModel")}
  placeholder={t("composer.selectModel")}
  searchPlaceholder={t("common.search")}
  emptyLabel={t("common.empty")}
  onchange={(option) => { const [provider, ...modelParts] = option.id.split("/"); onSelect(provider, modelParts.join("/")); }}
  class="composer-model-selector"
>
  <span class="sr-only">{selectedOption?.name || t("composer.selectModel")}</span>
</ModelSelector>
