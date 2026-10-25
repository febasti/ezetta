<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { HTMLAttributes } from 'svelte/elements'
  import Icon from '../Icon.svelte'
  import type { IconName } from '../Icon.svelte'

  /**
   * One row of a list, with one anatomy everywhere: an icon (or a leading snippet), a title, an
   * optional subtitle under it, and an accessory at the end (a count, a mark, a button). One line is
   * a sidebar or menu-like row; with a subtitle it is the taller two-line row. The chosen row has the
   * selection's ground; rows do not light up under the pointer, as in the system's source lists.
   *
   * Lists that need more (a tree, drag and drop, keyboard moves) pass their own attributes and
   * handlers (`role`, `aria-*`, `draggable`, `ondrop`, …), which go on the row itself; `content`
   * takes the place of the title (a field to rename it, say), and `drop` draws where a dragged item
   * would land.
   */
  interface Props extends Omit<HTMLAttributes<HTMLDivElement>, 'title' | 'class'> {
    title?: string
    subtitle?: string
    icon?: IconName
    /** Indentation steps, for a tree. */
    depth?: number
    selected?: boolean
    /** The title in the emphasis role (a tree's root, a chapter). */
    strong?: boolean
    /** Dims the row: something that is there but left out (of the export, say). */
    muted?: boolean
    drop?: 'before' | 'after' | 'inside' | null
    /** `top` for content of several lines: the icon stands at its first line. */
    align?: 'center' | 'top'
    element?: HTMLDivElement
    leading?: Snippet
    content?: Snippet
    accessory?: Snippet
  }
  let {
    title = '',
    subtitle,
    icon,
    depth = 0,
    selected = false,
    strong = false,
    muted = false,
    drop = null,
    align = 'center',
    element = $bindable(),
    leading,
    content,
    accessory,
    ...rest
  }: Props = $props()
</script>

<div
  role="option"
  aria-selected={selected}
  tabindex={selected ? 0 : -1}
  {...rest}
  bind:this={element}
  class="row"
  class:double={subtitle !== undefined}
  class:selected
  class:strong
  class:muted
  class:drop-before={drop === 'before'}
  class:drop-after={drop === 'after'}
  class:drop-inside={drop === 'inside'}
  class:top={align === 'top'}
  style:--depth={depth}
>
  {#if leading}
    <span class="leading">{@render leading()}</span>
  {:else if icon}
    <span class="leading"><Icon name={icon} size={16} /></span>
  {/if}
  {#if content}
    {@render content()}
  {:else}
    <span class="text">
      <span class="title">{title}</span>
      {#if subtitle !== undefined}<span class="subtitle">{subtitle}</span>{/if}
    </span>
  {/if}
  {#if accessory}<span class="accessory">{@render accessory()}</span>{/if}
</div>

<style>
  .row {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--sp-8);
    min-height: var(--row-single);
    padding: 0 var(--sp-8) 0 calc(var(--sp-8) + var(--depth) * var(--sp-16));
    border-radius: var(--r-md);
    color: var(--color-label);
    font: var(--type-body);
    cursor: default;
    user-select: none;
  }
  .double {
    min-height: var(--row-double);
  }
  /* The icon at the first line (18 px high) of content set in by the row's own small padding. */
  .top {
    align-items: flex-start;
    padding-top: var(--sp-4);
    padding-bottom: var(--sp-4);
  }
  .top .leading {
    height: 18px;
  }
  .selected {
    background: var(--color-selection);
  }
  .strong .title,
  .double .title {
    font: var(--type-emphasis);
  }
  .muted {
    color: var(--color-label-tertiary);
  }
  .row:focus-visible {
    outline: none;
    box-shadow: inset 0 0 0 2px var(--color-focus);
  }
  .leading {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: var(--sp-4);
    color: var(--color-label-secondary);
  }
  .text {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
  }
  .title,
  .subtitle {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .subtitle {
    color: var(--color-label-secondary);
    font: var(--type-caption);
  }
  .accessory {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: var(--sp-4);
    color: var(--color-label-tertiary);
    font: var(--type-caption);
    font-variant-numeric: tabular-nums;
  }
  /* Where a dragged item would land: a line above or below, or the row itself. */
  .drop-inside {
    background: var(--color-selection);
    box-shadow: inset 0 0 0 1px var(--color-accent);
  }
  .drop-before::before,
  .drop-after::after {
    content: '';
    position: absolute;
    right: var(--sp-8);
    left: var(--sp-8);
    height: 2px;
    border-radius: 1px;
    background: var(--color-accent);
  }
  .drop-before::before {
    top: -1px;
  }
  .drop-after::after {
    bottom: -1px;
  }
</style>
