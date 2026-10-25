<script lang="ts">
  import Icon from '../Icon.svelte'
  import type { IconName } from '../Icon.svelte'

  /**
   * A tool in a bar (the toolbar, the status bar): an icon, or a short text, or both; no fill until
   * hovered, the selection's ground when a toggle is on, a small chevron when it opens a menu. It
   * keeps the focus where it was (the text), so a tool acts on the selection. `md` is the toolbar's
   * size, `sm` the status bar's; `tone` colours a state that needs the writer's attention.
   */
  interface Props {
    icon?: IconName
    /** The name: the tooltip and screen readers; shown beside the icon with `showLabel`, and always
     *  shown when there is no icon. */
    label: string
    /** The tooltip, usually the name with its shortcut. */
    title?: string
    showLabel?: boolean
    pressed?: boolean
    menu?: boolean
    disabled?: boolean
    size?: 'sm' | 'md'
    tone?: 'default' | 'quiet' | 'warning' | 'danger'
    onclick: (event: MouseEvent) => void
  }
  let {
    icon,
    label,
    title,
    showLabel = false,
    pressed,
    menu = false,
    disabled = false,
    size = 'md',
    tone = 'default',
    onclick,
  }: Props = $props()
  const text = $derived(!icon || showLabel)
</script>

<!-- mousedown is cancelled so the editor keeps its focus and selection while a tool is used -->
<button
  class="tool {size} {tone}"
  class:text
  class:icon-only={!text}
  type="button"
  aria-label={label}
  title={title ?? label}
  aria-pressed={pressed}
  aria-haspopup={menu ? 'menu' : undefined}
  {disabled}
  onmousedown={(event) => event.preventDefault()}
  {onclick}
>
  {#if icon}<Icon name={icon} size={size === 'sm' ? 14 : 16} />{/if}
  {#if text}<span class="label">{label}</span>{/if}
  {#if menu}<span class="chevron"><Icon name="chevron-down" size={10} /></span>{/if}
</button>

<style>
  .tool {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    gap: var(--sp-4);
    height: var(--control-md);
    padding: 0 var(--sp-8);
    border: 0;
    border-radius: var(--r-md);
    background: transparent;
    color: var(--color-label);
    font: var(--type-body);
    white-space: nowrap;
    cursor: default;
    transition: background var(--duration);
  }
  .md.icon-only {
    min-width: var(--control-md);
    padding: 0 var(--sp-4);
  }
  .sm {
    height: var(--control-sm);
    padding: 0 var(--sp-8);
  }
  .quiet {
    color: var(--color-label-secondary);
  }
  .warning {
    color: var(--color-warning);
  }
  .danger {
    color: var(--color-danger);
  }
  .chevron {
    display: inline-flex;
    margin-left: calc(-1 * var(--sp-4) / 2);
    color: var(--color-label-tertiary);
  }
  .tool:hover:not(:disabled) {
    background: var(--color-control);
  }
  .tool:active:not(:disabled) {
    background: var(--color-control-pressed);
  }
  .tool[aria-pressed='true'] {
    background: var(--color-selection);
    color: var(--color-accent);
  }
  .tool:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--color-focus);
  }
  .tool:disabled {
    color: var(--color-label-tertiary);
    opacity: 0.6;
  }
</style>
