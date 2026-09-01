<script lang="ts">
  import { Bot, Check, ChevronDown, Eye, Search, Sparkles, X } from "lucide-svelte";
  import type { ModelGroup } from "$lib/dsh-client";
  import { t } from "$lib/i18n";
  import { onMount } from "svelte";

  type Props = {
    groups: ModelGroup[];
    selected: string;
    disabled?: boolean;
    onSelect: (provider: string, model: string) => void;
  };

  let { groups, selected, disabled = false, onSelect }: Props = $props();

  let open = $state(false);
  let query = $state("");
  let containerRef = $state<HTMLDivElement | null>(null);
  let searchInputRef = $state<HTMLInputElement | null>(null);
  let activeIndex = $state(0);

  const flatOptions = $derived.by(() => {
    return groups.flatMap((group) =>
      group.models.map((model) => {
        const fullId = `${group.id}/${model.id}`;
        const isVision = model.input?.includes("image");
        const isReasoning =
          model.id.includes("r1") ||
          model.id.includes("reasoner") ||
          model.id.includes("thinking") ||
          model.id.includes("o1") ||
          model.id.includes("o3");
        return {
          id: fullId,
          providerId: group.id,
          providerName: group.name,
          modelId: model.id,
          name: model.name || model.id,
          description: model.description || "",
          isVision,
          isReasoning,
          disabled: false,
        };
      })
    );
  });

  const filteredOptions = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (!q) return flatOptions;
    return flatOptions.filter(
      (opt) =>
        opt.name.toLowerCase().includes(q) ||
        opt.modelId.toLowerCase().includes(q) ||
        opt.providerName.toLowerCase().includes(q) ||
        opt.description.toLowerCase().includes(q)
    );
  });

  const selectedOption = $derived(
    flatOptions.find((opt) => opt.id === selected || opt.modelId === selected) ||
      flatOptions[0]
  );

  const selectedDisplayName = $derived(
    selectedOption?.name || (selected ? selected.split("/").pop() : t("composer.selectModel"))
  );

  function handleSelect(option: (typeof flatOptions)[number]) {
    onSelect(option.providerId, option.modelId);
    open = false;
    query = "";
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        open = true;
      }
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      open = false;
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIndex = (activeIndex + 1) % (filteredOptions.length || 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIndex =
        (activeIndex - 1 + (filteredOptions.length || 1)) % (filteredOptions.length || 1);
    } else if (e.key === "Enter" && filteredOptions.length > 0) {
      e.preventDefault();
      const target = filteredOptions[activeIndex] || filteredOptions[0];
      if (target) handleSelect(target);
    }
  }

  $effect(() => {
    if (open) {
      activeIndex = 0;
      setTimeout(() => {
        searchInputRef?.focus();
      }, 50);
    } else {
      query = "";
    }
  });

  onMount(() => {
    function handleClickOutside(e: MouseEvent) {
      if (open && containerRef && !containerRef.contains(e.target as Node)) {
        open = false;
      }
    }
    document.addEventListener("pointerdown", handleClickOutside);
    return () => {
      document.removeEventListener("pointerdown", handleClickOutside);
    };
  });
</script>

<div
  bind:this={containerRef}
  class="model-picker-dropdown"
  onkeydown={handleKeyDown}
  role="region"
  aria-label={t("composer.selectModel")}
>
  <button
    type="button"
    class="model-picker-trigger"
    class:active={open}
    {disabled}
    aria-haspopup="listbox"
    aria-expanded={open}
    title={selectedDisplayName}
    onclick={() => {
      if (!disabled) open = !open;
    }}
  >
    <Bot size={14} class="model-picker-icon" aria-hidden="true" />
    <span class="model-picker-label">{selectedDisplayName}</span>
    <ChevronDown
      size={13}
      class={`model-picker-arrow ${open ? "rotate-180" : ""}`}
      aria-hidden="true"
    />
  </button>

  {#if open}
    <div
      class="model-picker-popover"
      role="listbox"
      tabindex="-1"
      aria-label={t("composer.selectModel")}
    >
      <div class="model-picker-header">
        <div class="model-picker-search">
          <Search size={13} class="text-muted-foreground flex-shrink-0" />
          <input
            bind:this={searchInputRef}
            type="text"
            bind:value={query}
            placeholder={t("common.search")}
            class="model-search-input"
            aria-label={t("common.search")}
          />
          {#if query}
            <button
              type="button"
              class="model-search-clear"
              onclick={() => {
                query = "";
                searchInputRef?.focus();
              }}
              aria-label={t("common.clear")}
            >
              <X size={12} />
            </button>
          {/if}
        </div>
      </div>

      <div class="model-picker-list">
        {#if filteredOptions.length === 0}
          <div class="model-picker-empty">
            <span>{t("common.empty")}</span>
          </div>
        {:else}
          {#each filteredOptions as option, index (option.id)}
            {@const isSelected = option.id === selected || option.modelId === selected}
            {@const isFocused = index === activeIndex}
            <button
              type="button"
              role="option"
              aria-selected={isSelected}
              class="model-picker-item"
              class:selected={isSelected}
              class:focused={isFocused}
              onclick={() => handleSelect(option)}
              onmouseenter={() => (activeIndex = index)}
            >
              <div class="model-item-main">
                <div class="model-item-title-row">
                  <span class="model-item-name">{option.name}</span>
                  <span class="model-item-provider">{option.providerName}</span>
                </div>
                {#if option.description}
                  <span class="model-item-desc">{option.description}</span>
                {/if}
              </div>

              <div class="model-item-badges">
                {#if option.isReasoning}
                  <span class="model-tag reasoning" title={t("composer.reasoningDesc")}>
                    <Sparkles size={10} />
                    <span>{t("composer.reasoning")}</span>
                  </span>
                {/if}
                {#if option.isVision}
                  <span class="model-tag vision" title={t("composer.imageInputDesc")}>
                    <Eye size={10} />
                    <span>{t("composer.imageInput")}</span>
                  </span>
                {/if}
                {#if isSelected}
                  <Check size={14} class="model-check-icon" />
                {/if}
              </div>
            </button>
          {/each}
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .model-picker-dropdown {
    position: relative;
    display: inline-flex;
    align-items: center;
  }

  .model-picker-trigger {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 32px;
    min-height: 32px;
    max-width: 240px;
    padding: 0 10px;
    border: 1px solid var(--border);
    border-radius: 7px;
    background: var(--card);
    color: var(--foreground);
    font-size: 12.5px;
    font-weight: 500;
    cursor: pointer;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
    transition: all 140ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  .model-picker-trigger:hover:not(:disabled) {
    border-color: color-mix(in oklch, var(--primary) 45%, var(--border));
    background: var(--muted);
  }

  .model-picker-trigger.active {
    border-color: var(--primary);
    box-shadow: 0 0 0 2px color-mix(in oklch, var(--primary) 15%, transparent);
  }

  .model-picker-trigger:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  :global(.model-picker-icon) {
    color: var(--primary);
    flex-shrink: 0;
  }

  .model-picker-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
  }

  :global(.model-picker-arrow) {
    color: var(--muted-foreground);
    flex-shrink: 0;
    transition: transform 140ms ease;
  }

  .model-picker-popover {
    position: absolute;
    bottom: calc(100% + 8px);
    left: 0;
    z-index: 70;
    display: flex;
    flex-direction: column;
    width: min(340px, calc(100vw - 32px));
    max-height: 340px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: #ffffff;
    color: var(--foreground);
    box-shadow: 0 12px 36px rgba(15, 23, 42, 0.12), 0 4px 12px rgba(15, 23, 42, 0.06);
    overflow: hidden;
    animation: popover-in 140ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes popover-in {
    from {
      opacity: 0;
      transform: translateY(4px) scale(0.98);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .model-picker-header {
    padding: 8px;
    border-bottom: 1px solid var(--border);
    background: var(--background);
  }

  .model-picker-search {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 8px;
    height: 30px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: #ffffff;
  }

  .model-picker-search:focus-within {
    border-color: var(--primary);
    box-shadow: 0 0 0 1.5px color-mix(in oklch, var(--primary) 20%, transparent);
  }

  .model-search-input {
    width: 100%;
    min-width: 0;
    border: 0;
    outline: none;
    background: transparent;
    font-size: 12px;
    color: var(--foreground);
  }

  .model-search-clear {
    display: grid;
    place-items: center;
    width: 16px;
    height: 16px;
    border: 0;
    border-radius: 50%;
    background: var(--muted);
    color: var(--muted-foreground);
    cursor: pointer;
  }

  .model-picker-list {
    flex: 1;
    overflow-y: auto;
    padding: 4px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 280px;
  }

  .model-picker-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    width: 100%;
    padding: 8px 10px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--foreground);
    text-align: left;
    cursor: pointer;
    transition: background 100ms ease;
  }

  .model-picker-item:hover,
  .model-picker-item.focused {
    background: var(--muted);
  }

  .model-picker-item.selected {
    background: color-mix(in oklch, var(--primary) 8%, var(--card));
  }

  .model-item-main {
    min-width: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .model-item-title-row {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .model-item-name {
    font-size: 12.5px;
    font-weight: 600;
    color: var(--foreground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .model-item-provider {
    font-size: 10.5px;
    color: var(--muted-foreground);
    padding: 1px 4px;
    background: var(--background);
    border-radius: 4px;
    border: 1px solid var(--border);
    flex-shrink: 0;
  }

  .model-item-desc {
    font-size: 11px;
    color: var(--muted-foreground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .model-item-badges {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  .model-tag {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 1px 5px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 500;
  }

  .model-tag.reasoning {
    background: #ede9fe;
    color: #6d28d9;
  }

  .model-tag.vision {
    background: #e0f2fe;
    color: #0369a1;
  }

  :global(.model-check-icon) {
    color: var(--primary);
    flex-shrink: 0;
  }

  .model-picker-empty {
    padding: 24px 16px;
    text-align: center;
    color: var(--muted-foreground);
    font-size: 12px;
  }
</style>
