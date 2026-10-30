<script lang="ts">
  import { Value } from "typebox/value";
  import { Type } from "typebox";
  import { t } from "$lib/i18n";
  import type { VoltSurfaceWidgetProps } from "$lib/surface-catalog";

  const schema = Type.Object({
    title: Type.String(),
    labelField: Type.String(),
    valueField: Type.String(),
    showLegend: Type.Optional(Type.Boolean()),
  }, { additionalProperties: true });

  interface Slice { readonly label: string; readonly value: number; readonly share: number; readonly color: string }

  // 固定色板：颜色由宿主决定，不来自模型输出。
  const palette = ["#2563eb", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#14b8a6", "#f97316"];

  let { props, data }: VoltSurfaceWidgetProps = $props();
  const decoded = $derived(Value.Decode(schema, props));
  const showLegend = $derived(decoded.showLegend !== false);

  const points = $derived.by(() => {
    if (data.status !== "ready" || !Array.isArray(data.value)) return [];
    const rows: Array<{ label: string; value: number }> = [];
    for (const entry of data.value) {
      if (entry === null || typeof entry !== "object" || Array.isArray(entry)) continue;
      const record = entry as Record<string, unknown>;
      const label = record[decoded.labelField];
      const value = record[decoded.valueField];
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) continue;
      rows.push({ label: label === undefined || label === null ? "—" : String(label), value });
    }
    return rows.slice(0, 8);
  });

  const total = $derived(points.reduce((sum, point) => sum + point.value, 0));

  const slices = $derived.by((): Slice[] => {
    if (total <= 0) return [];
    let start = 0;
    return points.map((point, index) => {
      const share = point.value / total;
      const slice: Slice = { ...point, share, color: palette[index % palette.length] ?? "#2563eb" };
      start += share;
      return slice;
    });
  });

  function arcPath(startShare: number, share: number): string {
    const radius = 60;
    const center = 70;
    const startAngle = startShare * 2 * Math.PI - Math.PI / 2;
    const endAngle = (startShare + share) * 2 * Math.PI - Math.PI / 2;
    const x1 = center + radius * Math.cos(startAngle);
    const y1 = center + radius * Math.sin(startAngle);
    const x2 = center + radius * Math.cos(endAngle);
    const y2 = center + radius * Math.sin(endAngle);
    const largeArc = share > 0.5 ? 1 : 0;
    if (share >= 0.999) {
      // 单一片段画整圆：首尾重合的弧无法正确闭合。
      return `M ${center} ${center - radius} A ${radius} ${radius} 0 1 1 ${center - 0.01} ${center - radius} Z`;
    }
    return `M ${center} ${center} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
  }

  const formatShare = (share: number): string => `${Math.round(share * 1000) / 10}%`;
</script>

<section class="volt-pie" aria-label={decoded.title}>
  <header><h3>{decoded.title}</h3></header>
  {#if data.status === "loading"}
    <p class="volt-pie__state" role="status">{t("surface.widgetLoading")}</p>
  {:else if data.status === "error"}
    <p class="volt-pie__state volt-pie__state--error" role="alert">{t("surface.widgetUnavailable")}</p>
  {:else if slices.length === 0}
    <p class="volt-pie__state" role="status">{t("surface.widgetNoData")}</p>
  {:else}
    <div class="volt-pie__body">
      <svg viewBox="0 0 140 140" role="img" aria-label={decoded.title} class="volt-pie__chart">
        {#each slices as slice, index (index)}
          <path d={arcPath(slices.slice(0, index).reduce((sum, item) => sum + item.share, 0), slice.share)} fill={slice.color} />
        {/each}
      </svg>
      {#if showLegend}
        <ul class="volt-pie__legend">
          {#each slices as slice, index (index)}
            <li>
              <span class="volt-pie__swatch" style:background={slice.color} aria-hidden="true"></span>
              <span class="volt-pie__label">{slice.label}</span>
              <span class="volt-pie__value">{slice.value} · {formatShare(slice.share)}</span>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
</section>

<style>
  .volt-pie { display: grid; gap: 8px; padding: 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--card); }
  .volt-pie h3 { margin: 0; font-size: 14px; }
  .volt-pie__body { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
  .volt-pie__chart { width: 140px; height: 140px; flex: none; }
  .volt-pie__legend { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; font-size: 12px; }
  .volt-pie__legend li { display: flex; align-items: center; gap: 6px; }
  .volt-pie__swatch { width: 10px; height: 10px; border-radius: 2px; flex: none; }
  .volt-pie__label { color: var(--foreground); }
  .volt-pie__value { color: var(--muted-foreground); }
  .volt-pie__state { margin: 0; color: var(--muted-foreground); font-size: 12px; }
  .volt-pie__state--error { color: var(--destructive); }
</style>