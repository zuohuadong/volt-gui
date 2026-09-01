<script lang="ts">
  import { ModelSelector } from "@svadmin/ai-elements";
  import type { ModelGroup } from "$lib/dsh-client";

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
    return model.input?.includes("image") ? "支持图片输入" : "文本输入";
  }
</script>

<ModelSelector
  options={options}
  selectedId={selected}
  disabled={disabled || options.length === 0}
  label="会话模型"
  placeholder="默认模型"
  searchPlaceholder="搜索模型"
  emptyLabel="没有匹配的模型"
  onchange={(option) => { const [provider, ...modelParts] = option.id.split("/"); onSelect(provider, modelParts.join("/")); }}
  class="header-model-selector"
>
  <span class="sr-only">{selectedOption?.name || "选择模型"}</span>
</ModelSelector>
