<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { ElementDef } from '@core/export/elements'
  import { i18n } from '../../i18n/i18n.svelte'

  /**
   * The editor of the body text's arrangement: a page with two paragraphs, as grey bars, and the two
   * values that lie between them in the row between them: the indent of the first line at the left,
   * its span just over the indent of the line below, and the space between the paragraphs at the
   * right, its span as high as the row, which is the whole space. How the lines are set (ragged or
   * justified) and whether words are divided show in the bars, and are chosen in the cards under the
   * page.
   */
  interface Props {
    element: ElementDef
    values: Readonly<Record<string, unknown>>
    /** The control of one value, as the panel draws it. */
    control: Snippet<[ElementDef, string]>
  }
  let { element, values, control }: Props = $props()

  const justify = $derived(values['justify'] === true)
  const hyphens = $derived(values['hyphenate'] === true)
  /** A line's width in the measure: justified lines fill it, but the last of a paragraph. */
  const fill = (width: number, last: boolean): number => (justify && !last ? 100 : width)
</script>

{#snippet line(width: number, last: boolean, divided: boolean, dent = false)}
  <div class="line" class:dent>
    <span
      class="bar"
      style:width={divided && fill(width, last) === 100
        ? 'calc(100% - 10px)'
        : `${fill(width, last)}%`}
    ></span>
    {#if divided && !last}<span class="hyphen"></span>{/if}
  </div>
{/snippet}

<div class="desk">
  <div class="sheet">
    <div class="paragraph" aria-hidden="true">
      {@render line(97, false, false)}
      {@render line(86, false, hyphens)}
      {@render line(93, false, false)}
      {@render line(52, true, false)}
    </div>
    <!-- Everything between the paragraphs is this row, so what its span measures is the whole space. -->
    <div class="between">
      <div class="indent">
        <div class="set">
          <span class="field">{@render control(element, 'first_line_indent')}</span>
          <label class="short" for="prop-{element.id}-first_line_indent"
            >{i18n.t('templates.paragraphs.indent')}</label
          >
        </div>
        <svg class="span" viewBox="0 0 16 12" width="16" height="12" aria-hidden="true">
          <path d="M0.5 2V10M15.5 2V10M0.5 6H15.5" />
        </svg>
      </div>
      <div class="space">
        <span class="vspan" aria-hidden="true"></span>
        <span class="field">{@render control(element, 'paragraph_spacing')}</span>
        <label class="short" for="prop-{element.id}-paragraph_spacing"
          >{i18n.t('templates.paragraphs.spacing')}</label
        >
      </div>
    </div>
    <div class="paragraph" aria-hidden="true">
      {@render line(94, false, false, true)}
      {@render line(92, false, hyphens)}
      {@render line(60, true, false)}
    </div>
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
  .paragraph {
    display: flex;
    flex-direction: column;
    gap: var(--sp-8);
  }
  .line {
    display: flex;
    align-items: center;
  }
  /* The first line of a paragraph that is indented. */
  .line.dent {
    padding-left: var(--sp-16);
  }
  .bar {
    display: block;
    height: var(--sp-4);
    border-radius: var(--r-sm);
    background: var(--color-control-pressed);
  }
  /* A word divided at the end of the line: the hyphen after the line. */
  .hyphen {
    width: var(--sp-8);
    height: 2px;
    margin-left: 2px;
    border-radius: var(--r-sm);
    background: var(--color-label-tertiary);
  }
  /* The space between the paragraphs: the indent at its left, the distance at its right. */
  .between {
    display: flex;
    align-items: stretch;
    justify-content: space-between;
    gap: var(--sp-8);
  }
  .indent {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: var(--sp-4);
    padding: var(--sp-8) 0 0;
  }
  .set,
  .space {
    display: flex;
    align-items: center;
    gap: var(--sp-4);
  }
  .space {
    gap: var(--sp-8);
  }
  .span path {
    fill: none;
    stroke: var(--color-accent);
    stroke-width: 1;
  }
  /* The span of the distance: a line with an end at each side, as high as the row. */
  .vspan {
    position: relative;
    align-self: stretch;
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
  .short {
    color: var(--color-label-secondary);
    font: var(--type-caption);
    white-space: nowrap;
  }
</style>
