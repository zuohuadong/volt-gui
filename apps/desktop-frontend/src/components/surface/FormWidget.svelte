<script lang="ts">
  import { Value } from "typebox/value";
  import { Type } from "typebox";
  import { t } from "$lib/i18n";
  import type { VoltSurfaceWidgetProps } from "$lib/surface-catalog";

  const fieldBase = {
    name: Type.String(),
    label: Type.String(),
    required: Type.Optional(Type.Boolean()),
  };
  const schema = Type.Object({
    title: Type.String(),
    description: Type.Optional(Type.String()),
    submitLabel: Type.Optional(Type.String()),
    fields: Type.Array(Type.Union([
      Type.Object({ ...fieldBase, kind: Type.Literal("text"), placeholder: Type.Optional(Type.String()), maxLength: Type.Optional(Type.Number()) }, { additionalProperties: true }),
      Type.Object({ ...fieldBase, kind: Type.Literal("textarea"), placeholder: Type.Optional(Type.String()), rows: Type.Optional(Type.Number()) }, { additionalProperties: true }),
      Type.Object({ ...fieldBase, kind: Type.Literal("number"), min: Type.Optional(Type.Number()), max: Type.Optional(Type.Number()), step: Type.Optional(Type.Number()) }, { additionalProperties: true }),
      Type.Object({
        ...fieldBase,
        kind: Type.Literal("select"),
        options: Type.Array(Type.Object({ value: Type.String(), label: Type.String() }, { additionalProperties: true })),
      }, { additionalProperties: true }),
      Type.Object({ ...fieldBase, kind: Type.Literal("checkbox") }, { additionalProperties: true }),
      Type.Object({ ...fieldBase, kind: Type.Literal("date") }, { additionalProperties: true }),
    ]), { minItems: 1 }),
  }, { additionalProperties: true });

  interface FormField {
    readonly kind: "text" | "textarea" | "number" | "select" | "checkbox" | "date";
    readonly name: string;
    readonly label: string;
    readonly required?: boolean;
    readonly placeholder?: string;
    readonly maxLength?: number;
    readonly rows?: number;
    readonly min?: number;
    readonly max?: number;
    readonly step?: number;
    readonly options?: ReadonlyArray<{ readonly value: string; readonly label: string }>;
  }
  type FieldValue = string | boolean;

  let { props, onSubmitValues }: VoltSurfaceWidgetProps = $props();
  const decoded = $derived(Value.Decode(schema, props) as unknown as {
    title: string;
    description?: string;
    submitLabel?: string;
    fields: readonly FormField[];
  });

  // 表单值只保存在本地，提交时才作为一次性数据交给宿主。
  let values = $state<Record<string, FieldValue>>({});
  let errors = $state<Record<string, string>>({});
  let sent = $state(false);

  const submitLabel = $derived(decoded.submitLabel ?? t("surface.submit"));

  function current(name: string): string {
    const value = values[name];
    return typeof value === "string" ? value : "";
  }

  function setValue(name: string, value: FieldValue): void {
    values = { ...values, [name]: value };
    if (errors[name]) {
      const { [name]: _cleared, ...rest } = errors;
      errors = rest;
    }
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    for (const field of decoded.fields) {
      if (!field.required) continue;
      const value = values[field.name];
      const missing = field.kind === "checkbox"
        ? value !== true
        : typeof value !== "string" || value.trim().length === 0;
      if (missing) next[field.name] = t("surface.fieldRequired");
    }
    errors = next;
    return Object.keys(next).length === 0;
  }

  function submit(): void {
    if (!onSubmitValues || !validate()) return;
    const payload: Record<string, string | number | boolean> = {};
    for (const field of decoded.fields) {
      const value = values[field.name];
      if (field.kind === "checkbox") {
        payload[field.name] = value === true;
        continue;
      }
      const text = typeof value === "string" ? value.trim() : "";
      if (text.length === 0) continue;
      payload[field.name] = field.kind === "number" ? Number(text) : text;
    }
    sent = true;
    onSubmitValues(payload);
  }
</script>

<section class="volt-form" aria-label={decoded.title}>
  <header>
    <h3>{decoded.title}</h3>
    {#if decoded.description}<p>{decoded.description}</p>{/if}
  </header>
  <form class="volt-form__body" onsubmit={(event) => { event.preventDefault(); submit(); }}>
    {#each decoded.fields as field (field.name)}
      <label class="volt-form__field">
        <span class="volt-form__label">{field.label}{#if field.required}<span aria-hidden="true"> *</span>{/if}</span>
        {#if field.kind === "textarea"}
          <textarea rows={field.rows ?? 3} placeholder={field.placeholder} value={current(field.name)}
            oninput={(event) => setValue(field.name, event.currentTarget.value)}></textarea>
        {:else if field.kind === "number"}
          <input type="number" min={field.min} max={field.max} step={field.step} value={current(field.name)}
            oninput={(event) => setValue(field.name, event.currentTarget.value)} />
        {:else if field.kind === "select"}
          <select value={current(field.name)} onchange={(event) => setValue(field.name, event.currentTarget.value)}>
            <option value="">{t("surface.selectPlaceholder")}</option>
            {#each field.options as option (option.value)}
              <option value={option.value}>{option.label}</option>
            {/each}
          </select>
        {:else if field.kind === "checkbox"}
          <input type="checkbox" checked={values[field.name] === true}
            onchange={(event) => setValue(field.name, event.currentTarget.checked)} />
        {:else if field.kind === "date"}
          <input type="date" value={current(field.name)}
            oninput={(event) => setValue(field.name, event.currentTarget.value)} />
        {:else}
          <input type="text" placeholder={field.placeholder} maxlength={field.maxLength} value={current(field.name)}
            oninput={(event) => setValue(field.name, event.currentTarget.value)} />
        {/if}
        {#if errors[field.name]}<span class="volt-form__error" role="alert">{errors[field.name]}</span>{/if}
      </label>
    {/each}
    <div class="volt-form__actions">
      <button type="submit" class="volt-form__submit" disabled={!onSubmitValues || sent}>{submitLabel}</button>
      {#if !onSubmitValues}<span class="volt-form__hint">{t("surface.submitUnavailable")}</span>{/if}
      {#if sent}<span class="volt-form__hint" role="status">{t("surface.submitted")}</span>{/if}
    </div>
  </form>
</section>

<style>
  .volt-form { display: grid; gap: 10px; padding: 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--card); }
  .volt-form h3 { margin: 0; font-size: 14px; }
  .volt-form header p { margin: 2px 0 0; color: var(--muted-foreground); font-size: 12px; }
  .volt-form__body { display: grid; gap: 10px; }
  .volt-form__field { display: grid; gap: 4px; font-size: 12px; }
  .volt-form__label { color: var(--foreground); }
  .volt-form__field input,
  .volt-form__field textarea,
  .volt-form__field select {
    padding: 6px 8px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--background);
    color: var(--foreground);
    font: inherit;
    font-size: 13px;
  }
  .volt-form__field input[type="checkbox"] { justify-self: start; }
  .volt-form__error { color: var(--destructive); }
  .volt-form__actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .volt-form__submit {
    padding: 7px 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--primary);
    color: var(--primary-foreground);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }
  .volt-form__submit:disabled { cursor: not-allowed; opacity: 0.6; }
  .volt-form__hint { color: var(--muted-foreground); font-size: 12px; }
</style>