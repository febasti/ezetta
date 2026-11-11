<script lang="ts">
  import type { Snippet } from 'svelte'
  import { PROPS, isShown, propLabel } from '@core/export/elements'
  import type { ElementDef } from '@core/export/elements'
  import { i18n } from '../../i18n/i18n.svelte'
  import Icon from '../../ui/Icon.svelte'
  import { hasLength, thicknessPx } from './schematics'

  /**
   * The editor of the border of an image: the picture in its border, drawn as thick as the border is
   * and as round, with the border's distance to the picture inside it; its values around it, each on
   * the side it is: the weight over it, the distance at its left, the corners at its right, the colour
   * under it. The border's other values are there once it has a weight.
   */
  interface Props {
    element: ElementDef
    values: Readonly<Record<string, unknown>>
    /** The control of one value, as the panel draws it. */
    control: Snippet<[ElementDef, string]>
    /** The size of the type in centimetres, for the weight in em. */
    emCm: number
  }
  let { element, values, control, emCm }: Props = $props()

  const lang = $derived(i18n.locale)
  const name = (id: string): string => propLabel(element.id, PROPS[id]!, lang)
  const framed = $derived(hasLength(values['frame_width']))
  const shown = (id: string): boolean => isShown(id, values)
</script>

{#snippet cell(id: string)}
  <div class="cell">
    <label class="short" for="prop-{element.id}-{id}">{name(id)}</label>
    <span class="part">{@render control(element, id)}</span>
  </div>
{/snippet}

<div class="desk">
  <div class="grid">
    <div class="top">{@render cell('frame_width')}</div>
    {#if shown('frame_distance')}<div class="left">{@render cell('frame_distance')}</div>{/if}
    <div
      class="picture"
      class:plain={!framed}
      style:border={framed
        ? `${thicknessPx(values['frame_width'], emCm)}px solid var(--color-label-secondary)`
        : '1px dashed var(--color-separator)'}
      style:border-radius={framed && hasLength(values['frame_radius']) ? 'var(--sp-12)' : '0'}
      style:padding={framed && hasLength(values['frame_distance']) ? 'var(--sp-8)' : '0'}
      aria-hidden="true"
    >
      <span class="image"><Icon name="image" size={24} /></span>
    </div>
    {#if shown('frame_radius')}<div class="right">{@render cell('frame_radius')}</div>{/if}
    {#if shown('frame_color')}<div class="bottom">{@render cell('frame_color')}</div>{/if}
  </div>
</div>

<style>
  /* The picture lies on the panel's ground, as on a desk. */
  .desk {
    padding: var(--sp-12);
    border-radius: var(--r-lg);
    background: var(--color-panel);
  }
  /* The picture in the middle, its values around it: over it, at its sides, under it. */
  .grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    gap: var(--sp-12);
    align-items: center;
  }
  .top {
    grid-area: 1 / 2;
    justify-self: center;
  }
  .left {
    grid-area: 2 / 1;
    justify-self: end;
  }
  .picture {
    grid-area: 2 / 2;
    box-sizing: border-box;
    width: 128px;
    background: var(--color-window);
  }
  .right {
    grid-area: 2 / 3;
    justify-self: start;
  }
  .bottom {
    grid-area: 3 / 2;
    justify-self: center;
  }
  .cell {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--sp-4);
  }
  .short {
    color: var(--color-label-secondary);
    font: var(--type-caption);
    white-space: nowrap;
  }
  .image {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 80px;
    background: var(--color-control);
    color: var(--color-label-tertiary);
  }
</style>
