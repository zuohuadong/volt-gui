<script lang="ts">
  import { onMount } from "svelte";
  import { Crop, X } from "@lucide/svelte";
  import { Button } from "$components/ui/button";
  import { t } from "$lib/i18n";
  import { isSelectable, normalizeDragRect, toImageSelection, type ClientRect } from "$lib/screenshot-selection";
  import type { ScreenshotSelection } from "../electron";

  let { image, busy, onConfirm, onCancel }: {
    image: string;
    busy: boolean;
    onConfirm: (selection: ScreenshotSelection) => void;
    onCancel: () => void;
  } = $props();

  let dialog: HTMLDialogElement;
  let frame: HTMLImageElement | undefined = $state();
  let dragStart: { x: number; y: number } | undefined = $state();
  let dragging = $state<ClientRect>();
  let selection = $state<ClientRect>();
  let active = $derived(dragging ?? selection);

  function bounds(): ClientRect | undefined {
    if (!frame) return undefined;
    const rect = frame.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return undefined;
    return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
  }

  function naturalSize(): { width: number; height: number } | undefined {
    if (!frame || !frame.naturalWidth || !frame.naturalHeight) return undefined;
    return { width: frame.naturalWidth, height: frame.naturalHeight };
  }

  function selectionInImagePixels(rect: ClientRect | undefined): ScreenshotSelection | undefined {
    const box = bounds();
    const natural = naturalSize();
    if (!rect || !box || !natural || !isSelectable(rect)) return undefined;
    const cropped = toImageSelection(rect, { rect: box, natural });
    return cropped.width >= 1 && cropped.height >= 1 ? cropped : undefined;
  }

  let sizeLabel = $derived((() => {
    const cropped = selectionInImagePixels(active);
    return cropped ? `${cropped.width} × ${cropped.height}` : "";
  })());

  function onPointerDown(event: PointerEvent): void {
    const box = bounds();
    if (!box || event.button !== 0 || busy) return;
    dragStart = { x: event.clientX, y: event.clientY };
    selection = undefined;
    dragging = normalizeDragRect(dragStart, dragStart, box);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function onPointerMove(event: PointerEvent): void {
    const box = bounds();
    if (!dragStart || !box) return;
    dragging = normalizeDragRect(dragStart, { x: event.clientX, y: event.clientY }, box);
  }

  function onPointerUp(event: PointerEvent): void {
    const box = bounds();
    if (!dragStart) return;
    const rect = box ? normalizeDragRect(dragStart, { x: event.clientX, y: event.clientY }, box) : undefined;
    dragStart = undefined;
    dragging = undefined;
    selection = rect && isSelectable(rect) ? rect : undefined;
  }

  function confirm(): void {
    const cropped = selectionInImagePixels(selection);
    if (!cropped || busy) return;
    onConfirm(cropped);
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key === "Enter" && selection && !busy) {
      event.preventDefault();
      confirm();
    }
  }

  onMount(() => {
    dialog.showModal();
    return () => dialog.close();
  });
</script>

<svelte:window onkeydown={onKeydown} />

<dialog bind:this={dialog} onclose={onCancel} aria-labelledby="screenshot-crop-title" aria-describedby="screenshot-crop-hint">
  <header>
    <h2 id="screenshot-crop-title"><Crop size={15} />{t("composer.screenshotCropTitle")}</h2>
    <p id="screenshot-crop-hint">{t("composer.screenshotCropHint")}</p>
  </header>
  <div
    class="stage"
    role="presentation"
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerUp}
  >
    <img bind:this={frame} src={image} alt={t("composer.screenshotCropPreview")} draggable="false" />
    {#if active}
      <div
        class="selection"
        style:left={`${active.left}px`}
        style:top={`${active.top}px`}
        style:width={`${active.right - active.left}px`}
        style:height={`${active.bottom - active.top}px`}
      ></div>
      {#if sizeLabel}<span class="size" style:left={`${active.left}px`} style:top={`${active.top}px`}>{sizeLabel}</span>{/if}
    {/if}
  </div>
  <footer>
    <span class="status">{selection ? t("composer.screenshotCropReady") : t("composer.screenshotCropEmpty")}</span>
    <div class="actions">
      <Button variant="outline" onclick={onCancel} disabled={busy}><X size={14} />{t("common.cancel")}</Button>
      <Button onclick={confirm} disabled={!selection || busy}><Crop size={14} />{busy ? t("composer.screenshotCropBusy") : t("composer.screenshotCropConfirm")}</Button>
    </div>
  </footer>
</dialog>

<style>
  dialog { width: min(1100px, calc(100vw - 48px)); max-height: calc(100dvh - 32px); margin: auto; padding: 16px; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; gap: 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--background); color: var(--foreground); overflow: hidden; }
  dialog::backdrop { background: rgb(0 0 0 / 55%); }
  header h2 { display: flex; align-items: center; gap: 6px; margin: 0 0 6px; font-size: 15px; }
  header p { margin: 0; color: var(--muted-foreground); font-size: 12px; }
  .stage { position: relative; display: flex; align-items: center; justify-content: center; min-height: 120px; overflow: hidden; border-radius: 8px; background: var(--muted, #f4f4f5); cursor: crosshair; touch-action: none; user-select: none; }
  .stage img { max-width: 100%; max-height: 60vh; object-fit: contain; pointer-events: none; -webkit-user-drag: none; }
  /* 框选层按视口坐标定位，和 pointer 事件的 clientX/clientY 一致。 */
  .selection { position: fixed; border: 1px solid #2f80ed; box-shadow: 0 0 0 9999px rgb(0 0 0 / 45%); pointer-events: none; }
  .size { position: fixed; transform: translateY(-130%); padding: 1px 6px; border-radius: 4px; background: rgb(0 0 0 / 72%); color: #fff; font-size: 11px; font-variant-numeric: tabular-nums; pointer-events: none; }
  footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .status { color: var(--muted-foreground); font-size: 12px; }
  .actions { display: flex; gap: 8px; }
</style>