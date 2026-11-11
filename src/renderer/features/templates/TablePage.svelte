<script lang="ts">
  import type { Snippet } from 'svelte'
  import { PROPS, propLabel } from '@core/export/elements'
  import type { ElementDef } from '@core/export/elements'
  import { i18n } from '../../i18n/i18n.svelte'
  import { lengthCm, thicknessPx } from './schematics'

  /**
   * The editor of a table and its caption: a page with the table between two pieces of text, its
   * caption above or below it, as the template has them. The table is drawn as the template sets it: its
   * rules by their kind and weight, the ground of its header and of every second row, a bold header,
   * the alignment of the cells, and the room in them. The distance of the caption to the table is the
   * row between them, its span as high as the row. How the rules are drawn, how the cells are aligned and
   * where the caption stands are the choices over the page; the rest of the values are under it.
   */
  interface Props {
    element: ElementDef
    /** The caption of the table, an element of its own. */
    caption: ElementDef
    values: Readonly<Record<string, unknown>>
    captionValues: Readonly<Record<string, unknown>>
    /** The control of one value of an element, as the panel draws it. */
    control: Snippet<[ElementDef, string]>
    /** The size of the table's type in centimetres, for the weight of the rules and the room in cells. */
    emCm: number
  }
  let { element, caption, values, captionValues, control, emCm }: Props = $props()

  const lang = $derived(i18n.locale)
  const above = $derived(captionValues['caption_position'] !== 'below')
  const kind = $derived((values['border_style'] as string) ?? 'rows')
  const filled = (id: string): boolean => typeof values[id] === 'string' && values[id] !== ''
  const place = (v: unknown): string =>
    v === 'right' ? 'flex-end' : v === 'left' ? 'flex-start' : 'center'
  const thin = $derived(`${thicknessPx(values['rule_width'], emCm)}px`)
  const strong = $derived(`${thicknessPx(values['rule_strong_width'], emCm)}px`)
  /** The room in a cell as drawn: a little for a little, in whole pixels from two to twelve. */
  const room = $derived(
    Math.min(12, Math.max(2, Math.round((lengthCm(values['inset'], emCm) ?? 0.2) * 16))),
  )
  const rule = (on: boolean, weight: string): string =>
    on ? `${weight} solid var(--color-label-secondary)` : 'none'
  /** The rules above and below a row, and between its cells, as the kind of rules has them. */
  const edges = (row: number): { top: string; bottom: string } => {
    if (kind === 'none') return { top: 'none', bottom: 'none' }
    if (kind === 'booktabs')
      return {
        top: row === 0 ? rule(true, strong) : 'none',
        bottom: row === 0 ? rule(true, thin) : row === 3 ? rule(true, strong) : 'none',
      }
    if (kind === 'grid')
      return { top: row === 0 ? rule(true, thin) : 'none', bottom: rule(true, thin) }
    return {
      top: row === 0 ? rule(true, thin) : 'none',
      bottom: rule(true, row === 0 ? strong : thin),
    }
  }
</script>

{#snippet between(owner: ElementDef, id: string)}
  <!-- The space between two things: the row is the space, and its span measures it. -->
  <div class="between">
    <span class="vspan" aria-hidden="true"></span>
    <span class="field">{@render control(owner, id)}</span>
    <label class="short" for="prop-{owner.id}-{id}">{propLabel(owner.id, PROPS[id]!, lang)}</label>
  </div>
{/snippet}

{#snippet captionText()}
  <!-- The caption: two lines where its alignment puts them (the table is as wide as the page, so a caption limited to it is too). -->
  <div class="caption" aria-hidden="true">
    <span style:align-self={place(captionValues['align'])} style:width="100%"></span>
    <span style:align-self={place(captionValues['align'])} style:width="60%"></span>
  </div>
{/snippet}

{#snippet text(widths: number[])}
  <div class="text" aria-hidden="true">
    {#each widths as width, i (i)}<span style:width="{width}%"></span>{/each}
  </div>
{/snippet}

<!-- The choices about the table as a whole, over the page. -->
<div class="choices">
  <div class="choice">
    <span class="short">{propLabel(element.id, PROPS['border_style']!, lang)}</span>
    {@render control(element, 'border_style')}
  </div>
  <div class="choice">
    <span class="short">{i18n.t('templates.table.cells')}</span>
    {@render control(element, 'cell_align')}
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
    <div class="object">
      {#if above}
        {@render captionText()}
        {@render between(caption, 'caption_gap')}
      {/if}
      <div class="table" aria-hidden="true">
        {#each [0, 1, 2, 3] as row (row)}
          <div
            class="tr"
            class:tint={(row === 0 && filled('header_fill')) ||
              (row === 2 && filled('stripe_fill'))}
            style:border-top={edges(row).top}
            style:border-bottom={edges(row).bottom}
          >
            {#each [0, 1, 2] as col (col)}
              <span
                class="td"
                style:justify-content={place(values['cell_align'])}
                style:padding-block="{room}px"
                style:border-left={kind === 'grid' ? rule(true, thin) : 'none'}
                style:border-right={kind === 'grid' && col === 2 ? rule(true, thin) : 'none'}
              >
                <span class="cell" class:strong={row === 0 && values['header_bold'] === true}
                ></span>
              </span>
            {/each}
          </div>
        {/each}
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
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--sp-8) var(--sp-12);
  }
  .choice {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--sp-4);
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
  .object {
    display: flex;
    flex-direction: column;
  }
  /* The table: four rows of three cells, each row's rules and ground as the template sets them. */
  .table {
    display: flex;
    flex-direction: column;
  }
  .tr {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    box-sizing: border-box;
  }
  .tr.tint {
    background: var(--color-control);
  }
  .td {
    display: flex;
    align-items: center;
    padding-inline: var(--sp-8);
  }
  .cell {
    display: block;
    width: 40%;
    height: var(--sp-4);
    border-radius: var(--r-sm);
    background: var(--color-control-pressed);
  }
  .cell.strong {
    background: var(--color-label-tertiary);
  }
  /* The caption: two lines. */
  .caption {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
  }
  .caption span {
    display: block;
    height: var(--sp-4);
    border-radius: var(--r-sm);
    background: var(--color-label-tertiary);
  }
</style>
