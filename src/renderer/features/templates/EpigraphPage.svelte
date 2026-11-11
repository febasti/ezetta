<script lang="ts">
  import type { Snippet } from 'svelte'
  import { PROPS, propLabel } from '@core/export/elements'
  import type { ElementDef } from '@core/export/elements'
  import { i18n } from '../../i18n/i18n.svelte'
  import { shareOf } from './schematics'

  /**
   * The editor of an epigraph: a page with a chapter's title, the epigraph set apart at the right
   * under it, and the text after. Each value is where it is set: the space above and below in the rows
   * between, their spans as high as the row, and the width over the epigraph, a span as wide as the
   * epigraph is of the text. The source stands under the epigraph's text, at its right; its own
   * settings are in the entry under this one.
   */
  interface Props {
    element: ElementDef
    values: Readonly<Record<string, unknown>>
    /** The control of one value, as the panel draws it. */
    control: Snippet<[ElementDef, string]>
    /** The width of the text on the page and the size of the type, both in centimetres. */
    measure: number
    emCm: number
  }
  let { element, values, control, measure, emCm }: Props = $props()

  const lang = $derived(i18n.locale)
  const name = (id: string): string => propLabel(element.id, PROPS[id]!, lang)
  const share = $derived(shareOf(values['width'], measure, emCm) * 100)
</script>

{#snippet text(widths: number[])}
  <div class="text" aria-hidden="true">
    {#each widths as width, i (i)}<span style:width="{width}%"></span>{/each}
  </div>
{/snippet}

{#snippet between(id: string)}
  <!-- The space between the epigraph and what is around it: the row is the space, and its span measures it. -->
  <div class="between">
    <span class="vspan" aria-hidden="true"></span>
    <span class="field">{@render control(element, id)}</span>
    <label class="short" for="prop-{element.id}-{id}">{name(id)}</label>
  </div>
{/snippet}

<div class="desk">
  <div class="sheet">
    <div class="chapter" aria-hidden="true"></div>
    {@render between('above')}

    <!-- The width, over the epigraph: its field, and under it a span as wide as the epigraph, at the right. -->
    <div class="measure">
      <div class="set">
        <span class="field">{@render control(element, 'width')}</span>
        <label class="short" for="prop-{element.id}-width">{name('width')}</label>
      </div>
      <span class="hspan" style:width="{share}%" aria-hidden="true"></span>
    </div>
    <div class="epigraph" style:width="{share}%" aria-hidden="true">
      {@render text([100, 82, 54])}
      <span class="source"></span>
    </div>

    {@render between('below')}
    {@render text([100, 100, 58])}
  </div>
</div>

<style>
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
  /* The title of the chapter the epigraph stands under. */
  .chapter {
    width: 40%;
    height: var(--sp-8);
    border-radius: var(--r-sm);
    background: var(--color-label-tertiary);
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
  .measure {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    margin-bottom: var(--sp-4);
  }
  .set {
    display: flex;
    align-items: center;
    gap: var(--sp-4);
  }
  /* The span of the width: as wide as the epigraph, standing over it at the right. */
  .hspan {
    position: relative;
    flex: none;
    height: var(--sp-8);
    margin-left: auto;
    border-left: 1px solid var(--color-accent);
    border-right: 1px solid var(--color-accent);
  }
  .hspan::after {
    content: '';
    position: absolute;
    top: 50%;
    right: 0;
    left: 0;
    height: 1px;
    background: var(--color-accent);
  }
  /* The epigraph, set apart at the right: its text, and its source under it at the right. */
  .epigraph {
    display: flex;
    flex-direction: column;
    gap: var(--sp-8);
    margin-left: auto;
  }
  .source {
    align-self: flex-end;
    width: 36%;
    height: var(--sp-4);
    border-radius: var(--r-sm);
    background: var(--color-label-tertiary);
  }
</style>
