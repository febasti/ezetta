<script lang="ts">
  import PageSheet from './PageSheet.svelte'
  import type { Snippet } from 'svelte'
  import { PROPS, propLabel } from '@core/export/elements'
  import type { ElementDef } from '@core/export/elements'
  import { i18n } from '../../i18n/i18n.svelte'
  import { thicknessPx } from './schematics'

  /**
   * The editor of a block quote: a page with the quote between two pieces of text. Only what has a
   * place on the page is on it: the space above and below, in the rows between the quote and the text
   * (their spans as high as the row), and the indents, each in the strip it leaves empty at the side of
   * the quote; the quote's ground and its lines are drawn. What is not a place on the page (which sides
   * have a line, their look, the padding on the sides without one) is set under it.
   */
  interface Props {
    element: ElementDef
    values: Readonly<Record<string, unknown>>
    /** The control of one value, as the panel draws it. */
    control: Snippet<[ElementDef, string]>
    /** The size of the quote's type in centimetres, for a line's thickness in em. */
    emCm: number
  }
  let { element, values, control, emCm }: Props = $props()

  const lang = $derived(i18n.locale)
  const name = (id: string): string => propLabel(element.id, PROPS[id]!, lang)
  const filled = $derived(typeof values['fill'] === 'string' && values['fill'] !== '')
  const line = (side: string): string =>
    values[`border_${side}`] === true
      ? `${thicknessPx(values['border_thickness'], emCm)}px solid var(--color-label-secondary)`
      : 'none'
  const any = $derived(
    ['top', 'bottom', 'left', 'right'].some((side) => values[`border_${side}`] === true),
  )
</script>

{#snippet text(widths: number[])}
  <div class="text" aria-hidden="true">
    {#each widths as width, i (i)}<span style:width="{width}%"></span>{/each}
  </div>
{/snippet}

{#snippet between(id: string)}
  <!-- The space between the text and the quote: the row is the space, and its span measures it. -->
  <div class="between">
    <span class="vspan" aria-hidden="true"></span>
    <span class="field">{@render control(element, id)}</span>
    <label class="short" for="prop-{element.id}-{id}">{name(id)}</label>
  </div>
{/snippet}

<div class="desk">
  <PageSheet top="torn" bottom="torn">
    {@render text([100, 64])}
    {@render between('above')}

    <!-- The quote, with each indent as a field in the strip it leaves empty at its side. -->
    <div class="row">
      <div class="indent">
        <label class="short" for="prop-{element.id}-indent_left">{name('indent_left')}</label>
        <span class="field">{@render control(element, 'indent_left')}</span>
      </div>
      <div
        class="quote"
        class:filled
        class:plain={!filled && !any}
        style:border-top={line('top')}
        style:border-bottom={line('bottom')}
        style:border-left={line('left')}
        style:border-right={line('right')}
        aria-hidden="true"
      >
        {@render text([100, 100, 62])}
        <!-- The source: after the last word, or on a line of its own at the right. -->
        <span class="source" class:own={values['source_position'] === 'line'}></span>
      </div>
      <div class="indent">
        <label class="short" for="prop-{element.id}-indent_right">{name('indent_right')}</label>
        <span class="field">{@render control(element, 'indent_right')}</span>
      </div>
    </div>

    {@render between('below')}
    {@render text([100, 100, 58])}
  </PageSheet>
</div>

<style>
  /* The page lies on the panel's ground, as on a desk. */
  .desk {
    padding: var(--sp-12);
    border-radius: var(--r-lg);
    background: var(--color-panel);
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
  /* The space between the text and the quote, which the span measures from end to end. */
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
  /* The quote in a row of its own, an indent on each side of it. */
  .row {
    display: flex;
    align-items: center;
    gap: var(--sp-8);
  }
  .indent {
    display: flex;
    flex: none;
    flex-direction: column;
    gap: var(--sp-4);
  }
  /* The quote: set in by its indents, with its ground and its lines. */
  .quote {
    position: relative;
    flex: 1;
    min-width: 0;
    padding: var(--sp-12) var(--sp-8);
  }
  .quote.filled {
    background: var(--color-control);
  }
  /* The source after the last word: at the end of the quote's last line. */
  .source {
    position: absolute;
    right: calc(var(--sp-8) + 20%);
    bottom: var(--sp-12);
    width: 14%;
    height: var(--sp-4);
    border-radius: var(--r-sm);
    background: var(--color-label-secondary);
  }
  /* On a line of its own, at the right, under the last line. */
  .source.own {
    position: static;
    display: block;
    margin: var(--sp-8) 0 0 auto;
  }
  /* Nothing to see of the quote's box: its place is dashed. */
  .quote.plain {
    border: 1px dashed var(--color-separator);
  }
</style>
