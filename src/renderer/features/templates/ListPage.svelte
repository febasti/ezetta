<script lang="ts">
  import type { Snippet } from 'svelte'
  import { PROPS, propLabel } from '@core/export/elements'
  import type { ElementDef } from '@core/export/elements'
  import { i18n } from '../../i18n/i18n.svelte'

  /**
   * The editor of a list: a page with a list of three items between two pieces of text. Only what has
   * a place on the page is on it: the space above and below, in the rows between the list and the
   * text (their spans as high as the row), and the indent of the list and of a level, each in the
   * strip at the left of the item it is the indent of. The bullets are drawn as the template has them.
   * The distances that are between a bullet and its text, and between the items, are set under it.
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
  <!-- The space between the text and the list: the row is the space, and its span measures it. -->
  <div class="between">
    <span class="vspan" aria-hidden="true"></span>
    <span class="field">{@render control(element, id)}</span>
    <label class="short" for="prop-{element.id}-{id}">{name(id)}</label>
  </div>
{/snippet}

{#snippet item(kind: string, width: number, deeper: boolean)}
  <div class="item" class:deeper aria-hidden="true">
    <span class="marker {kind}"></span>
    <span class="bar" style:width="{width}%"></span>
  </div>
{/snippet}

<div class="desk">
  <div class="sheet">
    {@render text([100, 64])}
    {@render between('above')}

    <!-- The list: each indent in the strip at the left of the item it belongs to; every item as high as the strip, so they stand evenly. -->
    <div class="list">
      <div class="row">
        <div class="strip">
          <span class="field">{@render control(element, 'list_indent')}</span>
          <label class="short" for="prop-{element.id}-list_indent"
            >{i18n.t('templates.list.indent')}</label
          >
        </div>
        {@render item(shape(1), 72, false)}
      </div>
      <div class="row">
        <div class="strip">
          <span class="field">{@render control(element, 'level_indent')}</span>
          <label class="short" for="prop-{element.id}-level_indent"
            >{i18n.t('templates.list.level')}</label
          >
        </div>
        {@render item(shape(2), 54, true)}
      </div>
      <div class="row">
        <div class="strip"></div>
        {@render item(shape(1), 82, false)}
      </div>
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
  .list {
    display: flex;
    flex-direction: column;
    gap: var(--sp-8);
  }
  /* An item, with the strip at its left that holds the indent it has. */
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
  .item {
    display: flex;
    flex: 1;
    align-items: center;
    gap: var(--sp-8);
    min-width: 0;
  }
  .item.deeper {
    padding-left: var(--sp-16);
  }
  .bar {
    display: block;
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
