<script lang="ts">
  import type { Snippet } from 'svelte'
  import Icon from '../Icon.svelte'
  import type { IconName } from '../Icon.svelte'

  /**
   * A button that is only an icon, for actions everyone knows by their sign (+, ×, a gear). Its
   * label is for screen readers and the tooltip. `pressed` makes it a toggle that shows its state.
   * A small picture of the caller's own (`glyph`) can stand in the icon's place, for a sign the icon
   * set has none for.
   */
  interface Props {
    icon?: IconName
    /** A small picture in place of the icon, drawn in the colour of the text. */
    glyph?: Snippet
    label: string
    /** For a label elsewhere (`for`), or for tests to find it. */
    id?: string
    size?: 'sm' | 'md'
    pressed?: boolean
    /** A toggle that rests on the control's fill (as the menu beside it does), not on nothing. */
    filled?: boolean
    /** For a button that shows or hides something (a disclosure): whether it is shown. */
    expanded?: boolean
    disabled?: boolean
    onclick: (event: MouseEvent) => void
  }
  let {
    icon,
    glyph,
    label,
    id,
    size = 'md',
    pressed,
    filled = false,
    expanded,
    disabled = false,
    onclick,
  }: Props = $props()
</script>

<button
  class="icon-button {size}"
  class:filled
  type="button"
  {id}
  aria-label={label}
  aria-pressed={pressed}
  aria-expanded={expanded}
  title={label}
  {disabled}
  {onclick}
>
  {#if glyph}
    {@render glyph()}
  {:else if icon}
    <Icon name={icon} size={size === 'sm' ? 14 : 16} />
  {/if}
</button>

<style>
  .icon-button {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: var(--control-md);
    height: var(--control-md);
    padding: 0;
    border: 0;
    border-radius: var(--r-md);
    background: transparent;
    color: var(--color-label-secondary);
    cursor: default;
    transition: background var(--duration);
  }
  .sm {
    width: var(--control-sm);
    height: var(--control-sm);
    border-radius: var(--r-sm);
  }
  .icon-button.filled {
    background: var(--color-control);
  }
  .icon-button:hover:not(:disabled) {
    background: var(--color-control);
    color: var(--color-label);
  }
  .icon-button:active:not(:disabled) {
    background: var(--color-control-pressed);
  }
  .icon-button[aria-pressed='true'] {
    background: var(--color-selection);
    color: var(--color-accent);
  }
  .icon-button:disabled {
    opacity: 0.4;
  }
  .icon-button:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--color-focus);
  }
</style>
