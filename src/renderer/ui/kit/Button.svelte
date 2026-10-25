<script lang="ts">
  import type { Snippet } from 'svelte'
  import Icon from '../Icon.svelte'
  import type { IconName } from '../Icon.svelte'

  /**
   * A push button. `primary` is the one main action of a dialog or a view (filled with the accent),
   * `secondary` any other (a quiet fill), `plain` an action that should not draw the eye (no fill
   * until hovered). Sizes: `sm` in bars and dense places, `md` everywhere else, `lg` only for the main
   * action of a dialog.
   */
  interface Props {
    variant?: 'primary' | 'secondary' | 'plain' | 'danger'
    size?: 'sm' | 'md' | 'lg'
    icon?: IconName
    disabled?: boolean
    type?: 'button' | 'submit'
    onclick?: (event: MouseEvent) => void
    children: Snippet
  }
  let {
    variant = 'secondary',
    size = 'md',
    icon,
    disabled = false,
    type = 'button',
    onclick,
    children,
  }: Props = $props()
</script>

<button class="button {variant} {size}" {type} {disabled} {onclick}>
  {#if icon}<Icon name={icon} size={size === 'sm' ? 14 : 16} />{/if}
  {@render children()}
</button>

<style>
  .button {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    gap: var(--sp-4);
    height: var(--control-md);
    padding: 0 var(--sp-12);
    border: 0;
    border-radius: var(--r-md);
    font: var(--type-body);
    white-space: nowrap;
    cursor: default;
    transition: background var(--duration);
  }
  .sm {
    height: var(--control-sm);
    padding: 0 var(--sp-8);
  }
  .lg {
    height: var(--control-lg);
    padding: 0 var(--sp-16);
    font: var(--type-emphasis);
  }
  .primary {
    background: var(--color-accent);
    color: var(--color-on-accent);
  }
  .primary:hover:not(:disabled) {
    background: color-mix(in oklch, var(--color-accent) 90%, black);
  }
  .primary:active:not(:disabled) {
    background: color-mix(in oklch, var(--color-accent) 80%, black);
  }
  .secondary {
    background: var(--color-control);
    color: var(--color-label);
  }
  .secondary:hover:not(:disabled) {
    background: var(--color-control-hover);
  }
  .secondary:active:not(:disabled) {
    background: var(--color-control-pressed);
  }
  .plain {
    background: transparent;
    color: var(--color-label);
  }
  .plain:hover:not(:disabled) {
    background: var(--color-control);
  }
  .plain:active:not(:disabled) {
    background: var(--color-control-pressed);
  }
  .danger {
    background: var(--color-control);
    color: var(--color-danger);
  }
  .danger:hover:not(:disabled) {
    background: var(--color-control-hover);
  }
  .button:disabled {
    opacity: 0.45;
  }
  .button:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--color-focus);
  }
</style>
