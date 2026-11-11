<script lang="ts">
  import type { Snippet } from 'svelte'
  import { PROPS, propLabel } from '@core/export/elements'
  import type { ElementDef } from '@core/export/elements'
  import { i18n } from '../../i18n/i18n.svelte'
  import Icon from '../../ui/Icon.svelte'
  import { hasLength, thicknessPx } from './schematics'

  /**
   * The editor of a figure and its caption: a page with the figure between two pieces of text, its
   * caption above or below it, as the template has them. Each value is where it is set: the space above
   * and below the figure in the rows between it and the text, the distance of the caption to the figure
   * in the row between them (their spans as high as the row), and the figure where its alignment puts
   * it, in the frame it has. Where the caption stands and where the figure stands are the two choices
   * over the page.
   */
  interface Props {
    element: ElementDef
    /** The caption of the figure, an element of its own. */
    caption: ElementDef
    values: Readonly<Record<string, unknown>>
    captionValues: Readonly<Record<string, unknown>>
    /** The control of one value of an element, as the panel draws it. */
    control: Snippet<[ElementDef, string]>
    /** The size of the type in centimetres, for the thickness of the frame in em. */
    emCm: number
  }
  let { element, caption, values, captionValues, control, emCm }: Props = $props()

  const lang = $derived(i18n.locale)
  const place = (v: unknown): string =>
    v === 'right' ? 'flex-end' : v === 'left' ? 'flex-start' : 'center'
  const above = $derived(captionValues['caption_position'] === 'above')
  const fit = $derived(captionValues['caption_fit'] === true)
  const framed = $derived(hasLength(values['frame_width']))
</script>

{#snippet text(widths: number[])}
  <div class="text" aria-hidden="true">
    {#each widths as width, i (i)}<span style:width="{width}%"></span>{/each}
  </div>
{/snippet}

{#snippet between(owner: ElementDef, id: string)}
  <!-- The space between two things: the row is the space, and its span measures it. -->
  <div class="between">
    <span class="vspan" aria-hidden="true"></span>
    <span class="field">{@render control(owner, id)}</span>
    <label class="short" for="prop-{owner.id}-{id}">{propLabel(owner.id, PROPS[id]!, lang)}</label>
  </div>
{/snippet}

{#snippet captionText()}
  <!-- The caption: its lines where its alignment puts them, as wide as the figure when it is limited to it. -->
  <div class="caption" class:fit aria-hidden="true">
    <span style:align-self={place(captionValues['align'])} style:width="100%"></span>
    <span style:align-self={place(captionValues['align'])} style:width="60%"></span>
  </div>
{/snippet}

<!-- The choices over the page: the caption's position and alignment, and the figure's alignment. -->
<div class="choices">
  <div class="choice figure">
    <span class="short">{propLabel(element.id, PROPS['align']!, lang)}</span>
    {@render control(element, 'align')}
  </div>
  <!-- The caption: where it stands, and where its lines stand. -->
  <div class="choice">
    <span class="short">{i18n.t('templates.figure.caption')}</span>
    <div class="pair">
      {@render control(caption, 'caption_position')}
      {@render control(caption, 'align')}
    </div>
  </div>
</div>

<div class="desk">
  <div class="sheet">
    {@render text([100, 64])}
    {@render between(element, 'above')}

    <!-- The figure where its alignment puts it, and its caption above or below it. -->
    <div class="object" style:align-items={place(values['align'])}>
      {#if above}
        {@render captionText()}
        {@render between(caption, 'caption_gap')}
      {/if}
      <div
        class="picture"
        style:border={framed
          ? `${thicknessPx(values['frame_width'], emCm)}px solid var(--color-label-secondary)`
          : 'none'}
        style:border-radius={framed && hasLength(values['frame_radius']) ? 'var(--sp-8)' : '0'}
        style:padding={framed && hasLength(values['frame_distance']) ? 'var(--sp-8)' : '0'}
        aria-hidden="true"
      >
        <span class="image"><Icon name="image" size={24} /></span>
      </div>
      {#if !above}
        {@render between(caption, 'caption_gap')}
        {@render captionText()}
      {/if}
    </div>

    {@render between(element, 'below')}
    {@render text([100, 100, 58])}
  </div>
</div>

<style>
  .choices {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--sp-12);
  }
  .choice {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--sp-4);
  }
  /* The figure's own alignment comes after the caption's choices on the page, first in the order of the panel. */
  .choice.figure {
    order: 2;
  }
  .pair {
    display: flex;
    gap: var(--sp-8);
  }
  /* The page lies on the panel's ground, as on a desk. */
  .desk {
    padding: var(--sp-12);
    border-radius: var(--r-lg);
    background: var(--color-panel);
  }
  .sheet {
    display: flex;
    flex-direction: column;
    padding: var(--sp-12);
    border: 1px solid var(--color-field-border);
    border-radius: var(--r-md);
    background: var(--color-window);
  }
  .text {
    display: flex;
    flex-direction: column;
    gap: var(--sp-8);
  }
  .text span {
    display: block;
    height: var(--sp-4);
    border-radius: var(--r-sm);
    background: var(--color-control-pressed);
  }
  .between {
    display: flex;
    align-items: stretch;
    gap: var(--sp-8);
    min-height: var(--control-lg);
    padding: var(--sp-8) 0;
  }
  .between .field,
  .between .short {
    align-self: center;
  }
  .vspan {
    position: relative;
    width: var(--sp-8);
    border-top: 1px solid var(--color-accent);
    border-bottom: 1px solid var(--color-accent);
  }
  .vspan::after {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: 50%;
    width: 1px;
    background: var(--color-accent);
  }
  .field {
    width: 96px;
  }
  .short {
    color: var(--color-label-secondary);
    font: var(--type-caption);
    white-space: nowrap;
  }
  /* The figure and its caption, as wide as the page, each where its alignment puts it. */
  .object {
    display: flex;
    flex-direction: column;
  }
  /* The row between the figure and its caption is the page's width, wherever the figure stands. */
  .object .between {
    align-self: stretch;
  }
  .picture {
    box-sizing: border-box;
    width: 128px;
    background: var(--color-window);
  }
  .image {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 64px;
    background: var(--color-control);
    color: var(--color-label-tertiary);
  }
  /* The caption: two lines; limited to the figure's width, it is as wide as the picture. */
  .caption {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    align-self: stretch;
  }
  .caption.fit {
    align-self: inherit;
    width: 128px;
  }
  .caption span {
    display: block;
    height: var(--sp-4);
    border-radius: var(--r-sm);
    background: var(--color-label-tertiary);
  }
</style>
