<script lang="ts">
  import PageSheet from './PageSheet.svelte'
  import type { Snippet } from 'svelte'
  import { PROPS, propLabel } from '@core/export/elements'
  import type { ElementDef } from '@core/export/elements'
  import { i18n } from '../../i18n/i18n.svelte'
  import { shareOf, thicknessPx } from './schematics'

  /**
   * The editor of a divider: a page with the divider between two pieces of text. Each value is where
   * it is set: the space above and below in the rows between (their spans as high as the row), and,
   * for a rule, its length over it (a span as long as the rule is of the text). The mark is drawn as it
   * prints, where the alignment puts it: three asterisks, an asterism, a rule of its weight, or for
   * space only a dashed place with nothing in it.
   */
  interface Props {
    element: ElementDef
    values: Readonly<Record<string, unknown>>
    /** The control of one value, as the panel draws it. */
    control: Snippet<[ElementDef, string]>
    /** The width of the text on the page and the size of the mark's type, both in centimetres. */
    measure: number
    emCm: number
  }
  let { element, values, control, measure, emCm }: Props = $props()

  const lang = $derived(i18n.locale)
  const name = (id: string): string => propLabel(element.id, PROPS[id]!, lang)
  const mark = $derived(typeof values['divider_mark'] === 'string' ? values['divider_mark'] : '')
  const share = $derived(shareOf(values['width'], measure, emCm) * 100)
  const weight = $derived(thicknessPx(values['rule_width'], emCm))
  const side = $derived(
    values['align'] === 'left' ? 'left' : values['align'] === 'right' ? 'right' : 'center',
  )
</script>

{#snippet text(widths: number[])}
  <div class="text" aria-hidden="true">
    {#each widths as width, i (i)}<span style:width="{width}%"></span>{/each}
  </div>
{/snippet}

{#snippet between(id: string)}
  <!-- The space between the text and the divider: the row is the space, and its span measures it. -->
  <div class="between">
    <span class="vspan" aria-hidden="true"></span>
    <span class="field">{@render control(element, id)}</span>
    <label class="short" for="prop-{element.id}-{id}">{name(id)}</label>
  </div>
{/snippet}

<div class="desk">
  <PageSheet top="torn" bottom="torn">
    {@render text([100, 100, 64])}
    {@render between('above')}

    {#if mark === 'line'}
      <!-- The length of the rule, over it: its field, and under it a span as long as the rule. -->
      <div class="measure {side}">
        <div class="set">
          <span class="field">{@render control(element, 'width')}</span>
          <label class="short" for="prop-{element.id}-width">{name('width')}</label>
        </div>
        <span class="hspan" style:width="{share}%" aria-hidden="true"></span>
      </div>
    {/if}
    <div class="divider {side}" aria-hidden="true">
      {#if mark === 'line'}
        <span class="rule" style:width="{share}%" style:border-top-width="{weight}px"></span>
      {:else if mark === 'asterism'}
        <span class="asterism"><i></i><i></i><i></i></span>
      {:else if mark === 'space'}
        <span class="space"></span>
      {:else}
        <span class="asterisks"><i></i><i></i><i></i></span>
      {/if}
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
  /* The space between the text and the divider, which the span measures from end to end. */
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
  /* The divider and the length of its rule stand where the alignment puts them. */
  .divider,
  .measure {
    display: flex;
    flex-direction: column;
  }
  .divider.left,
  .measure.left {
    align-items: flex-start;
  }
  .divider.center,
  .measure.center {
    align-items: center;
  }
  .divider.right,
  .measure.right {
    align-items: flex-end;
  }
  .measure {
    gap: var(--sp-4);
    margin-bottom: var(--sp-4);
  }
  .set {
    display: flex;
    align-items: center;
    gap: var(--sp-4);
  }
  /* The span of the length: as long as the rule, standing over it. */
  .hspan {
    position: relative;
    flex: none;
    align-self: stretch;
    height: var(--sp-8);
    border-left: 1px solid var(--color-accent);
    border-right: 1px solid var(--color-accent);
  }
  .measure.left .hspan {
    align-self: flex-start;
  }
  .measure.center .hspan {
    align-self: center;
  }
  .measure.right .hspan {
    align-self: flex-end;
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
  .rule {
    display: block;
    border-top: 1px solid var(--color-label-secondary);
  }
  /* The asterisks in a row, the asterism as three in a triangle: small dots in the mark's place. */
  .asterisks,
  .asterism {
    display: flex;
    gap: var(--sp-8);
  }
  .asterism {
    display: grid;
    grid-template-columns: repeat(2, var(--sp-4));
    gap: 0;
  }
  .asterism i:first-child {
    grid-column: 1 / span 2;
    justify-self: center;
  }
  i {
    display: block;
    width: var(--sp-4);
    height: var(--sp-4);
    border-radius: 50%;
    background: var(--color-label-secondary);
  }
  /* Space only: the place, dashed, with nothing in it. */
  .space {
    display: block;
    width: 25%;
    height: var(--sp-8);
    border: 1px dashed var(--color-separator);
    border-radius: var(--r-sm);
  }
</style>
