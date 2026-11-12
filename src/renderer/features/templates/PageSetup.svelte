<script lang="ts">
  import type { Snippet } from 'svelte'
  import { PROPS, propLabel } from '@core/export/elements'
  import type { ElementDef } from '@core/export/elements'
  import { i18n } from '../../i18n/i18n.svelte'
  import { pageBox } from './schematics'

  /**
   * The editor of the page: the page itself, or the two that face each other, in the paper's
   * proportions, with the margins drawn as the bands they are, in their proportion to the paper. Each
   * margin's field stands on its side of the page, and its band lights when the field is pointed at or
   * has the focus; the right-hand page (or the only one) carries the brackets that measure them. The
   * choices that change the whole page, the pages' layout and the columns, are in a row over it, and the
   * space between the columns is set under the choice of them. The binding offset of the document, which
   * is set elsewhere, shows as a hatched strip at the inner edge.
   */
  interface Props {
    element: ElementDef
    values: Readonly<Record<string, unknown>>
    /** The document's binding offset, which is not the page's own. */
    binding: unknown
    /** The control of one value, as the panel draws it. */
    control: Snippet<[ElementDef, string]>
  }
  let { element, values, binding, control }: Props = $props()

  const lang = $derived(i18n.locale)
  const name = (id: string): string => propLabel(element.id, PROPS[id]!, lang)
  /** The value whose field is pointed at or has the focus, so its band and its bracket are drawn stronger. */
  let hot = $state<string | null>(null)

  const box = $derived(pageBox(values, binding, 176, 224))
  const facing = $derived(box.count === 2)
  /** Each page: which side its inner edge is on, and the room it leaves the text on each side. */
  const pages = $derived(
    Array.from({ length: box.count }, (_, i) => {
      const innerLeft = !(facing && i === 0)
      return {
        innerLeft,
        marked: i === box.count - 1,
        left: innerLeft ? box.inside + box.bind : box.outside,
        right: innerLeft ? box.outside : box.inside + box.bind,
      }
    }),
  )
  const insideName = $derived(
    !facing ? i18n.t('templates.page.left') : i18n.t('templates.page.inside'),
  )
  const outsideName = $derived(
    !facing ? i18n.t('templates.page.right') : i18n.t('templates.page.outside'),
  )
</script>

{#snippet field(id: string, caption: string, where: string)}
  <div
    class="field {where}"
    role="group"
    onpointerenter={() => (hot = id)}
    onpointerleave={() => (hot = null)}
    onfocusin={() => (hot = id)}
    onfocusout={() => (hot = null)}
  >
    <label class="short" for="prop-{element.id}-{id}" title={name(id)}>{caption}</label>
    {@render control(element, id)}
  </div>
{/snippet}

<div class="desk">
  <!-- The choices that change the whole page. -->
  <div class="choices">
    {@render field('facing', i18n.t('templates.page.pages'), 'choice')}
    <div class="columns">
      {@render field('columns', i18n.t('templates.page.columns'), 'choice')}
      {#if box.columns > 1}
        {@render field('column_gap', name('column_gap'), 'choice')}
      {/if}
    </div>
  </div>

  <div class="stage">
    {@render field('margin_inside', insideName, 'left')}
    {@render field('margin_outside', outsideName, 'right')}
    <div class="middle">
      {@render field('margin_top', i18n.t('templates.page.top'), 'top')}
      <div class="spread" style:width="{box.count * box.pw}px" style:height="{box.ph}px">
        {#each pages as page, i (i)}
          {@const tw = box.pw - page.left - page.right}
          {@const cw = (tw - box.gap * (box.columns - 1)) / box.columns}
          <div class="paper" style:width="{box.pw}px" aria-hidden="true">
            <!-- The margins as the bands they are. -->
            <span
              class="band"
              class:hot={hot === 'margin_top'}
              style="top: 0; left: 0; right: 0; height: {box.top}px"
            ></span>
            <span
              class="band"
              class:hot={hot === 'margin_bottom'}
              style="bottom: 0; left: 0; right: 0; height: {box.bottom}px"
            ></span>
            <span
              class="band"
              class:hot={hot === 'margin_inside'}
              style="top: {box.top}px; bottom: {box.bottom}px; {page.innerLeft
                ? 'left'
                : 'right'}: {box.bind}px; width: {box.inside}px"
            ></span>
            <span
              class="band"
              class:hot={hot === 'margin_outside'}
              style="top: {box.top}px; bottom: {box.bottom}px; {page.innerLeft
                ? 'right'
                : 'left'}: 0; width: {box.outside}px"
            ></span>
            {#if box.bind > 0}
              <span
                class="bind"
                style="top: 0; bottom: 0; {page.innerLeft
                  ? 'left'
                  : 'right'}: 0; width: {box.bind}px"
              ></span>
            {/if}
            <!-- The text, in its columns. -->
            <div
              class="text"
              style="top: {box.top}px; bottom: {box.bottom}px; left: {page.left}px; right: {page.right}px; grid-template-columns: repeat({box.columns}, 1fr); column-gap: {box.gap}px"
            >
              {#each Array.from({ length: box.columns }, (_, c) => c) as c (c)}<span class="column"
                ></span>{/each}
            </div>
            {#if box.columns > 1}
              <span
                class="band gap"
                class:hot={hot === 'column_gap'}
                style="top: {box.top}px; bottom: {box.bottom}px; left: {page.left +
                  cw}px; width: {box.gap}px"
              ></span>
            {/if}
            <!-- The brackets that measure the margins, on the right-hand page. -->
            {#if page.marked}
              <span
                class="vspan"
                class:hot={hot === 'margin_top'}
                style="top: 0; height: {box.top}px; left: {page.left + Math.round(tw * 0.3)}px"
              ></span>
              <span
                class="vspan"
                class:hot={hot === 'margin_bottom'}
                style="bottom: 0; height: {box.bottom}px; left: {page.left +
                  Math.round(tw * 0.3)}px"
              ></span>
              <span
                class="hspan"
                class:hot={hot === 'margin_inside'}
                style="top: 50%; width: {box.inside}px; {page.innerLeft
                  ? 'left'
                  : 'right'}: {box.bind}px"
              ></span>
              <span
                class="hspan"
                class:hot={hot === 'margin_outside'}
                style="top: 50%; width: {box.outside}px; {page.innerLeft ? 'right' : 'left'}: 0"
              ></span>
              {#if box.columns > 1}
                <span
                  class="hspan"
                  class:hot={hot === 'column_gap'}
                  style="top: {box.top +
                    Math.round((box.ph - box.top - box.bottom) * 0.25)}px; left: {page.left +
                    cw}px; width: {box.gap}px"
                ></span>
              {/if}
            {/if}
          </div>
        {/each}
      </div>
      {@render field('margin_bottom', i18n.t('templates.page.bottom'), 'bottom')}
    </div>
  </div>
</div>

<style>
  /* The page lies on the panel's ground, as on a desk. */
  .desk {
    display: flex;
    flex-direction: column;
    gap: var(--sp-12);
    padding: var(--sp-12);
    border-radius: var(--r-lg);
    background: var(--color-panel);
  }
  .choices {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--sp-12);
  }
  .columns {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: var(--sp-8);
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
  }
  .field.choice {
    align-items: flex-start;
  }
  .columns .field.choice {
    align-items: flex-end;
  }
  .short {
    color: var(--color-label-secondary);
    font: var(--type-caption);
    white-space: nowrap;
  }
  .field :global(.length) {
    width: 76px;
  }
  /* The stage: the page in the middle, the fields of the left and right margins on its sides. */
  .stage {
    display: grid;
    grid-template-columns: 76px minmax(0, 1fr) 76px;
    align-items: center;
    column-gap: var(--sp-8);
  }
  .stage > .left {
    grid-column: 1;
    grid-row: 1;
  }
  .stage > .right {
    grid-column: 3;
    grid-row: 1;
  }
  .stage > .middle {
    grid-column: 2;
    grid-row: 1;
  }
  .middle {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-8);
  }
  .field.top,
  .field.bottom {
    align-items: center;
  }
  .spread {
    display: flex;
  }
  .paper {
    position: relative;
    flex: none;
    height: 100%;
    background: var(--color-paper);
    box-shadow: 0 0 0 1px var(--color-field-border);
  }
  /* The margins: a faint tint in the accent, lit when the field is pointed at. */
  .band {
    position: absolute;
    background: var(--color-accent);
    opacity: 0.07;
    transition: opacity var(--duration);
  }
  .band.gap {
    opacity: 0.12;
  }
  .band.hot {
    opacity: 0.28;
  }
  /* What the binding takes: hatched, at the inner edge. */
  .bind {
    position: absolute;
    background-color: var(--color-control);
    background-image: repeating-linear-gradient(
      135deg,
      var(--color-label-tertiary) 0 1px,
      transparent 1px 3px
    );
  }
  .text {
    position: absolute;
    display: grid;
  }
  .column {
    display: block;
    background: repeating-linear-gradient(
      to bottom,
      var(--color-control-pressed) 0 2px,
      transparent 2px 6px
    );
  }
  /* The brackets: quiet until their field is pointed at or has the focus. */
  .vspan,
  .hspan {
    position: absolute;
    opacity: 0.55;
    transition: opacity var(--duration);
  }
  .vspan {
    width: var(--sp-8);
    margin-left: calc(-1 * var(--sp-4));
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
  .hspan {
    height: var(--sp-8);
    margin-top: calc(-1 * var(--sp-4));
    border-right: 1px solid var(--color-accent);
    border-left: 1px solid var(--color-accent);
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
</style>
