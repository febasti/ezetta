<script lang="ts">
  import type { Snippet } from 'svelte'
  import { PROPS, propLabel } from '@core/export/elements'
  import type { ElementDef } from '@core/export/elements'
  import { formatHeadingNumber } from '@core/export/numbering'
  import { shareOf, thicknessPx } from './schematics'
  import type { HeadingNumbering } from '@core/export/numbering'
  import { i18n } from '../../i18n/i18n.svelte'
  import Icon from '../../ui/Icon.svelte'

  /**
   * The editor of a heading's arrangement: a page with the heading between two pieces of text, and
   * each value where it is set on it. The space above and below stand in the rows between the heading
   * and the text, their spans as high as the row, which is the whole space; the line above and below
   * are drawn where they print, each with its switch; the text before and after the number stand in
   * front of and behind the number; the heading stands where its alignment puts it. Where the
   * heading breaks to a new page, a page before it and the name of the break say so (the page is empty for the break to the next right-hand page). The look of a line is set under the page,
   * and the two choices about the whole heading (the break, the alignment) over it.
   */
  interface Props {
    element: ElementDef
    values: Readonly<Record<string, unknown>>
    /** The control of one value, as the panel draws it. */
    control: Snippet<[ElementDef, string]>
    /** The value whose last input was refused (`element.property`), or null. */
    refused: string | null
    /** How the template numbers headings, for the sample number. */
    numbering: HeadingNumbering
    /** The width of the text on the page, and the size of the heading's type, both in centimetres. */
    measure: number
    emCm: number
  }
  let { element, values, control, refused, numbering, measure, emCm }: Props = $props()

  const lang = $derived(i18n.locale)
  const has = (id: string): boolean => element.props.includes(id)
  const name = (id: string): string => propLabel(element.id, PROPS[id]!, lang)
  const place = $derived(
    values['align'] === 'center' ? 'center' : values['align'] === 'right' ? 'end' : 'start',
  )
  const breaks = $derived(values['break_before'] === 'page' || values['break_before'] === 'odd')
  /** What the break is, as the choice names it: a new page, or the next right-hand one. */
  const breakName = $derived(
    PROPS['break_before']?.valueLabels?.[String(values['break_before'])]?.[lang] ?? '',
  )
  /** The number of a heading of this level, as the template prints it (the format and the separator). */
  const level = $derived(Number(element.id.replace('heading_', '')) || 2)
  const sample = $derived(formatHeadingNumber(Array<number>(level).fill(1), numbering) || '–')
</script>

{#snippet text(widths: number[])}
  <div class="text" aria-hidden="true">
    {#each widths as width, i (i)}<span style:width="{width}%"></span>{/each}
  </div>
{/snippet}

{#snippet between(id: string)}
  <!-- The space between the text and the heading: the row is the space, and its span measures it. -->
  <div class="between">
    <span class="vspan" aria-hidden="true"></span>
    <span class="field">{@render control(element, id)}</span>
    <label class="short" for="prop-{element.id}-{id}">{name(id)}</label>
  </div>
{/snippet}

{#snippet rule(side: 'above' | 'below')}
  <!-- The line, as long as its length is of the text's width, where the heading's alignment puts it,
       and as thick as its weight (lightly: it shows heavier from lighter, not how heavy). -->
  {#if values[`line_${side}`] === true}
    <div class="rule" style:justify-content={place === 'end' ? 'flex-end' : place}>
      <span
        style:width="{shareOf(values[`line_${side}_width`], measure, emCm) * 100}%"
        style:height="{thicknessPx(values[`line_${side}_thickness`], emCm)}px"
      ></span>
    </div>
  {/if}
{/snippet}

{#snippet toggle(side: 'above' | 'below')}
  {@const id = `line_${side}`}
  <div class="toggle">
    {@render control(element, id)}
    <label for="prop-{element.id}-{id}">{name(id)}</label>
  </div>
{/snippet}

<!-- The choices that are about the whole heading, over the page: where it breaks, where it stands. -->
<div class="choices">
  {#if has('break_before')}
    <div class="choice">
      <span class="short">{name('break_before')}</span>
      {@render control(element, 'break_before')}
    </div>
  {/if}
  <div class="choice">
    <span class="short">{name('align')}</span>
    {@render control(element, 'align')}
  </div>
</div>

{#snippet inside()}
  {#if has('above')}{@render between('above')}{/if}
  {#if has('line_above')}
    {@render toggle('above')}
    {@render rule('above')}
  {/if}

  <div class="heading" style:justify-content={place === 'end' ? 'flex-end' : place}>
    {#if has('number_prefix')}
      <span class="affix">{@render control(element, 'number_prefix')}</span>
    {/if}
    <span class="number" class:none={sample === '–'} aria-hidden="true">{sample}</span>
    {#if has('number_suffix')}
      <span class="affix">{@render control(element, 'number_suffix')}</span>
    {/if}
    <span class="title" aria-hidden="true"></span>
  </div>
  {#if refused === `${element.id}.number_prefix` || refused === `${element.id}.number_suffix`}
    <p class="invalid" role="alert">{i18n.t('templates.invalid')}</p>
  {/if}

  {#if has('line_below')}
    {@render rule('below')}
    {@render toggle('below')}
  {/if}
  {#if has('below')}{@render between('below')}{/if}
  {@render text([100, 100, 58])}
{/snippet}

<div class="desk">
  {#if breaks}
    <!-- A break: the text above ends with its page and the heading starts another one. To the next right-hand page the page before may stay empty, so it is drawn without text. -->
    <div class="sheet" class:empty={values['break_before'] === 'odd'} aria-hidden="true">
      {@render text([100, 64])}
    </div>
    <div class="pagebreak" aria-hidden="true">
      <Icon name={values['break_before'] === 'odd' ? 'pages' : 'page'} size={16} />
      <span>{breakName}</span>
    </div>
    <div class="sheet">{@render inside()}</div>
  {:else}
    <div class="sheet">
      {@render text([100, 64])}
      {@render inside()}
    </div>
  {/if}
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
  /* The page before a break to the next right-hand page, which may be empty: its text is there only to keep its height. */
  .sheet.empty .text {
    visibility: hidden;
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
  /* The pages are apart on the desk, the break between them named: a new page, or a right-hand one. */
  .pagebreak {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--sp-8);
    padding: var(--sp-8) 0;
    color: var(--color-label-secondary);
    font: var(--type-caption);
  }
  /* The space between the text and the heading, which the span measures from end to end. */
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
  }
  .toggle {
    display: flex;
    align-items: center;
    gap: var(--sp-8);
    padding: var(--sp-4) 0;
    color: var(--color-label);
    font: var(--type-body);
  }
  .rule {
    display: flex;
    align-items: center;
    height: var(--sp-4);
  }
  .rule span {
    display: block;
    background: var(--color-label-secondary);
  }
  /* The heading as it stands: the text before the number, the number, the text after it, the title. */
  .heading {
    display: flex;
    align-items: center;
    gap: var(--sp-4);
    padding: var(--sp-8) 0;
  }
  .invalid {
    margin: 0 0 var(--sp-8);
    color: var(--color-danger);
    font: var(--type-caption);
  }
  /* The text around the number is as wide as it is, with room for a short one. */
  .affix :global(.text-field) {
    width: auto;
    min-width: 40px;
    max-width: 120px;
    field-sizing: content;
  }
  .number {
    display: inline-flex;
    align-items: center;
    height: var(--control-md);
    padding: 0 var(--sp-8);
    border-radius: var(--r-sm);
    background: var(--color-control);
    color: var(--color-label-secondary);
    font: var(--type-body);
  }
  /* A level without a number (the template numbers fewer levels). */
  .number.none {
    color: var(--color-label-tertiary);
  }
  .title {
    width: 96px;
    height: var(--sp-8);
    margin-left: var(--sp-4);
    border-radius: var(--r-sm);
    background: var(--color-label-tertiary);
  }
</style>
