<script lang="ts">
  import type { Snippet } from 'svelte'

  /**
   * A checkbox with its label beside it; a click on the label checks it too. Without a label of its
   * own it is named by a form row (`id`) or by `label` for screen readers.
   */
  interface Props {
    checked: boolean
    id?: string
    label?: string
    disabled?: boolean
    onchange?: (checked: boolean) => void
    children?: Snippet
  }
  let { checked = $bindable(), id, label, disabled = false, onchange, children }: Props = $props()
</script>

<label class="checkbox" class:disabled>
  <input
    type="checkbox"
    {id}
    aria-label={label}
    {disabled}
    bind:checked
    onchange={(event) => onchange?.(event.currentTarget.checked)}
  />
  {#if children}<span>{@render children()}</span>{/if}
</label>

<style>
  .checkbox {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-8);
    min-height: var(--control-sm);
    color: var(--color-label);
    font: var(--type-body);
  }
  /* The system's own box, in the accent. */
  input {
    width: 14px;
    height: 14px;
    margin: 0;
    accent-color: var(--color-accent);
  }
  input:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--color-focus);
  }
  .disabled {
    color: var(--color-label-tertiary);
  }
</style>
