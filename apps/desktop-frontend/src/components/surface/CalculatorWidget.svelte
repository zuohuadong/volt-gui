<script lang="ts">
  import { untrack } from "svelte";
  import { Value } from "typebox/value";
  import { Type } from "typebox";
  import { t } from "$lib/i18n";
  import type { VoltSurfaceWidgetProps } from "$lib/surface-catalog";

  const schema = Type.Object({
    title: Type.String(),
    description: Type.Optional(Type.String()),
    initialValue: Type.Optional(Type.Number()),
    submitLabel: Type.Optional(Type.String()),
  }, { additionalProperties: true });

  let { props, onSubmitValues }: VoltSurfaceWidgetProps = $props();
  const decoded = $derived(Value.Decode(schema, props));

  type Operator = "+" | "-" | "×" | "÷";
  const keys: ReadonlyArray<readonly string[]> = [
    ["7", "8", "9", "÷"],
    ["4", "5", "6", "×"],
    ["1", "2", "3", "-"],
    ["0", ".", "C", "+"],
  ];

  // 只在本地计算：不访问数据源、网络或宿主接口。
  // 初始值只取一次；后续 props 变化不重置用户输入。
  let entry = $state(String(untrack(() => decoded).initialValue ?? "0"));
  let operand = $state<number | undefined>();
  let operator = $state<Operator | undefined>();
  let fresh = $state(true);
  let error = $state("");

  const display = $derived(entry === "" ? "0" : entry);

  function parse(value: string): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function apply(left: number, right: number, op: Operator): number {
    if (op === "+") return left + right;
    if (op === "-") return left - right;
    if (op === "×") return left * right;
    return right === 0 ? Number.NaN : left / right;
  }

  function digit(value: string): void {
    error = "";
    if (fresh) {
      entry = value === "." ? "0." : value;
      fresh = false;
      return;
    }
    if (value === "." && entry.includes(".")) return;
    if (entry.length >= 16) return;
    entry = entry === "0" && value !== "." ? value : entry + value;
  }

  function choose(op: Operator): void {
    error = "";
    const current = parse(entry);
    if (operand !== undefined && operator !== undefined && !fresh) {
      const result = apply(operand, current, operator);
      if (!Number.isFinite(result)) {
        error = t("surface.calculatorInvalid");
        reset();
        return;
      }
      entry = String(result);
      operand = result;
    } else {
      operand = current;
    }
    operator = op;
    fresh = true;
  }

  function equals(): void {
    if (operand === undefined || operator === undefined) return;
    const result = apply(operand, parse(entry), operator);
    if (!Number.isFinite(result)) {
      error = t("surface.calculatorInvalid");
      reset();
      return;
    }
    entry = String(result);
    operand = undefined;
    operator = undefined;
    fresh = true;
  }

  function reset(): void {
    entry = "0";
    operand = undefined;
    operator = undefined;
    fresh = true;
  }

  function clear(): void {
    error = "";
    reset();
  }

  function submit(): void {
    if (!onSubmitValues) return;
    onSubmitValues({ value: parse(entry), expression: `${decoded.title}: ${display}` });
  }
</script>

<section class="volt-calc" aria-label={decoded.title}>
  <header>
    <h3>{decoded.title}</h3>
    {#if decoded.description}<p>{decoded.description}</p>{/if}
  </header>
  <output class="volt-calc__display" aria-live="polite">{display}</output>
  {#if error}<p class="volt-calc__error" role="alert">{error}</p>{/if}
  <div class="volt-calc__keys">
    {#each keys as row, rowIndex (rowIndex)}
      {#each row as key (key)}
        <button
          type="button"
          class="volt-calc__key"
          class:volt-calc__key--operator={["+", "-", "×", "÷"].includes(key)}
          onclick={() => {
            if (key === "C") clear();
            else if (key === "+" || key === "-" || key === "×" || key === "÷") choose(key as Operator);
            else digit(key);
          }}
        >{key}</button>
      {/each}
    {/each}
    <button type="button" class="volt-calc__key volt-calc__key--equals" onclick={equals}>=</button>
  </div>
  {#if onSubmitValues}
    <button type="button" class="volt-calc__submit" onclick={submit}>{decoded.submitLabel ?? t("surface.sendToChat")}</button>
  {/if}
</section>

<style>
  .volt-calc { display: grid; gap: 8px; padding: 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--card); }
  .volt-calc h3 { margin: 0; font-size: 14px; }
  .volt-calc header p { margin: 2px 0 0; color: var(--muted-foreground); font-size: 12px; }
  .volt-calc__display {
    display: block;
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--background);
    font-variant-numeric: tabular-nums;
    font-size: 20px;
    text-align: end;
    overflow-wrap: anywhere;
  }
  .volt-calc__keys { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
  .volt-calc__key {
    padding: 8px 0;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--background);
    color: var(--foreground);
    font: inherit;
    cursor: pointer;
  }
  .volt-calc__key:hover { background: var(--accent); }
  .volt-calc__key:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
  .volt-calc__key--operator { color: var(--muted-foreground); }
  .volt-calc__key--equals { background: var(--primary); color: var(--primary-foreground); }
  .volt-calc__submit {
    padding: 7px 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--primary);
    color: var(--primary-foreground);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }
  .volt-calc__error { margin: 0; color: var(--destructive); font-size: 12px; }
</style>