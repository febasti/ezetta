<script lang="ts">
  import PageSheet from './PageSheet.svelte'
  import type { Snippet } from 'svelte'
  import { PROPS, propLabel } from '@core/export/elements'
  import type { ElementDef } from '@core/export/elements'
  import { i18n } from '../../i18n/i18n.svelte'

  /**
   * The editor of a list, in three small specimens, each showing one thing: where the list stands on the
   * page (the space above and below it, and its indent), what lies between a bullet and its text, and how
   * the levels and the items are spaced. A distance across is a field in a row of its own over the list,
   * in the column of the stretch it measures, with a bracket in the list's row under it; a distance down
   * is a row between two things, its span as high as the row. Spans and brackets are quiet until their
   * field is pointed at or has the focus. The bullets are drawn as the template has them.
   */
  interface Props {
    element: ElementDef
    values: Readonly<Record<string, unknown>>
    /** The control of one value, as the panel draws it. */
    control: Snippet<[ElementDef, string]>
  }
  let { element, values, control }: Props = $props()

  const lang = $derived(i18n.locale)
  const name = (id: string): string => propLabel(element.id, PROPS[id]!, lang)
  /** The value whose field is pointed at or has the focus, so its span is drawn stronger. */
  let hot = $state<string | null>(null)
  /** The bullet of a level: the template's own, or Typst's (a dot, and a triangle one level down). */
  const shape = (level: 1 | 2): string => {
    const marker = values['marker']
    return marker === 'bullet'
      ? 'dot'
      : marker === 'circle'
        ? 'ring'
        : marker === 'square'
          ? 'square'
          : marker === 'dash'
            ? 'dash'
            : level === 1
              ? 'dot'
              : 'triangle'
  }
</script>

{#snippet text(widths: number[])}
  <div class="text" aria-hidden="true">
    {#each widths as width, i (i)}<span style:width="{width}%"></span>{/each}
  </div>
{/snippet}

{#snippet between(id: string)}
  <!-- The space between two things: the row is the space, and its span measures it. -->
  <div
    class="between"
    role="group"
    onpointerenter={() => (hot = id)}
    onpointerleave={() => (hot = null)}
    onfocusin={() => (hot = id)}
    onfocusout={() => (hot = null)}
  >
    <span class="vspan" class:hot={hot === id} aria-hidden="true"></span>
    <span class="field">{@render control(element, id)}</span>
    <label class="short" for="prop-{element.id}-{id}">{name(id)}</label>
  </div>
{/snippet}

{#snippet slim(id: string)}
  <!-- The space between the items: a slim row, so the list stays close; its span measures the row. -->
  <div
    class="between slim"
    role="group"
    aria-hidden="false"
    onpointerenter={() => (hot = id)}
    onpointerleave={() => (hot = null)}
    onfocusin={() => (hot = id)}
    onfocusout={() => (hot = null)}
  >
    <span class="vspan" class:hot={hot === id} aria-hidden="true"></span>
    <span class="field">{@render control(element, id)}</span>
    <label class="short" for="prop-{element.id}-{id}">{name(id)}</label>
  </div>
{/snippet}

{#snippet cell(id: string, caption: string)}
  <!-- A distance across, as a field where it is in the item, with a bracket under it as wide as it. -->
  <div
    class="cell"
    role="group"
    onpointerenter={() => (hot = id)}
    onpointerleave={() => (hot = null)}
    onfocusin={() => (hot = id)}
    onfocusout={() => (hot = null)}
  >
    <label class="short" for="prop-{element.id}-{id}">{caption}</label>
    <span class="field">{@render control(element, id)}</span>
  </div>
{/snippet}

{#snippet bracket(id: string)}
  <!-- The stretch a distance across measures, marked in the list's row. -->
  <span class="hspan" class:hot={hot === id} aria-hidden="true"></span>
{/snippet}

<div class="desk">
  <!-- 1. Where the list stands on the page. -->
  <section class="part" aria-label={i18n.t('templates.list.part.place')}>
    <h4>{i18n.t('templates.list.part.place')}</h4>
    <PageSheet top="torn" bottom="torn">
      {@render text([100, 64])}
      {@render between('above')}
      <div class="ruler">{@render cell('list_indent', i18n.t('templates.list.indent'))}</div>
      <div class="list" aria-hidden="true">
        <div class="item">
          {@render bracket('list_indent')}
          <span class="marker {shape(1)}"></span>
          <span class="pad"></span>
          <span class="bar"></span>
        </div>
        <div class="item">
          <span class="column"></span>
          <span class="marker {shape(1)}"></span>
          <span class="pad"></span>
          <span class="bar short-bar"></span>
        </div>
      </div>
      {@render between('below')}
      {@render text([100, 100, 58])}
    </PageSheet>
  </section>

  <!-- 2. What lies between a bullet and its text. -->
  <section class="part" aria-label={i18n.t('templates.list.part.bullet')}>
    <h4>{i18n.t('templates.list.part.bullet')}</h4>
    <PageSheet top="torn" bottom="torn">
      <div class="ruler">
        <span class="lead"></span>
        {@render cell('marker_gap', i18n.t('templates.list.gap'))}
      </div>
      <div class="list" aria-hidden="true">
        <div class="item">
          <span class="marker {shape(1)}"></span>
          {@render bracket('marker_gap')}
          <span class="pad"></span>
          <span class="bar"></span>
        </div>
        <div class="item">
          <span class="marker {shape(1)}"></span>
          <span class="column"></span>
          <span class="pad"></span>
          <span class="bar short-bar"></span>
        </div>
      </div>
    </PageSheet>
  </section>

  <!-- 3. The levels, and the space between the items. -->
  <section class="part" aria-label={i18n.t('templates.list.part.levels')}>
    <h4>{i18n.t('templates.list.part.levels')}</h4>
    <PageSheet top="torn" bottom="torn">
      <div class="ruler">
        <span class="lead nested"></span>
        {@render cell('level_indent', i18n.t('templates.list.level'))}
      </div>
      <div class="list" aria-hidden="true">
        <div class="item">
          <span class="marker {shape(1)}"></span>
          <span class="pad"></span>
          <span class="bar"></span>
        </div>
        <!-- One level down: it starts where the text above it starts. -->
        <div class="item">
          <span class="lead nested"></span>
          {@render bracket('level_indent')}
          <span class="marker {shape(2)}"></span>
          <span class="pad"></span>
          <span class="bar"></span>
        </div>
        {@render slim('item_spacing')}
        <div class="item">
          <span class="marker {shape(1)}"></span>
          <span class="pad"></span>
          <span class="bar short-bar"></span>
        </div>
      </div>
    </PageSheet>
  </section>
</div>

<style>
  /* The page lies on the panel's ground, as on a desk. */
  .desk {
    display: flex;
    flex-direction: column;
    gap: var(--sp-16);
    padding: var(--sp-12);
    border-radius: var(--r-lg);
    background: var(--color-panel);
  }
  .part h4 {
    margin: 0 0 var(--sp-8);
    padding: 0 var(--sp-4);
    color: var(--color-label-tertiary);
    font: var(--type-caption);
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
  /* The spans: quiet until their field is pointed at or has the focus. */
  .vspan {
    position: relative;
    width: var(--sp-8);
    border-top: 1px solid var(--color-accent);
    border-bottom: 1px solid var(--color-accent);
    opacity: 0.55;
    transition: opacity var(--duration);
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
  .hspan {
    position: relative;
    flex: none;
    width: 76px;
    height: var(--sp-8);
    border-right: 1px solid var(--color-accent);
    border-left: 1px solid var(--color-accent);
    opacity: 0.55;
    transition: opacity var(--duration);
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
  .vspan.hot,
  .hspan.hot {
    opacity: 1;
  }
  .field {
    width: 84px;
  }
  .short {
    color: var(--color-label-secondary);
    font: var(--type-caption);
    white-space: nowrap;
  }
  /* The ruler: the three fields over the columns of the list. */
  .ruler {
    display: flex;
    align-items: flex-end;
    padding-top: var(--sp-8);
  }
  /* What lies before the field of a ruler: the bullet's own width, or the text's start one level up. */
  .ruler > .lead {
    flex: none;
    width: var(--sp-8);
  }
  .lead.nested {
    flex: none;
    width: calc(var(--sp-8) + var(--sp-8));
  }
  .cell {
    display: flex;
    flex: none;
    flex-direction: column;
    gap: var(--sp-4);
    width: 76px;
  }
  .cell .field {
    width: 100%;
  }
  /* A caption is as wide as its column, and goes on a second line where it needs one. */
  .cell .short {
    min-height: calc(2 * var(--sp-8) - var(--sp-4) + var(--sp-8) - var(--sp-4));
    white-space: normal;
    text-wrap: balance;
  }
  /* A little narrower than a length elsewhere, so the three stand in the columns of the list. */
  .cell :global(.length) {
    width: 76px;
  }
  /* The list: close, each item as high as a line of its text. */
  .list {
    display: flex;
    flex-direction: column;
    gap: var(--sp-8);
    padding: var(--sp-8) 0;
  }
  .item {
    display: flex;
    align-items: center;
    min-height: var(--sp-16);
  }
  /* The columns of the first item: the indent, the bullet, the distance, and the little before the text. */
  .column {
    flex: none;
    width: 76px;
  }
  .pad {
    flex: none;
    width: var(--sp-8);
  }
  .item > .bar.short-bar {
    margin-right: var(--sp-32);
  }
  .item > .bar {
    flex: 1;
    min-width: 0;
  }
  .between.slim {
    min-height: var(--control-md);
    padding: 0;
  }
  .bar {
    display: block;
    min-width: 0;
    height: var(--sp-4);
    border-radius: var(--r-sm);
    background: var(--color-control-pressed);
  }
  /* The bullets, as the template has them: a dot, a ring, a square, a dash, a triangle. */
  .marker {
    display: block;
    flex: none;
    width: var(--sp-8);
    height: var(--sp-8);
    background: var(--color-label-secondary);
  }
  .marker.dot {
    border-radius: 50%;
  }
  .marker.ring {
    border: 1px solid var(--color-label-secondary);
    border-radius: 50%;
    background: none;
  }
  .marker.dash {
    height: 2px;
  }
  .marker.triangle {
    clip-path: polygon(0 0, 100% 50%, 0 100%);
  }
</style>
