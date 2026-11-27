<script lang="ts">
  import PageSheet from './PageSheet.svelte'
  import type { Snippet } from 'svelte'
  import { PROPS, propLabel } from '@core/export/elements'
  import type { ElementDef } from '@core/export/elements'
  import { i18n } from '../../i18n/i18n.svelte'

  /**
   * The picture of a list: one page with a list of two levels between two pieces of text, and each
   * of its distances named where it is. A distance down (the space above and below the list, the
   * space between its items) is a row between two things, its span as high as the row. A distance
   * across (the indent of the list, the bullet's distance to its text, the indent of a level) is a
   * bracket in the row of an item, as wide as the stretch it measures, with its name over it. Spans
   * and brackets are quiet until their row of the panel, or their name here, is pointed at. A dot
   * stands for what an item starts with, a bullet or a number: the picture is about the distances,
   * and they are the same for both.
   */
  interface Props {
    element: ElementDef
    /** The control of one value, as the panel draws it. */
    control: Snippet<[ElementDef, string]>
    /** The value whose row of the panel is pointed at or has the focus, to mark it in the picture. */
    hot?: string | null
  }
  let { element, control, hot: outer = null }: Props = $props()

  const lang = $derived(i18n.locale)
  const name = (id: string): string => propLabel(element.id, PROPS[id]!, lang)
  /** The value whose field is pointed at or has the focus, so its span is drawn stronger. */
  let over = $state<string | null>(null)
  const hot = $derived(over ?? outer)
</script>

{#snippet text(widths: number[])}
  <div class="text" aria-hidden="true">
    {#each widths as width, i (i)}<span style:width="{width}%"></span>{/each}
  </div>
{/snippet}

{#snippet between(id: string, caption = name(id))}
  <!-- The space between two things: the row is the space, and its span measures it. -->
  <div
    class="between"
    role="group"
    onpointerenter={() => (over = id)}
    onpointerleave={() => (over = null)}
  >
    <span class="vspan" class:hot={hot === id} aria-hidden="true"></span>
    {@render control(element, id)}
    <label class="short" for="prop-{element.id}-{id}">{caption}</label>
  </div>
{/snippet}

{#snippet named(id: string, caption: string, at: 'margin' | 'bullet' | 'body')}
  <!-- The name of a distance across, over the bracket that measures it in the item under it. -->
  <div
    class="named {at}"
    role="group"
    onpointerenter={() => (over = id)}
    onpointerleave={() => (over = null)}
  >
    {@render control(element, id)}
    <label class="short" for="prop-{element.id}-{id}">{caption}</label>
  </div>
{/snippet}

{#snippet bracket(id: string, kind: 'indent' | 'gap')}
  <!-- The stretch a distance across measures, in the row of an item. -->
  <span class="column {kind}"><span class="hspan" class:hot={hot === id}></span></span>
{/snippet}

{#snippet item(level: 1 | 2, measured: string | null, short = false)}
  <!-- An item: the list's indent, its bullet, the distance to its text, the text. One level down it
       starts where the text of the item above it starts. The stretch `measured` is a bracket. -->
  <div class="item" aria-hidden="true">
    {#if measured === 'list_indent'}
      {@render bracket('list_indent', 'indent')}
    {:else}
      <span class="column indent"></span>
    {/if}
    {#if level === 2}
      <span class="bullet"></span>
      <span class="column gap"></span>
      {#if measured === 'level_indent'}
        {@render bracket('level_indent', 'gap')}
      {:else}
        <span class="column gap"></span>
      {/if}
    {/if}
    <span class="bullet"><span class="marker"></span></span>
    {#if measured === 'marker_gap'}
      {@render bracket('marker_gap', 'gap')}
    {:else}
      <span class="column gap"></span>
    {/if}
    <span class="bar" class:short></span>
  </div>
{/snippet}

<div class="desk">
  <PageSheet top="torn" bottom="torn">
    {@render text([100, 64])}
    {@render between('above')}
    <div class="list">
      {@render named('list_indent', i18n.t('templates.list.indent'), 'margin')}
      {@render item(1, 'list_indent')}
      {@render named('marker_gap', i18n.t('templates.list.gap'), 'bullet')}
      {@render item(1, 'marker_gap', true)}
      {@render named('level_indent', i18n.t('templates.list.level'), 'body')}
      {@render item(2, 'level_indent')}
      {@render between('item_spacing', i18n.t('templates.list.items'))}
      {@render item(1, null, true)}
    </div>
    {@render between('below')}
    {@render text([100, 100, 58])}
  </PageSheet>
</div>

<style>
  /* The page lies on the panel's ground, as on a desk. */
  .desk {
    --indent: calc(var(--sp-32) + var(--sp-16));
    --gap: calc(var(--sp-32) + var(--sp-8));
    --bullet: var(--sp-8);
    padding: var(--sp-12);
    border-radius: var(--r-lg);
    background: var(--color-panel);
  }
  .text {
    display: flex;
    flex-direction: column;
    gap: var(--sp-8);
  }
  .text span,
  .bar {
    display: block;
    height: var(--sp-4);
    border-radius: var(--r-sm);
    background: var(--color-control-pressed);
  }
  /* A distance down: its span, what it is, its name. */
  .between {
    display: flex;
    align-items: stretch;
    gap: var(--sp-8);
    min-height: var(--control-md);
    padding: var(--sp-4) 0;
  }
  .between > :global(*):not(.vspan) {
    align-self: center;
  }
  .short {
    color: var(--color-label-secondary);
    font: var(--type-caption);
    white-space: nowrap;
  }
  /* The spans and brackets: quiet until what they measure is pointed at. */
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
    display: block;
    flex: 1;
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
  /* The list: its items close together, each as high as a line of its text. */
  .list {
    display: flex;
    flex-direction: column;
  }
  .item {
    display: flex;
    align-items: center;
    height: var(--sp-16);
  }
  /* The columns of an item: the indent, the bullet, the distance to the text. A bracket fills its
     column but for a hair at each side, so it does not touch the bullet. */
  .column {
    display: flex;
    flex: none;
    align-items: center;
  }
  .column.indent {
    width: var(--indent);
    padding-right: 2px;
  }
  .column.gap {
    width: var(--gap);
    padding: 0 2px;
  }
  .bullet {
    display: flex;
    flex: none;
    align-items: center;
    width: var(--bullet);
  }
  .item > .bar {
    flex: 1;
    min-width: 0;
  }
  .item > .bar.short {
    margin-right: var(--sp-32);
  }
  /* The name of a distance across stands over its bracket, from where the bracket starts. */
  .named {
    display: flex;
    align-items: baseline;
    gap: var(--sp-4);
    padding-top: var(--sp-8);
  }
  .named.bullet {
    padding-left: calc(var(--indent) + var(--bullet));
  }
  .named.body {
    padding-left: calc(var(--indent) + var(--bullet) + var(--gap));
  }
  /* What an item starts with, a bullet or a number: a dot stands for either. */
  .marker {
    display: block;
    flex: none;
    width: var(--sp-8);
    height: var(--sp-8);
    border-radius: 50%;
    background: var(--color-label-secondary);
  }
</style>
