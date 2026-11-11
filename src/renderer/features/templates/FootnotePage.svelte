<script lang="ts">
  import type { Snippet } from 'svelte'
  import { PROPS, isShown, propLabel } from '@core/export/elements'
  import type { ElementDef } from '@core/export/elements'
  import { i18n } from '../../i18n/i18n.svelte'
  import { lengthCm, shareOf, thicknessPx } from './schematics'

  /**
   * The editor of footnotes: a page with a piece of text that has a note, and the notes where the
   * template puts them: at the foot of the page, under a short rule, or in a column at the side. The
   * number is the one the template prints, in the text and in the note: its format, how it is set in
   * the text, and how it stands in the note. At the foot, the rule is as long and as thick as it is, and
   * the indent and the space between the notes are fields where they are; in the margin, the column and
   * its distance to the text are as wide as they are of the page. What has no place on the page is set
   * under it.
   */
  interface Props {
    element: ElementDef
    values: Readonly<Record<string, unknown>>
    /** The control of one value, as the panel draws it. */
    control: Snippet<[ElementDef, string]>
    /** The width of the text on the page and the size of the notes' type, both in centimetres. */
    measure: number
    emCm: number
  }
  let { element, values, control, measure, emCm }: Props = $props()

  const lang = $derived(i18n.locale)
  const name = (id: string): string => propLabel(element.id, PROPS[id]!, lang)
  const margin = $derived(values['placement'] === 'margin')
  /** The first number, as the template counts: digits, roman numerals, letters or a symbol. */
  const first = $derived(
    ({ arabic: '1', roman_lower: 'i', alpha_lower: 'a', symbols: '*' } as Record<string, string>)[
      String(values['note_numbering'])
    ] ?? '1',
  )
  const mark = $derived(String(values['marker_style']))
  const entry = $derived(
    values['entry_number'] === 'period'
      ? `${first}.`
      : values['entry_number'] === 'plain'
        ? first
        : null,
  )
  const ruleStyle = $derived(String(values['separator_style'] ?? 'solid'))
  const ruleShare = $derived(shareOf(values['rule_length'], measure, emCm) * 100)
  /** The page's width in the margin's mode: the text, the distance, and the column, as shares. */
  const columns = $derived.by(() => {
    const gap = lengthCm(values['margin_gap'], emCm) ?? 0.7
    const width = lengthCm(values['margin_width'], emCm) ?? 4.5
    const total = measure + gap + width
    return { text: (measure / total) * 100, gap: (gap / total) * 100, note: (width / total) * 100 }
  })
  const shown = (id: string): boolean => isShown(id, values)
</script>

{#snippet text(widths: number[], marked = -1)}
  <div class="text" aria-hidden="true">
    {#each widths as width, i (i)}
      <div class="line">
        <span style:width="{width}%"></span>
        {#if i === marked}{@render marker()}{/if}
      </div>
    {/each}
  </div>
{/snippet}

{#snippet marker()}
  <!-- The marker in the text, as the template sets it. -->
  <span class="marker">
    {#if mark === 'super'}<sup>{first}</sup>
    {:else if mark === 'super_paren'}<sup>{first})</sup>
    {:else if mark === 'sub'}<sub>{first}</sub>
    {:else if mark === 'brackets'}[{first}]
    {:else if mark === 'parens'}({first})
    {:else}{first}{/if}
  </span>
{/snippet}

{#snippet note()}
  <!-- A note: its number as the template sets it in the note (as in the text, or plain), and two lines. -->
  <div class="note" aria-hidden="true">
    <span class="number">
      {#if entry !== null}{entry}{:else}{@render marker()}{/if}
    </span>
    <div class="bars"><span style:width="100%"></span><span style:width="64%"></span></div>
  </div>
{/snippet}

{#snippet between()}
  <!-- The space between the notes: the row is the space, and its span measures it. -->
  <div class="between">
    <span class="vspan" aria-hidden="true"></span>
    <span class="field">{@render control(element, 'note_gap')}</span>
    <label class="short" for="prop-{element.id}-note_gap">{name('note_gap')}</label>
  </div>
{/snippet}

<!-- Where the notes stand: the choice of the group, over the page. -->
<div class="choices">{@render control(element, 'placement')}</div>

<div class="desk">
  <div class="sheet">
    {#if margin}
      <!-- In the margin: the text at the left, its notes in a column at the side. -->
      <div class="cols" style:gap="{columns.gap}%">
        <div style:width="{columns.text}%">
          {@render text([100, 100, 94, 100, 100, 100, 100, 60], 2)}
        </div>
        <div class="side" style:width="{columns.note}%">
          {@render note()}
          <div class="space"></div>
          {@render note()}
        </div>
      </div>
    {:else}
      {@render text([100, 100, 82], 2)}
      <!-- At the foot: a short rule, as long and as thick as it is, then the notes. -->
      <div class="foot">
        <div class="rule">
          {#if ruleStyle !== 'none'}
            <span
              style:width="{ruleShare}%"
              style:border-top="{thicknessPx(values['rule_width'], emCm)}px {ruleStyle} var(--color-label-secondary)"
            ></span>
          {/if}
        </div>
        <div class="row">
          {#if shown('note_indent')}
            <div class="strip">
              <span class="field">{@render control(element, 'note_indent')}</span>
              <label class="short" for="prop-{element.id}-note_indent"
                >{i18n.t('templates.notes.indent')}</label
              >
            </div>
          {/if}
          {@render note()}
        </div>
        {@render between()}
        <div class="row">
          {#if shown('note_indent')}<div class="strip"></div>{/if}
          {@render note()}
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .choices {
    display: flex;
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
    gap: var(--sp-12);
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
  .line {
    display: flex;
    align-items: center;
    gap: var(--sp-4);
  }
  .line span,
  .bars span {
    display: block;
    height: var(--sp-4);
    border-radius: var(--r-sm);
    background: var(--color-control-pressed);
  }
  .marker {
    flex: none;
    color: var(--color-label-secondary);
    font: var(--type-caption);
  }
  .marker :global(sup),
  .marker :global(sub) {
    font-size: inherit;
  }
  .foot {
    display: flex;
    flex-direction: column;
  }
  /* The rule above the notes, in the height of its thickest, so changing it moves nothing. */
  .rule {
    display: flex;
    align-items: center;
    height: var(--sp-8);
    margin-bottom: var(--sp-8);
  }
  .rule span {
    display: block;
  }
  .row {
    display: flex;
    align-items: center;
    gap: var(--sp-8);
  }
  .strip {
    display: flex;
    flex: none;
    align-items: center;
    gap: var(--sp-4);
    width: 148px;
    min-height: var(--control-md);
  }
  .note {
    display: flex;
    flex: 1;
    align-items: flex-start;
    gap: var(--sp-8);
    min-width: 0;
  }
  .number {
    flex: none;
    min-width: var(--sp-8);
    color: var(--color-label-secondary);
    font: var(--type-caption);
  }
  .bars {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--sp-4);
    padding-top: var(--sp-4);
  }
  .between {
    display: flex;
    align-items: stretch;
    gap: var(--sp-8);
    min-height: var(--control-lg);
    padding: var(--sp-4) 0;
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
  /* In the margin: the text and the column of notes, as wide as they are of the page. */
  .cols {
    display: flex;
  }
  .side {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .space {
    height: var(--sp-16);
  }
</style>
